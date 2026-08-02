import { createHash, verify as verifySignature } from 'node:crypto';
import { existsSync, readFileSync, readSync, realpathSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function readContract(name) {
  return JSON.parse(readFileSync(new URL(`./contracts/${name}`, import.meta.url), 'utf8'));
}

const CONTEXT_CAPSULE_SCHEMA = readContract('context-capsule.schema.json');
const AGENT_LINEAGE_SCHEMA = readContract('agent-lineage.schema.json');
const EFFICIENCY_EVENT_SCHEMA = readContract('efficiency-event.schema.json');

export const MODES = Object.freeze([
  'local',
  'resume',
  'inherit-full',
  'inherit-recent',
  'fresh-capsule',
  'coordinated-team',
]);

export const REASON_CODES = Object.freeze([
  'LOCAL_CHEAPER',
  'BLOCKING',
  'RESUME_COMPATIBLE',
  'HIGH_CONTEXT_AFFINITY',
  'BOUNDED_RECENT_CONTEXT',
  'INDEPENDENT_CAPSULE',
  'SENSITIVITY_ISOLATION',
  'REVIEW_INDEPENDENCE',
  'TEAM_COORDINATION_REQUIRED',
  'WRITER_OWNERSHIP_CONFLICT',
  'NESTING_LIMIT',
  'CAPABILITY_FALLBACK',
]);

const REASON_ORDER = new Map(REASON_CODES.map((code, index) => [code, index]));
const LINEAGE_INVALIDATION_ORDER = [
  'UNKNOWN_PROVENANCE',
  'REVIEW_LINEAGE_CONTAMINATION',
  'PLATFORM_MISMATCH',
  'WORKGROUP_MISMATCH',
  'ROLE_MISMATCH',
  'PHASE_MISMATCH',
  'FIX_LOOP_MISMATCH',
  'SPEC_MISMATCH',
  'SCOPE_MISMATCH',
  'CHECKPOINT_MISMATCH',
  'MODEL_MISMATCH',
  'EFFORT_MISMATCH',
  'RUNTIME_PREFIX_MISMATCH',
  'BASELINE_MISMATCH',
  'TOOLS_MISMATCH',
  'PERMISSIONS_MISMATCH',
  'SENSITIVITY_MISMATCH',
  'FINAL_GATE',
  'NON_RESUMABLE',
];

function sortedReasons(codes) {
  return [...new Set(codes)].sort(
    (left, right) => (REASON_ORDER.get(left) ?? Number.MAX_SAFE_INTEGER)
      - (REASON_ORDER.get(right) ?? Number.MAX_SAFE_INTEGER)
  );
}

function decision(mode, reasonCodes) {
  if (!MODES.includes(mode)) throw new TypeError(`Unknown context-efficiency mode: ${mode}`);
  return { mode, reason_codes: sortedReasons(reasonCodes) };
}

function ownershipPathError(message) {
  const error = new TypeError(message);
  error.code = 'INVALID_OWNERSHIP_PATH';
  return error;
}

function writerScopeRequiredError() {
  const error = new TypeError('Every writer must declare at least one repository-relative owned path');
  error.code = 'WRITER_SCOPE_REQUIRED';
  return error;
}

/**
 * Resolve lexical aliases and any existing symlinked ancestor before comparing
 * writer scopes. Lower-casing is deliberately conservative: a false conflict
 * serializes work, while a missed case-folding conflict can corrupt it.
 */
function canonicalOwnershipPath(value, workspaceRoot = process.cwd()) {
  if (typeof value !== 'string' || value.trim() === '' || value.trim() !== value
      || value.includes('\0') || value.includes(':')
      || /[\u0000-\u001f\u007f]/.test(value)) {
    throw ownershipPathError('Writer ownership paths must be non-empty strings');
  }
  if (typeof workspaceRoot !== 'string' || workspaceRoot.trim() === '') {
    throw ownershipPathError('workspace_root must be a non-empty string');
  }

  const portableValue = value.trim().replace(/\\/g, '/');
  const portableRoot = workspaceRoot.trim().replace(/\\/g, '/');
  if (portableValue.startsWith('/') || /^[A-Za-z]:\//.test(portableValue)
      || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(portableValue)
      || portableValue.split('/').includes('..')) {
    throw ownershipPathError('Writer ownership paths must be repository-relative and non-traversing');
  }
  let canonicalRoot = resolve(portableRoot);
  try {
    canonicalRoot = realpathSync(canonicalRoot);
  } catch {
    // A not-yet-created workspace retains its normalized lexical root.
  }
  const absolute = resolve(canonicalRoot, portableValue);
  let cursor = absolute;
  const unresolved = [];
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) break;
    unresolved.unshift(basename(cursor));
    cursor = parent;
  }
  let resolvedPath = absolute;
  try {
    resolvedPath = resolve(realpathSync(cursor), ...unresolved);
  } catch {
    // Nonexistent or inaccessible paths retain their normalized lexical form.
  }
  const portableResolved = resolvedPath.normalize('NFKC').replace(/\\/g, '/').replace(/\/+$/, '');
  const portableCanonicalRoot = canonicalRoot
    .normalize('NFKC')
    .replace(/\\/g, '/')
    .replace(/\/+$/, '');
  if (portableResolved !== portableCanonicalRoot
      && !portableResolved.startsWith(`${portableCanonicalRoot}/`)) {
    throw ownershipPathError('Writer ownership path resolves outside workspace_root');
  }
  return portableResolved.toLocaleLowerCase('en-US');
}

function pathsOverlap(left, right) {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function canonicalOwnedFiles(scope = {}, workspaceRoot = process.cwd()) {
  if (!Array.isArray(scope.owned_files ?? []) || !Array.isArray(scope.resolved_owned_files ?? [])) {
    throw ownershipPathError('owned_files and resolved_owned_files must be arrays');
  }
  const raw = [
    ...(scope.owned_files ?? []),
    ...(scope.resolved_owned_files ?? []),
  ];
  return [...new Set(raw.map((path) => canonicalOwnershipPath(path, workspaceRoot)))];
}

function hasOverlappingWrites(scopes = [], workspaceRoot = process.cwd()) {
  if (!Array.isArray(scopes)) throw ownershipPathError('team.scopes must be an array');
  const seen = [];
  for (const scope of scopes) {
    if (!scope || typeof scope !== 'object' || Array.isArray(scope)) {
      throw ownershipPathError('writer scopes must be objects');
    }
    if (scope.is_writer === false) continue;
    const ownedFiles = canonicalOwnedFiles(scope, workspaceRoot);
    if (ownedFiles.length === 0) throw writerScopeRequiredError();
    for (const path of ownedFiles) {
      if (seen.some((candidate) => pathsOverlap(candidate, path))) return true;
      seen.push(path);
    }
  }
  return false;
}

function scopeLooksLikeWriter(input, proposedPaths) {
  const role = `${input.role ?? input.lineage?.role ?? ''}`.toLocaleLowerCase('en-US');
  return input.is_writer === true
    || proposedPaths.length > 0
    || /(?:^|[-_])(builder|writer|implementer)(?:$|[-_])/.test(role)
    || (input.team?.scopes ?? []).some((scope) => scope?.is_writer !== false
      && canonicalOwnedFiles(scope, input.workspace_root).length > 0);
}

function hasActiveWriterConflict(input = {}) {
  const workspaceRoot = input.workspace_root ?? process.cwd();
  const activeWriters = input.active_writers ?? input.active_writer_scopes ?? [];
  if (!Array.isArray(activeWriters)) throw ownershipPathError('active_writers must be an array');
  const teamScopes = input.team?.scopes ?? [];
  if (!Array.isArray(teamScopes)) throw ownershipPathError('team.scopes must be an array');
  for (const paths of [
    input.owned_files ?? [],
    input.resolved_owned_files ?? [],
    input.lineage?.owned_files ?? [],
    input.lineage?.resolved_owned_files ?? [],
  ]) {
    if (!Array.isArray(paths)) throw ownershipPathError('writer ownership paths must be arrays');
  }
  const proposed = canonicalOwnedFiles({
    owned_files: [
      ...(input.owned_files ?? []),
      ...(input.lineage?.owned_files ?? []),
      ...teamScopes.flatMap((scope) => scope?.is_writer === false
        ? []
        : (scope?.owned_files ?? [])),
    ],
    resolved_owned_files: [
      ...(input.resolved_owned_files ?? []),
      ...(input.lineage?.resolved_owned_files ?? []),
      ...teamScopes.flatMap((scope) => scope?.is_writer === false
        ? []
        : (scope?.resolved_owned_files ?? [])),
    ],
  }, workspaceRoot);
  if (!scopeLooksLikeWriter(input, proposed)) return false;
  if (proposed.length === 0) throw writerScopeRequiredError();

  return activeWriters.some((active) => {
    if (!active || typeof active !== 'object' || Array.isArray(active)) {
      throw ownershipPathError('active writer scopes must be objects');
    }
    const activePaths = canonicalOwnedFiles(active, workspaceRoot);
    if (activePaths.length === 0) throw writerScopeRequiredError();
    return activePaths.some((activePath) => proposed.some((path) => pathsOverlap(activePath, path)));
  });
}

/**
 * Resolve a portable execution mode without naming provider-specific tools.
 * Inputs are normalized facts collected by the adapter/coordinator.
 */
export function routeTask(input = {}) {
  const reasons = [];
  const coupling = input.coupling ?? 'independent';

  // A writer conflict is serialized before considering resume, inheritance, or
  // team fan-out. The coordinator may complete or release the current owner,
  // then route the deferred unit again.
  if (hasActiveWriterConflict(input)) {
    return decision('local', ['WRITER_OWNERSHIP_CONFLICT']);
  }

  const nestingDepth = input.nesting_depth ?? 0;
  const maxNestingDepth = input.max_nesting_depth ?? 2;
  if (!Number.isInteger(nestingDepth) || nestingDepth < 0
      || !Number.isInteger(maxNestingDepth) || maxNestingDepth < 1) {
    throw new TypeError('nesting depth and maximum must be non-negative/positive integers');
  }
  if (nestingDepth >= maxNestingDepth) {
    return decision('local', ['NESTING_LIMIT']);
  }

  if (input.trivial || input.blocking || coupling === 'tight') {
    if (input.trivial || coupling === 'tight') reasons.push('LOCAL_CHEAPER');
    if (input.blocking) reasons.push('BLOCKING');
    return decision('local', reasons);
  }

  const reviewerIsolation = input.independent_reviewer === true;
  const sensitivityIsolation = ['restricted', 'isolated'].includes(input.sensitivity)
    || input.inheritance?.safe === false;

  if (reviewerIsolation || sensitivityIsolation) {
    reasons.push('INDEPENDENT_CAPSULE');
    if (sensitivityIsolation) reasons.push('SENSITIVITY_ISOLATION');
    if (reviewerIsolation) reasons.push('REVIEW_INDEPENDENCE');
    return decision('fresh-capsule', reasons);
  }

  const lineage = input.lineage ?? {};
  const inferredWriter = input.is_writer === true
    || (Array.isArray(input.owned_files) && input.owned_files.length > 0)
    || (Array.isArray(input.resolved_owned_files) && input.resolved_owned_files.length > 0)
    || (Array.isArray(lineage.owned_files) && lineage.owned_files.length > 0)
    || (Array.isArray(lineage.resolved_owned_files) && lineage.resolved_owned_files.length > 0)
    || (input.team?.scopes ?? []).some((scope) => scope?.is_writer !== false
      && ((Array.isArray(scope?.owned_files) && scope.owned_files.length > 0)
        || (Array.isArray(scope?.resolved_owned_files) && scope.resolved_owned_files.length > 0)))
    || /(?:^|[-_])(builder|writer|implementer)(?:$|[-_])/.test(
      `${input.role ?? lineage.role ?? ''}`.toLocaleLowerCase('en-US')
    );
  const activeInheritedWriters = input.active_inherited_writers ?? 0;
  const maxActiveInherited = input.max_active_inherited ?? 2;
  if (inferredWriter && (!Number.isInteger(activeInheritedWriters) || activeInheritedWriters < 0
      || !Number.isInteger(maxActiveInherited) || maxActiveInherited < 1)) {
    throw new TypeError('inherited writer counts must be non-negative/positive integers');
  }
  const atInheritedWriterCap = inferredWriter
    && activeInheritedWriters >= maxActiveInherited;
  if (
    lineage.compatible === true
    && lineage.resumable === true
    && !atInheritedWriterCap
    && lineage.role !== 'builder-contaminated'
    && !(input.role === 'reviewer' && lineage.role === 'builder')
  ) {
    return decision('resume', ['RESUME_COMPATIBLE']);
  }

  const inheritance = input.inheritance ?? {};
  const wantsInheritance = inheritance.affinity === 'high';
  const inheritanceCompatible = wantsInheritance
    && inheritance.safe === true
    && inheritance.within_budget === true
    && !atInheritedWriterCap
    && nestingDepth < maxNestingDepth;

  if (inheritanceCompatible && inheritance.recent_sufficient && inheritance.recent_supported) {
    return decision('inherit-recent', ['BOUNDED_RECENT_CONTEXT']);
  }
  if (inheritanceCompatible && inheritance.full_supported) {
    return decision('inherit-full', ['HIGH_CONTEXT_AFFINITY']);
  }

  const team = input.team ?? {};
  const teamRequested = team.coordination_required === true
    && Number.isInteger(team.peers)
    && team.peers >= 2;
  const teamCompatible = teamRequested
    && team.provider_supported === true
    && team.safe === true
    && team.sensitivity_approved === true
    && input.sensitivity === 'normal'
    && team.within_budget === true
    && Number.isFinite(team.latency_ratio)
    && team.latency_ratio >= 0
    && team.latency_ratio <= 0.75
    && !hasOverlappingWrites(team.scopes, input.workspace_root);

  // Standalone fresh work is not sufficient when the task explicitly requires
  // real peer coordination. In all other cases fresh-capsule precedes a team.
  if (teamCompatible && input.capsule_sufficient === false) {
    return decision('coordinated-team', ['TEAM_COORDINATION_REQUIRED']);
  }

  const fallback = (wantsInheritance && !(
    inheritanceCompatible
    && (
      inheritance.full_supported
      || (inheritance.recent_supported && inheritance.recent_sufficient)
    )
  )) || (teamRequested && !teamCompatible) || (
    lineage.compatible === true && lineage.resumable === true && atInheritedWriterCap
  );

  reasons.push('INDEPENDENT_CAPSULE');
  if (fallback) reasons.push('CAPABILITY_FALLBACK');
  return decision('fresh-capsule', reasons);
}

function canonicalValue(value, omittedKeys) {
  if (Array.isArray(value)) return value.map((item) => canonicalValue(item, omittedKeys));
  if (value && typeof value === 'object') {
    const output = {};
    for (const key of Object.keys(value).sort()) {
      if (omittedKeys.has(key) || value[key] === undefined) continue;
      output[key] = canonicalValue(value[key], omittedKeys);
    }
    return output;
  }
  return value;
}

export function canonicalJson(value, { omit = [] } = {}) {
  return JSON.stringify(canonicalValue(value, new Set(omit)));
}

export function hashCapsule(capsule) {
  const canonical = canonicalJson(capsule, { omit: ['capsule_hash'] });
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

function clone(value) {
  return structuredClone(value);
}

function sealCapsule(value) {
  const sealed = clone(value);
  delete sealed.capsule_hash;
  sealed.capsule_hash = hashCapsule(sealed);
  return sealed;
}

const FORBIDDEN_CAPSULE_KEYS = /(^|_)(raw_?)?(transcript|prompt|chat|conversation|log|logs|tool_output|ambient_output|session|session_id|thread_id|agent_id|run_id|platform_handle|provider_handle|credential|credentials|password|passwd|api_key|access_token|refresh_token|auth_token)($|_)/i;
const MAX_CAPSULE_STRING_BYTES = 4096;
const TRUSTED_CAPSULE_ARTIFACT_ROOTS = Object.freeze(['knowzcode/artifacts']);
const SECRET_LIKE_VALUE = new RegExp([
  'Bearer\\s+[A-Za-z0-9._~+\\/-]+=*',
  '\\bAuthorization\\s*:\\s*Basic\\s+[A-Za-z0-9+/]{2,}={0,2}',
  '\\bAuthorization\\s*:\\s*(?:Token|ApiKey)\\s+[A-Za-z0-9=._~-]{8,}',
  '\\bnpm_[A-Za-z0-9]{20,}',
  '\\b(?:jdbc:)?[A-Za-z][A-Za-z0-9+.-]*:\\/\\/[^\\s:/@]+:[^\\s/@]+@[^\\s]+',
  '\\bjdbc:[^\\s]*(?:password|passwd)=[^\\s;&]+',
  '\\b(?:sk|rk|pk)-(?:live|test)?_?[A-Za-z0-9_-]{8,}',
  '\\bgh[pousr]_[A-Za-z0-9]{12,}',
  '\\bglpat-[A-Za-z0-9_-]{12,}',
  '\\bxox[baprs]-[A-Za-z0-9-]{10,}',
  '\\bAKIA[0-9A-Z]{16}\\b',
  '-----BEGIN [A-Z ]+PRIVATE KEY-----',
  '\\beyJ[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}\\b',
  '\\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token|secret)\\s*[:=]\\s*[^\\s]{4,}',
  '\\b(?:raw|full|verbatim)\\b.{0,48}\\b(?:transcript|chat|conversation|prompt|logs?|tool[-_\\s]?output|ambient[-_\\s]?output)\\b',
  '\\b(?:transcript|chat|conversation|prompt|logs?|tool[-_\\s]?output|ambient[-_\\s]?output)\\b.{0,48}\\b(?:raw|full|verbatim)\\b',
  '\\b(?:claude|codex|provider)[-_\\s:/]*(?:session|thread|agent|run)(?:[-_\\s]*id)?\\s*[:=#-]?\\s*[A-Za-z0-9][A-Za-z0-9._:-]{5,}\\b',
  '\\b(?:session|thread|agent|run)(?:[-_\\s]*id)?\\s*[:=#]\\s*[A-Za-z0-9][A-Za-z0-9._:-]{5,}\\b',
  '\\b(?:sess|thread|agent|run)[_-][A-Za-z0-9][A-Za-z0-9._:-]{7,}\\b',
].join('|'), 'i');

function privacyError(kind, path) {
  const error = new Error(`Forbidden ${kind} in context capsule at ${path}`);
  error.code = 'CAPSULE_PRIVATE_CONTENT';
  return error;
}

function assertCapsulePrivateContentFree(value, path = '$') {
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertCapsulePrivateContentFree(child, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_CAPSULE_KEYS.test(key)) throw privacyError(`field ${key}`, `${path}.${key}`);
      assertCapsulePrivateContentFree(child, `${path}.${key}`);
    }
    return;
  }
  if (typeof value === 'string') {
    if (Buffer.byteLength(value, 'utf8') > MAX_CAPSULE_STRING_BYTES) {
      const error = new RangeError(`Context capsule string exceeds ${MAX_CAPSULE_STRING_BYTES} bytes at ${path}`);
      error.code = 'CAPSULE_STRING_TOO_LONG';
      throw error;
    }
    if (SECRET_LIKE_VALUE.test(value)) throw privacyError('private or unbounded value', path);
  }
}

function assertCapsuleSchema(value) {
  const candidate = clone(value);
  candidate.capsule_hash ??= `sha256:${'0'.repeat(64)}`;
  const errors = validateAgainstSchema(candidate, CONTEXT_CAPSULE_SCHEMA);
  if (errors.length > 0) {
    const error = new TypeError(`Invalid context capsule: ${errors.join('; ')}`);
    error.code = 'CAPSULE_SCHEMA_INVALID';
    error.validation_errors = errors;
    throw error;
  }
}

/**
 * Bound a capsule by externalizing only optional evidence. Required context is
 * never truncated. If required context alone is too large, fail closed.
 */
export function prepareCapsule(capsule, {
  max_bytes = 12_288,
  artifact_path = null,
  artifact_roots = [],
} = {}) {
  if (!Number.isInteger(max_bytes) || max_bytes <= 0) {
    throw new TypeError('max_bytes must be a positive integer');
  }

  // Validate and reject sensitive content before it can be externalized, sized,
  // or hashed. This ordering prevents a poisoned capsule from being legitimized
  // by a stable digest or hidden behind an artifact reference.
  assertCapsuleSchema(capsule);
  assertCapsulePrivateContentFree(capsule);
  assertCapsuleFileRefs(capsule);

  let prepared = sealCapsule(capsule);
  if (Buffer.byteLength(canonicalJson(prepared), 'utf8') <= max_bytes) {
    assertCapsuleSchema(prepared);
    return prepared;
  }

  if (Array.isArray(prepared.evidence) && prepared.evidence.length > 0 && artifact_path) {
    assertAuthorizedArtifactPath(artifact_path, artifact_roots);
    prepared.evidence = [];
    prepared.artifact_refs = [...new Set([...(prepared.artifact_refs ?? []), artifact_path])];
    prepared = sealCapsule(prepared);
    // The artifact reference is caller-supplied and therefore requires the same
    // final privacy pass as every field present in the original capsule.
    assertCapsulePrivateContentFree(prepared);
    assertCapsuleFileRefs(prepared);
  }

  if (Buffer.byteLength(canonicalJson(prepared), 'utf8') <= max_bytes) {
    assertCapsuleSchema(prepared);
    return prepared;
  }

  const error = new RangeError(
    `Mandatory context capsule fields exceed the configured ${max_bytes}-byte limit`
  );
  error.code = 'CAPSULE_MANDATORY_OVERFLOW';
  throw error;
}

function assertSafeCapsulePath(value) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0
      || value.includes('\\') || value.includes('\0') || value.includes(':')
      || /[\u0000-\u001f\u007f]/.test(value)
      || value.startsWith('/') || value.includes('://')) {
    const error = new TypeError('Capsule file references must be portable repository-relative paths');
    error.code = 'CAPSULE_ARTIFACT_REF_INVALID';
    throw error;
  }
  const segments = value.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    const error = new TypeError('Capsule file references cannot contain empty or traversal segments');
    error.code = 'CAPSULE_ARTIFACT_REF_INVALID';
    throw error;
  }
}

function assertAuthorizedArtifactPath(value, roots) {
  assertSafeCapsulePath(value);
  if (!Array.isArray(roots) || roots.length === 0) {
    const error = new TypeError('Capsule externalization requires an explicit authorized artifact root');
    error.code = 'CAPSULE_ARTIFACT_REF_UNAUTHORIZED';
    throw error;
  }
  for (const root of roots) assertSafeCapsulePath(root);
  const trustedRequestedRoots = roots.filter((root) => TRUSTED_CAPSULE_ARTIFACT_ROOTS.some(
    (trustedRoot) => root === trustedRoot || root.startsWith(`${trustedRoot}/`)
  ));
  if (!trustedRequestedRoots.some((root) => value === root || value.startsWith(`${root}/`))) {
    const error = new TypeError('Capsule artifact path is outside the authorized artifact roots');
    error.code = 'CAPSULE_ARTIFACT_REF_UNAUTHORIZED';
    throw error;
  }
}

function assertCapsuleFileRefs(capsule) {
  const fileReferences = [
    ...(capsule.owned_files ?? []),
    ...(capsule.read_files ?? []),
    ...(capsule.specs ?? []).map((spec) => spec?.path).filter((value) => value !== null
      && value !== undefined),
  ];
  const artifactReferences = [
    ...(capsule.artifact_refs ?? []),
    ...(capsule.failures ?? []).map((failure) => failure?.artifact).filter((value) => value !== null
      && value !== undefined),
    ...(capsule.evidence ?? []).map((evidence) => evidence?.artifact).filter((value) => value !== null
      && value !== undefined),
  ];
  for (const reference of fileReferences) assertSafeCapsulePath(reference);
  for (const reference of artifactReferences) {
    assertAuthorizedArtifactPath(reference, TRUSTED_CAPSULE_ARTIFACT_ROOTS);
  }
}

const RFC3339_DATE_TIME = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.(\d{1,9}))?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

function isStrictRfc3339(value) {
  if (typeof value !== 'string') return false;
  const match = RFC3339_DATE_TIME.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= monthDays[month - 1] && Number.isFinite(Date.parse(value));
}

function jsonType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function matchesType(value, expected) {
  const actual = jsonType(value);
  if (expected === 'number') return actual === 'number' || actual === 'integer';
  return actual === expected;
}

/** A deliberately small JSON Schema 2020-12 subset sufficient for contracts. */
export function validateAgainstSchema(value, schema, path = '$') {
  const errors = [];

  if (schema.anyOf) {
    if (!schema.anyOf.some((candidate) => validateAgainstSchema(value, candidate, path).length === 0)) {
      errors.push(`${path}: does not match anyOf`);
    }
    return errors;
  }

  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${path}: expected constant ${JSON.stringify(schema.const)}`);
    return errors;
  }
  if (schema.enum && !schema.enum.some((candidate) => candidate === value)) {
    errors.push(`${path}: expected one of ${schema.enum.join(', ')}`);
  }
  if (schema.type) {
    const accepted = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!accepted.some((type) => matchesType(value, type))) {
      errors.push(`${path}: expected ${accepted.join('|')}, got ${jsonType(value)}`);
      return errors;
    }
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${path}: shorter than minLength ${schema.minLength}`);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push(`${path}: longer than maxLength ${schema.maxLength}`);
    }
    if (schema.pattern && !(new RegExp(schema.pattern).test(value))) {
      errors.push(`${path}: does not match pattern ${schema.pattern}`);
    }
    if (schema.format === 'date-time' && !isStrictRfc3339(value)) {
      errors.push(`${path}: invalid date-time`);
    }
  }

  if (typeof value === 'number' && schema.minimum !== undefined && value < schema.minimum) {
    errors.push(`${path}: below minimum ${schema.minimum}`);
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${path}: fewer than ${schema.minItems} items`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push(`${path}: more than ${schema.maxItems} items`);
    }
    if (schema.uniqueItems && new Set(value.map((item) => canonicalJson(item))).size !== value.length) {
      errors.push(`${path}: duplicate items`);
    }
    if (schema.items) {
      value.forEach((item, index) => {
        errors.push(...validateAgainstSchema(item, schema.items, `${path}[${index}]`));
      });
    }
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const required of schema.required ?? []) {
      if (!Object.hasOwn(value, required)) errors.push(`${path}: missing required ${required}`);
    }
    for (const [key, child] of Object.entries(value)) {
      if (schema.properties?.[key]) {
        errors.push(...validateAgainstSchema(child, schema.properties[key], `${path}.${key}`));
      } else if (schema.additionalProperties === false) {
        errors.push(`${path}: unexpected property ${key}`);
      }
    }
  }

  return errors;
}

export function evaluateLineage(lineage, current = {}, { now = new Date().toISOString() } = {}) {
  if (!isStrictRfc3339(now)) {
    const error = new TypeError('now must be a strict RFC 3339 date-time');
    error.code = 'INVALID_DATE_TIME';
    throw error;
  }
  if (!lineage || validateAgainstSchema(lineage, AGENT_LINEAGE_SCHEMA).length > 0) {
    return { state: 'INVALID', invalidations: ['UNKNOWN_PROVENANCE'] };
  }

  const requiredCurrent = [
    'platform', 'workgroup_id', 'role', 'phase', 'fix_loop_id', 'spec_hash', 'scope_hash',
    'checkpoint_sha', 'model', 'effort', 'runtime_prefix_hash', 'baseline_hash', 'capsule_hash',
    'tools_hash', 'permissions_hash', 'sensitivity',
  ];
  if (requiredCurrent.some((field) => !Object.hasOwn(current, field))) {
    return { state: 'INVALID', invalidations: ['UNKNOWN_PROVENANCE'] };
  }

  const invalidations = [];
  if (current.independent_reviewer && lineage.role === 'builder') {
    invalidations.push('REVIEW_LINEAGE_CONTAMINATION');
  }

  const comparisons = [
    ['platform', 'PLATFORM_MISMATCH'],
    ['workgroup_id', 'WORKGROUP_MISMATCH'],
    ['role', 'ROLE_MISMATCH'],
    ['phase', 'PHASE_MISMATCH'],
    ['fix_loop_id', 'FIX_LOOP_MISMATCH'],
    ['spec_hash', 'SPEC_MISMATCH'],
    ['scope_hash', 'SCOPE_MISMATCH'],
    ['checkpoint_sha', 'CHECKPOINT_MISMATCH'],
    ['model', 'MODEL_MISMATCH'],
    ['effort', 'EFFORT_MISMATCH'],
    ['runtime_prefix_hash', 'RUNTIME_PREFIX_MISMATCH'],
    ['baseline_hash', 'BASELINE_MISMATCH'],
    ['tools_hash', 'TOOLS_MISMATCH'],
    ['permissions_hash', 'PERMISSIONS_MISMATCH'],
    ['sensitivity', 'SENSITIVITY_MISMATCH'],
  ];
  for (const [field, code] of comparisons) {
    if (Object.hasOwn(current, field) && current[field] !== lineage[field]) invalidations.push(code);
  }
  if (lineage.resumable !== true) invalidations.push('NON_RESUMABLE');

  if (invalidations.length > 0) {
    const ordered = [...new Set(invalidations)].sort(
      (left, right) => LINEAGE_INVALIDATION_ORDER.indexOf(left)
        - LINEAGE_INVALIDATION_ORDER.indexOf(right)
    );
    return { state: 'INVALID', invalidations: ordered };
  }

  if (current.final_gate === true) {
    return { state: 'INVALID', invalidations: ['FINAL_GATE'] };
  }

  const capsuleChanged = Object.hasOwn(current, 'capsule_hash')
    && current.capsule_hash !== lineage.capsule_hash;
  if (current.reconcile_required === true || capsuleChanged) {
    return { state: 'RECONCILE_REQUIRED', invalidations: ['RECONCILIATION_REQUIRED'] };
  }

  // A resumable lease must always be bounded. A null lease can preserve valid
  // provenance for reconciliation, but it can never authorize a hot resume.
  if (lineage.lease_expires_at === null
      || Date.parse(now) >= Date.parse(lineage.lease_expires_at)) {
    return { state: 'COLD_VALID', invalidations: [] };
  }

  if (current.scope_complete === true && current.likely_continuation !== true) {
    return { state: 'COLD_VALID', invalidations: [] };
  }

  return { state: 'HOT', invalidations: [] };
}

export function evaluateBudget(used, limit) {
  if (limit === null || limit === undefined) {
    return {
      state: 'UNBOUNDED',
      ratio: null,
      actions: [],
      mandatory_gates_preserved: true,
    };
  }
  if (!Number.isFinite(used) || !Number.isFinite(limit) || used < 0 || limit <= 0) {
    throw new TypeError('Budget used/limit must be finite with used >= 0 and limit > 0');
  }

  const ratio = used / limit;
  if (ratio >= 1) {
    return {
      state: 'HARD',
      ratio,
      actions: [
        'STOP_DISCRETIONARY_WORK',
        'FINISH_ATOMIC_SAFE_STEP',
        'PERSIST_CAPSULE',
        'PAUSE_IF_MANDATORY_WORK_REMAINS',
      ],
      mandatory_gates_preserved: true,
    };
  }
  if (ratio >= 0.9) {
    return {
      state: 'CHECKPOINT',
      ratio,
      actions: ['STOP_DISCRETIONARY_FANOUT', 'PERSIST_CAPSULE'],
      mandatory_gates_preserved: true,
    };
  }
  if (ratio >= 0.7) {
    return {
      state: 'SOFT',
      ratio,
      actions: ['STOP_SPECULATIVE_FANOUT', 'PREFER_SMALLER_MODE'],
      mandatory_gates_preserved: true,
    };
  }
  return { state: 'NORMAL', ratio, actions: [], mandatory_gates_preserved: true };
}

const PRIVATE_TELEMETRY_KEYS = /(^|_)(prompt|prompt_body|raw_prompt|source_body|source_code|log|log_body|secret|credential|credentials|password|passwd|api_key|access_token|refresh_token|auth_token|platform_handle|provider_handle|provider_session_id|session_id|thread_id|agent_id|repository|repository_path|repo|file_path|email|account_id|account_email|user_id|org_id|organization_id|tenant_id|subscription_id)($|_)/i;
const PRIVATE_TELEMETRY_VALUES = new RegExp([
  'Bearer\\s+[A-Za-z0-9._~+\\/-]+=*',
  '\\b(?:sk|rk|pk)-(?:live|test)?_?[A-Za-z0-9_-]{8,}',
  '\\bgh[pousr]_[A-Za-z0-9]{12,}',
  '\\bglpat-[A-Za-z0-9_-]{12,}',
  '\\bxox[baprs]-[A-Za-z0-9-]{10,}',
  '\\bAKIA[0-9A-Z]{16}\\b',
  '-----BEGIN [A-Z ]+PRIVATE KEY-----',
  '\\beyJ[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}\\b',
  '\\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token|secret)\\s*[:=]\\s*[^\\s]{4,}',
  '\\b(?:thread|session|sess|run)[_-][A-Za-z0-9-]{8,}\\b',
  '\\bhttps?:\\/\\/[^\\s]+',
  '(?:^|[\\s"\'(])(?:\\/Users\\/|\\/home\\/|[A-Za-z]:\\\\|\\.\\.?\\/)[^\\s"\')]+',
  '\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b',
  '\\b(?:repo(?:sitory)?|project)[-_][A-Za-z0-9][A-Za-z0-9._-]{2,}\\b',
].join('|'), 'i');

export const MODEL_LABELS = Object.freeze([
  'unknown',
  'opus',
  'sonnet',
  'haiku',
  'fable',
  'gpt-5',
  'gpt-5.6-sol',
  'gpt-5.6-terra',
]);

function assertPrivateTelemetryFree(value, path = '$') {
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertPrivateTelemetryFree(child, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (key !== 'prompt_bytes' && PRIVATE_TELEMETRY_KEYS.test(key)) {
        const error = new Error(`Private telemetry field at ${path}.${key}`);
        error.code = 'PRIVATE_TELEMETRY';
        throw error;
      }
      assertPrivateTelemetryFree(child, `${path}.${key}`);
    }
    return;
  }
  if (typeof value === 'string' && PRIVATE_TELEMETRY_VALUES.test(value)) {
    const error = new Error(`Secret-like telemetry value at ${path}`);
    error.code = 'PRIVATE_TELEMETRY';
    throw error;
  }
}

function nullableCounter(value) {
  return value === undefined ? null : value;
}

function assertEfficiencyEventSchema(value) {
  const errors = validateAgainstSchema(value, EFFICIENCY_EVENT_SCHEMA);
  if (value.event === 'dispatch_decision' && (value.mode === null || value.reason_codes.length === 0)) {
    errors.push('$: dispatch_decision requires mode and at least one reason code');
  }
  if (value.outcome?.verify_passed !== null && value.outcome?.verify_total !== null
      && value.outcome.verify_passed > value.outcome.verify_total) {
    errors.push('$.outcome.verify_passed: exceeds verify_total');
  }
  if (value.outcome?.audit_score !== null && value.outcome?.audit_score > 100) {
    errors.push('$.outcome.audit_score: exceeds 100');
  }
  if (errors.length > 0) {
    const error = new TypeError(`Invalid efficiency event: ${errors.join('; ')}`);
    error.code = 'EFFICIENCY_EVENT_INVALID';
    error.validation_errors = errors;
    throw error;
  }
}

export function normalizeEfficiencyEvent(event) {
  assertPrivateTelemetryFree(event);
  const billedInput = event.billed ?? {};
  const allBillingUnknown = [
    billedInput.uncached_input_tokens,
    billedInput.cache_creation_input_tokens,
    billedInput.cache_read_input_tokens,
    billedInput.output_tokens,
    billedInput.amount,
    billedInput.units,
  ].every((value) => value === undefined || value === null);
  if (!allBillingUnknown && !['authoritative', 'provider-reported'].includes(billedInput.accounting_source)) {
    const error = new TypeError(
      'Billed values require an explicit authoritative or provider-reported accounting_source'
    );
    error.code = 'ACCOUNTING_SOURCE_REQUIRED';
    throw error;
  }

  const normalized = {
    schema: 'knowzcode.efficiency-event/v1',
    event: event.event,
    observed_at: event.observed_at,
    task_corpus_id: event.task_corpus_id ?? null,
    provider: event.provider,
    runtime: event.runtime ?? null,
    model: event.model ?? null,
    profile: event.profile ?? null,
    mode: event.mode ?? null,
    reason_codes: sortedReasons(event.reason_codes ?? []),
    logical: {
      estimated_context_occupancy: nullableCounter(event.logical?.estimated_context_occupancy),
      compaction_count: nullableCounter(event.logical?.compaction_count),
      repeated_file_reads: nullableCounter(event.logical?.repeated_file_reads),
      prompt_bytes: nullableCounter(event.logical?.prompt_bytes),
      tool_output_bytes: nullableCounter(event.logical?.tool_output_bytes),
      capsule_bytes: nullableCounter(event.logical?.capsule_bytes),
    },
    billed: {
      uncached_input_tokens: nullableCounter(billedInput.uncached_input_tokens),
      cache_creation_input_tokens: nullableCounter(billedInput.cache_creation_input_tokens),
      cache_read_input_tokens: nullableCounter(billedInput.cache_read_input_tokens),
      output_tokens: nullableCounter(billedInput.output_tokens),
      amount: nullableCounter(billedInput.amount),
      currency: billedInput.currency ?? null,
      units: billedInput.units ?? null,
      accounting_source: billedInput.accounting_source ?? 'unknown',
    },
    outcome: {
      accepted_workgroup: nullableCounter(event.outcome?.accepted_workgroup),
      verify_passed: nullableCounter(event.outcome?.verify_passed),
      verify_total: nullableCounter(event.outcome?.verify_total),
      audit_score: nullableCounter(event.outcome?.audit_score),
      rework_rounds: nullableCounter(event.outcome?.rework_rounds),
      escaped_high_critical: nullableCounter(event.outcome?.escaped_high_critical),
      elapsed_ms: nullableCounter(event.outcome?.elapsed_ms),
    },
  };
  assertPrivateTelemetryFree(normalized);
  assertEfficiencyEventSchema(normalized);
  return normalized;
}

export function verificationPlan(input = {}) {
  const artifact_logs = true;
  if (input.tier === 'tdd') {
    return { checks: ['targeted'], consolidated_required: false, artifact_logs };
  }
  if (input.tier === 'microtask') {
    return { checks: ['affected-surface'], consolidated_required: false, artifact_logs };
  }
  if (input.tier === 'gate3') {
    return {
      checks: ['full-tests', 'static-analysis', 'build', 'package', 'install-smoke'],
      consolidated_required: true,
      artifact_logs,
    };
  }
  if (input.tier === 'audit-fix' && input.production_changed_after_full_green) {
    return {
      checks: ['targeted', 'full-tests', 'static-analysis', 'build', 'package', 'install-smoke'],
      consolidated_required: true,
      artifact_logs,
    };
  }
  if (input.tier === 'audit-fix') {
    return { checks: ['targeted'], consolidated_required: false, artifact_logs };
  }
  throw new TypeError(`Unknown verification tier: ${input.tier}`);
}

function semanticDelta(delta) {
  const normalizeText = (value) => (value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  const normalizeIdentity = (value) => (typeof value === 'string'
    ? value.normalize('NFKC').trim()
    : '') || null;
  return {
    category: normalizeText(delta?.category) || null,
    title: normalizeText(delta?.title),
    content: normalizeText(delta?.content),
    semantic_key: normalizeText(delta?.semantic_key) || null,
    supersedes: normalizeIdentity(delta?.supersedes),
    source_hash: delta?.source_hash ?? null,
  };
}

function deltaHash(delta) {
  const { source_hash: _sourceHash, ...semanticIdentity } = semanticDelta(delta);
  return createHash('sha256').update(canonicalJson(semanticIdentity)).digest('hex');
}

function deltaContentHash(delta) {
  const { source_hash: _sourceHash, semantic_key: _semanticKey, supersedes: _supersedes, ...content } = semanticDelta(delta);
  return createHash('sha256').update(canonicalJson(content)).digest('hex');
}

function isEmptyDelta(delta) {
  const semantic = semanticDelta(delta);
  return semantic.title === '' && semantic.content === '' && semantic.supersedes === null;
}

export function shouldDeepQuery(question) {
  return typeof question === 'string' && question.trim().length >= 12 && /\?$/.test(question.trim());
}

export function evaluateVaultDelta(input = {}) {
  let severity = null;
  if (input.severity !== undefined && input.severity !== null) {
    if (typeof input.severity !== 'string') {
      const error = new TypeError('severity must be LOW, MEDIUM, HIGH, or CRITICAL');
      error.code = 'INVALID_SEVERITY';
      throw error;
    }
    severity = input.severity.trim().toLocaleUpperCase('en-US');
    if (!['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(severity)) {
      const error = new TypeError('severity must be LOW, MEDIUM, HIGH, or CRITICAL');
      error.code = 'INVALID_SEVERITY';
      throw error;
    }
  }
  const delta = input.delta;
  if (isEmptyDelta(delta)) return { action: 'skip', reason: 'EMPTY_DELTA' };

  const hash = deltaHash(delta);
  const semantic = semanticDelta(delta);
  const prior = input.previous_deltas ?? [];
  const previousHashes = new Set([
    ...(input.previous_hashes ?? []),
    ...prior.map(deltaHash),
  ]);
  if (previousHashes.has(hash)) return { action: 'skip', reason: 'SEMANTIC_DUPLICATE' };

  const contentHash = deltaContentHash(delta);
  if (prior.some((candidate) => deltaContentHash(candidate) === contentHash)) {
    return { action: 'skip', reason: 'SEMANTIC_DUPLICATE' };
  }

  const semanticIdentityMatches = prior.filter((candidate) => {
    const previous = semanticDelta(candidate);
    return Boolean(semantic.semantic_key) && semantic.semantic_key === previous.semantic_key;
  });
  if (semanticIdentityMatches.length > 0) {
    return mutationDecision(
      'amend',
      'SEMANTIC_IDENTITY_CHANGED',
      semanticIdentityMatches
    );
  }

  const supersessionMatches = prior.filter((candidate) => {
    const previous = semanticDelta(candidate);
    return Boolean(semantic.supersedes)
      && (
        semantic.supersedes === stableKnowledgeId(candidate)
        || (semantic.supersedes === previous.supersedes
          && semantic.category === previous.category)
      );
  });
  if (supersessionMatches.length > 0) {
    return mutationDecision(
      'update',
      'SUPERSESSION_CHANGED',
      supersessionMatches
    );
  }

  if (input.explicit_save) return { action: 'flush', reason: 'EXPLICIT_SAVE' };
  if (input.interruption_sensitive) return { action: 'flush', reason: 'INTERRUPTION_SENSITIVE' };
  if (['HIGH', 'CRITICAL'].includes(severity)) return { action: 'flush', reason: 'HIGH_RISK' };
  if (['correction', 'deprecation'].includes(semantic.category)) {
    return { action: 'flush', reason: 'DURABILITY_REQUIRED' };
  }
  return { action: 'batch', reason: 'NORMAL_DELTA' };
}

function stableKnowledgeId(delta) {
  const candidates = [delta?.KnowledgeId, delta?.knowledgeId, delta?.knowledge_id];
  const identities = candidates.filter((value) => typeof value === 'string')
    .map((value) => value.trim()).filter(Boolean);
  if (identities.length > 1) {
    const error = new TypeError('Prior delta contains multiple KnowledgeId values');
    error.code = 'VAULT_TARGET_AMBIGUOUS';
    throw error;
  }
  return identities[0] ?? null;
}

function mutationDecision(action, reason, matches) {
  const identities = [...new Set(matches.map(stableKnowledgeId).filter(Boolean))];
  if (identities.length === 0) {
    const error = new TypeError(`${action} requires a stable KnowledgeId target`);
    error.code = 'VAULT_TARGET_REQUIRED';
    throw error;
  }
  if (identities.length !== 1 || matches.length !== 1) {
    const error = new TypeError(`${action} target is ambiguous`);
    error.code = 'VAULT_TARGET_AMBIGUOUS';
    throw error;
  }
  return { action, reason, KnowledgeId: identities[0] };
}

export const ROLLOUT_STATES = Object.freeze(['off', 'observe', 'shadow', 'canary', 'on']);
const ANONYMOUS_CORPUS_ID = /^(?:anon-[a-f0-9]{16,64}|(?:small-tier2|backend-refactor|ui-integration|security-compliance|recovery-invalidation)-[0-9]{2})$/;

function deterministicPercent(identifier) {
  const hex = createHash('sha256').update(identifier).digest('hex').slice(0, 8);
  return (Number.parseInt(hex, 16) / 0x1_0000_0000) * 100;
}

/** Resolve whether an adaptive recommendation is recorded and/or executed. */
export function selectRollout(input = {}) {
  const rollout = input.rollout ?? 'off';
  if (!ROLLOUT_STATES.includes(rollout)) throw new TypeError(`Unknown rollout state: ${rollout}`);
  const actualMode = input.actual_mode ?? null;
  const recommendedMode = input.recommended_mode ?? input.recommendation?.mode ?? null;
  if (actualMode !== null && !MODES.includes(actualMode)) throw new TypeError(`Unknown actual mode: ${actualMode}`);
  if (recommendedMode !== null && !MODES.includes(recommendedMode)) {
    throw new TypeError(`Unknown recommended mode: ${recommendedMode}`);
  }
  if (['canary', 'on'].includes(rollout) && recommendedMode === null) {
    const error = new TypeError(`${rollout} rollout requires a recommendation`);
    error.code = 'ROLLOUT_RECOMMENDATION_REQUIRED';
    throw error;
  }

  let executeRecommendation = false;
  let canaryBucket = null;
  if (rollout === 'on') executeRecommendation = true;
  if (rollout === 'canary') {
    const canaryPercent = input.canary_percent ?? 10;
    if (!Number.isFinite(canaryPercent) || canaryPercent < 0 || canaryPercent > 100) {
      throw new TypeError('canary_percent must be between 0 and 100');
    }
    if (typeof input.task_corpus_id !== 'string' || !ANONYMOUS_CORPUS_ID.test(input.task_corpus_id)) {
      throw new TypeError('canary rollout requires an anonymous task_corpus_id');
    }
    canaryBucket = deterministicPercent(input.task_corpus_id);
    executeRecommendation = canaryBucket < canaryPercent;
  }

  return {
    rollout,
    execute_recommendation: executeRecommendation,
    record_actual: rollout !== 'off',
    record_recommendation: ['shadow', 'canary', 'on'].includes(rollout),
    selected_mode: executeRecommendation ? recommendedMode : actualMode,
    canary_bucket: canaryBucket,
  };
}

export const PROMOTION_STRATA = Object.freeze([
  'small-tier2',
  'backend-refactor',
  'ui-integration',
  'security-compliance',
  'recovery-invalidation',
]);

export const PROMOTION_THRESHOLDS = Object.freeze({
  minimum_sample_size: 40,
  minimum_per_stratum: 8,
  required_strata: PROMOTION_STRATA,
  median_cost_reduction: 0.25,
  p75_cost_reduction: 0.15,
  max_p95_regression: 0.10,
  median_wall_time_reduction: 0.15,
  max_quality_drop_points: 2,
  max_rework_relative_regression: 0.05,
  provider_reconciliation_tolerance: 0.02,
});

const PROMOTION_ENVELOPE_SCHEMA = 'knowzcode.measurement-envelope/v2';
const MEASUREMENT_RUN_ID = /^measurement-[a-f0-9]{16,64}$/;
const MEASUREMENT_KEY_ID = /^measurement-key-[a-z0-9._-]{1,64}$/;
const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/;
const VERSION_ID = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/;
const MAX_MEASUREMENT_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_MEASUREMENT_FUTURE_SKEW_MS = 5 * 60 * 1000;

export const RESULT_MODES = Object.freeze(['ephemeral', 'durable', 'artifact']);

/** Resolve output persistence without allowing a write-prohibited scope to leak state. */
export function resolveResultPolicy(input = {}) {
  const writeProhibited = input.write_prohibited === true;
  const durableHandoffRequired = input.material === true || input.writer === true
    || input.partial === true || input.resumable === true || input.crosses_phase === true
    || input.requested_mode === 'durable';
  let mode = input.requested_mode ?? null;
  if (mode !== null && !RESULT_MODES.includes(mode)) {
    throw new TypeError(`Unknown result mode: ${mode}`);
  }
  if (writeProhibited) mode = 'ephemeral';
  if (!writeProhibited) {
    if (input.large_raw_output === true) mode = 'artifact';
    else if (durableHandoffRequired && (mode === null || mode === 'ephemeral')) mode = 'durable';
    else if (mode === null) mode = 'ephemeral';
    if ((durableHandoffRequired || mode === 'durable') && input.authorize_handoff === false) {
      const error = new TypeError('Durable results require authorized handoff persistence');
      error.code = 'RESULT_HANDOFF_NOT_AUTHORIZED';
      throw error;
    }
    if (mode === 'artifact' && input.authorize_artifact === false) {
      const error = new TypeError('Artifact results require authorized artifact persistence');
      error.code = 'RESULT_ARTIFACT_NOT_AUTHORIZED';
      throw error;
    }
  }

  const writes = {
    handoff: false,
    artifact: false,
    vault: false,
    settings: false,
    workgroup: false,
  };
  if (!writeProhibited) {
    writes.handoff = (mode === 'durable' || durableHandoffRequired)
      && input.authorize_handoff !== false;
    writes.artifact = mode === 'artifact' && input.authorize_artifact !== false;
    writes.vault = input.authorize_vault_write === true;
    writes.settings = input.authorize_settings_write === true;
    writes.workgroup = input.authorize_workgroup_write === true;
  }
  return { mode, write_prohibited: writeProhibited, writes };
}

function quantile(values, probability) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function finiteMetric(value, label, {
  positive = false,
  integer = false,
  maximum = Number.MAX_SAFE_INTEGER,
} = {}) {
  if (!Number.isFinite(value) || (positive ? value <= 0 : value < 0)
      || value > maximum || (integer && !Number.isSafeInteger(value))) {
    throw new TypeError(
      `${label} must be a bounded ${integer ? 'integer' : 'number'} `
      + `between ${positive ? 'greater than zero' : 'zero'} and ${maximum}`
    );
  }
  return value;
}

function promotionCorpusDigest(pairs) {
  return `sha256:${createHash('sha256').update(canonicalJson(pairs)).digest('hex')}`;
}

function trustedMeasurementPublicKey(keyId) {
  const source = process.env.KNOWZCODE_TRUSTED_MEASUREMENT_KEYS;
  if (typeof source !== 'string' || source.length === 0 || source.length > 65_536) return null;
  try {
    const keys = JSON.parse(source);
    if (!keys || typeof keys !== 'object' || Array.isArray(keys)) return null;
    const key = keys[keyId];
    if (typeof key !== 'string'
        || !/^-----BEGIN PUBLIC KEY-----\r?\n[A-Za-z0-9+/=\r\n]+-----END PUBLIC KEY-----\r?\n?$/.test(key)) {
      return null;
    }
    return key;
  } catch {
    return null;
  }
}

function trustedMeasurementEnvelope(pairs, envelope, {
  now,
  consumedMeasurementRunIds,
  expectedCandidateVersion,
  expectedCorpusVersion,
  expectedRuntimeDigest,
} = {}) {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) return false;
  const exactKeys = [
    'accounting_source',
    'candidate_version',
    'corpus_digest',
    'corpus_version',
    'measured_at',
    'measurement_run_id',
    'pair_count',
    'promotion_authorized',
    'runtime_digest',
    'schema',
    'signature',
    'signer_key_id',
  ];
  if (canonicalJson(Object.keys(envelope).sort()) !== canonicalJson(exactKeys)) return false;
  if (!isStrictRfc3339(now)
      || !Array.isArray(consumedMeasurementRunIds)
      || consumedMeasurementRunIds.some((value) => !MEASUREMENT_RUN_ID.test(value))
      || !VERSION_ID.test(expectedCandidateVersion ?? '')
      || !VERSION_ID.test(expectedCorpusVersion ?? '')
      || !SHA256_DIGEST.test(expectedRuntimeDigest ?? '')) return false;
  const measuredAt = Date.parse(envelope.measured_at);
  const evaluatedAt = Date.parse(now);
  if (envelope.schema !== PROMOTION_ENVELOPE_SCHEMA
      || !MEASUREMENT_RUN_ID.test(envelope.measurement_run_id ?? '')
      || !MEASUREMENT_KEY_ID.test(envelope.signer_key_id ?? '')
      || !VERSION_ID.test(envelope.candidate_version ?? '')
      || !VERSION_ID.test(envelope.corpus_version ?? '')
      || !SHA256_DIGEST.test(envelope.runtime_digest ?? '')
      || envelope.candidate_version !== expectedCandidateVersion
      || envelope.corpus_version !== expectedCorpusVersion
      || envelope.runtime_digest !== expectedRuntimeDigest
      || envelope.accounting_source !== 'authoritative'
      || envelope.promotion_authorized !== true
      || envelope.pair_count !== pairs.length
      || !isStrictRfc3339(envelope.measured_at)
      || measuredAt > evaluatedAt + MAX_MEASUREMENT_FUTURE_SKEW_MS
      || evaluatedAt - measuredAt > MAX_MEASUREMENT_AGE_MS
      || consumedMeasurementRunIds.includes(envelope.measurement_run_id)
      || !SHA256_DIGEST.test(envelope.corpus_digest ?? '')
      || envelope.corpus_digest !== promotionCorpusDigest(pairs)
      || typeof envelope.signature !== 'string'
      || !/^[A-Za-z0-9+/]+={0,2}$/.test(envelope.signature)) return false;
  const publicKey = trustedMeasurementPublicKey(envelope.signer_key_id);
  if (publicKey === null) return false;
  try {
    const signed = canonicalJson(envelope, { omit: ['signature'] });
    return verifySignature(
      null,
      Buffer.from(signed, 'utf8'),
      publicKey,
      Buffer.from(envelope.signature, 'base64')
    );
  } catch {
    return false;
  }
}

/** Evaluate fixed, paired baseline/candidate results against every promotion gate. */
export function evaluatePromotion(
  pairs,
  thresholds = PROMOTION_THRESHOLDS,
  {
    measurement_envelope: measurementEnvelope = null,
    now = new Date().toISOString(),
    consumed_measurement_run_ids: consumedMeasurementRunIds = null,
    expected_candidate_version: expectedCandidateVersion = null,
    expected_corpus_version: expectedCorpusVersion = null,
    expected_runtime_digest: expectedRuntimeDigest = null,
  } = {}
) {
  if (!Array.isArray(pairs) || pairs.length === 0) throw new TypeError('pairs must be a non-empty array');
  if (!thresholds || typeof thresholds !== 'object' || Array.isArray(thresholds)) {
    throw new TypeError('thresholds must be an object');
  }
  for (const [name, value] of Object.entries(thresholds)) {
    if (name === 'required_strata') continue;
    if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  }
  const requestedStrata = Array.isArray(thresholds.required_strata) ? thresholds.required_strata : [];
  const effectiveThresholds = {
    minimum_sample_size: Math.max(
      PROMOTION_THRESHOLDS.minimum_sample_size,
      thresholds.minimum_sample_size ?? PROMOTION_THRESHOLDS.minimum_sample_size
    ),
    minimum_per_stratum: Math.max(
      PROMOTION_THRESHOLDS.minimum_per_stratum,
      thresholds.minimum_per_stratum ?? PROMOTION_THRESHOLDS.minimum_per_stratum
    ),
    required_strata: [...new Set([...PROMOTION_STRATA, ...requestedStrata])],
    median_cost_reduction: Math.max(
      PROMOTION_THRESHOLDS.median_cost_reduction,
      thresholds.median_cost_reduction ?? PROMOTION_THRESHOLDS.median_cost_reduction
    ),
    p75_cost_reduction: Math.max(
      PROMOTION_THRESHOLDS.p75_cost_reduction,
      thresholds.p75_cost_reduction ?? PROMOTION_THRESHOLDS.p75_cost_reduction
    ),
    max_p95_regression: Math.min(
      PROMOTION_THRESHOLDS.max_p95_regression,
      thresholds.max_p95_regression ?? PROMOTION_THRESHOLDS.max_p95_regression
    ),
    median_wall_time_reduction: Math.max(
      PROMOTION_THRESHOLDS.median_wall_time_reduction,
      thresholds.median_wall_time_reduction ?? PROMOTION_THRESHOLDS.median_wall_time_reduction
    ),
    max_quality_drop_points: Math.min(
      PROMOTION_THRESHOLDS.max_quality_drop_points,
      thresholds.max_quality_drop_points ?? PROMOTION_THRESHOLDS.max_quality_drop_points
    ),
    max_rework_relative_regression: Math.min(
      PROMOTION_THRESHOLDS.max_rework_relative_regression,
      thresholds.max_rework_relative_regression ?? PROMOTION_THRESHOLDS.max_rework_relative_regression
    ),
    provider_reconciliation_tolerance: Math.min(
      PROMOTION_THRESHOLDS.provider_reconciliation_tolerance,
      thresholds.provider_reconciliation_tolerance ?? PROMOTION_THRESHOLDS.provider_reconciliation_tolerance
    ),
  };
  const ids = new Set();
  const costReductions = [];
  const costRegressions = [];
  const latencyReductions = [];
  const baselineQuality = [];
  const candidateQuality = [];
  const baselineRework = [];
  const candidateRework = [];
  const reconciliationErrors = [];
  const stratumCounts = new Map();
  let newHighCriticalEscape = false;
  let measuredPairProvenance = true;
  let providerAccountingComplete = true;

  for (const pair of pairs) {
    if (typeof pair?.id !== 'string' || !ANONYMOUS_CORPUS_ID.test(pair.id) || ids.has(pair.id)) {
      throw new TypeError('paired results require unique anonymous corpus ids');
    }
    ids.add(pair.id);
    const provenance = pair.provenance ?? {};
    if (provenance.kind !== 'measured'
      || provenance.empirical !== true
      || provenance.promotion_authorized !== true
    ) {
      measuredPairProvenance = false;
    }
    if (!PROMOTION_STRATA.includes(pair.stratum)) {
      throw new TypeError(`${pair.id}.stratum must be a recognized promotion stratum`);
    }
    stratumCounts.set(pair.stratum, (stratumCounts.get(pair.stratum) ?? 0) + 1);
    const baseline = pair.baseline ?? {};
    const candidate = pair.candidate ?? {};
    const baseCost = finiteMetric(baseline.billed_cost, `${pair.id}.baseline.billed_cost`, {
      positive: true, maximum: 1_000_000_000,
    });
    const nextCost = finiteMetric(candidate.billed_cost, `${pair.id}.candidate.billed_cost`, {
      maximum: 1_000_000_000,
    });
    const baseTime = finiteMetric(baseline.wall_time_ms, `${pair.id}.baseline.wall_time_ms`, {
      positive: true, maximum: 2_678_400_000,
    });
    const nextTime = finiteMetric(candidate.wall_time_ms, `${pair.id}.candidate.wall_time_ms`, {
      maximum: 2_678_400_000,
    });
    costReductions.push((baseCost - nextCost) / baseCost);
    costRegressions.push((nextCost - baseCost) / baseCost);
    latencyReductions.push((baseTime - nextTime) / baseTime);
    baselineQuality.push(finiteMetric(baseline.quality_score, `${pair.id}.baseline.quality_score`, { maximum: 100 }));
    candidateQuality.push(finiteMetric(candidate.quality_score, `${pair.id}.candidate.quality_score`, { maximum: 100 }));
    baselineRework.push(finiteMetric(baseline.rework_rounds, `${pair.id}.baseline.rework_rounds`, {
      integer: true, maximum: 1_000_000,
    }));
    candidateRework.push(finiteMetric(candidate.rework_rounds, `${pair.id}.candidate.rework_rounds`, {
      integer: true, maximum: 1_000_000,
    }));
    const baseEscapes = finiteMetric(baseline.escaped_high_critical, `${pair.id}.baseline.escaped_high_critical`, {
      integer: true, maximum: 1_000_000,
    });
    const nextEscapes = finiteMetric(candidate.escaped_high_critical, `${pair.id}.candidate.escaped_high_critical`, {
      integer: true, maximum: 1_000_000,
    });
    if (nextEscapes > baseEscapes) newHighCriticalEscape = true;

    if (candidate.provider_reported_total !== null && candidate.provider_reported_total !== undefined
        && candidate.event_accounted_total !== null && candidate.event_accounted_total !== undefined) {
      const providerTotal = finiteMetric(candidate.provider_reported_total, `${pair.id}.candidate.provider_reported_total`, {
        positive: true, integer: true, maximum: Number.MAX_SAFE_INTEGER,
      });
      const accountedTotal = finiteMetric(candidate.event_accounted_total, `${pair.id}.candidate.event_accounted_total`, {
        integer: true, maximum: Number.MAX_SAFE_INTEGER,
      });
      reconciliationErrors.push(Math.abs(accountedTotal - providerTotal) / providerTotal);
    } else {
      providerAccountingComplete = false;
    }
  }

  const baseMedianRework = quantile(baselineRework, 0.5);
  const candidateMedianRework = quantile(candidateRework, 0.5);
  const reworkRelativeRegression = baseMedianRework === 0
    ? (candidateMedianRework === 0 ? 0 : Number.POSITIVE_INFINITY)
    : (candidateMedianRework - baseMedianRework) / baseMedianRework;
  const metrics = {
    sample_size: pairs.length,
    stratum_counts: Object.fromEntries([...stratumCounts].sort(([left], [right]) => left.localeCompare(right))),
    median_cost_reduction: quantile(costReductions, 0.5),
    p75_cost_reduction: quantile(costReductions, 0.75),
    p95_cost_regression: quantile(costRegressions, 0.95),
    median_wall_time_reduction: quantile(latencyReductions, 0.5),
    quality_drop_points: quantile(baselineQuality, 0.5) - quantile(candidateQuality, 0.5),
    rework_relative_regression: reworkRelativeRegression,
    new_high_critical_escape: newHighCriticalEscape,
    max_provider_reconciliation_error: reconciliationErrors.length
      ? Math.max(...reconciliationErrors)
      : null,
    measured_pair_provenance: measuredPairProvenance,
    provider_accounting_complete: providerAccountingComplete,
    trusted_measurement_envelope: trustedMeasurementEnvelope(pairs, measurementEnvelope, {
      now,
      consumedMeasurementRunIds,
      expectedCandidateVersion,
      expectedCorpusVersion,
      expectedRuntimeDigest,
    }),
  };
  const requiredStrata = effectiveThresholds.required_strata;
  const minimumSampleSize = effectiveThresholds.minimum_sample_size;
  const minimumPerStratum = effectiveThresholds.minimum_per_stratum;
  const gates = {
    provenance: metrics.measured_pair_provenance === true
      && metrics.trusted_measurement_envelope === true,
    sample_size: metrics.sample_size >= minimumSampleSize,
    strata: requiredStrata.every((stratum) => (stratumCounts.get(stratum) ?? 0) >= minimumPerStratum),
    median_cost: metrics.median_cost_reduction >= effectiveThresholds.median_cost_reduction,
    p75_cost: metrics.p75_cost_reduction >= effectiveThresholds.p75_cost_reduction,
    p95_cost: metrics.p95_cost_regression <= effectiveThresholds.max_p95_regression,
    median_wall_time: metrics.median_wall_time_reduction >= effectiveThresholds.median_wall_time_reduction,
    quality: metrics.quality_drop_points <= effectiveThresholds.max_quality_drop_points,
    rework: metrics.rework_relative_regression <= effectiveThresholds.max_rework_relative_regression,
    security: metrics.new_high_critical_escape === false,
    reconciliation: metrics.provider_accounting_complete === true
      && metrics.max_provider_reconciliation_error !== null
      && metrics.max_provider_reconciliation_error <= effectiveThresholds.provider_reconciliation_tolerance,
  };
  return { promote: Object.values(gates).every(Boolean), metrics, gates };
}

function requireObject(value, label = 'request') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    const error = new TypeError(`${label} must be one JSON object`);
    error.code = 'INVALID_REQUEST';
    throw error;
  }
  return value;
}

/** Execute one pure runtime operation. This function never writes to disk. */
export function executeRuntimeOperation(operation, payload) {
  const request = requireObject(payload);
  switch (operation) {
    case 'route':
      return routeTask(requireObject(request.input, 'input'));
    case 'lineage':
      return evaluateLineage(request.lineage, requireObject(request.current, 'current'),
        request.now === undefined ? {} : { now: request.now });
    case 'capsule':
      return prepareCapsule(request.capsule, {
        max_bytes: request.max_bytes,
        artifact_path: request.artifact_path ?? null,
        artifact_roots: request.artifact_roots ?? [],
      });
    case 'telemetry':
      return normalizeEfficiencyEvent(request.event);
    case 'rollout':
      return selectRollout(requireObject(request.input, 'input'));
    case 'result-policy':
      return resolveResultPolicy(requireObject(request.input, 'input'));
    case 'vault-delta':
      return evaluateVaultDelta(requireObject(request.input, 'input'));
    case 'dispatch': {
      const routingInput = requireObject(request.routing?.input ?? request.routing, 'routing');
      const lineageRequest = request.lineage ?? null;
      const lineageCurrent = lineageRequest === null
        ? null
        : requireObject(lineageRequest.current, 'lineage.current');
      for (const field of ['role', 'sensitivity']) {
        if (lineageCurrent !== null
            && routingInput[field] !== undefined
            && lineageCurrent[field] !== undefined
            && routingInput[field] !== lineageCurrent[field]) {
          const error = new TypeError(`routing.${field} conflicts with lineage.current.${field}`);
          error.code = 'DISPATCH_FACT_MISMATCH';
          throw error;
        }
      }
      const lineage = lineageRequest === null ? null : evaluateLineage(
        lineageRequest.lineage,
        lineageCurrent,
        lineageRequest.now === undefined ? {} : { now: lineageRequest.now }
      );
      // A combined dispatch never trusts a caller's cached compatibility booleans
      // over the evaluated lineage supplied in the same request.
      const reconciledRoutingInput = lineage === null ? routingInput : {
        ...routingInput,
        role: lineageCurrent.role ?? routingInput.role,
        sensitivity: lineageCurrent.sensitivity ?? routingInput.sensitivity,
        independent_reviewer: routingInput.independent_reviewer === true
          || lineageCurrent.independent_reviewer === true,
        lineage: {
          ...(routingInput.lineage ?? {}),
          lineage_id: lineageRequest.lineage?.lineage_id ?? null,
          role: lineageRequest.lineage?.role ?? null,
          compatible: lineage.state === 'HOT',
          resumable: lineage.state === 'HOT',
        },
      };
      const routing = routeTask(reconciledRoutingInput);
      const rolloutInput = requireObject(request.rollout?.input ?? request.rollout, 'rollout');
      // Bind the recommendation after spreading caller-owned observation fields;
      // canary/on may execute only the safe router result.
      const rollout = selectRollout({
        ...rolloutInput,
        actual_mode: routing.mode,
        recommended_mode: routing.mode,
      });
      const policyInput = request.result_policy?.input ?? request.result_policy ?? null;
      const result_policy = policyInput === null ? null : resolveResultPolicy(requireObject(policyInput, 'result_policy'));
      return { routing, rollout, lineage, result_policy };
    }
    default: {
      const error = new TypeError('Unsupported context-efficiency operation');
      error.code = 'UNSUPPORTED_OPERATION';
      throw error;
    }
  }
}

function safeFailure(error) {
  const code = typeof error?.code === 'string' && /^[A-Z0-9_]{3,64}$/.test(error.code)
    ? error.code
    : 'INVALID_REQUEST';
  const messages = {
    ACCOUNTING_SOURCE_REQUIRED: 'Billed telemetry requires an accounting source.',
    CAPSULE_ARTIFACT_REF_INVALID: 'Capsule rejected an unsafe file reference.',
    CAPSULE_ARTIFACT_REF_UNAUTHORIZED: 'Capsule artifact path is not authorized.',
    CAPSULE_MANDATORY_OVERFLOW: 'Mandatory capsule content exceeds the configured limit.',
    CAPSULE_PRIVATE_CONTENT: 'Capsule rejected private or unbounded content.',
    CAPSULE_SCHEMA_INVALID: 'Capsule does not satisfy its schema.',
    CAPSULE_STRING_TOO_LONG: 'Capsule contains an overlong string.',
    DISPATCH_FACT_MISMATCH: 'Dispatch routing facts conflict with evaluated lineage facts.',
    EFFICIENCY_EVENT_INVALID: 'Efficiency event does not satisfy its schema or allowlists.',
    INVALID_DATE_TIME: 'Date-time must use strict RFC 3339 syntax.',
    INVALID_OWNERSHIP_PATH: 'Writer ownership paths are malformed.',
    INVALID_REQUEST: 'Request must be one valid JSON object for the selected operation.',
    INVALID_SEVERITY: 'Severity must use an allowed level.',
    PRIVATE_TELEMETRY: 'Efficiency event rejected private or repository-identifying content.',
    REQUEST_TOO_LARGE: 'Request exceeds the one-megabyte stdin limit.',
    RESULT_HANDOFF_NOT_AUTHORIZED: 'Durable result handoff is not authorized.',
    RESULT_ARTIFACT_NOT_AUTHORIZED: 'Artifact result persistence is not authorized.',
    ROLLOUT_RECOMMENDATION_REQUIRED: 'Executable rollout requires a recommendation.',
    UNSUPPORTED_OPERATION: 'Unsupported context-efficiency operation.',
    VAULT_TARGET_AMBIGUOUS: 'Vault mutation target is ambiguous.',
    VAULT_TARGET_REQUIRED: 'Vault mutation requires a stable KnowledgeId.',
    WRITER_SCOPE_REQUIRED: 'Writer routing requires an explicit owned path.',
  };
  return { ok: false, code, message: messages[code] ?? 'Context-efficiency request rejected.' };
}

function isDirectExecution() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
  }
}

function readBoundedStdin(maxBytes = 1_048_576) {
  const chunks = [];
  let total = 0;
  while (true) {
    const remaining = maxBytes + 1 - total;
    const chunk = Buffer.allocUnsafe(Math.min(65_536, remaining));
    const count = readSync(0, chunk, 0, chunk.length, null);
    if (count === 0) break;
    total += count;
    if (total > maxBytes) {
      const error = new RangeError('Request exceeds the stdin limit');
      error.code = 'REQUEST_TOO_LARGE';
      throw error;
    }
    chunks.push(chunk.subarray(0, count));
  }
  return Buffer.concat(chunks, total).toString('utf8');
}

if (isDirectExecution()) {
  try {
    const operation = process.argv[2];
    if (!operation) {
      const error = new TypeError('Operation is required');
      error.code = 'UNSUPPORTED_OPERATION';
      throw error;
    }
    const source = readBoundedStdin();
    const payload = JSON.parse(source);
    const result = executeRuntimeOperation(operation, payload);
    process.stdout.write(`${JSON.stringify({ ok: true, operation, result })}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify(safeFailure(error))}\n`);
    process.exitCode = 1;
  }
}

import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
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

function hasOverlappingWrites(scopes = []) {
  const seen = new Set();
  for (const scope of scopes) {
    for (const path of scope.owned_files ?? []) {
      if (seen.has(path)) return true;
      seen.add(path);
    }
  }
  return false;
}

function hasActiveWriterConflict(input = {}) {
  if (input.is_writer !== true && !(input.team?.scopes ?? []).some((scope) => scope?.is_writer !== false)) {
    return false;
  }
  const activeWriters = input.active_writers ?? input.active_writer_scopes ?? [];
  const proposedLineageId = input.lineage_id ?? input.lineage?.lineage_id ?? null;
  const proposed = new Set([
    ...(input.owned_files ?? []),
    ...(input.lineage?.owned_files ?? []),
    ...(input.team?.scopes ?? []).flatMap((scope) => scope?.owned_files ?? []),
  ]);
  return activeWriters.some((active) => {
    if (proposedLineageId && active?.lineage_id === proposedLineageId) return false;
    return (active?.owned_files ?? []).some((path) => proposed.has(path));
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
  const atInheritedWriterCap = input.is_writer === true
    && (input.active_inherited_writers ?? 0) >= (input.max_active_inherited ?? 2);
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
    && inheritance.safe !== false
    && inheritance.within_budget !== false
    && !atInheritedWriterCap
    && nestingDepth < maxNestingDepth;

  if (inheritanceCompatible && inheritance.recent_sufficient && inheritance.recent_supported) {
    return decision('inherit-recent', ['BOUNDED_RECENT_CONTEXT']);
  }
  if (inheritanceCompatible && inheritance.full_supported) {
    return decision('inherit-full', ['HIGH_CONTEXT_AFFINITY']);
  }

  const team = input.team ?? {};
  const teamRequested = team.coordination_required === true && (team.peers ?? 0) >= 2;
  const teamCompatible = teamRequested
    && team.provider_supported === true
    && team.within_budget !== false
    && team.latency_ratio !== undefined
    && team.latency_ratio <= 0.75
    && !hasOverlappingWrites(team.scopes);

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
const SECRET_LIKE_VALUE = new RegExp([
  'Bearer\\s+[A-Za-z0-9._~+\\/-]+=*',
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
export function prepareCapsule(capsule, { max_bytes = 12_288, artifact_path = null } = {}) {
  if (!Number.isInteger(max_bytes) || max_bytes <= 0) {
    throw new TypeError('max_bytes must be a positive integer');
  }

  // Validate and reject sensitive content before it can be externalized, sized,
  // or hashed. This ordering prevents a poisoned capsule from being legitimized
  // by a stable digest or hidden behind an artifact reference.
  assertCapsuleSchema(capsule);
  assertCapsulePrivateContentFree(capsule);

  let prepared = sealCapsule(capsule);
  if (Buffer.byteLength(canonicalJson(prepared), 'utf8') <= max_bytes) {
    assertCapsuleSchema(prepared);
    return prepared;
  }

  if (Array.isArray(prepared.evidence) && prepared.evidence.length > 0 && artifact_path) {
    prepared.evidence = [];
    prepared.artifact_refs = [...new Set([...(prepared.artifact_refs ?? []), artifact_path])];
    prepared = sealCapsule(prepared);
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
    if (schema.format === 'date-time' && Number.isNaN(Date.parse(value))) {
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

  if (lineage.lease_expires_at && Date.parse(now) >= Date.parse(lineage.lease_expires_at)) {
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
  if (!allBillingUnknown && billedInput.accounting_source === undefined) {
    const error = new TypeError('Billed values require an explicit accounting_source');
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
  return {
    category: normalizeText(delta?.category) || null,
    title: normalizeText(delta?.title),
    content: normalizeText(delta?.content),
    semantic_key: normalizeText(delta?.semantic_key) || null,
    supersedes: normalizeText(delta?.supersedes) || null,
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

  const semanticIdentityChanged = prior.some((candidate) => {
    const previous = semanticDelta(candidate);
    return Boolean(semantic.semantic_key) && semantic.semantic_key === previous.semantic_key;
  });
  if (semanticIdentityChanged) return { action: 'amend', reason: 'SEMANTIC_IDENTITY_CHANGED' };

  const supersessionChanged = prior.some((candidate) => {
    const previous = semanticDelta(candidate);
    return Boolean(semantic.supersedes)
      && semantic.supersedes === previous.supersedes
      && semantic.category === previous.category;
  });
  if (supersessionChanged) return { action: 'update', reason: 'SUPERSESSION_CHANGED' };

  if (input.explicit_save) return { action: 'flush', reason: 'EXPLICIT_SAVE' };
  if (input.interruption_sensitive) return { action: 'flush', reason: 'INTERRUPTION_SENSITIVE' };
  if (['HIGH', 'CRITICAL'].includes(input.severity)) return { action: 'flush', reason: 'HIGH_RISK' };
  if (['correction', 'deprecation'].includes(semantic.category)) {
    return { action: 'flush', reason: 'DURABILITY_REQUIRED' };
  }
  return { action: 'batch', reason: 'NORMAL_DELTA' };
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

export const RESULT_MODES = Object.freeze(['ephemeral', 'durable', 'artifact']);

/** Resolve output persistence without allowing a write-prohibited scope to leak state. */
export function resolveResultPolicy(input = {}) {
  const writeProhibited = input.write_prohibited === true;
  let mode = input.requested_mode ?? null;
  if (mode !== null && !RESULT_MODES.includes(mode)) {
    throw new TypeError(`Unknown result mode: ${mode}`);
  }
  if (writeProhibited) mode = 'ephemeral';
  if (mode === null) {
    if (input.large_raw_output === true) mode = 'artifact';
    else if (input.material === true || input.writer === true || input.partial === true
      || input.resumable === true || input.crosses_phase === true) mode = 'durable';
    else mode = 'ephemeral';
  }

  const writes = {
    handoff: false,
    artifact: false,
    vault: false,
    settings: false,
    workgroup: false,
  };
  if (!writeProhibited) {
    writes.handoff = mode === 'durable' && input.authorize_handoff !== false;
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

function finiteMetric(value, label, { positive = false } = {}) {
  if (!Number.isFinite(value) || (positive ? value <= 0 : value < 0)) {
    throw new TypeError(`${label} must be a finite ${positive ? 'positive' : 'non-negative'} number`);
  }
  return value;
}

/** Evaluate fixed, paired baseline/candidate results against every promotion gate. */
export function evaluatePromotion(pairs, thresholds = PROMOTION_THRESHOLDS) {
  if (!Array.isArray(pairs) || pairs.length === 0) throw new TypeError('pairs must be a non-empty array');
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
  let promotionEvidenceAuthorized = true;

  for (const pair of pairs) {
    if (typeof pair?.id !== 'string' || pair.id.length === 0 || ids.has(pair.id)) {
      throw new TypeError('paired results require unique non-empty ids');
    }
    ids.add(pair.id);
    const provenance = pair.provenance ?? {};
    if (provenance.kind !== 'measured'
      || provenance.empirical !== true
      || provenance.promotion_authorized !== true
    ) {
      promotionEvidenceAuthorized = false;
    }
    if (typeof pair.stratum === 'string') {
      stratumCounts.set(pair.stratum, (stratumCounts.get(pair.stratum) ?? 0) + 1);
    }
    const baseline = pair.baseline ?? {};
    const candidate = pair.candidate ?? {};
    const baseCost = finiteMetric(baseline.billed_cost, `${pair.id}.baseline.billed_cost`, { positive: true });
    const nextCost = finiteMetric(candidate.billed_cost, `${pair.id}.candidate.billed_cost`);
    const baseTime = finiteMetric(baseline.wall_time_ms, `${pair.id}.baseline.wall_time_ms`, { positive: true });
    const nextTime = finiteMetric(candidate.wall_time_ms, `${pair.id}.candidate.wall_time_ms`);
    costReductions.push((baseCost - nextCost) / baseCost);
    costRegressions.push((nextCost - baseCost) / baseCost);
    latencyReductions.push((baseTime - nextTime) / baseTime);
    baselineQuality.push(finiteMetric(baseline.quality_score, `${pair.id}.baseline.quality_score`));
    candidateQuality.push(finiteMetric(candidate.quality_score, `${pair.id}.candidate.quality_score`));
    baselineRework.push(finiteMetric(baseline.rework_rounds, `${pair.id}.baseline.rework_rounds`));
    candidateRework.push(finiteMetric(candidate.rework_rounds, `${pair.id}.candidate.rework_rounds`));
    const baseEscapes = finiteMetric(baseline.escaped_high_critical, `${pair.id}.baseline.escaped_high_critical`);
    const nextEscapes = finiteMetric(candidate.escaped_high_critical, `${pair.id}.candidate.escaped_high_critical`);
    if (nextEscapes > baseEscapes) newHighCriticalEscape = true;

    if (candidate.provider_reported_total !== null && candidate.provider_reported_total !== undefined) {
      const providerTotal = finiteMetric(candidate.provider_reported_total, `${pair.id}.candidate.provider_reported_total`, { positive: true });
      const accountedTotal = finiteMetric(candidate.event_accounted_total, `${pair.id}.candidate.event_accounted_total`);
      reconciliationErrors.push(Math.abs(accountedTotal - providerTotal) / providerTotal);
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
    promotion_evidence_authorized: promotionEvidenceAuthorized,
  };
  const requiredStrata = effectiveThresholds.required_strata;
  const minimumSampleSize = effectiveThresholds.minimum_sample_size;
  const minimumPerStratum = effectiveThresholds.minimum_per_stratum;
  const gates = {
    provenance: metrics.promotion_evidence_authorized === true,
    sample_size: metrics.sample_size >= minimumSampleSize,
    strata: requiredStrata.every((stratum) => (stratumCounts.get(stratum) ?? 0) >= minimumPerStratum),
    median_cost: metrics.median_cost_reduction >= effectiveThresholds.median_cost_reduction,
    p75_cost: metrics.p75_cost_reduction >= effectiveThresholds.p75_cost_reduction,
    p95_cost: metrics.p95_cost_regression <= effectiveThresholds.max_p95_regression,
    median_wall_time: metrics.median_wall_time_reduction >= effectiveThresholds.median_wall_time_reduction,
    quality: metrics.quality_drop_points <= effectiveThresholds.max_quality_drop_points,
    rework: metrics.rework_relative_regression <= effectiveThresholds.max_rework_relative_regression,
    security: metrics.new_high_critical_escape === false,
    reconciliation: metrics.max_provider_reconciliation_error === null
      || metrics.max_provider_reconciliation_error <= effectiveThresholds.provider_reconciliation_tolerance,
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
      const routing = routeTask(routingInput);
      const rolloutInput = requireObject(request.rollout?.input ?? request.rollout, 'rollout');
      const rollout = selectRollout({
        actual_mode: routing.mode,
        recommended_mode: routing.mode,
        ...rolloutInput,
      });
      const lineageRequest = request.lineage ?? null;
      const lineage = lineageRequest === null ? null : evaluateLineage(
        lineageRequest.lineage,
        requireObject(lineageRequest.current, 'lineage.current'),
        lineageRequest.now === undefined ? {} : { now: lineageRequest.now }
      );
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
    CAPSULE_MANDATORY_OVERFLOW: 'Mandatory capsule content exceeds the configured limit.',
    CAPSULE_PRIVATE_CONTENT: 'Capsule rejected private or unbounded content.',
    CAPSULE_SCHEMA_INVALID: 'Capsule does not satisfy its schema.',
    CAPSULE_STRING_TOO_LONG: 'Capsule contains an overlong string.',
    EFFICIENCY_EVENT_INVALID: 'Efficiency event does not satisfy its schema or allowlists.',
    INVALID_REQUEST: 'Request must be one valid JSON object for the selected operation.',
    PRIVATE_TELEMETRY: 'Efficiency event rejected private or repository-identifying content.',
    REQUEST_TOO_LARGE: 'Request exceeds the one-megabyte stdin limit.',
    UNSUPPORTED_OPERATION: 'Unsupported context-efficiency operation.',
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

if (isDirectExecution()) {
  try {
    const operation = process.argv[2];
    if (!operation) {
      const error = new TypeError('Operation is required');
      error.code = 'UNSUPPORTED_OPERATION';
      throw error;
    }
    const source = readFileSync(0, 'utf8');
    if (Buffer.byteLength(source, 'utf8') > 1_048_576) {
      const error = new RangeError('Request exceeds the stdin limit');
      error.code = 'REQUEST_TOO_LARGE';
      throw error;
    }
    const payload = JSON.parse(source);
    const result = executeRuntimeOperation(operation, payload);
    process.stdout.write(`${JSON.stringify({ ok: true, operation, result })}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify(safeFailure(error))}\n`);
    process.exitCode = 1;
  }
}

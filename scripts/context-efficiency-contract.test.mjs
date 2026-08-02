import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  MODES,
  REASON_CODES,
  canonicalJson,
  evaluateBudget,
  evaluateLineage,
  evaluatePromotion,
  evaluateVaultDelta,
  executeRuntimeOperation,
  hashCapsule,
  normalizeEfficiencyEvent,
  prepareCapsule,
  resolveResultPolicy,
  routeTask,
  selectRollout,
  shouldDeepQuery,
  verificationPlan,
  validateAgainstSchema,
} from './lib/context-efficiency.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const fixtureRoot = join(here, 'fixtures', 'context-efficiency');

function json(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function fixture(name) {
  return json(join(fixtureRoot, name));
}

const sourceContracts = join(root, 'knowzcode', 'knowzcode', 'contracts');
const pluginContracts = join(root, 'plugins', 'knowzcode', 'knowzcode', 'contracts');
const capsuleSchema = json(join(sourceContracts, 'context-capsule.schema.json'));
const lineageSchema = json(join(sourceContracts, 'agent-lineage.schema.json'));
const eventSchema = json(join(sourceContracts, 'efficiency-event.schema.json'));

test('portable mode and reason vocabularies are stable and ordered', () => {
  assert.deepEqual(MODES, [
    'local',
    'resume',
    'inherit-full',
    'inherit-recent',
    'fresh-capsule',
    'coordinated-team',
  ]);
  assert.deepEqual(REASON_CODES, [
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
});

test('router fixtures resolve one deterministic mode and ordered reasons', () => {
  for (const entry of fixture('router-cases.json').cases) {
    const input = structuredClone(entry.input);
    if (entry.expected.mode === 'coordinated-team') {
      input.sensitivity = 'normal';
      input.team.safe = true;
      input.team.sensitivity_approved = true;
    }
    const first = routeTask(input);
    const second = routeTask(structuredClone(input));
    assert.deepEqual(first, second, `${entry.id}: repeatability`);
    assert.equal(first.mode, entry.expected.mode, `${entry.id}: mode`);
    assert.deepEqual(first.reason_codes, entry.expected.reason_codes, `${entry.id}: reasons`);
    assert.ok(MODES.includes(first.mode), `${entry.id}: documented mode`);
    assert.equal(new Set(first.reason_codes).size, first.reason_codes.length, `${entry.id}: reasons unique`);
  }
});

test('overlapping global writer ownership serializes before resume, inheritance, or team routing', () => {
  for (const candidate of [
    {
      is_writer: true,
      owned_files: ['src/shared.js'],
      lineage: { compatible: true, resumable: true, role: 'builder' },
    },
    {
      is_writer: true,
      owned_files: ['src/shared.js'],
      inheritance: { affinity: 'high', safe: true, within_budget: true, full_supported: true },
    },
    {
      capsule_sufficient: false,
      team: {
        coordination_required: true,
        peers: 2,
        provider_supported: true,
        within_budget: true,
        latency_ratio: 0.5,
        scopes: [{ owned_files: ['src/shared.js'] }, { owned_files: ['src/other.js'] }],
      },
    },
  ]) {
    const result = routeTask({
      ...candidate,
      active_writers: [{ owned_files: ['src/shared.js'] }],
    });
    assert.deepEqual(result, {
      mode: 'local',
      reason_codes: ['WRITER_OWNERSHIP_CONFLICT'],
    });
  }
  assert.deepEqual(routeTask({
    is_writer: true,
    lineage_id: 'same-lineage',
    owned_files: ['src/shared.js'],
    active_writers: [{ lineage_id: 'same-lineage', owned_files: ['src/shared.js'] }],
    lineage: { compatible: true, resumable: true, role: 'builder' },
  }), {
    mode: 'local',
    reason_codes: ['WRITER_OWNERSHIP_CONFLICT'],
  });
});

test('declared writers require explicit ownership before resume or inheritance', () => {
  for (const candidate of [
    { lineage: { compatible: true, resumable: true, role: 'builder' } },
    { inheritance: { affinity: 'high', safe: true, within_budget: true, full_supported: true } },
  ]) {
    assert.throws(
      () => routeTask({
        role: 'builder',
        active_writers: [{ owned_files: ['src/security.js'] }],
        ...candidate,
      }),
      (error) => error?.code === 'WRITER_SCOPE_REQUIRED',
      'an unscoped writer cannot prove non-overlap'
    );
  }
  assert.throws(
    () => routeTask({
      sensitivity: 'normal',
      capsule_sufficient: false,
      team: {
        coordination_required: true,
        peers: 2,
        provider_supported: true,
        safe: true,
        sensitivity_approved: true,
        within_budget: true,
        latency_ratio: 0.5,
        scopes: [{}, { owned_files: ['src/scoped.mjs'] }],
      },
    }),
    (error) => error?.code === 'WRITER_SCOPE_REQUIRED',
    'each inferred team writer needs its own scope'
  );
  assert.throws(
    () => routeTask({
      role: 'builder',
      owned_files: ['src/scoped.mjs'],
      active_writers: [{}],
    }),
    (error) => error?.code === 'WRITER_SCOPE_REQUIRED',
    'active writer records also require explicit ownership'
  );
});

test('writer ownership canonicalizes in-root aliases and rejects absolute, traversal, and escaping paths', () => {
  const conflict = {
    mode: 'local',
    reason_codes: ['WRITER_OWNERSHIP_CONFLICT'],
  };
  for (const candidate of [
    { role: 'builder', owned_files: ['./src/shared.js'], active_writers: [{ owned_files: ['src/shared.js'] }] },
    { role: 'builder', owned_files: ['src'], active_writers: [{ owned_files: ['src/shared.js'] }] },
    { role: 'builder', owned_files: ['SRC/Shared.js'], active_writers: [{ owned_files: ['src/shared.js'] }] },
  ]) {
    assert.deepEqual(routeTask(candidate), conflict);
  }

  for (const path of [
    join(root, 'scripts', 'context-efficiency-contract.test.mjs'),
    '../outside.js',
    'src/../outside.js',
    'C:/workspace/file.js',
    'file:relative.js',
    'https://example.test/file.js',
  ]) {
    assert.throws(
      () => routeTask({ role: 'builder', workspace_root: root, owned_files: [path] }),
      (error) => error?.code === 'INVALID_OWNERSHIP_PATH',
      path
    );
  }

  const temporaryRoot = mkdtempSync(join(tmpdir(), 'knowzcode-ownership-'));
  const outsideRoot = mkdtempSync(join(tmpdir(), 'knowzcode-outside-'));
  try {
    mkdirSync(join(temporaryRoot, 'actual'));
    symlinkSync(join(temporaryRoot, 'actual'), join(temporaryRoot, 'alias'), 'dir');
    assert.deepEqual(routeTask({
      role: 'builder',
      workspace_root: temporaryRoot,
      owned_files: ['alias/component'],
      active_writers: [{ owned_files: ['actual/component'] }],
    }), conflict);
    symlinkSync(outsideRoot, join(temporaryRoot, 'escape'), 'dir');
    assert.throws(
      () => routeTask({
        role: 'builder',
        workspace_root: temporaryRoot,
        owned_files: ['escape/component'],
      }),
      (error) => error?.code === 'INVALID_OWNERSHIP_PATH'
    );
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
    rmSync(outsideRoot, { recursive: true, force: true });
  }
});

test('inheritance and coordinated teams require affirmative safety, sensitivity, and budget facts', () => {
  for (const inheritance of [
    { affinity: 'high', within_budget: true, full_supported: true },
    { affinity: 'high', safe: true, full_supported: true },
  ]) {
    assert.deepEqual(routeTask({ inheritance }), {
      mode: 'fresh-capsule',
      reason_codes: ['INDEPENDENT_CAPSULE', 'CAPABILITY_FALLBACK'],
    });
  }
  assert.deepEqual(routeTask({
    capsule_sufficient: false,
    team: {
      coordination_required: true,
      peers: 2,
      provider_supported: true,
      latency_ratio: 0.5,
      scopes: [{ owned_files: ['src/a.js'] }, { owned_files: ['src/b.js'] }],
    },
  }), {
    mode: 'fresh-capsule',
    reason_codes: ['INDEPENDENT_CAPSULE', 'CAPABILITY_FALLBACK'],
  });

  const authorizedTeam = {
    coordination_required: true,
    peers: 2,
    provider_supported: true,
    within_budget: true,
    latency_ratio: 0.5,
    safe: true,
    sensitivity_approved: true,
    scopes: [{ owned_files: ['src/a.js'] }, { owned_files: ['src/b.js'] }],
  };
  assert.deepEqual(routeTask({
    capsule_sufficient: false,
    sensitivity: 'normal',
    team: authorizedTeam,
  }), {
    mode: 'coordinated-team',
    reason_codes: ['TEAM_COORDINATION_REQUIRED'],
  });
  for (const input of [
    { sensitivity: 'normal', team: { ...authorizedTeam, safe: undefined } },
    { sensitivity: 'normal', team: { ...authorizedTeam, sensitivity_approved: undefined } },
    { sensitivity: 'unclassified', team: authorizedTeam },
  ]) {
    assert.deepEqual(routeTask({ capsule_sufficient: false, ...input }), {
      mode: 'fresh-capsule',
      reason_codes: ['INDEPENDENT_CAPSULE', 'CAPABILITY_FALLBACK'],
    });
  }
});

test('resolved writer ownership participates in inherited-writer caps', () => {
  assert.deepEqual(routeTask({
    resolved_owned_files: ['src/generated.js'],
    active_inherited_writers: 2,
    max_active_inherited: 2,
    lineage: { compatible: true, resumable: true, role: 'generator' },
  }), {
    mode: 'fresh-capsule',
    reason_codes: ['INDEPENDENT_CAPSULE', 'CAPABILITY_FALLBACK'],
  });
});

test('nesting limit serializes every delegated mode, including capsules and teams', () => {
  for (const candidate of [
    {},
    { inheritance: { affinity: 'high', safe: true, within_budget: true, full_supported: true } },
    {
      capsule_sufficient: false,
      team: {
        coordination_required: true,
        peers: 2,
        provider_supported: true,
        within_budget: true,
        latency_ratio: 0.5,
        scopes: [{ owned_files: ['src/a.js'] }, { owned_files: ['src/b.js'] }],
      },
    },
  ]) {
    assert.deepEqual(routeTask({ ...candidate, nesting_depth: 2, max_nesting_depth: 2 }), {
      mode: 'local', reason_codes: ['NESTING_LIMIT'],
    });
  }
});

test('independent reviewers never inherit or resume builder reasoning lineage', () => {
  for (const mode of ['resume', 'inherit-full', 'inherit-recent']) {
    const result = routeTask({
      role: 'reviewer',
      independent_reviewer: true,
      capsule_sufficient: true,
      lineage: { compatible: mode === 'resume', role: 'builder', resumable: true },
      inheritance: {
        safe: true,
        affinity: 'high',
        full_supported: mode === 'inherit-full',
        recent_supported: mode === 'inherit-recent',
        recent_sufficient: mode === 'inherit-recent',
        within_budget: true,
      },
    });
    assert.equal(result.mode, 'fresh-capsule');
    assert.ok(result.reason_codes.includes('REVIEW_INDEPENDENCE'));
  }
});

test('capsules validate, canonicalize, and hash independently of key order', () => {
  const valid = fixture('capsule-valid.json');
  assert.deepEqual(validateAgainstSchema(valid, capsuleSchema), []);

  const reordered = Object.fromEntries(Object.entries(valid).reverse());
  assert.equal(canonicalJson(valid), canonicalJson(reordered));
  assert.equal(hashCapsule(valid), hashCapsule(reordered));
  assert.equal(valid.capsule_hash, hashCapsule(valid));
  assert.doesNotMatch(canonicalJson(valid), /raw transcript|Bearer |\bsk-[A-Za-z0-9_-]{12,}/i);
});

test('capsule overflow externalizes optional evidence but preserves mandatory fields', () => {
  const source = fixture('capsule-overflow.json');
  const prepared = prepareCapsule(source, {
    max_bytes: 1450,
    artifact_path: 'knowzcode/artifacts/capsule-evidence.json',
    artifact_roots: ['knowzcode/artifacts'],
  });
  assert.ok(Buffer.byteLength(canonicalJson(prepared), 'utf8') <= 1450);
  assert.equal(prepared.objective, source.objective);
  assert.deepEqual(prepared.specs, source.specs);
  assert.equal(prepared.next_action, source.next_action);
  assert.deepEqual(prepared.evidence, []);
  assert.equal(prepared.artifact_refs[0], 'knowzcode/artifacts/capsule-evidence.json');
  assert.deepEqual(validateAgainstSchema(prepared, capsuleSchema), []);
});

test('mandatory capsule overflow fails closed instead of truncating requirements', () => {
  const source = fixture('capsule-valid.json');
  assert.throws(
    () => prepareCapsule({ ...source, objective: 'x'.repeat(4000) }, { max_bytes: 500 }),
    (error) => error?.code === 'CAPSULE_MANDATORY_OVERFLOW'
  );
});

test('capsule preparation fails closed on schema errors and private content before hashing', () => {
  assert.throws(
    () => prepareCapsule(fixture('capsule-invalid-schema.json')),
    (error) => error?.code === 'CAPSULE_SCHEMA_INVALID'
  );
  assert.throws(
    () => prepareCapsule(fixture('capsule-private.json')),
    (error) => error?.code === 'CAPSULE_PRIVATE_CONTENT'
  );
  assert.throws(
    () => prepareCapsule({ ...fixture('capsule-valid.json'), raw_prompt: 'private' }),
    (error) => error?.code === 'CAPSULE_SCHEMA_INVALID'
  );
  for (const [id, mutate] of [
    ['raw-prompt-marker', (value) => { value.objective = 'RAW PROMPT: hidden system policy'; }],
    ['verbatim-log-marker', (value) => { value.failures = [{ command: 'test', summary: 'verbatim log output follows', artifact: null }]; }],
    ['claude-session-id', (value) => { value.approved_decisions = ['Claude session id: claude-session-1a2b3c4d5e6f']; }],
    ['codex-thread-id', (value) => { value.constraints = ['Codex thread id: thread_123456789abcdef']; }],
    ['provider-agent-id', (value) => { value.risks = ['provider agent id: provider-agent-123456789']; }],
    ['basic-authorization', (value) => { value.constraints = ['Authorization: Basic dXNlcjpwYXNzd29yZA==']; }],
    ['short-basic-authorization', (value) => { value.constraints = ['Authorization: Basic dTpw']; }],
    ['npm-token', (value) => { value.constraints = ['npm_0123456789abcdef0123456789abcdef0123']; }],
    ['credential-url', (value) => { value.constraints = ['jdbc:postgresql://user:password@db.internal/app']; }],
  ]) {
    const value = structuredClone(fixture('capsule-valid.json'));
    mutate(value);
    assert.throws(
      () => prepareCapsule(value),
      (error) => error?.code === 'CAPSULE_PRIVATE_CONTENT',
      id
    );
  }
});

test('artifact references are repository-relative and receive a final privacy scan', () => {
  const overflow = fixture('capsule-overflow.json');
  for (const artifact_path of [
    '../private/evidence.json',
    '/tmp/evidence.json',
    'https://example.test/evidence.json',
  ]) {
    assert.throws(
      () => prepareCapsule(overflow, { max_bytes: 1450, artifact_path }),
      (error) => error?.code === 'CAPSULE_ARTIFACT_REF_INVALID',
      artifact_path
    );
  }
  assert.throws(
    () => prepareCapsule(overflow, {
      max_bytes: 1450,
      artifact_path: 'knowzcode/artifacts/provider-session-id:session_123456789abcdef.json',
    }),
    (error) => error?.code === 'CAPSULE_ARTIFACT_REF_INVALID'
  );
  const embedded = structuredClone(fixture('capsule-valid.json'));
  embedded.failures = [{ command: 'test', summary: 'failed', artifact: '../../outside.log' }];
  assert.throws(
    () => prepareCapsule(embedded),
    (error) => ['CAPSULE_SCHEMA_INVALID', 'CAPSULE_ARTIFACT_REF_INVALID'].includes(error?.code)
  );
  const protectedArtifact = structuredClone(fixture('capsule-valid.json'));
  protectedArtifact.artifact_refs = ['.git/config'];
  assert.throws(
    () => prepareCapsule(protectedArtifact),
    (error) => error?.code === 'CAPSULE_ARTIFACT_REF_UNAUTHORIZED',
    'embedded artifact references must stay inside the runtime-owned artifact boundary'
  );
});

test('capsule evidence externalization requires an explicitly authorized artifact root', () => {
  const overflow = fixture('capsule-overflow.json');
  for (const artifact_path of [
    'package.json',
    '.git/config',
    'knowzcode/knowzcode/context_efficiency_runtime.mjs',
  ]) {
    assert.throws(
      () => prepareCapsule(overflow, {
        max_bytes: 1450,
        artifact_path,
        artifact_roots: ['knowzcode/artifacts'],
      }),
      (error) => error?.code === 'CAPSULE_ARTIFACT_REF_UNAUTHORIZED',
      artifact_path
    );
  }
  assert.throws(
    () => prepareCapsule(overflow, {
      max_bytes: 1450,
      artifact_path: 'knowzcode/artifacts/capsule-evidence.json',
    }),
    (error) => error?.code === 'CAPSULE_ARTIFACT_REF_UNAUTHORIZED',
    'authorization defaults to no writable artifact roots'
  );
  assert.throws(
    () => prepareCapsule(overflow, {
      max_bytes: 1450,
      artifact_path: '.git/config',
      artifact_roots: ['.git'],
    }),
    (error) => error?.code === 'CAPSULE_ARTIFACT_REF_UNAUTHORIZED',
    'a request cannot self-authorize a protected repository path'
  );
  assert.doesNotThrow(() => prepareCapsule(overflow, {
    max_bytes: 1450,
    artifact_path: 'knowzcode/artifacts/capsule-evidence.json',
    artifact_roots: ['knowzcode/artifacts'],
  }));
});

test('all capsule file references are portable repository-relative paths', () => {
  const capsule = fixture('capsule-valid.json');
  for (const mutation of [
    { owned_files: ['/tmp/outside.js'] },
    { read_files: ['../secrets.txt'] },
    { specs: [{ path: 'C:/private/spec.md', verify_ids: ['VERIFY-1'] }] },
    { owned_files: ['src/name:stream.js'] },
  ]) {
    assert.throws(
      () => prepareCapsule({ ...capsule, ...mutation }),
      (error) => error?.code === 'CAPSULE_ARTIFACT_REF_INVALID'
    );
  }
});

test('lineage fixtures cover hot, cold-valid, reconcile, and invalid states', () => {
  for (const entry of fixture('lineage-cases.json').cases) {
    assert.deepEqual(
      evaluateLineage(entry.lineage, entry.current, { now: entry.now }),
      entry.expected,
      entry.id
    );
    assert.deepEqual(validateAgainstSchema(entry.lineage, lineageSchema), [], `${entry.id}: schema`);
  }
});

test('lineage invalidates every stable compatibility dimension and reconciles capsule changes', () => {
  const lineage = fixture('lineage-cases.json').cases.find(({ id }) => id === 'hot').lineage;
  const current = Object.fromEntries([
    'platform', 'workgroup_id', 'role', 'phase', 'fix_loop_id', 'spec_hash', 'scope_hash',
    'checkpoint_sha', 'model', 'effort', 'runtime_prefix_hash', 'baseline_hash', 'capsule_hash',
    'tools_hash', 'permissions_hash', 'sensitivity',
  ].map((key) => [key, lineage[key]]));
  const changes = {
    platform: 'codex',
    workgroup_id: 'kc-other',
    role: 'reviewer',
    phase: '2B',
    fix_loop_id: 'fix-other',
    spec_hash: 'sha256:spec-v2',
    scope_hash: 'sha256:scope-v2',
    checkpoint_sha: '1234567changed',
    model: 'different',
    effort: 'high',
    runtime_prefix_hash: `sha256:${'d'.repeat(64)}`,
    baseline_hash: `sha256:${'e'.repeat(64)}`,
    tools_hash: 'sha256:tools-v2',
    permissions_hash: 'sha256:permissions-v2',
    sensitivity: 'isolated',
  };
  for (const [field, changed] of Object.entries(changes)) {
    assert.equal(
      evaluateLineage(lineage, { ...current, [field]: changed }).state,
      'INVALID',
      field
    );
  }
  assert.deepEqual(
    evaluateLineage(lineage, { ...current, capsule_hash: `sha256:${'f'.repeat(64)}` }),
    { state: 'RECONCILE_REQUIRED', invalidations: ['RECONCILIATION_REQUIRED'] }
  );
  assert.equal(
    evaluateLineage(lineage, { ...current, scope_complete: true, likely_continuation: false }).state,
    'COLD_VALID'
  );
});

test('lineage timestamps require strict RFC 3339 and malformed now never stays hot', () => {
  const lineage = fixture('lineage-cases.json').cases.find(({ id }) => id === 'hot').lineage;
  const current = Object.fromEntries([
    'platform', 'workgroup_id', 'role', 'phase', 'fix_loop_id', 'spec_hash', 'scope_hash',
    'checkpoint_sha', 'model', 'effort', 'runtime_prefix_hash', 'baseline_hash', 'capsule_hash',
    'tools_hash', 'permissions_hash', 'sensitivity',
  ].map((key) => [key, lineage[key]]));
  for (const now of ['not-a-date', '2026-02-31T00:00:00Z', '2026-07-30 00:00:00Z']) {
    assert.throws(
      () => evaluateLineage(lineage, current, { now }),
      (error) => error?.code === 'INVALID_DATE_TIME',
      now
    );
  }
  assert.notDeepEqual(validateAgainstSchema({ ...lineage, created_at: '2026-02-31T00:00:00Z' }, lineageSchema), []);
});

test('a resumable lineage without a bounded lease is never hot', () => {
  const lineage = fixture('lineage-cases.json').cases.find(({ id }) => id === 'hot').lineage;
  const current = Object.fromEntries([
    'platform', 'workgroup_id', 'role', 'phase', 'fix_loop_id', 'spec_hash', 'scope_hash',
    'checkpoint_sha', 'model', 'effort', 'runtime_prefix_hash', 'baseline_hash', 'capsule_hash',
    'tools_hash', 'permissions_hash', 'sensitivity',
  ].map((key) => [key, lineage[key]]));
  assert.deepEqual(
    evaluateLineage({ ...lineage, lease_expires_at: null }, current, {
      now: '2026-07-30T08:20:00Z',
    }),
    { state: 'COLD_VALID', invalidations: [] }
  );
});

test('budget fixtures enforce deterministic threshold actions without skipping safety', () => {
  for (const entry of fixture('budget-cases.json').cases) {
    const result = evaluateBudget(entry.used, entry.limit);
    assert.deepEqual(result, entry.expected, entry.id);
    assert.equal(result.mandatory_gates_preserved, true, entry.id);
  }
});

test('telemetry normalization keeps namespaces separate, nulls unknown billing, and rejects identifiers', () => {
  const cases = fixture('telemetry-cases.json');
  const normalized = normalizeEfficiencyEvent(cases.valid_partial);
  assert.equal(normalized.billed.uncached_input_tokens, null);
  assert.equal(normalized.billed.accounting_source, 'unknown');
  assert.deepEqual(validateAgainstSchema(normalized, eventSchema), []);

  for (const invalid of cases.private_invalid) {
    assert.throws(
      () => normalizeEfficiencyEvent(invalid.event),
      (error) => error?.code === 'PRIVATE_TELEMETRY',
      invalid.id
    );
  }
  for (const invalid of cases.schema_invalid) {
    assert.throws(
      () => normalizeEfficiencyEvent(invalid.event),
      (error) => error?.code === 'EFFICIENCY_EVENT_INVALID',
      invalid.id
    );
  }
  assert.throws(
    () => normalizeEfficiencyEvent({ ...cases.valid_partial, billed: { output_tokens: 1 } }),
    (error) => error?.code === 'ACCOUNTING_SOURCE_REQUIRED'
  );
  for (const accounting_source of [null, 'unknown', 'estimated']) {
    assert.throws(
      () => normalizeEfficiencyEvent({
        ...cases.valid_partial,
        billed: { amount: 1, currency: 'USD', accounting_source },
      }),
      (error) => error?.code === 'ACCOUNTING_SOURCE_REQUIRED',
      `${accounting_source}`
    );
  }
  assert.throws(
    () => normalizeEfficiencyEvent({ ...cases.valid_partial, model: 'arbitrary-unapproved-model' }),
    (error) => error?.code === 'EFFICIENCY_EVENT_INVALID'
  );
  assert.throws(
    () => normalizeEfficiencyEvent({ ...cases.valid_partial, model: 'customer-private-repository-name' }),
    (error) => error?.code === 'PRIVATE_TELEMETRY'
  );
});

test('verification tiers retain the mandatory consolidated Gate 3 boundary', () => {
  for (const entry of fixture('verification-cases.json').cases) {
    assert.deepEqual(verificationPlan(entry.input), entry.expected, entry.id);
  }
});

test('vault deltas skip empty/duplicate writes, batch normal changes, and flush risk', () => {
  for (const entry of fixture('vault-delta-cases.json').cases) {
    assert.deepEqual(evaluateVaultDelta(entry.input), entry.expected, entry.id);
  }
  assert.equal(shouldDeepQuery('Which retry convention remains unresolved?'), true);
  assert.equal(shouldDeepQuery('retry conventions'), false);
  assert.deepEqual(evaluateVaultDelta({
    delta: { category: 'Decision', title: 'Use Redis!', content: 'Cache   with Redis', source_hash: 'new' },
    previous_deltas: [{ category: 'decision', title: 'use redis', content: 'cache with redis', source_hash: 'old' }],
  }), { action: 'skip', reason: 'SEMANTIC_DUPLICATE' });
  assert.deepEqual(evaluateVaultDelta({
    delta: { category: 'Correction', title: 'Retry rule', content: 'New', semantic_key: 'retry-policy-v2' },
    previous_deltas: [{
      category: 'Decision', title: 'Retry', content: 'Old', semantic_key: 'retry-policy-v2',
      KnowledgeId: 'knowledge-retry-policy',
    }],
  }), {
    action: 'amend', reason: 'SEMANTIC_IDENTITY_CHANGED', KnowledgeId: 'knowledge-retry-policy',
  });
  assert.deepEqual(evaluateVaultDelta({
    delta: { category: 'Correction', title: 'Retry rule', content: 'New policy', supersedes: 'K-1' },
    previous_deltas: [{
      category: 'Correction', title: 'Retry rule', content: 'Old policy', supersedes: 'K-1',
      KnowledgeId: 'K-1',
    }],
  }), { action: 'update', reason: 'SUPERSESSION_CHANGED', KnowledgeId: 'K-1' });
  assert.deepEqual(evaluateVaultDelta({
    delta: { category: 'Correction', title: 'Retry rule', content: 'New policy', supersedes: 'K-1' },
    previous_deltas: [{
      category: 'Decision', title: 'Retry rule', content: 'Old policy', KnowledgeId: 'K-1',
    }],
  }), {
    action: 'update', reason: 'SUPERSESSION_CHANGED', KnowledgeId: 'K-1',
  }, 'supersedes may select exactly one prior stable KnowledgeId directly');
  assert.deepEqual(evaluateVaultDelta({
    delta: { category: 'Decision', title: 'Retry rule', content: 'Use three retries', semantic_key: 'new-key' },
    previous_deltas: [{ category: 'Decision', title: 'Retry rule', content: 'Use three retries', semantic_key: 'old-key' }],
  }), { action: 'skip', reason: 'SEMANTIC_DUPLICATE' });
  assert.deepEqual(evaluateVaultDelta({
    delta: { category: 'Security', title: 'Leak', content: 'Provider ID leaked.' },
    severity: ' high ',
  }), { action: 'flush', reason: 'HIGH_RISK' });
  assert.throws(
    () => evaluateVaultDelta({ delta: { title: 'Risk', content: 'Unknown' }, severity: 'urgent' }),
    (error) => error?.code === 'INVALID_SEVERITY'
  );
  assert.throws(
    () => evaluateVaultDelta({
      delta: {
        title: 'Retry', content: 'New', semantic_key: 'retry', KnowledgeId: 'attacker-target',
      },
      previous_deltas: [{ title: 'Retry', content: 'Old', semantic_key: 'retry' }],
    }),
    (error) => error?.code === 'VAULT_TARGET_REQUIRED'
  );
  assert.throws(
    () => evaluateVaultDelta({
      delta: {
        category: 'Correction', title: 'Retry', content: 'New', supersedes: 'attacker-target',
      },
      previous_deltas: [{
        category: 'Correction', title: 'Retry', content: 'Old', supersedes: 'attacker-target',
      }],
    }),
    (error) => error?.code === 'VAULT_TARGET_REQUIRED'
  );
  assert.throws(
    () => evaluateVaultDelta({
      delta: { title: 'Retry', content: 'New', semantic_key: 'retry' },
      previous_deltas: [
        { title: 'Retry A', content: 'Old', semantic_key: 'retry', KnowledgeId: 'K-1' },
        { title: 'Retry B', content: 'Older', semantic_key: 'retry', KnowledgeId: 'K-2' },
      ],
    }),
    (error) => error?.code === 'VAULT_TARGET_AMBIGUOUS'
  );
  assert.throws(
    () => evaluateVaultDelta({
      delta: { title: 'Retry', content: 'New', semantic_key: 'retry' },
      previous_deltas: [{
        title: 'Retry',
        content: 'Old',
        semantic_key: 'retry',
        KnowledgeId: 'K-1',
        knowledge_id: 'K-1',
      }],
    }),
    (error) => error?.code === 'VAULT_TARGET_AMBIGUOUS'
  );
});

test('write-prohibited result policy is executable and has a strict zero-write result', () => {
  assert.deepEqual(resolveResultPolicy({
    write_prohibited: true,
    requested_mode: 'artifact',
    large_raw_output: true,
    authorize_handoff: true,
    authorize_artifact: true,
    authorize_vault_write: true,
    authorize_settings_write: true,
    authorize_workgroup_write: true,
  }), {
    mode: 'ephemeral',
    write_prohibited: true,
    writes: { handoff: false, artifact: false, vault: false, settings: false, workgroup: false },
  });
});

test('material and writer results cannot downgrade their handoff, including raw artifacts', () => {
  for (const input of [
    { requested_mode: 'ephemeral', material: true },
    { requested_mode: 'ephemeral', writer: true },
    { requested_mode: 'ephemeral', partial: true },
  ]) {
    assert.deepEqual(resolveResultPolicy(input), {
      mode: 'durable',
      write_prohibited: false,
      writes: { handoff: true, artifact: false, vault: false, settings: false, workgroup: false },
    });
  }
  assert.deepEqual(resolveResultPolicy({
    requested_mode: 'ephemeral',
    material: true,
    large_raw_output: true,
  }), {
    mode: 'artifact',
    write_prohibited: false,
    writes: { handoff: true, artifact: true, vault: false, settings: false, workgroup: false },
  });
  assert.deepEqual(resolveResultPolicy({
    requested_mode: 'durable',
    large_raw_output: true,
  }), {
    mode: 'artifact',
    write_prohibited: false,
    writes: { handoff: true, artifact: true, vault: false, settings: false, workgroup: false },
  });
  assert.throws(
    () => resolveResultPolicy({ material: true, authorize_handoff: false }),
    (error) => error?.code === 'RESULT_HANDOFF_NOT_AUTHORIZED'
  );
  for (const input of [
    { large_raw_output: true, authorize_artifact: false },
    { requested_mode: 'artifact', authorize_artifact: false },
    { material: true, large_raw_output: true, authorize_artifact: false },
  ]) {
    assert.throws(
      () => resolveResultPolicy(input),
      (error) => error?.code === 'RESULT_ARTIFACT_NOT_AUTHORIZED',
      'artifact-required output cannot report artifact mode with artifact writes disabled'
    );
  }
});

test('rollout selection is executable, deterministic, and separates observe from shadow/canary/on', () => {
  assert.deepEqual(selectRollout({ rollout: 'off', actual_mode: 'local', recommended_mode: 'resume' }), {
    rollout: 'off', execute_recommendation: false, record_actual: false,
    record_recommendation: false, selected_mode: 'local', canary_bucket: null,
  });
  assert.equal(selectRollout({ rollout: 'observe', actual_mode: 'local', recommended_mode: 'resume' }).record_recommendation, false);
  assert.equal(selectRollout({ rollout: 'shadow', actual_mode: 'local', recommended_mode: 'resume' }).record_recommendation, true);
  const canary = selectRollout({ rollout: 'canary', canary_percent: 25, task_corpus_id: 'anon-0123456789abcdef', actual_mode: 'local', recommended_mode: 'resume' });
  assert.deepEqual(canary, selectRollout({ rollout: 'canary', canary_percent: 25, task_corpus_id: 'anon-0123456789abcdef', actual_mode: 'local', recommended_mode: 'resume' }));
  assert.equal(selectRollout({ rollout: 'on', actual_mode: 'local', recommended_mode: 'resume' }).selected_mode, 'resume');
  for (const rollout of ['canary', 'on']) {
    assert.throws(
      () => selectRollout({ rollout, task_corpus_id: 'anon-0123456789abcdef', actual_mode: 'local' }),
      (error) => error?.code === 'ROLLOUT_RECOMMENDATION_REQUIRED',
      rollout
    );
  }
});

test('combined dispatch evaluates lineage first and cannot execute a caller-overridden recommendation', () => {
  const lineage = fixture('lineage-cases.json').cases.find(({ id }) => id === 'hot').lineage;
  const current = Object.fromEntries([
    'platform', 'workgroup_id', 'role', 'phase', 'fix_loop_id', 'spec_hash', 'scope_hash',
    'checkpoint_sha', 'model', 'effort', 'runtime_prefix_hash', 'baseline_hash', 'capsule_hash',
    'tools_hash', 'permissions_hash', 'sensitivity',
  ].map((key) => [key, lineage[key]]));
  const result = executeRuntimeOperation('dispatch', {
    routing: {
      input: {
        role: 'builder',
        owned_files: ['src/dispatch-builder.js'],
        lineage: { compatible: true, resumable: true, role: 'builder' },
      },
    },
    lineage: {
      lineage,
      current: { ...current, checkpoint_sha: 'different-checkpoint' },
      now: '2026-07-30T00:10:00Z',
    },
    rollout: {
      input: {
        rollout: 'on',
        actual_mode: 'local',
        recommended_mode: 'inherit-full',
        recommendation: { mode: 'inherit-recent' },
      },
    },
  });
  assert.equal(result.lineage.state, 'INVALID');
  assert.equal(result.routing.mode, 'fresh-capsule');
  assert.equal(result.rollout.selected_mode, 'fresh-capsule');
  assert.equal(result.rollout.execute_recommendation, true);

  const isolated = executeRuntimeOperation('dispatch', {
    routing: { input: { independent_reviewer: true } },
    rollout: { input: { rollout: 'on', recommended_mode: 'inherit-full' } },
  });
  assert.equal(isolated.routing.mode, 'fresh-capsule');
  assert.equal(isolated.rollout.selected_mode, 'fresh-capsule');

  const outOfCanary = executeRuntimeOperation('dispatch', {
    routing: { input: { independent_reviewer: true } },
    rollout: {
      input: {
        rollout: 'canary',
        canary_percent: 0,
        task_corpus_id: 'anon-0000000000000000',
        actual_mode: 'resume',
      },
    },
  });
  assert.equal(outOfCanary.routing.mode, 'fresh-capsule');
  assert.equal(outOfCanary.rollout.execute_recommendation, false);
  assert.equal(outOfCanary.rollout.selected_mode, 'fresh-capsule',
    'combined dispatch binds both actual and recommended mode to the evaluated router result');

  const restricted = executeRuntimeOperation('dispatch', {
    routing: {
      input: {
        role: 'reviewer',
        lineage: { compatible: true, resumable: true, role: 'reviewer' },
      },
    },
    lineage: {
      lineage: { ...lineage, role: 'reviewer', sensitivity: 'restricted' },
      current: { ...current, role: 'reviewer', sensitivity: 'restricted' },
      now: '2026-07-30T00:10:00Z',
    },
    rollout: { input: { rollout: 'off', actual_mode: 'local' } },
  });
  assert.equal(restricted.lineage.state, 'HOT');
  assert.equal(restricted.routing.mode, 'fresh-capsule');
  assert.ok(restricted.routing.reason_codes.includes('SENSITIVITY_ISOLATION'));

  assert.throws(
    () => executeRuntimeOperation('dispatch', {
      routing: { input: { role: 'builder', sensitivity: 'restricted' } },
      lineage: { lineage, current: { ...current, role: 'reviewer', sensitivity: 'public' } },
      rollout: { input: { rollout: 'off', actual_mode: 'local' } },
    }),
    (error) => error?.code === 'DISPATCH_FACT_MISMATCH'
  );

  const incompleteCurrent = executeRuntimeOperation('dispatch', {
    routing: { input: { role: 'reviewer', sensitivity: 'restricted' } },
    lineage: { lineage, current: { role: 'reviewer' }, now: '2026-07-30T00:10:00Z' },
    rollout: { input: { rollout: 'off', actual_mode: 'local' } },
  });
  assert.equal(incompleteCurrent.lineage.state, 'INVALID');
  assert.equal(incompleteCurrent.routing.mode, 'fresh-capsule');
  assert.ok(incompleteCurrent.routing.reason_codes.includes('SENSITIVITY_ISOLATION'));
});

function assertSubset(actual, expected, label) {
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    assert.ok(actual && typeof actual === 'object', `${label}: expected object`);
    for (const [key, value] of Object.entries(expected)) {
      assertSubset(actual[key], value, `${label}.${key}`);
    }
    return;
  }
  assert.deepEqual(actual, expected, label);
}

test('evaluation corpus executes forty distinct self-contained cases across five balanced strata', (t) => {
  const manifest = fixture('experiment-corpus/manifest.json');
  assert.equal(manifest.schema, 'knowzcode.context-efficiency-corpus/v2');
  assert.equal(manifest.scenarios.length, 40);
  assert.deepEqual(manifest.provenance, {
    kind: 'fixture-only', empirical: false, promotion_authorized: false,
    notice: 'Contract fixtures exercise routing and safety behavior. They are not measured savings evidence.',
  });
  assert.equal(new Set(manifest.scenarios.map(({ id }) => id)).size, 40);
  assert.equal(new Set(manifest.scenarios.map(({ input }) => canonicalJson(input))).size, 40);

  const counts = new Map();
  const operations = new Set();
  const caseResults = [];
  for (const scenario of manifest.scenarios) {
    counts.set(scenario.stratum, (counts.get(scenario.stratum) ?? 0) + 1);
    operations.add(scenario.operation);
    assert.equal(scenario.provenance.kind, 'fixture-only', scenario.id);
    assert.equal(scenario.provenance.empirical, false, scenario.id);
    assert.equal(scenario.provenance.promotion_authorized, false, scenario.id);
    assert.equal(scenario.repository.schema, 'knowzcode.virtual-repository/v2', scenario.id);
    assert.equal(scenario.repository.files.length, 2, scenario.id);
    assert.ok(scenario.repository.files.every(({ path, content }) => path.includes(scenario.id) && content.includes(scenario.id)), scenario.id);
    assert.ok(scenario.spec.rule.includes(scenario.spec.verify_id), scenario.id);
    assert.deepEqual(scenario.owned_files, scenario.repository.files.map(({ path }) => path), scenario.id);

    let observed;
    try {
      const result = executeRuntimeOperation(scenario.operation, scenario.input);
      observed = { status: 'success', result };
      assert.equal(scenario.oracle.status, 'success', `${scenario.id}: unexpectedly succeeded`);
      assertSubset(result, scenario.oracle.match, scenario.id);
    } catch (error) {
      observed = { status: 'error', code: error?.code ?? null };
      assert.equal(scenario.oracle.status, 'error', `${scenario.id}: unexpected error ${error?.code}`);
      assert.equal(error?.code, scenario.oracle.code, scenario.id);
    }
    caseResults.push({ id: scenario.id, operation: scenario.operation, observed });
  }
  assert.deepEqual(Object.fromEntries([...counts].sort()), {
    'backend-refactor': 8,
    'recovery-invalidation': 8,
    'security-compliance': 8,
    'small-tier2': 8,
    'ui-integration': 8,
  });
  for (const operation of ['route', 'lineage', 'capsule', 'telemetry', 'rollout', 'result-policy', 'dispatch']) {
    assert.ok(operations.has(operation), `missing executable operation ${operation}`);
  }
  assert.equal(new Set(caseResults.map((record) => canonicalJson(record))).size, 40);
  assert.equal(manifest.scenarios.filter(({ category }) => category === 'recovery').length, 8);
  assert.deepEqual(manifest.canary_percentages, [10, 25, 50]);

  const paired = fixture(`experiment-corpus/${manifest.paired_results}`);
  assert.equal(paired.schema, 'knowzcode.paired-efficiency-results/v2');
  assert.equal(paired.provenance.kind, 'fixture-only');
  assert.equal(paired.provenance.empirical, false);
  assert.equal(paired.provenance.promotion_authorized, false);
  assert.equal(paired.pairs.length, 40);
  assert.ok(paired.pairs.every(({ stratum }) => typeof stratum === 'string'));
  assert.deepEqual(new Set(paired.pairs.map(({ id }) => id)), new Set(manifest.scenarios.map(({ id }) => id)));
  assert.equal(new Set(paired.pairs.map((record) => canonicalJson(record))).size, 40);
  const fixturePromotion = evaluatePromotion(paired.pairs);
  assert.equal(fixturePromotion.gates.provenance, false);
  assert.equal(fixturePromotion.promote, false, 'fixture-only records must not imply promotion');

  const passingFixtureMetrics = paired.pairs.map((pair) => ({
    ...structuredClone(pair),
    baseline: {
      billed_cost: 100,
      wall_time_ms: 1000,
      quality_score: 95,
      rework_rounds: 1,
      escaped_high_critical: 0,
    },
    candidate: {
      billed_cost: 60,
      wall_time_ms: 700,
      quality_score: 95,
      rework_rounds: 1,
      escaped_high_critical: 0,
      provider_reported_total: 1000,
      event_accounted_total: 1000,
    },
  }));
  const blockedFixturePromotion = evaluatePromotion(passingFixtureMetrics);
  assert.equal(blockedFixturePromotion.gates.provenance, false);
  assert.equal(blockedFixturePromotion.promote, false, 'passing fixture metrics still cannot authorize promotion');

  const relabeledSynthetic = passingFixtureMetrics.map((pair) => ({
    ...pair,
    provenance: { kind: 'synthetic-relabeled', empirical: true, promotion_authorized: true },
  }));
  assert.equal(evaluatePromotion(relabeledSynthetic).gates.provenance, false);
  assert.equal(evaluatePromotion(relabeledSynthetic).promote, false, 'only measured provenance may promote');

  const measuredPairs = passingFixtureMetrics.map((pair) => ({
    ...pair,
    provenance: { kind: 'measured', empirical: true, promotion_authorized: true },
  }));
  const previousTrustedKeys = process.env.KNOWZCODE_TRUSTED_MEASUREMENT_KEYS;
  t.after(() => {
    if (previousTrustedKeys === undefined) delete process.env.KNOWZCODE_TRUSTED_MEASUREMENT_KEYS;
    else process.env.KNOWZCODE_TRUSTED_MEASUREMENT_KEYS = previousTrustedKeys;
  });
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const signerKeyId = 'measurement-key-contract-test';
  process.env.KNOWZCODE_TRUSTED_MEASUREMENT_KEYS = JSON.stringify({
    [signerKeyId]: publicKey.export({ type: 'spki', format: 'pem' }),
  });
  const trustedVersion = {
    expected_candidate_version: 'candidate-v1',
    expected_corpus_version: 'corpus-v1',
    expected_runtime_digest: `sha256:${'1'.repeat(64)}`,
    now: '2026-07-31T12:00:00Z',
    consumed_measurement_run_ids: [],
  };
  const signMeasurementEnvelope = (pairs, overrides = {}) => {
    const envelope = {
      schema: 'knowzcode.measurement-envelope/v2',
      measurement_run_id: 'measurement-0123456789abcdef',
      corpus_digest: `sha256:${createHash('sha256').update(canonicalJson(pairs)).digest('hex')}`,
      pair_count: pairs.length,
      measured_at: '2026-07-30T12:00:00Z',
      accounting_source: 'authoritative',
      promotion_authorized: true,
      signer_key_id: signerKeyId,
      candidate_version: trustedVersion.expected_candidate_version,
      corpus_version: trustedVersion.expected_corpus_version,
      runtime_digest: trustedVersion.expected_runtime_digest,
      ...overrides,
    };
    for (const key of overrides.omit ?? []) delete envelope[key];
    delete envelope.omit;
    envelope.signature = sign(
      null,
      Buffer.from(canonicalJson(envelope), 'utf8'),
      privateKey
    ).toString('base64');
    return envelope;
  };
  const measurementEnvelope = signMeasurementEnvelope(measuredPairs);
  assert.equal(evaluatePromotion(measuredPairs).gates.provenance, false,
    'self-asserted pair provenance is not a trust boundary');
  const measuredPromotion = evaluatePromotion(measuredPairs, undefined, {
    measurement_envelope: measurementEnvelope,
    ...trustedVersion,
  });
  assert.equal(measuredPromotion.gates.provenance, true);
  assert.equal(measuredPromotion.gates.sample_size, true);
  assert.equal(measuredPromotion.gates.strata, true);
  assert.equal(measuredPromotion.promote, true, 'authorized empirical evidence may promote when every gate passes');

  const undersizedPromotion = evaluatePromotion(measuredPairs.slice(0, 1), undefined, {
    measurement_envelope: measurementEnvelope,
    ...trustedVersion,
  });
  assert.equal(undersizedPromotion.gates.sample_size, false);
  assert.equal(undersizedPromotion.promote, false, 'an undersized measured sample cannot promote');

  const weakenedThresholdPromotion = evaluatePromotion(measuredPairs.slice(0, 1), {
    minimum_sample_size: 1,
    minimum_per_stratum: 0,
    required_strata: [],
    median_cost_reduction: -1,
    p75_cost_reduction: -1,
    max_p95_regression: 10,
    median_wall_time_reduction: -1,
    max_quality_drop_points: 100,
    max_rework_relative_regression: 100,
    provider_reconciliation_tolerance: 1,
  });
  assert.equal(weakenedThresholdPromotion.gates.sample_size, false);
  assert.equal(weakenedThresholdPromotion.gates.strata, false);
  assert.equal(weakenedThresholdPromotion.promote, false, 'callers cannot weaken mandatory promotion floors');

  const unbalancedPairs = measuredPairs.map((pair) => ({ ...pair, stratum: 'small-tier2' }));
  const unbalancedPromotion = evaluatePromotion(unbalancedPairs);
  assert.equal(unbalancedPromotion.gates.strata, false);
  assert.equal(unbalancedPromotion.promote, false, 'an unbalanced measured corpus cannot promote');
  const escaped = structuredClone(paired.pairs);
  escaped[0].candidate.escaped_high_critical = 1;
  assert.equal(evaluatePromotion(escaped).gates.security, false);

  const tamperedPairs = structuredClone(measuredPairs);
  tamperedPairs[0].candidate.billed_cost = 1;
  const tamperedPromotion = evaluatePromotion(tamperedPairs, undefined, {
    measurement_envelope: measurementEnvelope,
    ...trustedVersion,
  });
  assert.equal(tamperedPromotion.gates.provenance, false);
  assert.equal(tamperedPromotion.promote, false, 'signed envelope is bound to the exact corpus');

  assert.equal(evaluatePromotion(measuredPairs, undefined, {
    measurement_envelope: { ...measurementEnvelope, signature: 'AA==' },
    ...trustedVersion,
  }).gates.provenance, false);

  for (const [id, options] of [
    ['candidate-version-mismatch', { ...trustedVersion, expected_candidate_version: 'candidate-v2' }],
    ['corpus-version-mismatch', { ...trustedVersion, expected_corpus_version: 'corpus-v2' }],
    ['runtime-digest-mismatch', {
      ...trustedVersion, expected_runtime_digest: `sha256:${'2'.repeat(64)}`,
    }],
    ['stale-measurement', { ...trustedVersion, now: '2026-09-01T12:00:00Z' }],
    ['future-measurement', { ...trustedVersion, now: '2026-07-30T11:54:59Z' }],
    ['replayed-run', {
      ...trustedVersion,
      consumed_measurement_run_ids: [measurementEnvelope.measurement_run_id],
    }],
  ]) {
    const result = evaluatePromotion(measuredPairs, undefined, {
      measurement_envelope: measurementEnvelope,
      ...options,
    });
    assert.equal(result.gates.provenance, false, id);
    assert.equal(result.promote, false, id);
  }

  const missingVersionEnvelope = signMeasurementEnvelope(measuredPairs, {
    omit: ['candidate_version'],
  });
  assert.equal(evaluatePromotion(measuredPairs, undefined, {
    measurement_envelope: missingVersionEnvelope,
    ...trustedVersion,
  }).gates.provenance, false, 'all signed version bindings are mandatory');

  const providerlessPairs = structuredClone(measuredPairs);
  for (const pair of providerlessPairs) {
    delete pair.candidate.provider_reported_total;
    delete pair.candidate.event_accounted_total;
  }
  const providerlessPromotion = evaluatePromotion(providerlessPairs, undefined, {
    measurement_envelope: signMeasurementEnvelope(providerlessPairs, {
      measurement_run_id: 'measurement-fedcba9876543210',
    }),
    ...trustedVersion,
  });
  assert.equal(providerlessPromotion.gates.reconciliation, false,
    'promotion requires complete provider/accounted totals for every measured pair');
  assert.equal(providerlessPromotion.promote, false);
  assert.throws(
    () => evaluatePromotion([
      measuredPairs[0],
      { ...structuredClone(measuredPairs[1]), id: measuredPairs[0].id },
    ]),
    /unique anonymous corpus ids/
  );
  const unbounded = structuredClone(measuredPairs);
  unbounded[0].candidate.quality_score = 101;
  assert.throws(() => evaluatePromotion(unbounded), /bounded number/);
  const fractional = structuredClone(measuredPairs);
  fractional[0].candidate.rework_rounds = 0.5;
  assert.throws(() => evaluatePromotion(fractional), /bounded integer/);
});

test('shipped stdin CLI exposes pure operations and redacts fail-closed errors', () => {
  const runtime = join(root, 'knowzcode', 'knowzcode', 'context_efficiency_runtime.mjs');
  const manifest = fixture('experiment-corpus/manifest.json');
  for (const operation of ['route', 'lineage', 'capsule', 'telemetry', 'rollout', 'result-policy', 'dispatch']) {
    const scenario = manifest.scenarios.find((entry) => entry.operation === operation && entry.oracle.status === 'success');
    assert.ok(scenario, `missing successful CLI fixture for ${operation}`);
    const child = spawnSync(process.execPath, [runtime, operation], {
      cwd: root,
      input: JSON.stringify(scenario.input),
      encoding: 'utf8',
    });
    assert.equal(child.status, 0, `${operation}: ${child.stderr || child.stdout}`);
    assert.equal(child.stderr, '', operation);
    const lines = child.stdout.trim().split(/\r?\n/);
    assert.equal(lines.length, 1, operation);
    const response = JSON.parse(lines[0]);
    assert.equal(response.ok, true, operation);
    assert.equal(response.operation, operation, operation);
    assertSubset(response.result, scenario.oracle.match, operation);
  }

  const vaultDelta = spawnSync(process.execPath, [runtime, 'vault-delta'], {
    cwd: root,
    input: JSON.stringify({
      input: {
        delta: {
          category: 'decision',
          title: 'Reuse compatible lineage',
          content: 'Resume with a bounded delta before spawning.',
          semantic_key: 'lineage-reuse',
        },
      },
    }),
    encoding: 'utf8',
  });
  assert.equal(vaultDelta.status, 0, vaultDelta.stderr || vaultDelta.stdout);
  assert.deepEqual(JSON.parse(vaultDelta.stdout.trim()), {
    ok: true,
    operation: 'vault-delta',
    result: { action: 'batch', reason: 'NORMAL_DELTA' },
  });

  const rejected = manifest.scenarios.find(({ id }) => id === 'security-compliance-03');
  const child = spawnSync(process.execPath, [runtime, 'capsule'], {
    cwd: root,
    input: JSON.stringify(rejected.input),
    encoding: 'utf8',
  });
  assert.notEqual(child.status, 0);
  const response = JSON.parse(child.stdout.trim());
  assert.deepEqual(response, {
    ok: false,
    code: 'CAPSULE_PRIVATE_CONTENT',
    message: 'Capsule rejected private or unbounded content.',
  });
  assert.doesNotMatch(child.stdout, /claude-session|1a2b3c4d5e6f/i);
});

test('stdin limit is enforced while reading rather than after buffering the complete request', () => {
  const runtime = join(root, 'knowzcode', 'knowzcode', 'context_efficiency_runtime.mjs');
  const runtimeSource = readFileSync(runtime, 'utf8');
  assert.doesNotMatch(runtimeSource, /readFileSync\(\s*0\s*,/,
    'an unbounded read of fd 0 defeats the one-megabyte adapter limit');

  const child = spawnSync(process.execPath, [runtime, 'route'], {
    cwd: root,
    input: `{"padding":"${'x'.repeat(1_048_576)}"}`,
    encoding: 'utf8',
    maxBuffer: 2_097_152,
  });
  assert.notEqual(child.status, 0);
  assert.deepEqual(JSON.parse(child.stdout.trim()), {
    ok: false,
    code: 'REQUEST_TOO_LARGE',
    message: 'Request exceeds the one-megabyte stdin limit.',
  });
});

test('source and Codex plugin contract schemas are exact mirrors', () => {
  for (const name of [
    'context-capsule.schema.json',
    'agent-lineage.schema.json',
    'efficiency-event.schema.json',
  ]) {
    assert.equal(
      readFileSync(join(sourceContracts, name), 'utf8'),
      readFileSync(join(pluginContracts, name), 'utf8'),
      name
    );
  }
  assert.equal(
    readFileSync(join(root, 'knowzcode', 'knowzcode', 'context_efficiency_runtime.mjs'), 'utf8'),
    readFileSync(join(root, 'plugins', 'knowzcode', 'knowzcode', 'context_efficiency_runtime.mjs'), 'utf8')
  );
});

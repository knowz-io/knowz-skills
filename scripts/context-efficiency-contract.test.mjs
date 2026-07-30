import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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
    const first = routeTask(entry.input);
    const second = routeTask(structuredClone(entry.input));
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
  assert.equal(routeTask({
    is_writer: true,
    lineage_id: 'same-lineage',
    owned_files: ['src/shared.js'],
    active_writers: [{ lineage_id: 'same-lineage', owned_files: ['src/shared.js'] }],
    lineage: { compatible: true, resumable: true, role: 'builder' },
  }).mode, 'resume');
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
    previous_deltas: [{ category: 'Decision', title: 'Retry', content: 'Old', semantic_key: 'retry-policy-v2' }],
  }), { action: 'amend', reason: 'SEMANTIC_IDENTITY_CHANGED' });
  assert.deepEqual(evaluateVaultDelta({
    delta: { category: 'Correction', title: 'Retry rule', content: 'New policy', supersedes: 'K-1' },
    previous_deltas: [{ category: 'Correction', title: 'Retry rule', content: 'Old policy', supersedes: 'K-1' }],
  }), { action: 'update', reason: 'SUPERSESSION_CHANGED' });
  assert.deepEqual(evaluateVaultDelta({
    delta: { category: 'Decision', title: 'Retry rule', content: 'Use three retries', semantic_key: 'new-key' },
    previous_deltas: [{ category: 'Decision', title: 'Retry rule', content: 'Use three retries', semantic_key: 'old-key' }],
  }), { action: 'skip', reason: 'SEMANTIC_DUPLICATE' });
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

test('evaluation corpus executes forty distinct self-contained cases across five balanced strata', () => {
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
  const measuredPromotion = evaluatePromotion(measuredPairs);
  assert.equal(measuredPromotion.gates.provenance, true);
  assert.equal(measuredPromotion.gates.sample_size, true);
  assert.equal(measuredPromotion.gates.strata, true);
  assert.equal(measuredPromotion.promote, true, 'authorized empirical evidence may promote when every gate passes');

  const undersizedPromotion = evaluatePromotion(measuredPairs.slice(0, 1));
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

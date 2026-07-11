#!/usr/bin/env node

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

const errors = [];

function readJson(...parts) {
  const file = join(ROOT, ...parts);
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    errors.push(`Failed to read JSON from ${file}: ${error.message}`);
    return null;
  }
}

function expect(condition, message) {
  if (!condition) errors.push(message);
}

function parseFrontmatter(filePath) {
  const raw = readFileSync(filePath, 'utf8');
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    errors.push(`Missing YAML frontmatter in ${filePath}`);
    return null;
  }

  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const entry = trimmed.match(/^([A-Za-z0-9_-]+):\s*(.+)$/);
    if (!entry) {
      errors.push(`Unparseable frontmatter line in ${filePath}: ${line}`);
      continue;
    }
    fields[entry[1]] = entry[2];
  }
  return fields;
}

function validateSkillDirectory(...parts) {
  const dir = join(ROOT, ...parts);
  expect(existsSync(dir), `Missing skill directory: ${dir}`);
  if (!existsSync(dir)) return;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillPath = join(dir, entry.name, 'SKILL.md');
    expect(existsSync(skillPath), `Missing SKILL.md for ${entry.name}: ${skillPath}`);
    if (!existsSync(skillPath)) continue;
    const fields = parseFrontmatter(skillPath);
    if (!fields) continue;
    const keys = Object.keys(fields).sort();
    expect(
      keys.length === 2 && keys[0] === 'description' && keys[1] === 'name',
      `Codex skill frontmatter must contain only name and description: ${skillPath}`
    );
    expect(Boolean(fields.name), `Missing skill name in ${skillPath}`);
    expect(Boolean(fields.description), `Missing skill description in ${skillPath}`);
  }
}

// These helpers run on hardcoded surface paths. Guard the read: if a surface is renamed,
// moved, or deleted (exactly the drift this validator exists to catch), push a clean error
// and continue instead of crashing with an uncaught ENOENT before the report/exit path.
function expectFileContains(filePath, pattern, message) {
  if (!existsSync(filePath)) {
    expect(false, `Surface file is missing: ${filePath}`);
    return;
  }
  const raw = readFileSync(filePath, 'utf8');
  expect(pattern.test(raw), message);
}

function expectFileContainsAll(filePath, checks, messagePrefix) {
  if (!existsSync(filePath)) {
    expect(false, `${messagePrefix} file is missing: ${filePath}`);
    return;
  }
  const raw = readFileSync(filePath, 'utf8');
  for (const [label, pattern] of checks) {
    expect(pattern.test(raw), `${messagePrefix} must mention ${label}: ${filePath}`);
  }
}

function expectFileNotContains(filePath, pattern, message) {
  if (!existsSync(filePath)) {
    expect(false, `Surface file is missing: ${filePath}`);
    return;
  }
  const raw = readFileSync(filePath, 'utf8');
  expect(!pattern.test(raw), message);
}

const sourcePackages = {
  knowz: readJson('knowz', 'package.json'),
  knowzcode: readJson('knowzcode', 'package.json'),
};

const claudeMarketplace = readJson('.claude-plugin', 'marketplace.json');
const codexMarketplace = readJson('.agents', 'plugins', 'marketplace.json');
const codexManifests = {
  knowz: readJson('plugins', 'knowz', '.codex-plugin', 'plugin.json'),
  knowzcode: readJson('plugins', 'knowzcode', '.codex-plugin', 'plugin.json'),
};

if (claudeMarketplace?.plugins && codexMarketplace?.plugins) {
  for (const productName of Object.keys(sourcePackages)) {
    const sourcePkg = sourcePackages[productName];
    const claudeEntry = claudeMarketplace.plugins.find((plugin) => plugin.name === productName);
    const codexEntry = codexMarketplace.plugins.find((plugin) => plugin.name === productName);
    const codexManifest = codexManifests[productName];

    expect(Boolean(sourcePkg), `Missing source package metadata for ${productName}`);
    expect(Boolean(claudeEntry), `Missing Claude marketplace entry for ${productName}`);
    expect(Boolean(codexEntry), `Missing Codex marketplace entry for ${productName}`);
    expect(Boolean(codexManifest), `Missing Codex plugin manifest for ${productName}`);

    if (!sourcePkg || !claudeEntry || !codexEntry || !codexManifest) continue;

    expect(
      claudeEntry.source === `./${productName}`,
      `Unexpected Claude marketplace source for ${productName}: ${claudeEntry.source}`
    );
    expect(
      codexEntry.source?.source === 'local' && codexEntry.source?.path === `./plugins/${productName}`,
      `Unexpected Codex marketplace source for ${productName}: ${JSON.stringify(codexEntry.source)}`
    );
    expect(
      codexEntry.policy?.installation && codexEntry.policy?.authentication && codexEntry.category,
      `Codex marketplace entry for ${productName} is missing required policy/category fields`
    );

    expect(
      claudeEntry.version === sourcePkg.version,
      `Claude marketplace version drift for ${productName}: ${claudeEntry.version} !== ${sourcePkg.version}`
    );
    expect(
      codexManifest.version === sourcePkg.version,
      `Codex plugin version drift for ${productName}: ${codexManifest.version} !== ${sourcePkg.version}`
    );
    expect(
      codexManifest.name === productName,
      `Codex plugin manifest name drift for ${productName}: ${codexManifest.name}`
    );
    expect(
      codexManifest.interface?.displayName,
      `Missing Codex interface.displayName for ${productName}`
    );
    expect(
      codexManifest.skills?.startsWith('./') && existsSync(join(ROOT, 'plugins', productName, codexManifest.skills.replace(/^\.\//, ''))),
      `Codex plugin skills path is missing or invalid for ${productName}: ${codexManifest.skills}`
    );
    if (codexManifest.mcpServers) {
      expect(
        codexManifest.mcpServers.startsWith('./') && existsSync(join(ROOT, 'plugins', productName, codexManifest.mcpServers.replace(/^\.\//, ''))),
        `Codex plugin MCP manifest path is missing or invalid for ${productName}: ${codexManifest.mcpServers}`
      );
    }
    expect(
      codexManifest.interface?.category === codexEntry.category,
      `Codex category drift for ${productName}: plugin=${codexManifest.interface?.category} marketplace=${codexEntry.category}`
    );
    const prompts = codexManifest.interface?.defaultPrompt || [];
    expect(
      Array.isArray(prompts) && prompts.length <= 3,
      `Codex defaultPrompt must contain at most 3 entries for ${productName}`
    );
    for (const prompt of prompts) {
      expect(
        typeof prompt === 'string' && prompt.length <= 128,
        `Codex defaultPrompt entries must be strings <= 128 chars for ${productName}`
      );
    }
  }
}

if (sourcePackages.knowzcode?.version) {
  const expectedVersion = sourcePackages.knowzcode.version;
  for (const file of [
    join(ROOT, 'knowzcode', 'knowzcode', '.knowzcode-version'),
    join(ROOT, 'plugins', 'knowzcode', 'knowzcode', '.knowzcode-version'),
  ]) {
    expect(existsSync(file), `Missing KnowzCode version marker: ${file}`);
    if (existsSync(file)) {
      expect(
        readFileSync(file, 'utf8').trim() === expectedVersion,
        `KnowzCode version marker drift: ${file} !== ${expectedVersion}`
      );
    }
  }
}

const knowzMcpManifest = readJson('plugins', 'knowz', '.mcp.json');
expect(Boolean(knowzMcpManifest?.mcpServers?.knowz?.url), 'plugins/knowz/.mcp.json is missing mcpServers.knowz.url');
expect(
  Boolean(knowzMcpManifest?.mcpServers?.knowz?.bearer_token_env_var),
  'plugins/knowz/.mcp.json is missing bearer_token_env_var for Codex shared auth'
);

validateSkillDirectory('plugins', 'knowz', 'skills');
validateSkillDirectory('plugins', 'knowzcode', 'skills');

const retiredKnowzSkillDirs = [
  join(ROOT, 'plugins', 'knowz', 'skills', 'knowz-regroup'),
  join(ROOT, 'plugins', 'knowz', 'skills', 'knowz-resume'),
];
for (const dir of retiredKnowzSkillDirs) {
  expect(!existsSync(dir), `Knowz must not ship workflow handoff skill directory: ${dir}`);
}

const knowzBoundaryFiles = [
  join(ROOT, 'knowz', 'skills', 'knowz', 'SKILL.md'),
  join(ROOT, 'knowz', 'skills', 'knowz-auto', 'SKILL.md'),
  join(ROOT, 'plugins', 'knowz', 'skills', 'knowz-auto', 'SKILL.md'),
  join(ROOT, 'knowz', 'platform_adapters.md'),
];
for (const file of knowzBoundaryFiles) {
  expectFileNotContains(
    file,
    /\/knowz\s+(regroup|resume)|knowz-regroup|knowz-resume|Resume Context|resume-context/i,
    `Knowz surface must not expose workflow handoff commands: ${file}`
  );
}

const regroupContractFiles = [
  join(ROOT, 'knowzcode', 'skills', 'regroup', 'SKILL.md'),
  join(ROOT, 'plugins', 'knowzcode', 'skills', 'regroup', 'SKILL.md'),
  join(ROOT, 'knowzcode', '.gemini', 'skills', 'knowzcode-regroup', 'SKILL.md'),
  join(ROOT, 'knowzcode', 'knowzcode', 'platform_adapters.md'),
  join(ROOT, 'plugins', 'knowzcode', 'knowzcode', 'platform_adapters.md'),
];
for (const file of regroupContractFiles) {
  expect(existsSync(file), `Missing KnowzCode regroup surface: ${file}`);
  if (!existsSync(file)) continue;
  expectFileContains(file, /knowzcode\/handoffs\//, `Regroup surface must write local handoffs: ${file}`);
  expectFileContains(file, /Fresh Context Prompt/, `Regroup surface must include fresh-context prompt schema: ${file}`);
  expectFileContains(file, /Durable Learning Candidates/, `Regroup surface must separate durable Knowz candidates: ${file}`);
  expectFileContains(file, /Do not save the (whole )?handoff to Knowz|Do not save the handoff itself to Knowz/i, `Regroup surface must keep workflow handoffs out of Knowz: ${file}`);
}

const regroupTriggerFiles = [
  join(ROOT, 'knowzcode', 'skills', 'regroup-trigger', 'SKILL.md'),
  join(ROOT, 'plugins', 'knowzcode', 'skills', 'regroup-trigger', 'SKILL.md'),
  join(ROOT, 'knowzcode', 'knowzcode', 'platform_adapters.md'),
  join(ROOT, 'plugins', 'knowzcode', 'knowzcode', 'platform_adapters.md'),
];
for (const file of regroupTriggerFiles) {
  expect(existsSync(file), `Missing KnowzCode regroup trigger surface: ${file}`);
  if (!existsSync(file)) continue;
  expectFileContains(file, /\/knowzcode:regroup/, `Regroup trigger must route to /knowzcode:regroup: ${file}`);
  expectFileContains(file, /Never auto-regroup|never writes handoffs directly/i, `Regroup trigger must ask before writing: ${file}`);
}

// Gemini has explicit commands/skills only in this repo; do not ship a passive regroup trigger there
// unless Gemini gains an equivalent trigger-skill concept.
const geminiRegroupTriggerDir = join(ROOT, 'knowzcode', '.gemini', 'skills', 'knowzcode-regroup-trigger');
expect(!existsSync(geminiRegroupTriggerDir), `Gemini regroup trigger is intentionally not shipped: ${geminiRegroupTriggerDir}`);
for (const file of [
  join(ROOT, 'knowzcode', 'knowzcode', 'platform_adapters.md'),
  join(ROOT, 'plugins', 'knowzcode', 'knowzcode', 'platform_adapters.md'),
]) {
  expectFileNotContains(
    file,
    /\.gemini\/skills\/knowzcode-regroup-trigger/,
    `Gemini regroup trigger template should not exist without a passive trigger surface: ${file}`
  );
}

const continueHandoffFiles = [
  join(ROOT, 'knowzcode', 'skills', 'continue', 'SKILL.md'),
  join(ROOT, 'plugins', 'knowzcode', 'skills', 'continue', 'SKILL.md'),
  join(ROOT, 'knowzcode', '.gemini', 'skills', 'knowzcode-continue', 'SKILL.md'),
  join(ROOT, 'knowzcode', '.gemini', 'commands', 'knowzcode', 'continue.toml'),
  join(ROOT, 'knowzcode', 'knowzcode', 'platform_adapters.md'),
  join(ROOT, 'plugins', 'knowzcode', 'knowzcode', 'platform_adapters.md'),
];
for (const file of continueHandoffFiles) {
  expect(existsSync(file), `Missing KnowzCode continue handoff surface: ${file}`);
  if (!existsSync(file)) continue;
  expectFileContains(file, /knowzcode\/handoffs/, `Continue surface must check local handoffs before WorkGroups: ${file}`);
}

const codexSupportDir = join(ROOT, 'plugins', 'knowzcode', 'knowzcode');
expect(existsSync(codexSupportDir) && statSync(codexSupportDir).isDirectory(), `Missing KnowzCode support directory: ${codexSupportDir}`);
expect(!existsSync(join(ROOT, 'plugins', 'knowzcode', 'agents')), 'Codex package should not ship Claude-only agents/ as active support content');

// Cross-agent relay is supported from Claude Code and Codex. The host keeps
// planning/review/finalization while the resolved external target implements.
// Gemini remains native-only until it has an unambiguous supported target contract.
const relayExecutionRef = join(ROOT, 'knowzcode', 'skills', 'work', 'references', 'relay-execution.md');
expectFileContainsAll(
  relayExecutionRef,
  [
    ['host/target resolution', /RELAY_HOST[\s\S]*RELAY_TARGET/],
    ['portable selectors', /none[|`, ]+auto[|`, ]+other[|`, ]+claude[|`, ]+codex/],
    ['natural-language precedence', /explicit flag[\s\S]*natural[- ]language[\s\S]*config/i],
    ['same-host rejection', /target (equals|==) (the )?host|same-host/i],
    ['schema 2 state', /Schema:\*\* 2|Schema:\s*2/],
    ['role-based states', /TARGET_IMPLEMENTING[\s\S]*HOST_TAKEOVER/],
    ['legacy state mapping', /CODEX_IMPLEMENTING[\s\S]*TARGET_IMPLEMENTING/],
    ['Codex session resume', /codex exec resume/],
    ['Codex completion selector', /COMPLETION_COMMAND[\s\S]*turn\.completed/],
    ['Codex result-status selector', /RESULT_SUBTYPE_COMMAND[\s\S]*turn\.failed/],
    ['Claude session resume', /claude[\s\S]*--resume/],
    ['Claude authentication probe', /claude auth status --json/],
    ['Claude streaming output', /--output-format stream-json/],
    ['Claude resumable success', /session_id[\s\S]{0,160}length > 0/],
    ['Claude safe permission mode', /--permission-mode dontAsk/],
    ['strict Claude sandbox', /failIfUnavailable["': ]+true[\s\S]*allowUnsandboxedCommands["': ]+false/],
    ['the standard-2A fallback', /\[RELAY-FALLBACK\]/],
  ],
  'Relay execution reference'
);
expect(existsSync(join(ROOT, 'knowzcode', 'skills', 'relay', 'SKILL.md')), 'Missing Claude relay entry skill: knowzcode/skills/relay/SKILL.md');
expect(existsSync(join(ROOT, 'knowzcode', 'agents', 'relay-runner.md')), 'Missing relay-runner agent: knowzcode/agents/relay-runner.md');
const relayContractSkills = [
  join(ROOT, 'knowzcode', 'skills', 'relay', 'SKILL.md'),
  join(ROOT, 'knowzcode', 'skills', 'work', 'SKILL.md'),
  join(ROOT, 'plugins', 'knowzcode', 'skills', 'relay', 'SKILL.md'),
  join(ROOT, 'plugins', 'knowzcode', 'skills', 'work', 'SKILL.md'),
];
for (const file of relayContractSkills) {
  expectFileContainsAll(
    file,
    [
      ['all relay selectors', /none[|`, ]+auto[|`, ]+other[|`, ]+claude[|`, ]+codex/],
      ['natural-language relay intent', /natural[- ]language|other agent/i],
      ['configuration fallback', /config|knowzcode_orchestration/],
      ['same-host protection', /same-host|target (equals|==) (the )?host/i],
    ],
    'Cross-agent relay skill contract'
  );
}
const codexRelaySkill = join(ROOT, 'plugins', 'knowzcode', 'skills', 'relay', 'SKILL.md');
const codexRelayRef = join(ROOT, 'plugins', 'knowzcode', 'skills', 'work', 'references', 'relay-execution.md');
expect(existsSync(codexRelaySkill), 'Codex plugin must ship the cross-agent relay entry skill');
expect(existsSync(codexRelayRef), 'Codex plugin must ship the relay execution reference');
expectFileContainsAll(
  codexRelaySkill,
  [
    ['Claude target discovery', /Claude/i],
    ['other-agent discovery', /other agent/i],
    ['implementation delegation discovery', /delegate implementation|implementation.*delegate/i],
  ],
  'Codex relay entry skill'
);
for (const file of [
  join(ROOT, 'plugins', 'knowzcode', 'skills', 'continue', 'SKILL.md'),
  join(ROOT, 'plugins', 'knowzcode', 'skills', 'init', 'SKILL.md'),
  join(ROOT, 'plugins', 'knowzcode', 'skills', 'start-work', 'SKILL.md'),
  join(ROOT, 'plugins', 'knowzcode', 'skills', 'status', 'SKILL.md'),
]) {
  expectFileContains(file, /relay/i, `Codex support skill must integrate cross-agent relay: ${file}`);
}
expect(!existsSync(join(ROOT, 'knowzcode', '.gemini', 'skills', 'knowzcode-relay')), 'Gemini is native-only and must not ship a relay mirror');
const relayOrchestrationFiles = [
  join(ROOT, 'knowzcode', 'knowzcode', 'knowzcode_orchestration.md'),
  join(ROOT, 'plugins', 'knowzcode', 'knowzcode', 'knowzcode_orchestration.md'),
];
for (const file of relayOrchestrationFiles) {
  expectFileContainsAll(
    file,
    [
      ['relay opt-in defaulted off', /^relay:\s*none/m],
      ['portable other target', /relay:\s*other|none.*auto.*other.*claude.*codex/is],
      ['Claude model configuration', /relay_claude_model/],
      ['Claude permission configuration', /relay_claude_permission_mode/],
      ['Codex model configuration', /relay_codex_model/],
    ],
    'Cross-agent orchestration template'
  );
}

for (const rel of [
  'knowzcode_loop.md',
  'knowzcode_orchestration.md',
  'platform_adapters.md',
  'relay_execution.md',
  'claude_code_execution.md',
  'gitignore.template',
]) {
  const sourceFile = join(ROOT, 'knowzcode', 'knowzcode', rel);
  const pluginFile = join(ROOT, 'plugins', 'knowzcode', 'knowzcode', rel);
  expect(existsSync(sourceFile), `Missing source KnowzCode framework file: ${sourceFile}`);
  expect(existsSync(pluginFile), `Missing Codex KnowzCode framework file: ${pluginFile}`);
  if (existsSync(sourceFile) && existsSync(pluginFile)) {
    expect(
      readFileSync(sourceFile, 'utf8') === readFileSync(pluginFile, 'utf8'),
      `Codex framework file drifted from source: ${rel}`
    );
  }
}

// Exercise the actual Codex adapter parser/writer. Static markdown assertions
// do not catch malformed headings or fences that silently drop generated files.
const generatedCodexTarget = mkdtempSync(join(tmpdir(), 'knowzcode-codex-relay-'));
try {
  execFileSync(
    process.execPath,
    [
      join(ROOT, 'knowzcode', 'bin', 'knowzcode.mjs'),
      'install',
      '--target', generatedCodexTarget,
      '--platforms', 'codex',
      '--force',
    ],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' }
  );

  const generatedRelaySkill = join(generatedCodexTarget, '.agents', 'skills', 'knowzcode-relay', 'SKILL.md');
  const generatedRelayRef = join(generatedCodexTarget, '.agents', 'skills', 'knowzcode-work', 'references', 'relay-execution.md');
  const generatedCoreRef = join(generatedCodexTarget, 'knowzcode', 'relay_execution.md');
  const generatedAgents = join(generatedCodexTarget, 'AGENTS.md');

  for (const file of [generatedRelaySkill, generatedRelayRef, generatedCoreRef, generatedAgents]) {
    expect(existsSync(file), `Codex adapter generation dropped relay surface: ${file}`);
  }
  expectFileContains(generatedRelaySkill, /Generated by KnowzCode v\d+\.\d+\.\d+/, 'Generated Codex relay skill must inject the package version');
  expectFileContainsAll(
    generatedRelaySkill,
    [
      ['other-agent routing', /other agent/i],
      ['Claude target', /Claude/i],
      ['same-host guard', /same-host|target (equals|==) (the )?host/i],
    ],
    'Generated Codex relay skill'
  );
  expectFileContainsAll(
    generatedRelayRef,
    [
      ['streaming Claude output', /--output-format stream-json/],
      ['session resume', /--resume/],
      ['strict sandbox failure', /failIfUnavailable["': ]+true/],
    ],
    'Generated Codex relay reference'
  );
} catch (error) {
  expect(false, `Codex adapter generation smoke test failed: ${error.stderr || error.message}`);
} finally {
  rmSync(generatedCodexTarget, { recursive: true, force: true });
}

const codexExecutionGuide = join(ROOT, 'plugins', 'knowzcode', 'knowzcode', 'codex_execution.md');
expect(existsSync(codexExecutionGuide), `Missing Codex execution guide: ${codexExecutionGuide}`);
if (existsSync(codexExecutionGuide)) {
  expectFileContains(
    codexExecutionGuide,
    /## Status\s+complete\s+\|\s+blocked\s+\|\s+partial/,
    `Codex handoff schema must allow partial checkpoints: ${codexExecutionGuide}`
  );
  expectFileContains(
    codexExecutionGuide,
    /## Remaining Work/,
    `Codex handoff schema must include Remaining Work for partial checkpoints: ${codexExecutionGuide}`
  );
  expectFileContains(
    codexExecutionGuide,
    /## Phase[\s\S]*## Owned Files[\s\S]*## Next Phase Inputs/,
    `Codex handoff schema must match the work skill phase-report schema: ${codexExecutionGuide}`
  );
  expectFileNotContains(
    codexExecutionGuide,
    /## Handoff|Next Action:|Artifact Paths:/,
    `Codex execution guide must not keep the old compact handoff schema: ${codexExecutionGuide}`
  );
}

for (const file of [
  join(ROOT, 'knowzcode', 'knowzcode', 'platform_adapters.md'),
  join(ROOT, 'plugins', 'knowzcode', 'knowzcode', 'platform_adapters.md'),
]) {
  expectFileContains(
    file,
    /Stage 2 dispatches builders per ready NodeID\/microtask with assigned acceptance criteria/,
    `Claude adapter Phase 2A must mention NodeID/microtask scope discipline: ${file}`
  );
  expectFileContains(
    file,
    /Scope implementation by dependency wave: one ready NodeID or named microtask/,
    `Codex AGENTS.md Phase 2A must mention dependency-wave microtasks: ${file}`
  );
  expectFileContains(
    file,
    /Skills are the command surface; `AGENTS\.md` is optional supporting context/,
    `Codex AGENTS.md adapter must keep skills as the primary Codex command surface: ${file}`
  );
  expectFileContains(
    file,
    /consolidated full test suite \+ static analysis \+ build after all waves/,
    `Codex AGENTS.md Phase 2A must defer consolidated verification until all waves complete: ${file}`
  );
  expectFileContains(
    file,
    /Agent Teams is the expected execution mode for all KnowzCode workflows/,
    `Claude adapter must include the full Agent Teams execution guidance: ${file}`
  );
}

const codexWorkSkill = join(ROOT, 'plugins', 'knowzcode', 'skills', 'work', 'SKILL.md');
expect(existsSync(codexWorkSkill), `Missing Codex work skill: ${codexWorkSkill}`);
if (existsSync(codexWorkSkill)) {
  expectFileContains(
    codexWorkSkill,
    /knowzcode\/codex_execution\.md/,
    'Codex work skill must reference knowzcode/codex_execution.md'
  );
  expectFileContains(
    codexWorkSkill,
    /## Phase[\s\S]*## Status[\s\S]*complete`\s+\|\s+`blocked`\s+\|\s+`partial`[\s\S]*## Owned Files[\s\S]*## Remaining Work[\s\S]*## Next Phase Inputs/,
    `Codex work skill handoff schema must stay aligned with codex_execution.md: ${codexWorkSkill}`
  );
}

// VaultCaptureReinforcement capture-surface assertions (vault-capture spec, dual-queue flush,
// retrieval-freshness, capture-taxonomy) are parked on the feature/vault-capture branch with
// that work; re-add them here when it merges into this release.

for (const file of [
  join(ROOT, 'knowzcode', 'agents', 'enterprise-enforcer.md'),
  join(ROOT, 'knowzcode', 'skills', 'work', 'SKILL.md'),
  join(ROOT, 'knowzcode', 'skills', 'audit', 'SKILL.md'),
  join(ROOT, 'knowzcode', 'knowzcode', 'enterprise', 'compliance_manifest.md'),
  join(ROOT, 'plugins', 'knowzcode', 'skills', 'work', 'SKILL.md'),
  join(ROOT, 'plugins', 'knowzcode', 'skills', 'audit', 'SKILL.md'),
  join(ROOT, 'plugins', 'knowzcode', 'knowzcode', 'codex_execution.md'),
  join(ROOT, 'plugins', 'knowzcode', 'knowzcode', 'enterprise', 'compliance_manifest.md'),
]) {
  expectFileContainsAll(
    file,
    [
      ['local enterprise.md discovery', /enterprise\.md/],
      ['guideline KnowledgeIds', /guideline_knowledge_ids|KnowledgeId/],
      ['guideline vault sources', /guideline_vault_sources|guideline vault sources|vault ID\/name/i],
      ['compliance vault', /compliance_vault_id|compliance vault/i],
      ['provenance', /provenance/i],
      ['created/updated metadata', /created\/updated|created date[\s\S]*updated date/i],
    ],
    'Enterprise guideline enforcement surface'
  );
}

const complianceBehaviorKeys = [
  'include_in_audit',
  'require_signoff_for_finalization',
  'show_advisory_issues',
  'pull_standards_at_start',
  'push_audit_results',
  'push_completion_records',
  'preserve_guideline_provenance',
];
for (const file of [
  join(ROOT, 'knowzcode', 'skills', 'work', 'SKILL.md'),
  join(ROOT, 'plugins', 'knowzcode', 'skills', 'work', 'SKILL.md'),
  join(ROOT, 'plugins', 'knowzcode', 'knowzcode', 'codex_execution.md'),
  join(ROOT, 'knowzcode', 'knowzcode', 'enterprise', 'compliance_manifest.md'),
  join(ROOT, 'plugins', 'knowzcode', 'knowzcode', 'enterprise', 'compliance_manifest.md'),
]) {
  expectFileContainsAll(
    file,
    complianceBehaviorKeys.map((key) => [key, new RegExp(`\\b${key}\\b`)]),
    'Compliance config behavior surface'
  );
}

for (const file of [
  join(ROOT, 'knowzcode', 'skills', 'audit', 'SKILL.md'),
  join(ROOT, 'plugins', 'knowzcode', 'skills', 'audit', 'SKILL.md'),
]) {
  expectFileContainsAll(
    file,
    [
      ['include_in_audit', /\binclude_in_audit\b/],
      ['show_advisory_issues', /\bshow_advisory_issues\b/],
      ['push_audit_results', /\bpush_audit_results\b/],
      ['preserve_guideline_provenance', /\bpreserve_guideline_provenance\b/],
      ['mcp_compliance_enabled master switch', /\bmcp_compliance_enabled\b/],
    ],
    'Audit compliance config behavior surface'
  );
}

// Trigger-term coverage: a capability the body supports must be advertised in the frontmatter
// `description`, because Codex (and the Claude skill router) selects skills from the description
// before loading the body. The audit skill performs compliance audits, so "compliance" must
// appear in its description or the capability is undiscoverable. (Reads the frontmatter directly
// rather than via parseFrontmatter, which rejects the source skill's `#`-comment lines.)
for (const skillFile of [
  join(ROOT, 'knowzcode', 'skills', 'audit', 'SKILL.md'),
  join(ROOT, 'plugins', 'knowzcode', 'skills', 'audit', 'SKILL.md'),
]) {
  if (!existsSync(skillFile)) {
    expect(false, `Missing audit skill: ${skillFile}`);
    continue;
  }
  const fm = readFileSync(skillFile, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const description = fm ? (fm[1].match(/^description:\s*(.+)$/m)?.[1] ?? '') : '';
  expect(
    /compliance/i.test(description),
    `audit skill frontmatter description must advertise "compliance" (trigger term — Codex selects on frontmatter before the body): ${skillFile}`
  );
}

// The core loop is read early by the skills; if it describes enterprise vault pulls/pushes
// without naming the manifest gates, it silently overrides the wired config flags. Require the
// gating keys to appear (both byte-coupled copies).
for (const file of [
  join(ROOT, 'knowzcode', 'knowzcode', 'knowzcode_loop.md'),
  join(ROOT, 'plugins', 'knowzcode', 'knowzcode', 'knowzcode_loop.md'),
]) {
  expectFileContainsAll(
    file,
    [
      ['mcp_compliance_enabled master switch', /\bmcp_compliance_enabled\b/],
      ['pull_standards_at_start gate', /\bpull_standards_at_start\b/],
      ['push_audit_results gate', /\bpush_audit_results\b/],
      ['push_completion_records gate', /\bpush_completion_records\b/],
    ],
    'Enterprise vault-write gating in the core loop'
  );
}

const parallelOrchestrationGuide = join(ROOT, 'knowzcode', 'skills', 'work', 'references', 'parallel-orchestration.md');
expectFileNotContains(
  parallelOrchestrationGuide,
  /N5-audit-task-id|N6-audit-task-id|Audit N6: PreExtractionRequestedConsumer/,
  `Stage 2 examples must not reference future dependency tasks before those tasks exist: ${parallelOrchestrationGuide}`
);
expectFileContains(
  parallelOrchestrationGuide,
  /Do not create downstream implementation tasks until their dependency audit task IDs exist/,
  `Stage 2 examples must explicitly defer downstream task creation until dependency audit IDs exist: ${parallelOrchestrationGuide}`
);
expectFileContains(
  parallelOrchestrationGuide,
  /create the reviewer task only after creating that wave's implementation task/,
  `Stage 2 examples must defer downstream reviewer tasks until their implementation tasks exist: ${parallelOrchestrationGuide}`
);

const codexSkillRoot = join(ROOT, 'plugins', 'knowzcode', 'skills');
if (existsSync(codexSkillRoot)) {
  for (const entry of readdirSync(codexSkillRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillPath = join(codexSkillRoot, entry.name, 'SKILL.md');
    if (!existsSync(skillPath)) continue;
    expectFileNotContains(
      skillPath,
      /\b(TeamCreate|TaskCreate|TaskUpdate|TaskGet|SendMessage|ExitPlanMode)\b/,
      `Codex skill must not rely on Claude-only team APIs: ${skillPath}`
    );
    const generated = readFileSync(skillPath, 'utf8').match(/Generated by KnowzCode v([0-9]+\.[0-9]+\.[0-9]+)/);
    if (generated && sourcePackages.knowzcode?.version) {
      expect(
        generated[1] === sourcePackages.knowzcode.version,
        `Codex skill generated-version comment drift for ${skillPath}: ${generated[1]} !== ${sourcePackages.knowzcode.version}`
      );
    }
  }
}

// --- Enterprise compliance parity: source (knowzcode/) is canonical; the Codex plugin
// copy must mirror it byte-for-byte. The enterprise/ tree is pure config + guideline
// templates with no platform-specific content, so full content equality is the correct
// (and strongest) invariant — a set/path-only check let value/content drift through
// (e.g. the missing design.md AND the stale pre-v0.16.0 manifest both shipped green). ---
const srcEnterprise = join(ROOT, 'knowzcode', 'knowzcode', 'enterprise');
const pluginEnterprise = join(ROOT, 'plugins', 'knowzcode', 'knowzcode', 'enterprise');

if (existsSync(srcEnterprise)) {
  // Do NOT silently skip when the plugin copy is missing entirely — that is the worst drift.
  expect(
    existsSync(pluginEnterprise),
    `Codex enterprise copy is missing entirely: ${pluginEnterprise} (source exists at ${srcEnterprise})`
  );

  if (existsSync(pluginEnterprise)) {
    const listFiles = (base) => {
      const out = [];
      const walk = (d, prefix) => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
          if (e.isDirectory()) walk(join(d, e.name), `${prefix}${e.name}/`);
          else out.push(`${prefix}${e.name}`);
        }
      };
      walk(base, '');
      return out.sort();
    };
    const srcFiles = listFiles(srcEnterprise);
    const pluginFiles = listFiles(pluginEnterprise);

    // 1) Same file set (catches a missing design.md, or an extra/stale plugin-only file).
    expect(
      srcFiles.join(',') === pluginFiles.join(','),
      `Enterprise file set drifted between source and Codex plugin.\n    source: [${srcFiles.join(', ')}]\n    plugin: [${pluginFiles.join(', ')}]`
    );

    // 2) Identical contents for every shared file (catches a stale manifest/status/guideline
    //    whose name is unchanged but body diverged — the form set-comparison missed).
    for (const rel of srcFiles) {
      const pluginPath = join(pluginEnterprise, rel);
      if (!existsSync(pluginPath)) continue; // already reported by the set-diff above
      expect(
        readFileSync(join(srcEnterprise, rel), 'utf8') === readFileSync(pluginPath, 'utf8'),
        `Enterprise file content drifted between source and Codex plugin: ${rel} (re-sync plugins/knowzcode/knowzcode/enterprise/ from knowzcode/knowzcode/enterprise/)`
      );
    }
  }
}

if (errors.length) {
  console.error('Platform surface validation failed:\n');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Platform surface validation passed.');

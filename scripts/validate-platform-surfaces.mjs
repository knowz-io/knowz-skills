#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
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

function expectFileContains(filePath, pattern, message) {
  const raw = readFileSync(filePath, 'utf8');
  expect(pattern.test(raw), message);
}

function expectFileNotContains(filePath, pattern, message) {
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

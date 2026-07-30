#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

const errors = [];

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashValue(value) {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function stringLeaves(value, output = []) {
  if (Array.isArray(value)) {
    for (const child of value) stringLeaves(child, output);
  } else if (value && typeof value === 'object') {
    for (const child of Object.values(value)) stringLeaves(child, output);
  } else if (typeof value === 'string' && value.length >= 8) {
    output.push(value);
  }
  return output;
}

function matchesSubset(actual, expected) {
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    return actual && typeof actual === 'object'
      && Object.entries(expected).every(([key, value]) => matchesSubset(actual[key], value));
  }
  return stableJson(actual) === stableJson(expected);
}

function snapshotDirectory(root) {
  const entries = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = join(dir, entry.name);
      const path = relative(root, absolute);
      if (entry.isDirectory()) {
        entries.push(`directory:${path}`);
        walk(absolute);
      } else {
        const digest = createHash('sha256').update(readFileSync(absolute)).digest('hex');
        entries.push(`file:${path}:${digest}`);
      }
    }
  };
  walk(root);
  return entries;
}

function invokeRuntime(runtimePath, operation, input, cwd = ROOT, { wrapInput = true } = {}) {
  const options = {
    cwd,
    encoding: 'utf8',
    input: JSON.stringify(wrapInput ? { input } : input),
    stdio: ['pipe', 'pipe', 'pipe'],
  };
  try {
    const response = JSON.parse(execFileSync(process.execPath, [runtimePath, operation], options));
    Object.defineProperty(response, '__exitCode', { value: 0, enumerable: false });
    return response;
  } catch (error) {
    const stdout = typeof error.stdout === 'string' ? error.stdout : error.stdout?.toString('utf8');
    if (stdout?.trim()) {
      const response = JSON.parse(stdout);
      Object.defineProperty(response, '__exitCode', { value: error.status ?? 1, enumerable: false });
      return response;
    }
    throw error;
  }
}

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

function expectFileOrder(filePath, earlierPattern, laterPattern, message) {
  if (!existsSync(filePath)) {
    expect(false, `Surface file is missing: ${filePath}`);
    return;
  }
  const raw = readFileSync(filePath, 'utf8');
  const earlier = raw.search(earlierPattern);
  const later = raw.search(laterPattern);
  expect(earlier !== -1 && later !== -1 && earlier < later, message);
}

const sourcePackages = {
  knowz: readJson('knowz', 'package.json'),
  knowzcode: readJson('knowzcode', 'package.json'),
};
expect(
  sourcePackages.knowzcode?.files?.includes('knowzcode/'),
  'KnowzCode package manifest must ship the framework directory containing context_efficiency_runtime.mjs'
);

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

// A skill's slash-command id comes from its DIRECTORY name; the frontmatter `name:` is only the
// picker label. A mismatch splits the two (autocomplete shows one command, Enter runs another) —
// this happened when skills/setup/ was half-renamed to init/ while frontmatter kept `name: setup`.
for (const skillsRoot of [
  join(ROOT, 'knowzcode', 'skills'),
  join(ROOT, 'plugins', 'knowzcode', 'skills'),
]) {
  if (!existsSync(skillsRoot)) continue;
  for (const entry of readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillPath = join(skillsRoot, entry.name, 'SKILL.md');
    if (!existsSync(skillPath)) continue;
    // Source-tree frontmatter may contain comment lines parseFrontmatter rejects — read name: directly.
    const nameMatch = readFileSync(skillPath, 'utf8').match(/^---\r?\n[\s\S]*?^name:\s*(\S+)\s*$/m);
    if (!nameMatch) continue;
    expect(
      nameMatch[1] === entry.name,
      `Skill frontmatter name "${nameMatch[1]}" must equal its directory name "${entry.name}" (directory = command id, frontmatter = picker label): ${skillPath}`
    );
  }
}

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
expectFileContainsAll(
  join(ROOT, 'knowzcode', 'agents', 'relay-runner.md'),
  [
    ['filtered progress command', /PROGRESS_COMMAND/],
    ['bounded progress cadence', /PROGRESS_INTERVAL_SECONDS/],
    ['progress envelope', /\[RELAY-PROGRESS\]/],
    ['untrusted telemetry handling', /untrusted target telemetry/i],
    ['90 minute time checkpoint', /TIMEOUT_MINUTES[\s\S]*default `90`/],
    ['time decision envelope', /\[RELAY-TIME-CHECK\]/],
    ['continue and resume distinction', /continue-live[\s\S]*interrupt-and-resume/],
    ['runner turn budget', /maxTurns:\s*300/],
  ],
  'Relay runner progress bridge'
);
expectFileContainsAll(
  relayExecutionRef,
  [
    ['relay progress bridge', /Relay progress bridge/],
    ['Codex progress selector', /Codex exec leg[\s\S]*PROGRESS_COMMAND/],
    ['bounded target message', /320 characters/],
    ['time-budget dialogue', /Time-budget checkpoint and dialogue/],
    ['90 minute default', /defaults to 90/],
  ],
  'Relay progress bridge reference'
);
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
  codexRelayRef,
  [
    ['filtered relay progress', /Filtered progress bridge/],
    ['progress envelope', /\[RELAY-PROGRESS\]/],
    ['untrusted telemetry handling', /untrusted telemetry/i],
    ['time decision envelope', /\[RELAY-TIME-CHECK\]/],
    ['continue and resume options', /continue-live[\s\S]*interrupt-and-resume/],
  ],
  'Codex relay progress bridge'
);
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
  join(ROOT, 'plugins', 'knowzcode', 'skills', 'setup', 'SKILL.md'),
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
      ['90 minute relay checkpoint', /relay_timeout_minutes:\s*90/],
    ],
    'Cross-agent orchestration template'
  );
}

for (const rel of [
  'knowzcode_loop.md',
  'knowzcode_orchestration.md',
  'context_efficiency.md',
  'context_efficiency_runtime.mjs',
  'platform_adapters.md',
  'relay_execution.md',
  'claude_code_execution.md',
  'codex_execution.md',
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

for (const rel of [
  'context-capsule.schema.json',
  'agent-lineage.schema.json',
  'efficiency-event.schema.json',
]) {
  const sourceFile = join(ROOT, 'knowzcode', 'knowzcode', 'contracts', rel);
  const pluginFile = join(ROOT, 'plugins', 'knowzcode', 'knowzcode', 'contracts', rel);
  expect(existsSync(sourceFile), `Missing canonical context-efficiency contract: ${sourceFile}`);
  expect(existsSync(pluginFile), `Missing plugin context-efficiency contract: ${pluginFile}`);
  if (existsSync(sourceFile) && existsSync(pluginFile)) {
    expect(
      readFileSync(sourceFile, 'utf8') === readFileSync(pluginFile, 'utf8'),
      `Context-efficiency contract drifted from canonical source: ${rel}`
    );
    try {
      JSON.parse(readFileSync(sourceFile, 'utf8'));
    } catch (error) {
      expect(false, `Invalid JSON schema ${sourceFile}: ${error.message}`);
    }
  }
}

const canonicalAdapter = join(ROOT, 'knowzcode', 'knowzcode', 'platform_adapters.md');
const canonicalAdapterText = readFileSync(canonicalAdapter, 'utf8');
const adapterCodexSkillNames = [...canonicalAdapterText.matchAll(
  /^#### \.agents\/skills\/(knowzcode-[^/\r\n]+)\/SKILL\.md\s*$/gm
)].map((match) => match[1]);
expect(adapterCodexSkillNames.length > 0, 'Canonical adapter must define at least one generated Codex skill');
expect(
  new Set(adapterCodexSkillNames).size === adapterCodexSkillNames.length,
  'Canonical adapter must not define duplicate generated Codex skill paths'
);

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
  const generatedWorkSkill = join(generatedCodexTarget, '.agents', 'skills', 'knowzcode-work', 'SKILL.md');
  const generatedExploreSkill = join(generatedCodexTarget, '.agents', 'skills', 'knowzcode-explore', 'SKILL.md');
  const generatedRelayRef = join(generatedCodexTarget, '.agents', 'skills', 'knowzcode-work', 'references', 'relay-execution.md');
  const generatedCoreRef = join(generatedCodexTarget, 'knowzcode', 'relay_execution.md');
  const generatedCodexGuide = join(generatedCodexTarget, 'knowzcode', 'codex_execution.md');
  const generatedEfficiencyGuide = join(generatedCodexTarget, 'knowzcode', 'context_efficiency.md');
  const generatedEfficiencyRuntime = join(generatedCodexTarget, 'knowzcode', 'context_efficiency_runtime.mjs');
  const generatedContractRoot = join(generatedCodexTarget, 'knowzcode', 'contracts');
  const generatedAgents = join(generatedCodexTarget, 'AGENTS.md');

  for (const file of [generatedRelaySkill, generatedWorkSkill, generatedExploreSkill, generatedRelayRef, generatedCoreRef, generatedCodexGuide, generatedEfficiencyGuide, generatedEfficiencyRuntime, generatedAgents]) {
    expect(existsSync(file), `Codex adapter generation dropped relay surface: ${file}`);
  }
  const generatedCodexSkillRoot = join(generatedCodexTarget, '.agents', 'skills');
  const generatedCodexSkillNames = existsSync(generatedCodexSkillRoot)
    ? readdirSync(generatedCodexSkillRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('knowzcode-'))
      .map((entry) => entry.name)
      .sort()
    : [];
  for (const skillName of adapterCodexSkillNames) {
    expect(
      existsSync(join(generatedCodexSkillRoot, skillName, 'SKILL.md')),
      `Codex adapter generation dropped defined skill: ${skillName}`
    );
  }
  expect(
    stableJson(generatedCodexSkillNames) === stableJson([...adapterCodexSkillNames].sort()),
    `Generated Codex skill set differs from adapter definitions: expected ${adapterCodexSkillNames.length}, got ${generatedCodexSkillNames.length}`
  );
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
  expectFileContainsAll(
    generatedCodexGuide,
    [
      ['portable context modes', /local[\s\S]*resume[\s\S]*inherit-full[\s\S]*fresh-capsule[\s\S]*coordinated-team/i],
      ['lineage compatibility', /lineage[\s\S]*(spec|scope)[\s\S]*(permissions|sensitivity)/i],
      ['conditional handoffs', /(tiny|short) read-only[\s\S]*(bounded|direct)[\s\S]*(handoff|result)|ephemeral[\s\S]*(tiny|short) read-only[\s\S]*No handoff/i],
      ['semantic runtime operations', /semantic operations/i],
    ],
    'Generated Codex execution guide'
  );
  expectFileContainsAll(
    generatedEfficiencyGuide,
    [
      ['context capsule schema', /knowzcode\.context-capsule\/v1/],
      ['agent lineage schema', /knowzcode\.agent-lineage\/v1/],
      ['logical billing outcome separation', /logical[\s\S]*billed[\s\S]*outcome/i],
      ['independent reviewer', /independent reviewer[\s\S]*(fresh|must not)/i],
      ['forty-case corpus', /(?:at least|minimum(?: of)?)\s+40\s+tasks/i],
      ['five balanced strata', /small\/Tier-2[\s\S]*backend[\s\S]*UI\/integration[\s\S]*security-sensitive[\s\S]*recovery\/invalidation/i],
    ],
    'Generated context-efficiency guide'
  );
  const canonicalRuntime = join(ROOT, 'knowzcode', 'knowzcode', 'context_efficiency_runtime.mjs');
  if (existsSync(generatedEfficiencyRuntime) && existsSync(canonicalRuntime)) {
    expect(
      readFileSync(generatedEfficiencyRuntime, 'utf8') === readFileSync(canonicalRuntime, 'utf8'),
      'Codex npm-installed context-efficiency runtime differs from canonical source'
    );
    try {
      const installedRuntimeResponse = invokeRuntime(
        generatedEfficiencyRuntime,
        'result-policy',
        { write_prohibited: true, material: true, resumable: true },
        generatedCodexTarget
      );
      expect(
        installedRuntimeResponse?.ok === true
          && installedRuntimeResponse?.result?.mode === 'ephemeral',
        'Codex npm-installed runtime must execute through temporary/symlink-normalized paths'
      );
      expect(
        Object.values(installedRuntimeResponse?.result?.writes ?? {}).every((allowed) => allowed === false),
        'Codex npm-installed write-prohibited runtime must authorize zero writes'
      );
    } catch (error) {
      expect(false, `Codex npm-installed runtime execution failed: ${error.stderr || error.message}`);
    }
  }
  expectFileContainsAll(
    generatedAgents,
    [
      ['classification before work', /Classify the request as Micro, Light, or Full/i],
      ['WorkGroup or capsule selection', /active WorkGroup or compact context capsule/i],
      ['specification reuse', /resolve reusable specs\/`VERIFY:` criteria/i],
      ['question-gated project and architecture reads', /project\.md[\s\S]*architecture\.md[\s\S]*only to answer a concrete unresolved planning question/i],
      ['conditional execution guide', /codex_execution\.md` only when delegation, inheritance, warm-worker reuse, or a conditional handoff is eligible/i],
      ['conditional relay and compliance', /relay guidance only after relay resolves non-`none`[\s\S]*enterprise guidance only when/i],
      ['MCP health TTL', /Reuse MCP health within its configured TTL/i],
    ],
    'Generated Codex AGENTS progressive startup'
  );
  expectFileNotContains(
    generatedAgents,
    /Read `knowzcode\/knowzcode_loop\.md` before starting any feature work|^1\. Read `knowzcode\/knowzcode_tracker\.md`/m,
    'Generated Codex AGENTS must not require broad eager startup reads'
  );
  expectFileContainsAll(
    generatedExploreSkill,
    [
      ['classification before delegation', /before vault retrieval, parallel delegation, or file writes/i],
      ['fresh reviewer lineage', /fresh reviewer-owned lineage/i],
      ['strict zero-write audit', /MUST NOT create a findings, handoff, summary, or artifact file/i],
      ['question-gated vault retrieval', /named prior-decision or convention question[\s\S]*mcp_health_ttl_minutes/i],
    ],
    'Generated Codex explore skill'
  );
  expectFileOrder(
    generatedWorkSkill,
    /Classify the request and resolve specification reuse/i,
    /Discover applicable enterprise guidance/i,
    'Generated Codex work skill must classify and resolve spec reuse before enterprise retrieval'
  );
  expectFileOrder(
    generatedWorkSkill,
    /Classify the request and resolve specification reuse/i,
    /Resolve relay intent once/i,
    'Generated Codex work skill must classify and resolve spec reuse before relay/delegation'
  );
  expectFileContainsAll(
    generatedWorkSkill,
    [
      ['question-gated vault retrieval', /named question remains after local WorkGroup\/spec\/code evidence/i],
      ['MCP health TTL', /mcp_health_ttl_minutes/i],
      ['fresh reviewer lineage', /first independent reviewer must use a fresh reviewer-owned lineage/i],
      ['strict zero-write audit', /MUST NOT create a handoff or artifact file/i],
      ['context-efficiency enablement gate', /context[_ -]efficiency[\s\S]*enabled/i],
      ['enabled runtime invocation', /\bnode\s+[^\r\n`]*context_efficiency_runtime\.mjs[\s\S]*(?:route|dispatch|capsule|lineage|result-policy)/i],
      ['vault-delta batching invocation', /vault-delta[\s\S]*(?:skip|amend|update|batch|flush)/i],
    ],
    'Generated Codex work skill'
  );
  for (const rel of [
    'context-capsule.schema.json',
    'agent-lineage.schema.json',
    'efficiency-event.schema.json',
  ]) {
    const generatedContract = join(generatedContractRoot, rel);
    const canonicalContract = join(ROOT, 'knowzcode', 'knowzcode', 'contracts', rel);
    expect(existsSync(generatedContract), `Codex npm install dropped portable contract: ${generatedContract}`);
    if (existsSync(generatedContract) && existsSync(canonicalContract)) {
      expect(
        readFileSync(generatedContract, 'utf8') === readFileSync(canonicalContract, 'utf8'),
        `Codex npm-installed portable contract differs from canonical source: ${rel}`
      );
    }
  }
} catch (error) {
  expect(false, `Codex adapter generation smoke test failed: ${error.stderr || error.message}`);
} finally {
  rmSync(generatedCodexTarget, { recursive: true, force: true });
}

// A stale installed execution contract must be replaceable without overwriting
// documented user-owned project state.
const upgradedCodexTarget = mkdtempSync(join(tmpdir(), 'knowzcode-codex-upgrade-'));
try {
  const cli = join(ROOT, 'knowzcode', 'bin', 'knowzcode.mjs');
  execFileSync(
    process.execPath,
    [cli, 'install', '--target', upgradedCodexTarget, '--platforms', 'codex', '--force'],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' }
  );
  const installedGuide = join(upgradedCodexTarget, 'knowzcode', 'codex_execution.md');
  const installedRuntime = join(upgradedCodexTarget, 'knowzcode', 'context_efficiency_runtime.mjs');
  const installedCapsuleContract = join(upgradedCodexTarget, 'knowzcode', 'contracts', 'context-capsule.schema.json');
  const preservedArchitecture = join(upgradedCodexTarget, 'knowzcode', 'knowzcode_architecture.md');
  const architectureSentinel = '# USER-OWNED ARCHITECTURE SENTINEL\n';
  writeFileSync(installedGuide, '# stale codex execution contract\n');
  writeFileSync(installedRuntime, '// stale context-efficiency runtime\n');
  writeFileSync(installedCapsuleContract, '{}\n');
  writeFileSync(preservedArchitecture, architectureSentinel);

  execFileSync(
    process.execPath,
    [cli, 'upgrade', '--target', upgradedCodexTarget, '--force'],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' }
  );

  const canonicalGuide = join(ROOT, 'knowzcode', 'knowzcode', 'codex_execution.md');
  expect(
    readFileSync(installedGuide, 'utf8') === readFileSync(canonicalGuide, 'utf8'),
    'Codex upgrade must replace a stale installed execution contract with the canonical source'
  );
  const canonicalCapsuleContract = join(ROOT, 'knowzcode', 'knowzcode', 'contracts', 'context-capsule.schema.json');
  expect(
    readFileSync(installedCapsuleContract, 'utf8') === readFileSync(canonicalCapsuleContract, 'utf8'),
    'Codex upgrade must replace stale portable schema contracts'
  );
  const canonicalRuntime = join(ROOT, 'knowzcode', 'knowzcode', 'context_efficiency_runtime.mjs');
  expect(
    readFileSync(installedRuntime, 'utf8') === readFileSync(canonicalRuntime, 'utf8'),
    'Codex upgrade must replace a stale installed context-efficiency runtime'
  );
  expect(
    readFileSync(preservedArchitecture, 'utf8') === architectureSentinel,
    'Codex upgrade must preserve user-owned architecture state'
  );
} catch (error) {
  expect(false, `Codex upgrade parity smoke test failed: ${error.stderr || error.message}`);
} finally {
  rmSync(upgradedCodexTarget, { recursive: true, force: true });
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
  expectFileNotContains(
    codexExecutionGuide,
    /\b(send_input|close_agent)\b/,
    `Codex execution guide must use semantic operations instead of stale runtime names: ${codexExecutionGuide}`
  );
  expectFileContainsAll(
    codexExecutionGuide,
    [
      ['semantic operations', /semantic operations/i],
      ['context-efficient modes', /inherit-full[\s\S]*inherit-recent[\s\S]*fresh-capsule/i],
      ['warm lease invalidation', /lease[\s\S]*(spec|scope|checkpoint|tools|permissions|sensitivity)/i],
      ['conditional disk handoffs', /(tiny|short) read-only[\s\S]*(bounded|direct)[\s\S]*(handoff|result)|ephemeral[\s\S]*(tiny|short) read-only[\s\S]*No handoff/i],
    ],
    'Codex context-efficiency contract'
  );
}

for (const file of [
  join(ROOT, 'knowzcode', 'knowzcode', 'claude_code_execution.md'),
  join(ROOT, 'plugins', 'knowzcode', 'knowzcode', 'claude_code_execution.md'),
  join(ROOT, 'knowzcode', 'skills', 'work', 'SKILL.md'),
]) {
  expectFileNotContains(
    file,
    /\b(TeamCreate|TeamDelete)\b/,
    `Claude current-runtime guidance must not call removed team lifecycle APIs: ${file}`
  );
}

const activeClaudeWorkflowFiles = [
  ['work', 'SKILL.md'],
  ['audit', 'SKILL.md'],
  ['explore', 'SKILL.md'],
  ['continue', 'SKILL.md'],
  ['status', 'SKILL.md'],
  ['work', 'CLAUDE.md'],
  ['audit', 'CLAUDE.md'],
  ['explore', 'CLAUDE.md'],
  ['continue', 'CLAUDE.md'],
].map(([skill, name]) => join(ROOT, 'knowzcode', 'skills', skill, name));
activeClaudeWorkflowFiles.push(
  ...[
    'light-workflow.md',
    'parallel-orchestration.md',
    'profile-models.md',
    'quality-gates.md',
    'spawn-prompts.md',
  ].map((name) => join(ROOT, 'knowzcode', 'skills', 'work', 'references', name))
);
for (const file of activeClaudeWorkflowFiles) {
  expectFileNotContains(
    file,
    /\b(TeamCreate|TeamDelete|TeamSpawn)\b/,
    `Active Claude workflow file must not use removed team lifecycle APIs: ${file}`
  );
  expectFileNotContains(
    file,
    /Agent Teams is the expected execution mode|Knowledge capture and parallel orchestration degraded/i,
    `Active Claude workflow file must not make teams a default quality tier: ${file}`
  );
}
expectFileNotContains(
  join(ROOT, 'knowzcode', 'skills', 'work', 'references', 'spawn-prompts.md'),
  /mode\s*=\s*["']bypassPermissions["']|permissionMode:\s*bypassPermissions/,
  'Claude spawn prompts must never dispatch a child with bypass permissions'
);

const claudeExecutionGuide = join(ROOT, 'knowzcode', 'knowzcode', 'claude_code_execution.md');
expectFileContainsAll(
  claudeExecutionGuide,
  [
    ['conversation fork semantics', /conversation fork/i],
    ['skill fork distinction', /context:\s*fork[\s\S]*(does not|not)[\s\S]*(conversation|chat history)/i],
    ['conditional team selection', /team[\s\S]*(peer coordination|shared task|mailbox)[\s\S]*(only|when)/i],
    ['runtime-owned team cleanup', /runtime-managed cleanup|cleanup[\s\S]*automatic/i],
    ['cache occupancy distinction', /cache[\s\S]*(billed|billing)[\s\S]*(context|occup)/i],
  ],
  'Claude context-efficiency contract'
);

const claudeAgentRoot = join(ROOT, 'knowzcode', 'agents');
if (existsSync(claudeAgentRoot)) {
  for (const entry of readdirSync(claudeAgentRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const agentFile = join(claudeAgentRoot, entry.name);
    const frontmatter = readFileSync(agentFile, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!frontmatter) continue;
    expect(
      !/^(permissionMode|hooks|mcpServers):/m.test(frontmatter[1]),
      `Claude plugin agent uses unsupported frontmatter fields: ${agentFile}`
    );
    const agentSource = readFileSync(agentFile, 'utf8');
    if (/\bnode\s+[^\r\n`]*context_efficiency_runtime\.mjs/i.test(agentSource)) {
      expect(
        /^tools:[^\r\n]*\bBash\b/m.test(frontmatter[1]),
        `Claude agent invokes the context runtime without Bash authority: ${agentFile}`
      );
    }
  }
}
expectFileContainsAll(
  join(claudeAgentRoot, 'closer.md'),
  [
    ['lead-owned final classifier', /FinalCaptureDelta[\s\S]*lead[\s\S]*vault-delta/i],
    ['no direct closer mutation', /Do not call `create_knowledge`[\s\S]*`amend_knowledge`[\s\S]*`update_knowledge`/i],
  ],
  'Claude closer capture boundary'
);
expectFileContainsAll(
  join(ROOT, 'knowzcode', 'skills', 'audit', 'SKILL.md'),
  [
    ['strict audit returns authorized delta', /AuthorizedVaultDelta[\s\S]*lead\/runtime owner[\s\S]*vault-delta/i],
    ['strict audit does not persist skip or batch', /skip`?\/`?batch[\s\S]*(?:no writer|creates no writer)[\s\S]*pending/i],
  ],
  'Strict audit vault-classification boundary'
);
expectFileContainsAll(
  join(ROOT, 'knowzcode', 'skills', 'explore', 'SKILL.md'),
  [
    ['explore invokes vault-delta before persistence', /node\s+knowzcode\/context_efficiency_runtime\.mjs\s+vault-delta[\s\S]*explicit_save/i],
    ['explore sends exact classified action', /exact classified action[\s\S]*stable identity/i],
  ],
  'Explore vault-classification boundary'
);
for (const agentName of ['closer.md', 'knowledge-liaison.md']) {
  expectFileContainsAll(
    join(claudeAgentRoot, agentName),
    [
      ['pending queue preserves mutation operation', /Operation[^\r\n]*(?:amend|update)/i],
      ['pending queue preserves KnowledgeId', /KnowledgeId[^\r\n]*required for amend\/update/i],
      ['pending queue preserves vault-delta action', /Vault Delta Action/i],
    ],
    `Claude ${agentName} pending replay identity`
  );
}
expectFileContains(
  join(ROOT, 'knowzcode', 'knowzcode', 'platform_adapters.md'),
  /KnowzCode Closer[\s\S]*FinalCaptureDelta[\s\S]*lead owns vault classification/i,
  'Generated Gemini closer must return classification to the lead'
);

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
    /## Context-Efficient Execution[\s\S]*local execution[\s\S]*worker[\s\S]*resume[\s\S]*fresh context capsule/i,
    `Claude adapter must include adaptive context-efficient execution guidance: ${file}`
  );
  expectFileNotContains(
    file,
    /Agent Teams is the expected execution mode|fallback degraded|Knowledge capture and parallel orchestration degraded/i,
    `Claude adapter must not present Agent Teams as the default or quality tier: ${file}`
  );
  expectFileNotContains(
    file,
    /\b(send_input|close_agent)\b/,
    `Generated Codex adapter surfaces must not require stale runtime operation names: ${file}`
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
  expectFileNotContains(
    codexWorkSkill,
    /\b(send_input|close_agent)\b/,
    `Codex work skill must use semantic runtime operations: ${codexWorkSkill}`
  );
  expectFileContains(
    codexWorkSkill,
    /tiny read-only[\s\S]*(bounded|direct)[\s\S]*(handoff|result)/i,
    `Codex work skill must permit bounded direct results for tiny read-only checks: ${codexWorkSkill}`
  );
}

for (const file of [
  join(ROOT, 'knowzcode', 'knowzcode', 'knowzcode_orchestration.md'),
  join(ROOT, 'plugins', 'knowzcode', 'knowzcode', 'knowzcode_orchestration.md'),
]) {
  expectFileContainsAll(
    file,
    [
      ['context-efficiency switch', /context_efficiency:/],
      ['complete rollout stage set', /off\|observe\|shadow\|canary\|on/],
      ['safe rollout default', /^\s*rollout:\s*off\s*$/m],
      ['runtime activation guard', /stage is active only when[\s\S]*adapter calls context_efficiency_runtime\.mjs[\s\S]*records its redacted event/i],
      ['warm lease', /warm_lease_minutes/],
      ['MCP health TTL', /mcp_health_ttl_minutes/],
      ['logical/billed/outcome telemetry', /logical[\s\S]*billed[\s\S]*outcome/i],
    ],
    'Context-efficiency configuration'
  );
}

for (const file of [
  join(ROOT, 'knowzcode', 'knowzcode', 'context_efficiency.md'),
  join(ROOT, 'plugins', 'knowzcode', 'knowzcode', 'context_efficiency.md'),
]) {
  expectFileContainsAll(
    file,
    [
      ['forty-case evaluation corpus', /(?:at least|minimum(?: of)?)\s+40\s+tasks/i],
      ['small/Tier-2 stratum', /small\/Tier-2/i],
      ['backend stratum', /\bbackend\b/i],
      ['UI/integration stratum', /UI\/integration/i],
      ['security-sensitive stratum', /security-sensitive/i],
      ['recovery/invalidation stratum', /recovery\/invalidation/i],
    ],
    'Context-efficiency evaluation guide'
  );
  expectFileNotContains(
    file,
    /at least 32 tasks/i,
    `Context-efficiency guide must not retain the obsolete 32-case corpus: ${file}`
  );
}

const efficiencyRuntime = join(ROOT, 'knowzcode', 'knowzcode', 'context_efficiency_runtime.mjs');
expectFileContainsAll(
  efficiencyRuntime,
  [
    ['capsule schema validation', /CAPSULE_SCHEMA_INVALID/],
    ['capsule privacy rejection', /CAPSULE_PRIVATE_CONTENT/],
    ['reviewer-lineage invalidation', /REVIEW_LINEAGE_CONTAMINATION/],
    ['writer ownership conflict', /WRITER_OWNERSHIP_CONFLICT/],
    ['deep-query gate', /function shouldDeepQuery|export function shouldDeepQuery/],
  ],
  'Shipped context-efficiency runtime safety'
);

const vaultDeltaTarget = mkdtempSync(join(tmpdir(), 'knowzcode-vault-delta-'));
try {
  const before = snapshotDirectory(vaultDeltaTarget);
  const vaultDeltaResponse = invokeRuntime(
    efficiencyRuntime,
    'vault-delta',
    {
      delta: {
        category: 'decision',
        title: 'Batch normal progress',
        content: 'Retain the delta until a required flush boundary.',
        semantic_key: 'progress-capture-policy',
      },
    },
    vaultDeltaTarget
  );
  expect(vaultDeltaResponse?.ok === true, 'vault-delta runtime call must succeed');
  expect(vaultDeltaResponse?.result?.action === 'batch', 'vault-delta runtime must batch a normal delta');
  expect(
    hashValue(snapshotDirectory(vaultDeltaTarget)) === hashValue(before),
    'vault-delta runtime call must not mutate its working directory'
  );
} finally {
  rmSync(vaultDeltaTarget, { recursive: true, force: true });
}

// A write-prohibited result-policy decision must be behaviorally side-effect free,
// not merely described as zero-write in a skill prompt.
const zeroWriteTarget = mkdtempSync(join(tmpdir(), 'knowzcode-zero-write-'));
try {
  const before = snapshotDirectory(zeroWriteTarget);
  const response = invokeRuntime(
    efficiencyRuntime,
    'result-policy',
    { write_prohibited: true, material: true, resumable: true },
    zeroWriteTarget
  );
  const result = response?.result ?? response;
  const writeFlags = result?.writes ?? {};
  const allowedWrites = result?.allowed_writes
    ?? result?.authorized_writes
    ?? Object.entries(writeFlags).filter(([, allowed]) => allowed === true).map(([name]) => name);
  expect(response?.ok === true, 'Write-prohibited result-policy runtime call must succeed');
  expect(response?.__exitCode === 0, 'Write-prohibited result-policy runtime call must exit zero');
  expect(result?.mode === 'ephemeral', 'Write-prohibited result-policy must return ephemeral mode');
  expect(
    Array.isArray(allowedWrites) && allowedWrites.length === 0,
    'Write-prohibited result-policy must authorize zero writes'
  );
  for (const [field, nestedField] of [
    ['create_handoff', 'handoff'],
    ['create_artifact', 'artifact'],
    ['write_vault', 'vault'],
    ['write_settings', 'settings'],
    ['write_workgroup', 'workgroup'],
  ]) {
    expect(
      result?.[field] === false || writeFlags[nestedField] === false,
      `Write-prohibited result-policy must deny ${nestedField} writes`
    );
  }
  expect(
    stableJson(snapshotDirectory(zeroWriteTarget)) === stableJson(before),
    'Write-prohibited result-policy runtime call must not create or change any file or directory'
  );
} catch (error) {
  expect(false, `Write-prohibited result-policy behavioral smoke failed: ${error.stderr || error.message}`);
} finally {
  rmSync(zeroWriteTarget, { recursive: true, force: true });
}

const efficiencyContractTests = join(ROOT, 'scripts', 'context-efficiency-contract.test.mjs');
expectFileContainsAll(
  efficiencyContractTests,
  [
    ['malformed capsule negative coverage', /CAPSULE_SCHEMA_INVALID/],
    ['private capsule negative coverage', /CAPSULE_PRIVATE_CONTENT/],
    ['reviewer-lineage negative coverage', /REVIEW_LINEAGE_CONTAMINATION|independent reviewers never inherit/i],
    ['overlapping-writer negative coverage', /WRITER_OWNERSHIP_CONFLICT|overlapping writer/i],
    ['nesting-limit local fallback coverage', /nesting[_ ]depth[\s\S]*max[_ ]nesting[_ ]depth[\s\S]*(?:mode,?\s*['"]local['"]|mode:\s*['"]local['"])/i],
    ['embedded capsule-value privacy coverage', /approved_decisions[\s\S]*CAPSULE_PRIVATE_CONTENT|embedded[ -](?:private|secret|value)/i],
    ['vault amend coverage', /action:\s*['"]amend['"]|changed content[\s\S]*amend/i],
    ['strict telemetry-label coverage', /arbitrary-unapproved-model[\s\S]*EFFICIENCY_EVENT_INVALID|unapproved[ -](?:telemetry )?label/i],
    ['per-scenario runnable corpus coverage', /scenario\.operation[\s\S]*scenario\.input[\s\S]*scenario\.oracle/i],
  ],
  'Context-efficiency negative test coverage'
);
try {
  execFileSync(process.execPath, ['--test', efficiencyContractTests], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
  });
} catch (error) {
  expect(false, `Context-efficiency executable contract suite failed: ${error.stderr || error.message}`);
}

const experimentRoot = join(ROOT, 'scripts', 'fixtures', 'context-efficiency', 'experiment-corpus');
const experimentManifest = readJson('scripts', 'fixtures', 'context-efficiency', 'experiment-corpus', 'manifest.json');
const experimentPairs = experimentManifest?.paired_results
  ? readJson('scripts', 'fixtures', 'context-efficiency', 'experiment-corpus', experimentManifest.paired_results)
  : null;
if (experimentManifest?.scenarios) {
  const scenarios = experimentManifest.scenarios;
  expect(scenarios.length >= 40, 'Context-efficiency corpus must contain at least 40 runnable scenarios');
  expect(
    scenarios.every((scenario) => typeof scenario.operation === 'string'
      && scenario.input && typeof scenario.input === 'object'
      && (Object.hasOwn(scenario, 'expected')
        || (['success', 'error'].includes(scenario.oracle?.status)
          && (Object.hasOwn(scenario.oracle, 'match') || typeof scenario.oracle?.code === 'string')))),
    'Every context-efficiency corpus scenario must contain operation, self-contained input, and a success/error oracle'
  );
  expect(
    new Set(scenarios.map(({ operation, input }) => hashValue({ operation, input }))).size === scenarios.length,
    'All context-efficiency corpus operation/input pairs must be unique'
  );
  for (const scenario of scenarios) {
    if (typeof scenario.operation !== 'string' || !scenario.input) continue;
    try {
      const response = invokeRuntime(
        efficiencyRuntime,
        scenario.operation,
        scenario.input,
        experimentRoot,
        { wrapInput: false }
      );
      if (scenario.oracle?.status === 'success') {
        expect(response?.ok === true, `Context-efficiency corpus scenario must succeed: ${scenario.id}`);
        expect(
          matchesSubset(response?.result, scenario.oracle.match),
          `Context-efficiency corpus runtime result differs from success oracle: ${scenario.id}`
        );
      } else if (scenario.oracle?.status === 'error') {
        expect(response?.ok === false, `Context-efficiency corpus scenario must fail closed: ${scenario.id}`);
        expect(response?.__exitCode !== 0, `Context-efficiency corpus error scenario must exit nonzero: ${scenario.id}`);
        expect(
          response?.code === scenario.oracle.code,
          `Context-efficiency corpus runtime error differs from oracle: ${scenario.id}`
        );
        const failureJson = stableJson(response);
        expect(
          stringLeaves(scenario.input).every((value) => !failureJson.includes(value)),
          `Context-efficiency corpus runtime failure must not echo input content: ${scenario.id}`
        );
      } else if (Object.hasOwn(scenario, 'expected')) {
        const actual = scenario.expected?.ok === false || scenario.expected?.ok === true
          ? response
          : response?.result;
        expect(
          stableJson(actual) === stableJson(scenario.expected),
          `Context-efficiency corpus runtime result differs from oracle: ${scenario.id}`
        );
      }
    } catch (error) {
      expect(false, `Context-efficiency corpus scenario failed to execute (${scenario.id}): ${error.stderr || error.message}`);
    }
  }
}
if (experimentManifest?.scenarios && experimentPairs?.pairs) {
  const scenarioIds = experimentManifest.scenarios.map(({ id }) => id).sort();
  const pairIds = experimentPairs.pairs.map(({ id }) => id).sort();
  expect(stableJson(pairIds) === stableJson(scenarioIds), 'Paired corpus results must cover every runnable scenario exactly once');
  expect(
    new Set(experimentPairs.pairs.map(({ id: _id, ...measurements }) => hashValue(measurements))).size
      === experimentPairs.pairs.length,
    'Every context-efficiency scenario must have unique case-specific paired measurements'
  );
}

for (const file of [
  join(ROOT, 'knowzcode', 'knowzcode', 'relay_execution.md'),
  join(ROOT, 'plugins', 'knowzcode', 'knowzcode', 'relay_execution.md'),
  join(ROOT, 'knowzcode', 'skills', 'work', 'references', 'relay-execution.md'),
  join(ROOT, 'plugins', 'knowzcode', 'skills', 'work', 'references', 'relay-execution.md'),
]) {
  expectFileContainsAll(
    file,
    [
      ['Claude per-leg budget', /relay_claude_max_budget_usd|per-leg (budget|ceiling)/i],
      ['Claude max-budget flag', /--max-budget-usd/],
      ['warm delta prompt', /delta prompt|delta-prompt/i],
      ['cold recovery prompt', /cold-recovery|recovery brief/i],
    ],
    'Claude relay efficiency boundary'
  );
  expectFileNotContains(
    file,
    /--tools\s+["'][^"'\n]*\bAgent\b/,
    `Claude relay tool allowlist must not widen to Agent/fork: ${file}`
  );
  expectFileContains(
    file,
    /reject `?bypassPermissions`?|never add `?--dangerously-skip-permissions`?|Reject[\s\S]*--dangerously-skip-permissions/i,
    `Claude relay must explicitly reject permission bypass: ${file}`
  );
}

const installerFile = join(ROOT, 'knowzcode', 'bin', 'knowzcode.mjs');
expectFileNotContains(
  installerFile,
  /Enable Agent Teams\? \(recommended for Claude Code\)/,
  'Installer must keep Agent Teams explicit opt-in instead of recommending it by default'
);
expectFileNotContains(
  installerFile,
  /CLAUDE_CODE_FORK_SUBAGENT/,
  'Installer must never enable Claude fork mode globally'
);

// Exercise Claude Teams as a strict explicit opt-in. Isolate HOME so a developer's
// installed marketplace registry cannot influence plugin detection in these smokes.
const claudeTeamsCli = join(ROOT, 'knowzcode', 'bin', 'knowzcode.mjs');
const ordinaryClaudeTarget = mkdtempSync(join(tmpdir(), 'knowzcode-claude-ordinary-'));
try {
  execFileSync(
    process.execPath,
    [claudeTeamsCli, 'install', '--target', ordinaryClaudeTarget, '--platforms', 'claude', '--force'],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, HOME: ordinaryClaudeTarget } }
  );
  const generatedClaudeWork = join(ordinaryClaudeTarget, '.claude', 'skills', 'work', 'SKILL.md');
  const generatedClaudeRuntime = join(ordinaryClaudeTarget, 'knowzcode', 'context_efficiency_runtime.mjs');
  expect(existsSync(generatedClaudeRuntime), 'Fresh Claude install must ship context_efficiency_runtime.mjs');
  expect(
    readFileSync(generatedClaudeRuntime, 'utf8') === readFileSync(efficiencyRuntime, 'utf8'),
    'Fresh Claude install runtime must be byte-identical to the canonical runtime'
  );
  expectFileContainsAll(
    generatedClaudeWork,
    [
      ['context-efficiency enablement gate', /context[_ -]efficiency[\s\S]*enabled/i],
      ['shipped safety runtime invocation', /\bnode\s+[^\r\n`]*context_efficiency_runtime\.mjs[\s\S]*(?:route|dispatch|capsule|lineage|result-policy)/i],
      ['vault-delta batching invocation', /vault-delta[\s\S]*(?:skip|amend|update|batch|flush)/i],
    ],
    'Generated Claude work skill runtime integration'
  );
  const installedClaudeVaultDelta = invokeRuntime(
    generatedClaudeRuntime,
    'vault-delta',
    {
      delta: {
        category: 'decision',
        title: 'Installed Claude batching',
        content: 'Classify without writing.',
        semantic_key: 'installed-claude-vault-delta',
      },
    },
    ordinaryClaudeTarget
  );
  expect(installedClaudeVaultDelta?.ok === true, 'Fresh Claude installed runtime must execute vault-delta');
  expect(installedClaudeVaultDelta?.result?.action === 'batch', 'Fresh Claude installed runtime must batch normal deltas');
  const settingsPath = join(ordinaryClaudeTarget, '.claude', 'settings.local.json');
  if (existsSync(settingsPath)) {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    expect(
      settings.env?.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS !== '1',
      'Ordinary Claude install must not enable Agent Teams'
    );
  }
} catch (error) {
  expect(false, `Ordinary Claude install smoke test failed: ${error.stderr || error.message}`);
} finally {
  rmSync(ordinaryClaudeTarget, { recursive: true, force: true });
}

const malformedOrdinaryClaudeTarget = mkdtempSync(join(tmpdir(), 'knowzcode-claude-ordinary-malformed-'));
try {
  const claudeDir = join(malformedOrdinaryClaudeTarget, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  const settingsPath = join(claudeDir, 'settings.json');
  const malformedSentinel = '{ malformed ordinary settings: preserve exactly\n';
  writeFileSync(settingsPath, malformedSentinel);
  let rejected = false;
  try {
    execFileSync(
      process.execPath,
      [claudeTeamsCli, 'install', '--target', malformedOrdinaryClaudeTarget, '--platforms', 'claude', '--force'],
      { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, HOME: malformedOrdinaryClaudeTarget } }
    );
  } catch {
    rejected = true;
  }
  expect(rejected, 'Ordinary Claude install must fail closed when .claude/settings.json is malformed');
  expect(
    readFileSync(settingsPath, 'utf8') === malformedSentinel,
    'Failed ordinary Claude install must preserve malformed .claude/settings.json byte-for-byte'
  );
} catch (error) {
  expect(false, `Malformed ordinary Claude settings smoke setup failed: ${error.stderr || error.message}`);
} finally {
  rmSync(malformedOrdinaryClaudeTarget, { recursive: true, force: true });
}

const explicitTeamsTarget = mkdtempSync(join(tmpdir(), 'knowzcode-claude-teams-'));
try {
  execFileSync(
    process.execPath,
    [claudeTeamsCli, 'install', '--target', explicitTeamsTarget, '--platforms', 'claude', '--agent-teams', '--force'],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, HOME: explicitTeamsTarget } }
  );
  const settingsPath = join(explicitTeamsTarget, '.claude', 'settings.local.json');
  const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
  expect(
    settings.env?.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS === '1',
    'Explicit --agent-teams install must enable Agent Teams'
  );
} catch (error) {
  expect(false, `Explicit Claude Teams install smoke test failed: ${error.stderr || error.message}`);
} finally {
  rmSync(explicitTeamsTarget, { recursive: true, force: true });
}

const malformedClaudeTarget = mkdtempSync(join(tmpdir(), 'knowzcode-claude-malformed-'));
try {
  execFileSync(
    process.execPath,
    [claudeTeamsCli, 'install', '--target', malformedClaudeTarget, '--platforms', 'claude', '--force'],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, HOME: malformedClaudeTarget } }
  );
  const settingsPath = join(malformedClaudeTarget, '.claude', 'settings.local.json');
  const malformedSentinel = '{ malformed user settings: preserve exactly\n';
  writeFileSync(settingsPath, malformedSentinel);
  let rejected = false;
  try {
    execFileSync(
      process.execPath,
      [claudeTeamsCli, 'install', '--target', malformedClaudeTarget, '--platforms', 'claude', '--agent-teams', '--force'],
      { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, HOME: malformedClaudeTarget } }
    );
  } catch {
    rejected = true;
  }
  expect(rejected, 'Explicit Teams opt-in must fail closed when existing Claude settings are malformed');
  expect(
    readFileSync(settingsPath, 'utf8') === malformedSentinel,
    'Failed Claude Teams opt-in must preserve malformed existing settings byte-for-byte'
  );
} catch (error) {
  expect(false, `Malformed Claude settings smoke setup failed: ${error.stderr || error.message}`);
} finally {
  rmSync(malformedClaudeTarget, { recursive: true, force: true });
}

const malformedGlobalClaudeRoot = mkdtempSync(join(tmpdir(), 'knowzcode-claude-global-malformed-'));
try {
  const globalHome = join(malformedGlobalClaudeRoot, 'home');
  const target = join(malformedGlobalClaudeRoot, 'project');
  const claudeDir = join(globalHome, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  mkdirSync(target, { recursive: true });
  const settingsPath = join(claudeDir, 'settings.json');
  const malformedShapeSentinel = '{\n  "env": "must-remain-a-string",\n  "keep": true\n}\n';
  writeFileSync(settingsPath, malformedShapeSentinel);
  const before = snapshotDirectory(claudeDir);
  let rejected = false;
  try {
    execFileSync(
      process.execPath,
      [claudeTeamsCli, 'install', '--target', target, '--platforms', 'claude', '--global', '--agent-teams', '--force'],
      { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, HOME: globalHome } }
    );
  } catch {
    rejected = true;
  }
  expect(rejected, 'Global explicit Teams install must reject malformed settings before any mutation');
  expect(
    readFileSync(settingsPath, 'utf8') === malformedShapeSentinel,
    'Failed global Teams preflight must preserve settings.json byte-for-byte'
  );
  expect(
    stableJson(snapshotDirectory(claudeDir)) === stableJson(before),
    'Failed global Teams preflight must not partially install skills, agents, or marketplace settings'
  );
} catch (error) {
  expect(false, `Malformed global Claude settings smoke setup failed: ${error.stderr || error.message}`);
} finally {
  rmSync(malformedGlobalClaudeRoot, { recursive: true, force: true });
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

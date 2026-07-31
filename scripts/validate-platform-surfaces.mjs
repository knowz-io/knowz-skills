#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const VALIDATOR_HOME = mkdtempSync(join(tmpdir(), 'knowzcode-validator-home-'));
const VALIDATOR_CODEX_HOME = join(VALIDATOR_HOME, '.codex');
process.env.HOME = VALIDATOR_HOME;
process.env.USERPROFILE = VALIDATOR_HOME;
process.env.CODEX_HOME = VALIDATOR_CODEX_HOME;
process.on('exit', () => rmSync(VALIDATOR_HOME, { recursive: true, force: true }));

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
      } else if (entry.isSymbolicLink()) {
        entries.push(`symlink:${path}:${readlinkSync(absolute)}`);
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

function listMarkdownFiles(root) {
  if (!existsSync(root)) return [];
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...listMarkdownFiles(path));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(path);
  }
  return files;
}

function collectClaudePluginResourceReferences(...roots) {
  const references = new Map();
  const pattern = /\$\{CLAUDE_PLUGIN_ROOT\}\/([A-Za-z0-9._/-]+)/g;
  for (const root of roots) {
    for (const file of listMarkdownFiles(root)) {
      const raw = readFileSync(file, 'utf8');
      for (const match of raw.matchAll(pattern)) {
        const resource = match[1];
        const sources = references.get(resource) ?? [];
        sources.push(file);
        references.set(resource, sources);
      }
    }
  }
  return references;
}

function localizedClaudeResourcePath(resource) {
  if (resource.startsWith('skills/')) return join('.claude', resource);
  if (resource.startsWith('agents/')) return join('.claude', resource);
  if (resource.startsWith('docs/')) return join('knowzcode', resource);
  return null;
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

// Claude substitutes CLAUDE_PLUGIN_ROOT in marketplace skill and agent content.
// The npx installer must localize the same declarations to project-owned paths.
// Treat each declaration as a required resource and prove the package-side target
// before exercising the generated local-install target later in this validator.
const claudePluginResourceReferences = collectClaudePluginResourceReferences(
  join(ROOT, 'knowzcode', 'skills'),
  join(ROOT, 'knowzcode', 'agents')
);
const claudeResourceSourceFiles = [
  ...listMarkdownFiles(join(ROOT, 'knowzcode', 'skills')),
  ...listMarkdownFiles(join(ROOT, 'knowzcode', 'agents')),
];
for (const file of claudeResourceSourceFiles) {
  const raw = readFileSync(file, 'utf8');
  expect(
    !/knowzcode\/skills\/[A-Za-z0-9_./{}*-]+/.test(raw),
    `Claude package-internal skill references must use \${CLAUDE_PLUGIN_ROOT}: ${file}`
  );
  if (relative(join(ROOT, 'knowzcode', 'skills'), file).split(/[\\/]/).includes('references')) {
    expect(
      !/(?:`|\()references\/[A-Za-z0-9_.{}*/-]+\.md/.test(raw),
      `Nested Claude references must not use a top-level-skill-relative path: ${file}`
    );
  }
  if (file !== join(ROOT, 'knowzcode', 'agents', 'update-coordinator.md')) {
    expect(
      !/(?<![A-Za-z0-9_./$}{-])(?:agents\/[A-Za-z0-9_.{}*-]+\.md|skills\/[A-Za-z0-9_./{}*-]+\.md)/.test(raw),
      `Claude package-internal agent/skill references must use \${CLAUDE_PLUGIN_ROOT}: ${file}`
    );
  }
}
const requiredClaudeResourceCoverage = [
  'skills/work/references/relay-execution.md',
  'skills/work/references/profile-models.md',
  'skills/work/references/spawn-prompts.md',
  'agents/relay-runner.md',
  'docs/enterprise-compliance.md',
];
expect(claudePluginResourceReferences.size > 0, 'Claude package must declare its required plugin resources with ${CLAUDE_PLUGIN_ROOT}');
let packedKnowzCodeFiles = new Set();
try {
  const packResult = JSON.parse(execFileSync(
    'npm',
    ['pack', '--dry-run', '--json', '--ignore-scripts'],
    { cwd: join(ROOT, 'knowzcode'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  ));
  packedKnowzCodeFiles = new Set(packResult?.[0]?.files?.map((entry) => entry.path) ?? []);
  expect(packedKnowzCodeFiles.size > 0, 'npm pack dry-run must enumerate the KnowzCode package payload');
} catch (error) {
  expect(false, `Unable to inspect the npm KnowzCode package payload: ${error.stderr || error.message}`);
}
for (const resource of requiredClaudeResourceCoverage) {
  expect(
    claudePluginResourceReferences.has(resource),
    `Claude package must declare required resource: ${resource}`
  );
}
for (const [resource, sources] of claudePluginResourceReferences) {
  expect(
    resource !== '..' && !resource.startsWith('../') && !resource.includes('/../'),
    `Claude plugin resource must not traverse outside the package: ${resource} (${sources.join(', ')})`
  );
  const packagedPath = join(ROOT, 'knowzcode', resource);
  expect(
    existsSync(packagedPath),
    `Declared Claude plugin resource is missing from the package: ${resource} (${sources.join(', ')})`
  );
  expect(
    packedKnowzCodeFiles.has(resource.replace(/\/$/, ''))
      || [...packedKnowzCodeFiles].some((entry) => entry.startsWith(resource)),
    `Declared Claude plugin resource is omitted from npm pack output: ${resource} (${sources.join(', ')})`
  );
  expect(
    localizedClaudeResourcePath(resource) !== null,
    `Declared Claude plugin resource has no npx-localized destination: ${resource} (${sources.join(', ')})`
  );
}

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
expectFileContainsAll(
  canonicalAdapter,
  [
    ['Claude v2.1.212 /subtask full-context semantics', /v2\.1\.212[\s\S]*`\/subtask`[\s\S]*in-session full-context/i],
    ['Claude v2.1.212 /fork background semantics', /`\/fork`[\s\S]*background session[\s\S]*Agent\s+View\s+is\s+disabled[\s\S]*forked-subagent/i],
    ['ordinary Claude subagent nesting limit', /ordinary subagents can nest to depth 3/i],
    ['Claude custom-agent field scope', /Local, user, and CLI custom agents may use `permissionMode`, `hooks`, and\s+`mcpServers`[\s\S]*plugin-shipped agent definitions do not support/i],
    ['Claude native auto-resume', /completed custom\/general `Agent` returns an ID[\s\S]*`SendMessage`[\s\S]*auto-resume[\s\S]*without a team/i],
    ['Claude non-resumable built-ins', /`Explore` and `Plan` agents return no[\s\S]*ID and cannot be resumed/i],
    ['per-run Claude Team approval', /approval for each run[\s\S]*prior-run approval is not reusable/i],
  ],
  'Canonical platform adapter current Claude semantics'
);
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
  const generatedContinueSkill = join(generatedCodexTarget, '.agents', 'skills', 'knowzcode-continue', 'SKILL.md');
  const generatedSetupSkill = join(generatedCodexTarget, '.agents', 'skills', 'knowzcode-setup', 'SKILL.md');
  const generatedStatusSkill = join(generatedCodexTarget, '.agents', 'skills', 'knowzcode-status', 'SKILL.md');
  const generatedRelayRef = join(generatedCodexTarget, '.agents', 'skills', 'knowzcode-work', 'references', 'relay-execution.md');
  const generatedCoreRef = join(generatedCodexTarget, 'knowzcode', 'relay_execution.md');
  const generatedCodexGuide = join(generatedCodexTarget, 'knowzcode', 'codex_execution.md');
  const generatedEfficiencyGuide = join(generatedCodexTarget, 'knowzcode', 'context_efficiency.md');
  const generatedEfficiencyRuntime = join(generatedCodexTarget, 'knowzcode', 'context_efficiency_runtime.mjs');
  const generatedContractRoot = join(generatedCodexTarget, 'knowzcode', 'contracts');
  const generatedAgents = join(generatedCodexTarget, 'AGENTS.md');
  const generatedCodexManifest = join(generatedCodexTarget, '.agents', 'skills', '.knowzcode-managed.json');

  for (const file of [generatedRelaySkill, generatedWorkSkill, generatedExploreSkill, generatedContinueSkill, generatedSetupSkill, generatedStatusSkill, generatedRelayRef, generatedCoreRef, generatedCodexGuide, generatedEfficiencyGuide, generatedEfficiencyRuntime, generatedAgents, generatedCodexManifest]) {
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
  expectFileContains(generatedAgents, /<!-- KnowzCode managed adapter: codex -->/, 'Generated Codex AGENTS.md must carry an explicit ownership marker');
  if (existsSync(generatedCodexManifest)) {
    const manifest = JSON.parse(readFileSync(generatedCodexManifest, 'utf8'));
    expect(manifest.schema === 'knowzcode.codex-skill-ownership/v1', 'Generated Codex manifest must use the ownership schema');
    expect(manifest.owner === 'knowzcode', 'Generated Codex manifest must name KnowzCode as owner');
    expect(stableJson(manifest.entries) === stableJson([...adapterCodexSkillNames].sort()), 'Generated Codex manifest must list exactly the generated skill directories');
  }
  for (const skill of [generatedRelaySkill, generatedContinueSkill, generatedSetupSkill, generatedStatusSkill]) {
    expectFileNotContains(
      skill,
      /\.\.\/work\/references\/relay-execution\.md/,
      `Generated prefixed Codex skill must not retain an unprefixed sibling relay reference: ${skill}`
    );
  }
  for (const skill of [generatedRelaySkill, generatedContinueSkill, generatedSetupSkill, generatedStatusSkill]) {
    if (/relay-execution\.md/.test(readFileSync(skill, 'utf8'))) {
      expectFileContains(
        skill,
        /\.\.\/knowzcode-work\/references\/relay-execution\.md/,
        `Generated prefixed Codex relay reference must resolve through knowzcode-work: ${skill}`
      );
    }
  }
  expectFileContainsAll(
    generatedSetupSkill,
    [
      ['packaged npx bootstrap', /npx --yes knowzcode install --target/],
      ['explicit repository target', /absolute-repository-root/],
      ['unmanaged AGENTS preservation', /unmanaged[\s\S]{0,40}`AGENTS\.md`/i],
    ],
    'Generated Codex setup skill'
  );
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
      ['fork_turns full inheritance', /fork_turns[\s\S]*omitting it or passing `?"all"`?[\s\S]*full parent-history inheritance/i],
      ['fork_turns inherited settings', /neither form accepts model or reasoning overrides/i],
      ['fork_turns recent inheritance', /positive decimal string[\s\S]*inherit-recent/i],
      ['fork_turns cold fallback', /`?"none"`?[\s\S]*fresh-capsule[\s\S]*CAPABILITY_FALLBACK/i],
      ['canonical pending queue', /project-root `knowz-pending\.md`/i],
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

// Codex ownership is fail-safe: unmanaged AGENTS.md and unlisted kc-* or
// knowzcode-* directories survive install, local upgrade, and uninstall. The
// same sequence also proves Codex-only --agent-teams cannot alter Claude state
// and project-local commands cannot mutate HOME.
const unmanagedCodexTarget = mkdtempSync(join(tmpdir(), 'knowzcode-codex-unmanaged-'));
try {
  const cli = join(ROOT, 'knowzcode', 'bin', 'knowzcode.mjs');
  const agentsSentinel = '# User-owned project instructions\n\nKeep this byte-for-byte.\n';
  const claudeSettingsSentinel = '{\n  "env": { "KEEP": "unchanged" }\n}\n';
  const unrelatedSkillRoot = join(unmanagedCodexTarget, '.agents', 'skills');
  const unrelatedKcSkill = join(unrelatedSkillRoot, 'kc-custom', 'SKILL.md');
  const unrelatedKnowzCodeSkill = join(unrelatedSkillRoot, 'knowzcode-user-owned', 'SKILL.md');
  mkdirSync(dirname(unrelatedKcSkill), { recursive: true });
  mkdirSync(dirname(unrelatedKnowzCodeSkill), { recursive: true });
  mkdirSync(join(unmanagedCodexTarget, '.claude'), { recursive: true });
  writeFileSync(join(unmanagedCodexTarget, 'AGENTS.md'), agentsSentinel);
  writeFileSync(join(unmanagedCodexTarget, '.claude', 'settings.local.json'), claudeSettingsSentinel);
  writeFileSync(unrelatedKcSkill, '# user-owned kc skill\n');
  writeFileSync(unrelatedKnowzCodeSkill, '# user-owned knowzcode skill\n');

  const homeSentinel = join(VALIDATOR_HOME, 'local-command-sentinel.txt');
  writeFileSync(homeSentinel, 'must not change\n');
  const homeBefore = snapshotDirectory(VALIDATOR_HOME);

  execFileSync(
    process.execPath,
    [cli, 'install', '--target', unmanagedCodexTarget, '--platforms', 'codex', '--agent-teams', '--force'],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' }
  );
  expect(readFileSync(join(unmanagedCodexTarget, 'AGENTS.md'), 'utf8') === agentsSentinel, 'Codex install must preserve unmanaged AGENTS.md byte-for-byte');
  expect(readFileSync(join(unmanagedCodexTarget, '.claude', 'settings.local.json'), 'utf8') === claudeSettingsSentinel, 'Codex-only --agent-teams must not mutate Claude settings');
  expect(existsSync(join(unrelatedSkillRoot, '.knowzcode-managed.json')), 'Codex install beside unmanaged AGENTS.md must still create its skill ownership manifest');
  expect(stableJson(snapshotDirectory(VALIDATOR_HOME)) === stableJson(homeBefore), 'Project-local Codex install must not mutate isolated HOME');

  execFileSync(
    process.execPath,
    [cli, 'upgrade', '--target', unmanagedCodexTarget, '--force'],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' }
  );
  expect(readFileSync(join(unmanagedCodexTarget, 'AGENTS.md'), 'utf8') === agentsSentinel, 'Codex upgrade must preserve unmanaged AGENTS.md byte-for-byte');
  expect(existsSync(unrelatedKcSkill), 'Codex upgrade must preserve an unlisted kc-* skill');
  expect(existsSync(unrelatedKnowzCodeSkill), 'Codex upgrade must preserve an unlisted knowzcode-* skill');
  expect(stableJson(snapshotDirectory(VALIDATOR_HOME)) === stableJson(homeBefore), 'Project-local Codex upgrade must not mutate isolated HOME');

  execFileSync(
    process.execPath,
    [cli, 'uninstall', '--target', unmanagedCodexTarget, '--force'],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' }
  );
  expect(readFileSync(join(unmanagedCodexTarget, 'AGENTS.md'), 'utf8') === agentsSentinel, 'Codex uninstall must preserve unmanaged AGENTS.md byte-for-byte');
  expect(existsSync(unrelatedKcSkill), 'Codex uninstall must preserve an unlisted kc-* skill');
  expect(existsSync(unrelatedKnowzCodeSkill), 'Codex uninstall must preserve an unlisted knowzcode-* skill');
  expect(!existsSync(join(unrelatedSkillRoot, 'knowzcode-work')), 'Codex uninstall must remove manifest-owned generated skills');
  expect(!existsSync(join(unrelatedSkillRoot, '.knowzcode-managed.json')), 'Codex uninstall must remove its ownership manifest');
  expect(stableJson(snapshotDirectory(VALIDATOR_HOME)) === stableJson(homeBefore), 'Project-local Codex uninstall must not mutate isolated HOME');
} catch (error) {
  expect(false, `Codex ownership isolation smoke test failed: ${error.stderr || error.message}`);
} finally {
  rmSync(unmanagedCodexTarget, { recursive: true, force: true });
}

const scopedCodexUpgradeTarget = mkdtempSync(join(tmpdir(), 'knowzcode-codex-scoped-upgrade-'));
try {
  const cli = join(ROOT, 'knowzcode', 'bin', 'knowzcode.mjs');
  execFileSync(
    process.execPath,
    [cli, 'install', '--target', scopedCodexUpgradeTarget, '--platforms', 'codex,claude', '--force'],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' }
  );
  const claudeDir = join(scopedCodexUpgradeTarget, '.claude');
  const localSettings = join(claudeDir, 'settings.local.json');
  writeFileSync(localSettings, '{\n  "env": { "KEEP": "exact" }\n}\n');
  const claudeBefore = snapshotDirectory(claudeDir);
  execFileSync(
    process.execPath,
    [cli, 'upgrade', '--target', scopedCodexUpgradeTarget, '--platforms', 'codex', '--agent-teams', '--force'],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' }
  );
  expect(stableJson(snapshotDirectory(claudeDir)) === stableJson(claudeBefore), 'Codex-scoped upgrade with --agent-teams must not mutate any Claude component or setting');
} catch (error) {
  expect(false, `Explicit Codex-only upgrade scope smoke test failed: ${error.stderr || error.message}`);
} finally {
  rmSync(scopedCodexUpgradeTarget, { recursive: true, force: true });
}

// Reject an invalid target layout before copying any framework or adapter file.
const invalidCodexTarget = mkdtempSync(join(tmpdir(), 'knowzcode-codex-invalid-target-'));
try {
  const cli = join(ROOT, 'knowzcode', 'bin', 'knowzcode.mjs');
  mkdirSync(join(invalidCodexTarget, 'knowzcode'), { recursive: true });
  writeFileSync(join(invalidCodexTarget, 'knowzcode', 'specs'), 'not a directory\n');
  writeFileSync(join(invalidCodexTarget, 'sentinel.txt'), 'preserve exact target\n');
  const before = snapshotDirectory(invalidCodexTarget);
  let rejected = false;
  try {
    execFileSync(
      process.execPath,
      [cli, 'install', '--target', invalidCodexTarget, '--platforms', 'codex', '--force'],
      { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' }
    );
  } catch {
    rejected = true;
  }
  expect(rejected, 'Codex install must reject an invalid target layout during preflight');
  expect(stableJson(snapshotDirectory(invalidCodexTarget)) === stableJson(before), 'Failed Codex target preflight must preserve the complete target snapshot');
} catch (error) {
  expect(false, `Invalid Codex target preflight smoke setup failed: ${error.stderr || error.message}`);
} finally {
  rmSync(invalidCodexTarget, { recursive: true, force: true });
}

const lateCollisionTarget = mkdtempSync(join(tmpdir(), 'knowzcode-framework-file-collision-'));
try {
  const cli = join(ROOT, 'knowzcode', 'bin', 'knowzcode.mjs');
  mkdirSync(join(lateCollisionTarget, 'knowzcode', 'knowzcode_loop.md'), { recursive: true });
  writeFileSync(join(lateCollisionTarget, 'sentinel.txt'), 'no partial framework writes\n');
  const before = snapshotDirectory(lateCollisionTarget);
  let rejected = false;
  try {
    execFileSync(
      process.execPath,
      [cli, 'install', '--target', lateCollisionTarget, '--platforms', 'codex', '--force'],
      { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' }
    );
  } catch {
    rejected = true;
  }
  expect(rejected, 'Install must reject an exact framework file target that is a directory');
  expect(stableJson(snapshotDirectory(lateCollisionTarget)) === stableJson(before), 'Late framework target collision must fail before any partial writes');
} catch (error) {
  expect(false, `Late framework target collision smoke setup failed: ${error.stderr || error.message}`);
} finally {
  rmSync(lateCollisionTarget, { recursive: true, force: true });
}

const collidingCodexTarget = mkdtempSync(join(tmpdir(), 'knowzcode-codex-collision-'));
try {
  const cli = join(ROOT, 'knowzcode', 'bin', 'knowzcode.mjs');
  const collidingSkill = join(collidingCodexTarget, '.agents', 'skills', 'knowzcode-work', 'SKILL.md');
  mkdirSync(dirname(collidingSkill), { recursive: true });
  writeFileSync(collidingSkill, '# user-owned same-name skill\n');
  writeFileSync(join(collidingCodexTarget, 'AGENTS.md'), '# unmanaged instructions\n');
  const before = snapshotDirectory(collidingCodexTarget);
  let rejected = false;
  try {
    execFileSync(
      process.execPath,
      [cli, 'install', '--target', collidingCodexTarget, '--platforms', 'codex', '--force'],
      { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' }
    );
  } catch {
    rejected = true;
  }
  expect(rejected, 'Codex install must reject an unowned same-name skill collision');
  expect(stableJson(snapshotDirectory(collidingCodexTarget)) === stableJson(before), 'Rejected Codex skill collision must preserve the complete target snapshot');
} catch (error) {
  expect(false, `Codex skill collision smoke setup failed: ${error.stderr || error.message}`);
} finally {
  rmSync(collidingCodexTarget, { recursive: true, force: true });
}

// Shared non-Codex instruction files and generated children require exact
// ownership. An explicit --force install must not overwrite user content.
const nonCodexCollisionTarget = mkdtempSync(join(tmpdir(), 'knowzcode-noncodex-collision-'));
try {
  const cli = join(ROOT, 'knowzcode', 'bin', 'knowzcode.mjs');
  mkdirSync(join(nonCodexCollisionTarget, '.github'), { recursive: true });
  writeFileSync(join(nonCodexCollisionTarget, 'GEMINI.md'), '# user Gemini instructions\n');
  writeFileSync(join(nonCodexCollisionTarget, '.github', 'copilot-instructions.md'), '# user Copilot instructions\n');
  const before = snapshotDirectory(nonCodexCollisionTarget);
  let rejected = false;
  try {
    execFileSync(
      process.execPath,
      [cli, 'install', '--target', nonCodexCollisionTarget, '--platforms', 'gemini,copilot', '--force'],
      { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' }
    );
  } catch {
    rejected = true;
  }
  expect(rejected, 'Non-Codex install must reject unowned primary adapter collisions');
  expect(stableJson(snapshotDirectory(nonCodexCollisionTarget)) === stableJson(before), 'Rejected non-Codex primary collisions must preserve the full target snapshot');
} catch (error) {
  expect(false, `Non-Codex primary collision smoke failed: ${error.stderr || error.message}`);
} finally {
  rmSync(nonCodexCollisionTarget, { recursive: true, force: true });
}

const nonCodexChildCollisionTarget = mkdtempSync(join(tmpdir(), 'knowzcode-noncodex-child-collision-'));
try {
  const cli = join(ROOT, 'knowzcode', 'bin', 'knowzcode.mjs');
  const child = join(nonCodexChildCollisionTarget, '.gemini', 'commands', 'knowzcode', 'work.toml');
  mkdirSync(dirname(child), { recursive: true });
  writeFileSync(child, '# user-owned same-name Gemini command\n');
  const before = snapshotDirectory(nonCodexChildCollisionTarget);
  let rejected = false;
  try {
    execFileSync(
      process.execPath,
      [cli, 'install', '--target', nonCodexChildCollisionTarget, '--platforms', 'gemini', '--force'],
      { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' }
    );
  } catch {
    rejected = true;
  }
  expect(rejected, 'Non-Codex install must reject an unowned generated child collision');
  expect(stableJson(snapshotDirectory(nonCodexChildCollisionTarget)) === stableJson(before), 'Rejected non-Codex child collision must preserve the full target snapshot');
} catch (error) {
  expect(false, `Non-Codex child collision smoke failed: ${error.stderr || error.message}`);
} finally {
  rmSync(nonCodexChildCollisionTarget, { recursive: true, force: true });
}

// Copilot's shared JSON is merged structurally and tracked at entry level.
// Uninstall removes only KnowzCode-owned entries, even if the primary adapter
// was deleted independently.
const copilotMergeTarget = mkdtempSync(join(tmpdir(), 'knowzcode-copilot-merge-'));
try {
  const cli = join(ROOT, 'knowzcode', 'bin', 'knowzcode.mjs');
  const mcpPath = join(copilotMergeTarget, '.vscode', 'mcp.json');
  mkdirSync(dirname(mcpPath), { recursive: true });
  writeFileSync(mcpPath, JSON.stringify({
    servers: { other: { type: 'http', url: 'https://example.invalid/mcp' } },
    inputs: [{ id: 'user_input', type: 'promptString', description: 'keep' }],
    userSetting: 'preserve',
  }, null, 2) + '\n');
  execFileSync(
    process.execPath,
    [cli, 'install', '--target', copilotMergeTarget, '--platforms', 'copilot', '--force'],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' }
  );
  const merged = JSON.parse(readFileSync(mcpPath, 'utf8'));
  expect(merged.userSetting === 'preserve', 'Copilot MCP merge must preserve unrelated top-level settings');
  expect(merged.servers?.other?.url === 'https://example.invalid/mcp', 'Copilot MCP merge must preserve unrelated servers');
  expect(Boolean(merged.servers?.knowz), 'Copilot MCP merge must add the Knowz server entry');
  expect(merged.inputs.some((entry) => entry.id === 'user_input'), 'Copilot MCP merge must preserve unrelated inputs');
  expect(existsSync(join(copilotMergeTarget, '.vscode', '.knowzcode-mcp-managed.json')), 'Copilot MCP merge must write entry-level ownership metadata');

  rmSync(join(copilotMergeTarget, '.github', 'copilot-instructions.md'), { force: true });
  execFileSync(
    process.execPath,
    [cli, 'uninstall', '--target', copilotMergeTarget, '--force'],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' }
  );
  const preserved = JSON.parse(readFileSync(mcpPath, 'utf8'));
  expect(preserved.userSetting === 'preserve', 'Copilot uninstall must preserve unrelated top-level settings');
  expect(preserved.servers?.other?.url === 'https://example.invalid/mcp', 'Copilot uninstall must preserve unrelated servers');
  expect(!Object.hasOwn(preserved.servers ?? {}, 'knowz'), 'Copilot uninstall must remove only the owned Knowz server entry');
  expect(preserved.inputs?.length === 1 && preserved.inputs[0].id === 'user_input', 'Copilot uninstall must remove only owned input entries');
  expect(!existsSync(join(copilotMergeTarget, '.vscode', '.knowzcode-mcp-managed.json')), 'Copilot uninstall must remove its entry ownership manifest');
} catch (error) {
  expect(false, `Copilot structural MCP lifecycle smoke failed: ${error.stderr || error.message}`);
} finally {
  rmSync(copilotMergeTarget, { recursive: true, force: true });
}

// Gemini's mcpServers.knowz entry is shared with the Knowz package. Both
// install orders preserve the first owner's exact entry, and KnowzCode removes
// it only when its own digest still matches and no Knowz install remains.
for (const firstOwner of ['knowz', 'knowzcode']) {
  const coexistRoot = mkdtempSync(join(tmpdir(), `knowz-gemini-coexist-${firstOwner}-`));
  try {
    const project = join(coexistRoot, 'project');
    const home = join(coexistRoot, 'home');
    const knowzCli = join(ROOT, 'knowz', 'bin', 'knowz-mcp.mjs');
    const knowzCodeCli = join(ROOT, 'knowzcode', 'bin', 'knowzcode.mjs');
    const env = { ...process.env, HOME: home, USERPROFILE: home, CODEX_HOME: join(home, '.codex') };
    mkdirSync(project, { recursive: true });
    mkdirSync(home, { recursive: true });
    const settingsPath = join(project, '.gemini', 'settings.json');
    if (firstOwner === 'knowz') {
      execFileSync(process.execPath, [
        knowzCli, 'install', '--target', project, '--platforms', 'gemini', '--mcp-key', 'knowz-owner-key', '--force',
      ], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env });
    } else {
      execFileSync(process.execPath, [
        knowzCodeCli, 'install', '--target', project, '--platforms', 'gemini', '--force',
      ], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env });
    }
    const firstEntry = JSON.parse(readFileSync(settingsPath, 'utf8')).mcpServers.knowz;

    if (firstOwner === 'knowz') {
      execFileSync(process.execPath, [
        knowzCodeCli, 'install', '--target', project, '--platforms', 'gemini', '--force',
      ], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env });
      expect(existsSync(join(project, '.gemini', '.knowzcode-mcp-managed.json')), 'KnowzCode must digest-claim a verified Knowz-owned Gemini MCP entry without rewriting it');
    } else {
      execFileSync(process.execPath, [
        knowzCli, 'install', '--target', project, '--platforms', 'gemini', '--force',
      ], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env });
      expect(existsSync(join(project, '.gemini', '.knowzcode-mcp-managed.json')), 'KnowzCode ownership remains recorded until its uninstall when Knowz reuses the entry');
    }
    const afterSecondInstall = JSON.parse(readFileSync(settingsPath, 'utf8')).mcpServers.knowz;
    expect(stableJson(afterSecondInstall) === stableJson(firstEntry), `Gemini coexistence must preserve the first ${firstOwner} MCP entry exactly`);
    const sharedDigest = hashValue(firstEntry);
    const knowzClaimPath = join(project, '.gemini', '.knowz-mcp-managed.json');
    const knowzCodeClaimPath = join(project, '.gemini', '.knowzcode-mcp-managed.json');
    expect(JSON.parse(readFileSync(knowzClaimPath, 'utf8')).entry_digest === sharedDigest, 'Knowz shared Gemini claim must match the unchanged entry');
    expect(JSON.parse(readFileSync(knowzCodeClaimPath, 'utf8')).entry_digest === sharedDigest, 'KnowzCode shared Gemini claim must match the unchanged entry');

    // A reinstall/upgrade by either co-owner must not rewrite auth or endpoint
    // behind the peer's digest. Preserve the entry until one owner remains.
    const firstCli = firstOwner === 'knowz' ? knowzCli : knowzCodeCli;
    const coOwnedUpgradeOutput = execFileSync(process.execPath, [
      firstCli, 'upgrade', '--target', project,
      '--mcp-endpoint', 'https://coowned-change.invalid/mcp', '--force',
    ], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env });
    const afterCoOwnedUpgrade = JSON.parse(readFileSync(settingsPath, 'utf8')).mcpServers.knowz;
    expect(stableJson(afterCoOwnedUpgrade) === stableJson(firstEntry), `${firstOwner} upgrade must not rewrite a co-owned Gemini MCP entry`);
    expect(JSON.parse(readFileSync(knowzClaimPath, 'utf8')).entry_digest === sharedDigest, 'Knowz claim must remain valid after a co-owned upgrade attempt');
    expect(JSON.parse(readFileSync(knowzCodeClaimPath, 'utf8')).entry_digest === sharedDigest, 'KnowzCode claim must remain valid after a co-owned upgrade attempt');
    expect(/not applied because the entry is shared or unowned/i.test(coOwnedUpgradeOutput), `${firstOwner} co-owned endpoint request must explain that it was preserved rather than updated`);

    if (firstOwner === 'knowz') {
      execFileSync(process.execPath, [
        knowzCodeCli, 'uninstall', '--target', project, '--force',
      ], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env });
      const afterKnowzCodeUninstall = JSON.parse(readFileSync(settingsPath, 'utf8')).mcpServers.knowz;
      expect(stableJson(afterKnowzCodeUninstall) === stableJson(firstEntry), 'KnowzCode uninstall must preserve the Knowz-owned shared Gemini entry');
      expect(existsSync(join(project, '.gemini', 'commands', 'knowz', '.knowz-managed.json')), 'KnowzCode uninstall must preserve the Knowz Gemini command installation');
      execFileSync(process.execPath, [
        knowzCli, 'uninstall', '--target', project, '--force',
      ], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env });
      expect(!JSON.parse(readFileSync(settingsPath, 'utf8')).mcpServers?.knowz, 'Knowz uninstall may remove its own unchanged Gemini entry after KnowzCode is absent');
    } else {
      execFileSync(process.execPath, [
        knowzCli, 'uninstall', '--target', project, '--force',
      ], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env });
      const afterKnowzUninstall = JSON.parse(readFileSync(settingsPath, 'utf8')).mcpServers.knowz;
      expect(stableJson(afterKnowzUninstall) === stableJson(firstEntry), 'Knowz uninstall must preserve the KnowzCode-owned shared Gemini entry');
      expect(existsSync(join(project, '.gemini', '.knowzcode-mcp-managed.json')), 'Knowz uninstall must preserve the active KnowzCode Gemini ownership record');
      execFileSync(process.execPath, [
        knowzCodeCli, 'uninstall', '--target', project, '--force',
      ], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env });
      expect(!JSON.parse(readFileSync(settingsPath, 'utf8')).mcpServers?.knowz, 'KnowzCode uninstall may remove its own unchanged Gemini entry after Knowz is absent');
    }
  } catch (error) {
    expect(false, `Gemini coexistence smoke (${firstOwner} first) failed: ${error.stderr || error.message}`);
  } finally {
    rmSync(coexistRoot, { recursive: true, force: true });
  }
}

// Crash/interruption evidence must be live, not merely manifest-declared. If
// the peer's managed command is missing, replaced, or symlinked, the active
// owner must treat the peer as stale and remove its own unchanged MCP entry.
for (const stalePeer of ['knowz', 'knowzcode']) {
  for (const evidenceState of ['missing', 'replaced', 'symlinked', 'ancestor-symlinked']) {
    const staleRoot = mkdtempSync(join(tmpdir(), `knowz-gemini-stale-${stalePeer}-${evidenceState}-`));
    try {
      const project = join(staleRoot, 'project');
      const home = join(staleRoot, 'home');
      const outside = join(staleRoot, 'outside-command.txt');
      const knowzCli = join(ROOT, 'knowz', 'bin', 'knowz-mcp.mjs');
      const knowzCodeCli = join(ROOT, 'knowzcode', 'bin', 'knowzcode.mjs');
      const env = { ...process.env, HOME: home, USERPROFILE: home, CODEX_HOME: join(home, '.codex') };
      mkdirSync(project, { recursive: true });
      mkdirSync(home, { recursive: true });
      execFileSync(process.execPath, [
        knowzCli, 'install', '--target', project, '--platforms', 'gemini',
        '--mcp-key', 'stale-peer-key', '--force',
      ], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env });
      execFileSync(process.execPath, [
        knowzCodeCli, 'install', '--target', project, '--platforms', 'gemini', '--force',
      ], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env });

      const evidencePath = stalePeer === 'knowz'
        ? join(project, '.gemini', 'commands', 'knowz', 'ask.toml')
        : join(project, '.gemini', 'commands', 'knowzcode', 'work.toml');
      const originalEvidence = readFileSync(evidencePath, 'utf8');
      if (evidenceState === 'missing') {
        rmSync(evidencePath, { force: true });
      } else if (evidenceState === 'replaced') {
        writeFileSync(evidencePath, '# user replacement without a managed marker\n');
      } else if (evidenceState === 'symlinked') {
        writeFileSync(outside, '# external command must remain untouched\n');
        rmSync(evidencePath, { force: true });
        symlinkSync(outside, evidencePath, 'file');
      } else {
        const outsideDir = join(staleRoot, 'outside-command-directory');
        mkdirSync(outsideDir, { recursive: true });
        writeFileSync(join(outsideDir, basename(evidencePath)), originalEvidence);
        rmSync(dirname(evidencePath), { recursive: true, force: true });
        symlinkSync(outsideDir, dirname(evidencePath), 'dir');
      }

      const activeCli = stalePeer === 'knowz' ? knowzCodeCli : knowzCli;
      execFileSync(process.execPath, [
        activeCli, 'uninstall', '--target', project, '--force',
      ], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env });
      const settings = JSON.parse(readFileSync(join(project, '.gemini', 'settings.json'), 'utf8'));
      expect(!settings.mcpServers?.knowz, `${stalePeer} ${evidenceState} peer evidence must not preserve an orphan Gemini MCP entry`);
      if (evidenceState === 'symlinked') {
        expect(readFileSync(outside, 'utf8') === '# external command must remain untouched\n', `${stalePeer} stale-peer handling must not mutate an external symlink target`);
      } else if (evidenceState === 'ancestor-symlinked') {
        expect(readFileSync(evidencePath, 'utf8') === originalEvidence, `${stalePeer} stale-peer handling must not mutate an external symlinked directory`);
      }
    } catch (error) {
      expect(false, `Stale Gemini peer evidence smoke (${stalePeer}/${evidenceState}) failed: ${error.stderr || error.message}`);
    } finally {
      rmSync(staleRoot, { recursive: true, force: true });
    }
  }
}

// Neither package may infer ownership from the reserved server name alone.
// A user-created entry with no matching peer claim must survive install and
// uninstall byte-for-byte and must never acquire an ownership manifest.
for (const installer of ['knowz', 'knowzcode']) {
  const unownedRoot = mkdtempSync(join(tmpdir(), `knowz-gemini-unowned-${installer}-`));
  try {
    const project = join(unownedRoot, 'project');
    const home = join(unownedRoot, 'home');
    const settingsPath = join(project, '.gemini', 'settings.json');
    const cli = join(
      ROOT,
      installer === 'knowz' ? 'knowz/bin/knowz-mcp.mjs' : 'knowzcode/bin/knowzcode.mjs'
    );
    const manifestPath = join(
      project,
      '.gemini',
      installer === 'knowz' ? '.knowz-mcp-managed.json' : '.knowzcode-mcp-managed.json'
    );
    const unownedEntry = {
      httpUrl: 'https://user-owned.invalid/mcp',
      headers: { 'X-User-Owned': 'preserve-exactly' },
    };
    mkdirSync(dirname(settingsPath), { recursive: true });
    mkdirSync(home, { recursive: true });
    writeFileSync(settingsPath, JSON.stringify({
      theme: 'user-theme',
      mcpServers: { knowz: unownedEntry, other: { httpUrl: 'https://other.invalid/mcp' } },
    }, null, 2) + '\n');
    const env = { ...process.env, HOME: home, USERPROFILE: home, CODEX_HOME: join(home, '.codex') };
    execFileSync(process.execPath, [
      cli, 'install', '--target', project, '--platforms', 'gemini', '--force',
    ], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env });
    const afterInstall = JSON.parse(readFileSync(settingsPath, 'utf8'));
    expect(stableJson(afterInstall.mcpServers.knowz) === stableJson(unownedEntry), `${installer} install must preserve an arbitrary unowned Gemini entry exactly`);
    expect(!existsSync(manifestPath), `${installer} install must not claim an arbitrary unowned Gemini entry`);
    execFileSync(process.execPath, [
      cli, 'uninstall', '--target', project, '--force',
    ], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env });
    const afterUninstall = JSON.parse(readFileSync(settingsPath, 'utf8'));
    expect(stableJson(afterUninstall.mcpServers.knowz) === stableJson(unownedEntry), `${installer} uninstall must preserve an arbitrary unowned Gemini entry exactly`);
    expect(Boolean(afterUninstall.mcpServers.other), `${installer} uninstall must preserve unrelated Gemini servers`);
  } catch (error) {
    expect(false, `Unowned Gemini MCP lifecycle smoke (${installer}) failed: ${error.stderr || error.message}`);
  } finally {
    rmSync(unownedRoot, { recursive: true, force: true });
  }
}

const knowzCodeMalformedGeminiRoot = mkdtempSync(join(tmpdir(), 'knowzcode-gemini-malformed-shape-'));
try {
  const cli = join(ROOT, 'knowzcode', 'bin', 'knowzcode.mjs');
  const home = join(knowzCodeMalformedGeminiRoot, 'home');
  const installProject = join(knowzCodeMalformedGeminiRoot, 'install-project');
  const installSettings = join(installProject, '.gemini', 'settings.json');
  mkdirSync(dirname(installSettings), { recursive: true });
  mkdirSync(home, { recursive: true });
  writeFileSync(installSettings, JSON.stringify({ mcpServers: { knowz: 'invalid-string' } }, null, 2) + '\n');
  const env = { ...process.env, HOME: home, USERPROFILE: home, CODEX_HOME: join(home, '.codex') };
  const expectRefused = (args, project, label) => {
    const projectBefore = snapshotDirectory(project);
    const homeBefore = snapshotDirectory(home);
    let rejected = false;
    try {
      execFileSync(process.execPath, [cli, ...args, '--target', project, '--force'], {
        cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env,
      });
    } catch {
      rejected = true;
    }
    expect(rejected, `${label} must reject a non-object Gemini Knowz MCP entry`);
    expect(stableJson(snapshotDirectory(project)) === stableJson(projectBefore), `${label} must preserve the project snapshot`);
    expect(stableJson(snapshotDirectory(home)) === stableJson(homeBefore), `${label} must preserve the HOME snapshot`);
  };
  expectRefused(['install', '--platforms', 'gemini'], installProject, 'KnowzCode install');

  const lifecycleProject = join(knowzCodeMalformedGeminiRoot, 'lifecycle-project');
  mkdirSync(lifecycleProject, { recursive: true });
  execFileSync(process.execPath, [
    cli, 'install', '--target', lifecycleProject, '--platforms', 'gemini', '--force',
  ], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env });
  const lifecycleSettings = join(lifecycleProject, '.gemini', 'settings.json');
  writeFileSync(lifecycleSettings, JSON.stringify({ mcpServers: { knowz: [] } }, null, 2) + '\n');
  expectRefused(['upgrade'], lifecycleProject, 'KnowzCode upgrade');
  expectRefused(['uninstall'], lifecycleProject, 'KnowzCode uninstall');
} catch (error) {
  expect(false, `KnowzCode malformed Gemini shape lifecycle failed: ${error.stderr || error.message}`);
} finally {
  rmSync(knowzCodeMalformedGeminiRoot, { recursive: true, force: true });
}

const globalGeminiRefusalRoot = mkdtempSync(join(tmpdir(), 'knowzcode-global-gemini-refusal-'));
try {
  const project = join(globalGeminiRefusalRoot, 'project');
  const home = join(globalGeminiRefusalRoot, 'home');
  mkdirSync(project, { recursive: true });
  mkdirSync(home, { recursive: true });
  writeFileSync(join(project, 'project-sentinel.txt'), 'preserve project\n');
  writeFileSync(join(home, 'home-sentinel.txt'), 'preserve home\n');
  const projectBefore = snapshotDirectory(project);
  const homeBefore = snapshotDirectory(home);
  let rejected = false;
  try {
    execFileSync(process.execPath, [
      join(ROOT, 'knowzcode', 'bin', 'knowzcode.mjs'),
      'install', '--target', project, '--platforms', 'gemini', '--global', '--force',
    ], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
      env: { ...process.env, HOME: home, USERPROFILE: home },
    });
  } catch {
    rejected = true;
  }
  expect(rejected, 'Unsupported global Gemini install must fail closed with a project-scoped instruction');
  expect(stableJson(snapshotDirectory(project)) === stableJson(projectBefore), 'Rejected global Gemini install must preserve the project snapshot');
  expect(stableJson(snapshotDirectory(home)) === stableJson(homeBefore), 'Rejected global Gemini install must preserve the HOME snapshot');
} catch (error) {
  expect(false, `Global Gemini refusal smoke failed: ${error.stderr || error.message}`);
} finally {
  rmSync(globalGeminiRefusalRoot, { recursive: true, force: true });
}

const geminiSettingsSymlinkRoot = mkdtempSync(join(tmpdir(), 'knowzcode-gemini-settings-symlink-'));
try {
  const project = join(geminiSettingsSymlinkRoot, 'project');
  const home = join(geminiSettingsSymlinkRoot, 'home');
  const outside = join(geminiSettingsSymlinkRoot, 'outside-settings.json');
  const settingsPath = join(project, '.gemini', 'settings.json');
  mkdirSync(dirname(settingsPath), { recursive: true });
  mkdirSync(home, { recursive: true });
  writeFileSync(outside, '{\n  "outside": "preserve"\n}\n');
  symlinkSync(outside, settingsPath, 'file');
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  const cli = join(ROOT, 'knowzcode', 'bin', 'knowzcode.mjs');
  const beforeInstall = snapshotDirectory(project);
  let installRejected = false;
  try {
    execFileSync(process.execPath, [
      cli, 'install', '--target', project, '--platforms', 'gemini', '--force',
    ], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env });
  } catch {
    installRejected = true;
  }
  expect(installRejected, 'Gemini install must reject a symlinked settings file');
  expect(stableJson(snapshotDirectory(project)) === stableJson(beforeInstall), 'Rejected Gemini settings symlink install must preserve all project state');
  expect(readFileSync(outside, 'utf8') === '{\n  "outside": "preserve"\n}\n', 'Rejected Gemini settings symlink install must preserve the external file');

  rmSync(settingsPath, { force: true });
  execFileSync(process.execPath, [
    cli, 'install', '--target', project, '--platforms', 'gemini', '--force',
  ], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env });
  writeFileSync(outside, readFileSync(settingsPath));
  rmSync(settingsPath, { force: true });
  symlinkSync(outside, settingsPath, 'file');
  for (const operation of ['upgrade', 'uninstall']) {
    const projectBefore = snapshotDirectory(project);
    const outsideBefore = readFileSync(outside, 'utf8');
    let rejected = false;
    try {
      execFileSync(process.execPath, [cli, operation, '--target', project, '--force'], {
        cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env,
      });
    } catch {
      rejected = true;
    }
    expect(rejected, `Gemini ${operation} must reject a symlinked settings file`);
    expect(stableJson(snapshotDirectory(project)) === stableJson(projectBefore), `Rejected Gemini settings symlink ${operation} must preserve all managed project state`);
    expect(readFileSync(outside, 'utf8') === outsideBefore, `Rejected Gemini settings symlink ${operation} must preserve the external file`);
  }
} catch (error) {
  expect(false, `Gemini settings symlink lifecycle smoke failed: ${error.stderr || error.message}`);
} finally {
  rmSync(geminiSettingsSymlinkRoot, { recursive: true, force: true });
}

const symlinkedCodexTarget = mkdtempSync(join(tmpdir(), 'knowzcode-codex-symlink-'));
try {
  const cli = join(ROOT, 'knowzcode', 'bin', 'knowzcode.mjs');
  const externalAgents = join(VALIDATOR_HOME, 'symlink-escape-agents');
  mkdirSync(externalAgents, { recursive: true });
  writeFileSync(join(externalAgents, 'sentinel.txt'), 'must remain the only entry\n');
  symlinkSync(externalAgents, join(symlinkedCodexTarget, '.agents'), 'dir');
  const targetBefore = snapshotDirectory(symlinkedCodexTarget);
  const homeBefore = snapshotDirectory(VALIDATOR_HOME);
  let rejected = false;
  try {
    execFileSync(
      process.execPath,
      [cli, 'install', '--target', symlinkedCodexTarget, '--platforms', 'codex', '--force'],
      { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' }
    );
  } catch {
    rejected = true;
  }
  expect(rejected, 'Project-local Codex install must reject a symlinked .agents mutation root');
  expect(stableJson(snapshotDirectory(symlinkedCodexTarget)) === stableJson(targetBefore), 'Rejected symlinked Codex install must preserve the project snapshot');
  expect(stableJson(snapshotDirectory(VALIDATOR_HOME)) === stableJson(homeBefore), 'Rejected symlinked Codex install must preserve isolated HOME');
} catch (error) {
  expect(false, `Codex symlink containment smoke setup failed: ${error.stderr || error.message}`);
} finally {
  rmSync(symlinkedCodexTarget, { recursive: true, force: true });
}

const symlinkedUpgradeTarget = mkdtempSync(join(tmpdir(), 'knowzcode-upgrade-symlink-'));
try {
  const cli = join(ROOT, 'knowzcode', 'bin', 'knowzcode.mjs');
  execFileSync(
    process.execPath,
    [cli, 'install', '--target', symlinkedUpgradeTarget, '--platforms', 'codex', '--force'],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' }
  );
  const escapedFile = join(VALIDATOR_HOME, 'upgrade-escape-sentinel.md');
  writeFileSync(escapedFile, '# must not be overwritten\n');
  const installedGuide = join(symlinkedUpgradeTarget, 'knowzcode', 'codex_execution.md');
  rmSync(installedGuide, { force: true });
  symlinkSync(escapedFile, installedGuide, 'file');
  const targetBefore = snapshotDirectory(symlinkedUpgradeTarget);
  const homeBefore = snapshotDirectory(VALIDATOR_HOME);
  let rejected = false;
  try {
    execFileSync(
      process.execPath,
      [cli, 'upgrade', '--target', symlinkedUpgradeTarget, '--platforms', 'codex', '--force'],
      { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' }
    );
  } catch {
    rejected = true;
  }
  expect(rejected, 'Project-local upgrade must reject a symlinked framework file target');
  expect(stableJson(snapshotDirectory(symlinkedUpgradeTarget)) === stableJson(targetBefore), 'Rejected symlinked upgrade must preserve the project snapshot');
  expect(stableJson(snapshotDirectory(VALIDATOR_HOME)) === stableJson(homeBefore), 'Rejected symlinked upgrade must preserve isolated HOME');
} catch (error) {
  expect(false, `Upgrade symlink containment smoke setup failed: ${error.stderr || error.message}`);
} finally {
  rmSync(symlinkedUpgradeTarget, { recursive: true, force: true });
}

// Global skill lifecycle is isolated to a disposable HOME and deletes only
// entries explicitly recorded in the KnowzCode ownership manifest.
const globalCodexRoot = mkdtempSync(join(tmpdir(), 'knowzcode-codex-global-'));
try {
  const cli = join(ROOT, 'knowzcode', 'bin', 'knowzcode.mjs');
  const globalHome = join(globalCodexRoot, 'home');
  const projectA = join(globalCodexRoot, 'project-a');
  const projectB = join(globalCodexRoot, 'project-b');
  const projectC = join(globalCodexRoot, 'project-c');
  mkdirSync(globalHome, { recursive: true });
  mkdirSync(projectA, { recursive: true });
  mkdirSync(projectB, { recursive: true });
  mkdirSync(projectC, { recursive: true });
  const globalEnv = { ...process.env, HOME: globalHome, USERPROFILE: globalHome, CODEX_HOME: join(globalHome, '.codex') };

  execFileSync(
    process.execPath,
    [cli, 'install', '--target', projectA, '--platforms', 'codex', '--global', '--force'],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env: globalEnv }
  );
  const globalSkillRoot = join(globalHome, '.agents', 'skills');
  const globalSetupSkill = join(globalSkillRoot, 'knowzcode-setup', 'SKILL.md');
  expectFileContains(globalSetupSkill, /npx --yes knowzcode install --target/, 'Global Codex setup skill must bootstrap another repository through the packaged npx CLI');

  const globalManifestPath = join(globalSkillRoot, '.knowzcode-managed.json');
  const globalManifest = JSON.parse(readFileSync(globalManifestPath, 'utf8'));
  globalManifest.entries.push('knowzcode-stale-owned');
  writeFileSync(globalManifestPath, JSON.stringify(globalManifest, null, 2) + '\n');
  mkdirSync(join(globalSkillRoot, 'knowzcode-stale-owned'), { recursive: true });
  mkdirSync(join(globalSkillRoot, 'knowzcode-user-owned'), { recursive: true });
  mkdirSync(join(globalSkillRoot, 'kc-user-owned'), { recursive: true });
  writeFileSync(join(globalSkillRoot, 'knowzcode-stale-owned', 'SKILL.md'), '# stale owned\n');
  writeFileSync(join(globalSkillRoot, 'knowzcode-user-owned', 'SKILL.md'), '# preserve user-owned\n');
  writeFileSync(join(globalSkillRoot, 'kc-user-owned', 'SKILL.md'), '# preserve kc\n');

  execFileSync(
    process.execPath,
    [cli, 'upgrade', '--target', projectA, '--global', '--force'],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env: globalEnv }
  );
  expect(!existsSync(join(projectA, '.agents', 'skills')), 'Global Codex upgrade must not create project-local skill copies');
  expect(!existsSync(join(globalSkillRoot, 'knowzcode-stale-owned')), 'Global upgrade must remove a stale manifest-owned Codex skill');
  expect(existsSync(join(globalSkillRoot, 'knowzcode-user-owned')), 'Global upgrade must preserve an unlisted knowzcode-* skill');
  expect(existsSync(join(globalSkillRoot, 'kc-user-owned')), 'Global upgrade must preserve an unlisted kc-* skill');

  // Exercise the exact target-taking CLI described by the globally installed
  // setup skill; this proves one installation can initialize another repo.
  execFileSync(
    process.execPath,
    [cli, 'install', '--target', projectB, '--platforms', 'codex', '--force'],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env: globalEnv }
  );
  expect(existsSync(join(projectB, 'knowzcode', '.knowzcode-version')), 'Global setup bootstrap contract must initialize a second repository target');

  execFileSync(
    process.execPath,
    [cli, 'install', '--target', projectC, '--platforms', 'none', '--force'],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env: globalEnv }
  );
  const unmanagedGlobalRefreshAgents = '# unmanaged AGENTS for global-only refresh\n';
  writeFileSync(join(projectC, 'AGENTS.md'), unmanagedGlobalRefreshAgents);
  execFileSync(
    process.execPath,
    [cli, 'upgrade', '--target', projectC, '--platforms', 'codex', '--global', '--force'],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env: globalEnv }
  );
  expect(readFileSync(join(projectC, 'AGENTS.md'), 'utf8') === unmanagedGlobalRefreshAgents, 'Global-only Codex refresh must not require or mutate a local unmanaged AGENTS.md');
  expect(!existsSync(join(projectC, '.agents', 'skills')), 'Global-only Codex refresh must not create project-local skill copies');
} catch (error) {
  expect(false, `Global Codex ownership/bootstrap smoke test failed: ${error.stderr || error.message}`);
} finally {
  rmSync(globalCodexRoot, { recursive: true, force: true });
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
  ['fix', 'SKILL.md'],
  ['continue', 'SKILL.md'],
  ['status', 'SKILL.md'],
  ['work', 'CLAUDE.md'],
  ['audit', 'CLAUDE.md'],
  ['explore', 'CLAUDE.md'],
  ['fix', 'CLAUDE.md'],
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
    /\b(TeamCreate|TeamDelete|TeamSpawn)\s*\(/,
    `Active Claude workflow file must not use removed team lifecycle APIs: ${file}`
  );
  expectFileNotContains(
    file,
    /Agent Teams is the expected execution mode|Knowledge capture and parallel orchestration degraded/i,
    `Active Claude workflow file must not make teams a default quality tier: ${file}`
  );
  expectFileNotContains(
    file,
    /mode\s*[:=]\s*["']bypassPermissions["']|permissionMode:\s*bypassPermissions/,
    `Active Claude workflow file must not request bypass permissions: ${file}`
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
    ['current /subtask semantics', /conversation fork[\s\S]*(copies|preserves)[\s\S]*(conversation state|history)[\s\S]*`?\/subtask`?[\s\S]*forked subagent/i],
    ['current /fork semantics', /`?\/fork`?[\s\S]*background session[\s\S]*Agent View[\s\S]*(disabled|off)[\s\S]*(forked subagent|forked-subagent|fallback)/i],
    ['exact Agent fork dispatch', /Agent\(subagent_type=["']fork["'],\s*description=["']<short task>["'],\s*prompt=["']<bounded objective>["']\)/],
    ['Agent fork capability gate', /gate[\s\S]*(?:capability|version)[\s\S]*CLAUDE_CODE_FORK_SUBAGENT[\s\S]*0[\s\S]*disables/i],
    ['skill frontmatter fork distinction', /context:\s*fork[\s\S]*(does not|not)[\s\S]*(conversation|chat history)/i],
    ['ordinary subagent nesting limit', /ordinary subagents?[\s\S]*(?:nest|spawn)[\s\S]*(?:depth|3)[\s\S]*(?:default|limit)/i],
    ['custom-agent field scope', /ignore[\s\S]{0,80}permissionMode[\s\S]{0,80}hooks[\s\S]{0,80}mcpServers[\s\S]{0,100}plugin-shipped[\s\S]{0,160}(?:local|user|CLI)[\s\S]{0,120}support/i],
    ['conditional team selection', /team[\s\S]*(peer coordination|shared task|mailbox)[\s\S]*(only|when)/i],
    ['runtime-owned team cleanup', /runtime-managed cleanup|cleanup[\s\S]*automatic/i],
    ['cache occupancy distinction', /cache[\s\S]*(billed|billing)[\s\S]*(context|occup)/i],
  ],
  'Claude context-efficiency contract'
);

const claudeAgentRoot = join(ROOT, 'knowzcode', 'agents');
const knowzCodeAgentRoles = existsSync(claudeAgentRoot)
  ? new Set(readdirSync(claudeAgentRoot).filter((entry) => entry.endsWith('.md')).map((entry) => entry.slice(0, -3)))
  : new Set();
const knowzCodeSkillNames = new Set(
  readdirSync(join(ROOT, 'knowzcode', 'skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
);
let canonicalScopedKnowzCodeRole = false;
const canonicalClaudePluginFiles = [
  ...listMarkdownFiles(join(ROOT, 'knowzcode', 'skills')),
  ...listMarkdownFiles(join(ROOT, 'knowzcode', 'agents')),
];
for (const file of canonicalClaudePluginFiles) {
  const content = readFileSync(file, 'utf8');
  for (const match of content.matchAll(/Agent\s*\(\s*subagent_type\s*=\s*["']knowzcode:([a-z0-9-]+)["']/g)) {
    if (knowzCodeAgentRoles.has(match[1])) canonicalScopedKnowzCodeRole = true;
  }
  for (const match of content.matchAll(/Agent\s*\(\s*subagent_type\s*=\s*["']([a-z0-9-]+)["']/g)) {
    expect(!knowzCodeAgentRoles.has(match[1]), `Canonical KnowzCode plugin skill must scope Agent role as knowzcode:${match[1]}: ${file}`);
  }
  expect(
    !/Agent\s*\(\s*subagent_type\s*=\s*["'](?:reader|writer)["']/.test(content),
    `Canonical KnowzCode plugin skill must scope Knowz reader/writer calls with the knowz: namespace: ${file}`
  );
  for (const match of content.matchAll(/(^|[\s`("'=])\/([a-z0-9-]+)\b/gm)) {
    expect(
      !knowzCodeSkillNames.has(match[2]),
      `Canonical KnowzCode plugin command reference must use /knowzcode:${match[2]}: ${file}`
    );
  }
  for (const role of knowzCodeAgentRoles) {
    const explicitBareRole = new RegExp(
      `(?:${[
        "(?:`subagent_type`|subagent_type)[^\\r\\n]{0,40}[\"`']" + role + "[\"`']",
        "delegat(?:e|es|ing)\\s+to\\s+(?:the\\s+)?`" + role + "`(?:\\s+agent)?",
      ].join('|')})`,
      'i'
    );
    expect(!explicitBareRole.test(content), `Canonical KnowzCode plugin prose/parameters must scope role as knowzcode:${role}: ${file}`);
    if (file.endsWith('/CLAUDE.md')) {
      const bareRoleTable = new RegExp("^\\|\\s*`?" + role + "`?\\s*\\|", 'm');
      expect(!bareRoleTable.test(content), `Canonical KnowzCode plugin agent table must scope role as knowzcode:${role}: ${file}`);
    }
  }
}
expect(canonicalScopedKnowzCodeRole, 'Canonical KnowzCode plugin skills must retain at least one exact knowzcode:<role> Agent call');
for (const file of listMarkdownFiles(join(ROOT, 'plugins', 'knowzcode', 'skills'))) {
  expectFileNotContains(
    file,
    /Agent\s*\(/,
    `Codex plugin skill must not be treated as a Claude plugin execution surface: ${file}`
  );
}
const knowzAgentRoot = join(ROOT, 'knowz', 'agents');
const knowzAgentRoles = existsSync(knowzAgentRoot)
  ? new Set(readdirSync(knowzAgentRoot).filter((entry) => entry.endsWith('.md')).map((entry) => entry.slice(0, -3)))
  : new Set();
let canonicalScopedKnowzRole = false;
for (const file of listMarkdownFiles(join(ROOT, 'knowz', 'skills'))) {
  const content = readFileSync(file, 'utf8');
  if (/Agent\s*\(\s*subagent_type\s*=\s*["']knowz:(?:[a-z0-9-]+)["']/.test(content)) canonicalScopedKnowzRole = true;
  for (const match of content.matchAll(/Agent\s*\(\s*subagent_type\s*=\s*["']([a-z0-9-]+)["']/g)) {
    expect(!knowzAgentRoles.has(match[1]), `Knowz plugin skill must scope its agent role as knowz:${match[1]}: ${file}`);
  }
}
expect(canonicalScopedKnowzRole, 'Canonical Knowz plugin skills must retain at least one exact knowz:<role> Agent call');
if (existsSync(claudeAgentRoot)) {
  for (const entry of readdirSync(claudeAgentRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const agentFile = join(claudeAgentRoot, entry.name);
    const frontmatter = readFileSync(agentFile, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!frontmatter) continue;
    expect(
      !/^(permissionMode|hooks|mcpServers):/m.test(frontmatter[1]),
      `Claude plugin agent uses unsupported plugin-shipped frontmatter fields: ${agentFile}`
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

const ordinaryKnowzTarget = mkdtempSync(join(tmpdir(), 'knowz-claude-local-'));
try {
  const knowzCli = join(ROOT, 'knowz', 'bin', 'knowz-mcp.mjs');
  execFileSync(
    process.execPath,
    [knowzCli, 'install', '--target', ordinaryKnowzTarget, '--platforms', 'claude', '--force'],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, HOME: ordinaryKnowzTarget } }
  );
  const installedKnowzSkill = join(ordinaryKnowzTarget, '.claude', 'skills', 'knowz', 'CLAUDE.md');
  expectFileContains(
    installedKnowzSkill,
    /Agent\s*\(\s*subagent_type\s*=\s*["']knowledge-worker["']/,
    'npm-installed Knowz local skill must call the bare knowledge-worker agent role'
  );
  expectFileNotContains(
    installedKnowzSkill,
    /Agent\s*\(\s*subagent_type\s*=\s*["']knowz:(?:knowledge-worker|reader|writer)["']/,
    'npm-installed Knowz local skill must not retain plugin-scoped Knowz agent roles'
  );
} catch (error) {
  expect(false, `Knowz local agent-role installation smoke test failed: ${error.stderr || error.message}`);
} finally {
  rmSync(ordinaryKnowzTarget, { recursive: true, force: true });
}

// Knowz and KnowzCode share Claude/Codex roots. Exercise the package CLI in an
// isolated project and HOME so lifecycle cleanup proves ownership rather than
// relying on broad filename prefixes.
const knowzOwnershipCli = join(ROOT, 'knowz', 'bin', 'knowz-mcp.mjs');
const runKnowzOwnershipCli = (args, project, home) => execFileSync(
  process.execPath,
  [knowzOwnershipCli, ...args, '--target', project, '--force'],
  { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, HOME: home } }
);
const expectRefusedKnowzOperation = (args, project, home, label) => {
  const projectBefore = snapshotDirectory(project);
  const homeBefore = snapshotDirectory(home);
  let rejected = false;
  try {
    runKnowzOwnershipCli(args, project, home);
  } catch {
    rejected = true;
  }
  expect(rejected, `${label} must refuse the operation`);
  expect(
    stableJson(snapshotDirectory(project)) === stableJson(projectBefore),
    `${label} must preserve the complete project snapshot`
  );
  expect(
    stableJson(snapshotDirectory(home)) === stableJson(homeBefore),
    `${label} must preserve the complete HOME snapshot`
  );
};

// Invalid settings shapes are not recoverable by guessing. Install, upgrade,
// and uninstall must all fail before touching either project or HOME state.
const malformedGeminiRoot = mkdtempSync(join(tmpdir(), 'knowz-gemini-malformed-shape-'));
try {
  const installProject = join(malformedGeminiRoot, 'install-project');
  const installHome = join(malformedGeminiRoot, 'install-home');
  const installSettings = join(installProject, '.gemini', 'settings.json');
  mkdirSync(dirname(installSettings), { recursive: true });
  mkdirSync(installHome, { recursive: true });
  writeFileSync(installSettings, JSON.stringify({ mcpServers: 'invalid-string' }, null, 2) + '\n');
  writeFileSync(join(installHome, 'sentinel.txt'), 'preserve install HOME\n');
  expectRefusedKnowzOperation(
    ['install', '--platforms', 'gemini'],
    installProject,
    installHome,
    'Knowz install with string-shaped Gemini mcpServers'
  );

  const lifecycleProject = join(malformedGeminiRoot, 'lifecycle-project');
  const lifecycleHome = join(malformedGeminiRoot, 'lifecycle-home');
  const lifecycleSettings = join(lifecycleProject, '.gemini', 'settings.json');
  mkdirSync(dirname(lifecycleSettings), { recursive: true });
  mkdirSync(lifecycleHome, { recursive: true });
  writeFileSync(lifecycleSettings, JSON.stringify({
    mcpServers: { knowz: { httpUrl: 'https://mcp.knowz.io/mcp', authProviderType: 'dynamic_discovery' } },
  }, null, 2) + '\n');
  writeFileSync(join(lifecycleHome, 'sentinel.txt'), 'preserve lifecycle HOME\n');
  runKnowzOwnershipCli(['install', '--platforms', 'gemini'], lifecycleProject, lifecycleHome);

  writeFileSync(lifecycleSettings, JSON.stringify({ mcpServers: [] }, null, 2) + '\n');
  expectRefusedKnowzOperation(
    ['upgrade'],
    lifecycleProject,
    lifecycleHome,
    'Knowz upgrade with array-shaped Gemini mcpServers'
  );

  writeFileSync(lifecycleSettings, JSON.stringify({ mcpServers: 'invalid-string' }, null, 2) + '\n');
  expectRefusedKnowzOperation(
    ['uninstall'],
    lifecycleProject,
    lifecycleHome,
    'Knowz uninstall with string-shaped Gemini mcpServers'
  );
} catch (error) {
  expect(false, `Malformed Gemini settings zero-mutation setup failed: ${error.stderr || error.message}`);
} finally {
  rmSync(malformedGeminiRoot, { recursive: true, force: true });
}

// Exact package names without an ownership manifest are collisions, not stale
// package files. Cover each platform surface independently so one early
// collision cannot mask another.
const exactCollisionCases = [
  {
    label: 'Claude agent',
    platforms: 'claude',
    relativePath: ['.claude', 'agents', 'reader.md'],
    content: '# user-owned exact reader agent\n',
  },
  {
    label: 'Codex skill',
    platforms: 'codex',
    relativePath: ['.agents', 'skills', 'knowz-ask', 'SKILL.md'],
    content: '# user-owned exact Knowz Codex skill\n',
  },
  {
    label: 'Gemini command',
    platforms: 'gemini',
    relativePath: ['.gemini', 'commands', 'knowz', 'ask.toml'],
    content: 'prompt = "user-owned exact Knowz Gemini command"\n',
  },
];
for (const collision of exactCollisionCases) {
  const collisionRoot = mkdtempSync(join(tmpdir(), 'knowz-exact-collision-'));
  try {
    const project = join(collisionRoot, 'project');
    const home = join(collisionRoot, 'home');
    const target = join(project, ...collision.relativePath);
    mkdirSync(dirname(target), { recursive: true });
    mkdirSync(home, { recursive: true });
    writeFileSync(target, collision.content);
    writeFileSync(join(project, 'project-sentinel.txt'), 'preserve project\n');
    writeFileSync(join(home, 'home-sentinel.txt'), 'preserve HOME\n');
    if (collision.platforms === 'gemini') {
      const settings = join(project, '.gemini', 'settings.json');
      writeFileSync(settings, JSON.stringify({
        mcpServers: { knowz: { httpUrl: 'https://mcp.knowz.io/mcp' } },
      }, null, 2) + '\n');
    }
    expectRefusedKnowzOperation(
      ['install', '--platforms', collision.platforms],
      project,
      home,
      `Knowz install with an unowned exact-name ${collision.label}`
    );
  } catch (error) {
    expect(false, `Exact-name ${collision.label} collision setup failed: ${error.stderr || error.message}`);
  } finally {
    rmSync(collisionRoot, { recursive: true, force: true });
  }
}

const exactUpgradeCollisionRoot = mkdtempSync(join(tmpdir(), 'knowz-exact-upgrade-collision-'));
try {
  const project = join(exactUpgradeCollisionRoot, 'project');
  const home = join(exactUpgradeCollisionRoot, 'home');
  const exactSkill = join(project, '.claude', 'skills', 'knowz', 'SKILL.md');
  mkdirSync(dirname(exactSkill), { recursive: true });
  mkdirSync(home, { recursive: true });
  writeFileSync(exactSkill, '# unowned exact-name skill detected as a legacy installation\n');
  writeFileSync(join(project, 'project-sentinel.txt'), 'preserve project\n');
  writeFileSync(join(home, 'home-sentinel.txt'), 'preserve HOME\n');
  expectRefusedKnowzOperation(
    ['upgrade'],
    project,
    home,
    'Knowz upgrade with an unowned exact-name Claude skill'
  );

  const projectBeforeUninstall = snapshotDirectory(project);
  const homeBeforeUninstall = snapshotDirectory(home);
  runKnowzOwnershipCli(['uninstall'], project, home);
  expect(
    stableJson(snapshotDirectory(project)) === stableJson(projectBeforeUninstall),
    'Knowz uninstall must preserve unmanifested exact-name components'
  );
  expect(
    stableJson(snapshotDirectory(home)) === stableJson(homeBeforeUninstall),
    'Knowz uninstall of unmanifested exact-name components must preserve HOME'
  );
} catch (error) {
  expect(false, `Exact-name upgrade/uninstall collision setup failed: ${error.stderr || error.message}`);
} finally {
  rmSync(exactUpgradeCollisionRoot, { recursive: true, force: true });
}

// A mutation root symlink and a symlink inserted below a managed destination
// both fail closed. Put escape targets under isolated HOME so snapshot equality
// also proves nothing followed the link.
const symlinkInstallRoot = mkdtempSync(join(tmpdir(), 'knowz-symlink-install-'));
try {
  const project = join(symlinkInstallRoot, 'project');
  const home = join(symlinkInstallRoot, 'home');
  const escapedClaude = join(home, 'escaped-claude');
  mkdirSync(project, { recursive: true });
  mkdirSync(escapedClaude, { recursive: true });
  writeFileSync(join(project, 'project-sentinel.txt'), 'preserve project\n');
  writeFileSync(join(escapedClaude, 'home-sentinel.txt'), 'preserve symlink destination\n');
  symlinkSync(escapedClaude, join(project, '.claude'), 'dir');
  expectRefusedKnowzOperation(
    ['install', '--platforms', 'claude'],
    project,
    home,
    'Knowz install with a symlinked Claude destination root'
  );
} catch (error) {
  expect(false, `Symlinked install destination setup failed: ${error.stderr || error.message}`);
} finally {
  rmSync(symlinkInstallRoot, { recursive: true, force: true });
}

const danglingSymlinkInstallRoot = mkdtempSync(join(tmpdir(), 'knowz-dangling-symlink-install-'));
try {
  const project = join(danglingSymlinkInstallRoot, 'project');
  const home = join(danglingSymlinkInstallRoot, 'home');
  const escapedSettings = join(home, 'not-created-settings.json');
  const settingsPath = join(project, '.gemini', 'settings.json');
  mkdirSync(dirname(settingsPath), { recursive: true });
  mkdirSync(home, { recursive: true });
  symlinkSync(escapedSettings, settingsPath, 'file');
  expectRefusedKnowzOperation(
    ['install', '--platforms', 'gemini', '--mcp-key', 'test-only-key'],
    project,
    home,
    'Knowz install with a dangling Gemini settings symlink'
  );
  expect(!existsSync(escapedSettings), 'Rejected dangling Gemini settings symlink must not create the external target');
} catch (error) {
  expect(false, `Dangling symlink install setup failed: ${error.stderr || error.message}`);
} finally {
  rmSync(danglingSymlinkInstallRoot, { recursive: true, force: true });
}

const symlinkUpgradeRoot = mkdtempSync(join(tmpdir(), 'knowz-symlink-upgrade-'));
try {
  const project = join(symlinkUpgradeRoot, 'project');
  const home = join(symlinkUpgradeRoot, 'home');
  mkdirSync(project, { recursive: true });
  mkdirSync(home, { recursive: true });
  runKnowzOwnershipCli(['install', '--platforms', 'claude'], project, home);
  const escapedSkillFile = join(home, 'upgrade-escape-sentinel.md');
  const managedSkillFile = join(project, '.claude', 'skills', 'knowz', 'SKILL.md');
  writeFileSync(escapedSkillFile, '# preserve upgrade escape target\n');
  rmSync(managedSkillFile, { force: true });
  symlinkSync(escapedSkillFile, managedSkillFile, 'file');
  expectRefusedKnowzOperation(
    ['upgrade'],
    project,
    home,
    'Knowz upgrade with a symlinked managed-skill descendant'
  );
} catch (error) {
  expect(false, `Symlinked upgrade descendant setup failed: ${error.stderr || error.message}`);
} finally {
  rmSync(symlinkUpgradeRoot, { recursive: true, force: true });
}

const symlinkUninstallRoot = mkdtempSync(join(tmpdir(), 'knowz-symlink-uninstall-'));
try {
  const project = join(symlinkUninstallRoot, 'project');
  const home = join(symlinkUninstallRoot, 'home');
  mkdirSync(project, { recursive: true });
  mkdirSync(home, { recursive: true });
  runKnowzOwnershipCli(['install', '--platforms', 'claude'], project, home);
  const escapedAgentFile = join(home, 'uninstall-escape-sentinel.md');
  const managedAgentFile = join(project, '.claude', 'agents', 'reader.md');
  writeFileSync(escapedAgentFile, '# preserve uninstall escape target\n');
  rmSync(managedAgentFile, { force: true });
  symlinkSync(escapedAgentFile, managedAgentFile, 'file');
  expectRefusedKnowzOperation(
    ['uninstall'],
    project,
    home,
    'Knowz uninstall with a symlinked manifest-owned agent descendant'
  );
} catch (error) {
  expect(false, `Symlinked uninstall descendant setup failed: ${error.stderr || error.message}`);
} finally {
  rmSync(symlinkUninstallRoot, { recursive: true, force: true });
}

const claudeKnowzOwnershipRoot = mkdtempSync(join(tmpdir(), 'knowz-claude-ownership-'));
try {
  const project = join(claudeKnowzOwnershipRoot, 'project');
  const home = join(claudeKnowzOwnershipRoot, 'home');
  const claudeDir = join(project, '.claude');
  const homeCodexConfig = join(home, '.codex', 'config.toml');
  const knowzCodeAgent = join(claudeDir, 'agents', 'analyst.md');
  const unrelatedAgent = join(claudeDir, 'agents', 'user-agent.md');
  const knowzCodeSkill = join(claudeDir, 'skills', 'work', 'SKILL.md');
  const unrelatedSkill = join(claudeDir, 'skills', 'user-skill', 'SKILL.md');
  const prefixAgent = join(claudeDir, 'agents', 'knowz-user-owned.md');
  const prefixSkill = join(claudeDir, 'skills', 'knowz-user-owned', 'SKILL.md');
  const claudeManifestPath = join(claudeDir, '.knowz-managed.json');
  const sentinels = new Map([
    [knowzCodeAgent, '# KnowzCode analyst sentinel\n'],
    [unrelatedAgent, '# unrelated Claude agent sentinel\n'],
    [knowzCodeSkill, '# KnowzCode work skill sentinel\n'],
    [unrelatedSkill, '# unrelated Claude skill sentinel\n'],
    [prefixAgent, '# user-owned Knowz-prefixed agent sentinel\n'],
    [prefixSkill, '# user-owned Knowz-prefixed skill sentinel\n'],
  ]);
  for (const [file, content] of sentinels) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  mkdirSync(dirname(homeCodexConfig), { recursive: true });
  writeFileSync(homeCodexConfig, [
    '[mcp_servers.knowz]',
    'url = "https://mcp.knowz.io/mcp"',
    'bearer_token_env_var = "KNOWZ_API_KEY"',
    '',
    '[user_sentinel]',
    'preserve = true',
    '',
  ].join('\n'));
  const homeBefore = snapshotDirectory(home);

  runKnowzOwnershipCli(['install', '--platforms', 'claude'], project, home);
  expect(existsSync(claudeManifestPath), 'Knowz Claude install must write a component ownership manifest');
  const installedManifest = JSON.parse(readFileSync(claudeManifestPath, 'utf8'));
  expect(installedManifest.schema === 'knowz.claude-component-ownership/v1', 'Knowz Claude ownership manifest must use the expected schema');
  expect(installedManifest.owner === 'knowz', 'Knowz Claude ownership manifest must identify Knowz as owner');
  expect(Array.isArray(installedManifest.agents) && installedManifest.agents.length > 0, 'Knowz Claude ownership manifest must enumerate owned agents');
  expect(Array.isArray(installedManifest.skills) && installedManifest.skills.length > 0, 'Knowz Claude ownership manifest must enumerate owned skills');
  for (const [file, content] of sentinels) {
    expect(readFileSync(file, 'utf8') === content, `Knowz Claude install must preserve coexisting sentinel: ${file}`);
  }
  expect(stableJson(snapshotDirectory(home)) === stableJson(homeBefore), 'Project-local Knowz Claude install must not mutate isolated HOME');

  const staleAgentName = 'knowz-stale-owned.md';
  const staleSkillName = 'knowz-stale-owned';
  installedManifest.agents.push(staleAgentName);
  installedManifest.skills.push(staleSkillName);
  writeFileSync(claudeManifestPath, JSON.stringify(installedManifest, null, 2) + '\n');
  const staleAgent = join(claudeDir, 'agents', staleAgentName);
  const staleSkill = join(claudeDir, 'skills', staleSkillName, 'SKILL.md');
  mkdirSync(dirname(staleAgent), { recursive: true });
  mkdirSync(dirname(staleSkill), { recursive: true });
  writeFileSync(staleAgent, '# stale manifest-owned Knowz agent\n');
  writeFileSync(staleSkill, '# stale manifest-owned Knowz skill\n');

  runKnowzOwnershipCli(['upgrade', '--platforms', 'claude'], project, home);
  expect(!existsSync(staleAgent), 'Knowz Claude upgrade must remove a stale manifest-owned agent');
  expect(!existsSync(dirname(staleSkill)), 'Knowz Claude upgrade must remove a stale manifest-owned skill');
  for (const [file, content] of sentinels) {
    expect(readFileSync(file, 'utf8') === content, `Knowz Claude upgrade must preserve coexisting sentinel: ${file}`);
  }
  expect(stableJson(snapshotDirectory(home)) === stableJson(homeBefore), 'Project-local Knowz Claude upgrade must not mutate isolated HOME');

  const upgradedManifest = JSON.parse(readFileSync(claudeManifestPath, 'utf8'));
  runKnowzOwnershipCli(['uninstall'], project, home);
  for (const entry of upgradedManifest.agents) {
    expect(!existsSync(join(claudeDir, 'agents', entry)), `Knowz Claude uninstall must remove manifest-owned agent: ${entry}`);
  }
  for (const entry of upgradedManifest.skills) {
    expect(!existsSync(join(claudeDir, 'skills', entry)), `Knowz Claude uninstall must remove manifest-owned skill: ${entry}`);
  }
  expect(!existsSync(claudeManifestPath), 'Knowz Claude uninstall must remove its ownership manifest');
  for (const [file, content] of sentinels) {
    expect(readFileSync(file, 'utf8') === content, `Knowz Claude uninstall must preserve coexisting sentinel: ${file}`);
  }
  expect(stableJson(snapshotDirectory(home)) === stableJson(homeBefore), 'Project-local Knowz Claude uninstall must not mutate isolated HOME');
} catch (error) {
  expect(false, `Knowz Claude ownership/coexistence smoke test failed: ${error.stderr || error.message}`);
} finally {
  rmSync(claudeKnowzOwnershipRoot, { recursive: true, force: true });
}

const sharedKnowzOwnershipRoot = mkdtempSync(join(tmpdir(), 'knowz-shared-ownership-'));
try {
  const project = join(sharedKnowzOwnershipRoot, 'project');
  const home = join(sharedKnowzOwnershipRoot, 'home');
  const skillRoot = join(project, '.agents', 'skills');
  const codexManifestPath = join(skillRoot, '.knowz-managed.json');
  const geminiManifestPath = join(project, '.gemini', 'commands', 'knowz', '.knowz-managed.json');
  const geminiMcpManifestPath = join(project, '.gemini', '.knowz-mcp-managed.json');
  const geminiSettingsPath = join(project, '.gemini', 'settings.json');
  const homeCodexConfig = join(home, '.codex', 'config.toml');
  const knowzCodeSkill = join(skillRoot, 'knowzcode-work', 'SKILL.md');
  const prefixedCodexSkill = join(skillRoot, 'knowz-user-owned', 'SKILL.md');
  const unrelatedCodexSkill = join(skillRoot, 'user-skill', 'SKILL.md');
  const legacyGeminiSkill = join(project, '.gemini', 'skills', 'knowz-user-owned', 'SKILL.md');
  const unownedGeminiProductDirFile = join(project, '.gemini', 'commands', 'knowz', 'user-sentinel.toml');
  const siblingGeminiCommand = join(project, '.gemini', 'commands', 'knowz-user-owned', 'sentinel.toml');
  const unrelatedGeminiCommand = join(project, '.gemini', 'commands', 'user', 'sentinel.toml');
  const sharedSentinels = new Map([
    [knowzCodeSkill, '# KnowzCode Codex skill sentinel\n'],
    [prefixedCodexSkill, '# unowned Knowz-prefixed Codex skill sentinel\n'],
    [unrelatedCodexSkill, '# unrelated Codex skill sentinel\n'],
    [legacyGeminiSkill, '# unowned legacy Gemini skill sentinel\n'],
    [unownedGeminiProductDirFile, 'prompt = "preserve unmanifested command"\n'],
    [siblingGeminiCommand, 'prompt = "preserve prefixed sibling"\n'],
    [unrelatedGeminiCommand, 'prompt = "preserve unrelated command"\n'],
  ]);
  for (const [file, content] of sharedSentinels) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  mkdirSync(dirname(geminiSettingsPath), { recursive: true });
  writeFileSync(geminiSettingsPath, JSON.stringify({
    theme: 'user-theme',
    mcpServers: {
      other: { httpUrl: 'https://example.invalid/mcp' },
    },
  }, null, 2) + '\n');
  mkdirSync(dirname(homeCodexConfig), { recursive: true });
  writeFileSync(homeCodexConfig, [
    '[mcp_servers.knowz]',
    'url = "https://mcp.knowz.io/mcp"',
    'bearer_token_env_var = "KNOWZ_API_KEY"',
    '',
    '[user_sentinel]',
    'preserve = true',
    '',
  ].join('\n'));
  const homeBefore = snapshotDirectory(home);

  runKnowzOwnershipCli([
    'install', '--platforms', 'codex,gemini', '--mcp-key', 'knowz-owned-fixture-key',
  ], project, home);
  expect(existsSync(codexManifestPath), 'Knowz Codex install must write a shared-skill ownership manifest');
  const installedManifest = JSON.parse(readFileSync(codexManifestPath, 'utf8'));
  expect(installedManifest.schema === 'knowz.codex-skill-ownership/v1', 'Knowz Codex ownership manifest must use the expected schema');
  expect(installedManifest.owner === 'knowz', 'Knowz Codex ownership manifest must identify Knowz as owner');
  expect(Array.isArray(installedManifest.entries) && installedManifest.entries.length > 0, 'Knowz Codex ownership manifest must enumerate owned skills');
  expect(existsSync(geminiManifestPath), 'Knowz Gemini install must write command ownership metadata');
  const installedGeminiManifest = JSON.parse(readFileSync(geminiManifestPath, 'utf8'));
  expect(installedGeminiManifest.schema === 'knowz.gemini-command-ownership/v1', 'Knowz Gemini ownership manifest must use the expected schema');
  expect(installedGeminiManifest.owner === 'knowz', 'Knowz Gemini ownership manifest must identify Knowz as owner');
  expect(Array.isArray(installedGeminiManifest.entries) && installedGeminiManifest.entries.length > 0, 'Knowz Gemini ownership manifest must enumerate owned commands');
  expect(existsSync(geminiMcpManifestPath), 'Knowz Gemini install must claim the MCP entry it creates');
  for (const [file, content] of sharedSentinels) {
    expect(readFileSync(file, 'utf8') === content, `Knowz Codex/Gemini install must preserve coexisting sentinel: ${file}`);
  }
  expect(stableJson(snapshotDirectory(home)) === stableJson(homeBefore), 'Project-local Knowz Codex/Gemini install must not mutate isolated HOME');

  const staleSkillName = 'knowz-stale-owned';
  const staleSkill = join(skillRoot, staleSkillName, 'SKILL.md');
  installedManifest.entries.push(staleSkillName);
  writeFileSync(codexManifestPath, JSON.stringify(installedManifest, null, 2) + '\n');
  mkdirSync(dirname(staleSkill), { recursive: true });
  writeFileSync(staleSkill, '# stale manifest-owned Codex skill\n');
  const staleGeminiCommand = join(project, '.gemini', 'commands', 'knowz', 'obsolete.toml');
  installedGeminiManifest.entries.push('obsolete.toml');
  writeFileSync(geminiManifestPath, JSON.stringify(installedGeminiManifest, null, 2) + '\n');
  mkdirSync(dirname(staleGeminiCommand), { recursive: true });
  writeFileSync(staleGeminiCommand, 'prompt = "stale owned command"\n');

  runKnowzOwnershipCli(['upgrade'], project, home);
  expect(!existsSync(dirname(staleSkill)), 'Knowz Codex upgrade must remove a stale manifest-owned shared skill');
  expect(!existsSync(staleGeminiCommand), 'Knowz Gemini upgrade must remove stale files only inside its exact command directory');
  for (const [file, content] of sharedSentinels) {
    expect(readFileSync(file, 'utf8') === content, `Knowz Codex/Gemini upgrade must preserve coexisting sentinel: ${file}`);
  }
  expect(stableJson(snapshotDirectory(home)) === stableJson(homeBefore), 'Project-local Knowz Codex/Gemini upgrade must not mutate isolated HOME');

  const upgradedManifest = JSON.parse(readFileSync(codexManifestPath, 'utf8'));
  const upgradedGeminiManifest = JSON.parse(readFileSync(geminiManifestPath, 'utf8'));
  runKnowzOwnershipCli(['uninstall'], project, home);
  for (const entry of upgradedManifest.entries) {
    expect(!existsSync(join(skillRoot, entry)), `Knowz Codex uninstall must remove manifest-owned shared skill: ${entry}`);
  }
  expect(!existsSync(codexManifestPath), 'Knowz Codex uninstall must remove its ownership manifest');
  for (const entry of upgradedGeminiManifest.entries) {
    expect(!existsSync(join(project, '.gemini', 'commands', 'knowz', entry)), `Knowz Gemini uninstall must remove manifest-owned command: ${entry}`);
  }
  expect(!existsSync(geminiManifestPath), 'Knowz Gemini uninstall must remove its ownership manifest');
  expect(!existsSync(geminiMcpManifestPath), 'Knowz Gemini uninstall must remove its MCP ownership manifest');
  for (const [file, content] of sharedSentinels) {
    expect(readFileSync(file, 'utf8') === content, `Knowz Codex/Gemini uninstall must preserve coexisting sentinel: ${file}`);
  }
  const preservedGeminiSettings = JSON.parse(readFileSync(geminiSettingsPath, 'utf8'));
  expect(preservedGeminiSettings.theme === 'user-theme', 'Knowz Gemini uninstall must preserve unrelated settings');
  expect(Boolean(preservedGeminiSettings.mcpServers?.other), 'Knowz Gemini uninstall must preserve unrelated MCP servers');
  expect(!preservedGeminiSettings.mcpServers?.knowz, 'Knowz Gemini uninstall must remove only the project Knowz MCP entry');
  expect(stableJson(snapshotDirectory(home)) === stableJson(homeBefore), 'Project-local Knowz Codex/Gemini uninstall must not mutate isolated HOME');
} catch (error) {
  expect(false, `Knowz Codex/Gemini ownership/coexistence smoke test failed: ${error.stderr || error.message}`);
} finally {
  rmSync(sharedKnowzOwnershipRoot, { recursive: true, force: true });
}

const globalKnowzOwnershipRoot = mkdtempSync(join(tmpdir(), 'knowz-global-ownership-'));
try {
  const project = join(globalKnowzOwnershipRoot, 'project');
  const home = join(globalKnowzOwnershipRoot, 'home');
  const projectSentinel = join(project, '.gemini', 'skills', 'knowz-user-owned', 'SKILL.md');
  const globalUnownedClaudeAgent = join(home, '.claude', 'agents', 'user-agent.md');
  const globalUnownedCodexSkill = join(home, '.agents', 'skills', 'knowz-user-owned', 'SKILL.md');
  const homeCodexConfig = join(home, '.codex', 'config.toml');
  mkdirSync(dirname(projectSentinel), { recursive: true });
  writeFileSync(projectSentinel, '# project must remain untouched by global operations\n');
  mkdirSync(dirname(globalUnownedClaudeAgent), { recursive: true });
  writeFileSync(globalUnownedClaudeAgent, '# global unrelated Claude agent\n');
  mkdirSync(dirname(globalUnownedCodexSkill), { recursive: true });
  writeFileSync(globalUnownedCodexSkill, '# global unowned Knowz-prefixed Codex skill\n');
  mkdirSync(dirname(homeCodexConfig), { recursive: true });
  writeFileSync(homeCodexConfig, [
    '[mcp_servers.knowz]',
    'url = "https://mcp.knowz.io/mcp"',
    'bearer_token_env_var = "KNOWZ_API_KEY"',
    '',
  ].join('\n'));
  const projectBefore = snapshotDirectory(project);

  runKnowzOwnershipCli(['install', '--platforms', 'claude,codex', '--global'], project, home);
  const globalClaudeManifestPath = join(home, '.claude', '.knowz-managed.json');
  const globalCodexManifestPath = join(home, '.agents', 'skills', '.knowz-managed.json');
  expect(existsSync(globalClaudeManifestPath), 'Global Knowz Claude install must write HOME ownership metadata');
  expect(existsSync(globalCodexManifestPath), 'Global Knowz Codex install must write HOME ownership metadata');
  expect(stableJson(snapshotDirectory(project)) === stableJson(projectBefore), 'Global Knowz install must not mutate project Claude/Codex/Gemini state');

  const installedGlobalClaudeManifest = JSON.parse(readFileSync(globalClaudeManifestPath, 'utf8'));
  const installedGlobalCodexManifest = JSON.parse(readFileSync(globalCodexManifestPath, 'utf8'));
  installedGlobalClaudeManifest.agents.push('knowz-global-stale-owned.md');
  installedGlobalCodexManifest.entries.push('knowz-global-stale-owned');
  writeFileSync(globalClaudeManifestPath, JSON.stringify(installedGlobalClaudeManifest, null, 2) + '\n');
  writeFileSync(globalCodexManifestPath, JSON.stringify(installedGlobalCodexManifest, null, 2) + '\n');
  const globalStaleAgent = join(home, '.claude', 'agents', 'knowz-global-stale-owned.md');
  const globalStaleSkill = join(home, '.agents', 'skills', 'knowz-global-stale-owned', 'SKILL.md');
  writeFileSync(globalStaleAgent, '# global stale manifest-owned Claude agent\n');
  mkdirSync(dirname(globalStaleSkill), { recursive: true });
  writeFileSync(globalStaleSkill, '# global stale manifest-owned Codex skill\n');

  runKnowzOwnershipCli(['upgrade', '--global'], project, home);
  expect(!existsSync(globalStaleAgent), 'Global Knowz upgrade must remove stale manifest-owned Claude agents');
  expect(!existsSync(dirname(globalStaleSkill)), 'Global Knowz upgrade must remove stale manifest-owned Codex skills');
  expect(readFileSync(globalUnownedClaudeAgent, 'utf8') === '# global unrelated Claude agent\n', 'Global Knowz upgrade must preserve unrelated Claude agents');
  expect(readFileSync(globalUnownedCodexSkill, 'utf8') === '# global unowned Knowz-prefixed Codex skill\n', 'Global Knowz upgrade must preserve unowned Knowz-prefixed Codex skills');
  expect(stableJson(snapshotDirectory(project)) === stableJson(projectBefore), 'Global Knowz upgrade must not mutate project Claude/Codex/Gemini state');

  const globalClaudeManifest = JSON.parse(readFileSync(globalClaudeManifestPath, 'utf8'));
  const globalCodexManifest = JSON.parse(readFileSync(globalCodexManifestPath, 'utf8'));
  runKnowzOwnershipCli(['uninstall', '--global'], project, home);
  for (const entry of globalClaudeManifest.agents) {
    expect(!existsSync(join(home, '.claude', 'agents', entry)), `Global Knowz uninstall must remove owned Claude agent: ${entry}`);
  }
  for (const entry of globalClaudeManifest.skills) {
    expect(!existsSync(join(home, '.claude', 'skills', entry)), `Global Knowz uninstall must remove owned Claude skill: ${entry}`);
  }
  for (const entry of globalCodexManifest.entries) {
    expect(!existsSync(join(home, '.agents', 'skills', entry)), `Global Knowz uninstall must remove owned Codex skill: ${entry}`);
  }
  expect(!existsSync(globalClaudeManifestPath), 'Global Knowz uninstall must remove the Claude ownership manifest');
  expect(!existsSync(globalCodexManifestPath), 'Global Knowz uninstall must remove the Codex ownership manifest');
  expect(readFileSync(globalUnownedClaudeAgent, 'utf8') === '# global unrelated Claude agent\n', 'Global Knowz uninstall must preserve unrelated Claude agents');
  expect(readFileSync(globalUnownedCodexSkill, 'utf8') === '# global unowned Knowz-prefixed Codex skill\n', 'Global Knowz uninstall must preserve unowned Knowz-prefixed Codex skills');
  expect(stableJson(snapshotDirectory(project)) === stableJson(projectBefore), 'Global Knowz uninstall must not mutate project Claude/Codex/Gemini state');
} catch (error) {
  expect(false, `Global Knowz ownership/isolation smoke test failed: ${error.stderr || error.message}`);
} finally {
  rmSync(globalKnowzOwnershipRoot, { recursive: true, force: true });
}

// Exercise Claude Teams as a strict explicit opt-in. Isolate HOME so a developer's
// installed marketplace registry cannot influence plugin detection in these smokes.
const claudeTeamsCli = join(ROOT, 'knowzcode', 'bin', 'knowzcode.mjs');
const unownedClaudeTarget = mkdtempSync(join(tmpdir(), 'knowzcode-claude-unowned-'));
try {
  const userSkill = join(unownedClaudeTarget, '.claude', 'skills', 'work', 'SKILL.md');
  mkdirSync(dirname(userSkill), { recursive: true });
  writeFileSync(userSkill, '# unrelated user work skill\n\nThis user-owned prose mentions KnowzCode.\n');
  const before = snapshotDirectory(unownedClaudeTarget);
  execFileSync(
    process.execPath,
    [claudeTeamsCli, 'uninstall', '--target', unownedClaudeTarget, '--force'],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' }
  );
  expect(stableJson(snapshotDirectory(unownedClaudeTarget)) === stableJson(before), 'Uninstall must preserve an unmanifested same-name Claude skill');
  let rejected = false;
  try {
    execFileSync(
      process.execPath,
      [claudeTeamsCli, 'install', '--target', unownedClaudeTarget, '--platforms', 'claude', '--force'],
      { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' }
    );
  } catch {
    rejected = true;
  }
  expect(rejected, 'Claude install must reject an unmanifested same-name component collision');
  expect(stableJson(snapshotDirectory(unownedClaudeTarget)) === stableJson(before), 'Rejected Claude component collision must preserve the exact target snapshot');
} catch (error) {
  expect(false, `Claude component ownership smoke test failed: ${error.stderr || error.message}`);
} finally {
  rmSync(unownedClaudeTarget, { recursive: true, force: true });
}

const ordinaryClaudeTarget = mkdtempSync(join(tmpdir(), 'knowzcode-claude-ordinary-'));
try {
  const ordinaryInstallOutput = execFileSync(
    process.execPath,
    [claudeTeamsCli, 'install', '--target', ordinaryClaudeTarget, '--platforms', 'claude', '--force'],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, HOME: ordinaryClaudeTarget } }
  );
  expect(/Run \/setup in your AI tool/.test(ordinaryInstallOutput), 'Local Claude install summary must advertise the resolvable /setup command');
  expect(/\/work "Your first feature"/.test(ordinaryInstallOutput), 'Local Claude install summary must advertise the resolvable /work command');
  const generatedClaudeWork = join(ordinaryClaudeTarget, '.claude', 'skills', 'work', 'SKILL.md');
  const generatedClaudeManifest = join(ordinaryClaudeTarget, '.claude', '.knowzcode-managed.json');
  const generatedClaudeRuntime = join(ordinaryClaudeTarget, 'knowzcode', 'context_efficiency_runtime.mjs');
  expect(existsSync(generatedClaudeRuntime), 'Fresh Claude install must ship context_efficiency_runtime.mjs');
  expect(existsSync(generatedClaudeManifest), 'Fresh Claude install must write explicit component ownership metadata');
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
  let installedLocalRoleCall = false;
  let retainedExternalKnowzRole = false;
  for (const file of listMarkdownFiles(join(ordinaryClaudeTarget, '.claude', 'skills'))) {
    const content = readFileSync(file, 'utf8');
    expect(
      !/\bknowzcode:[a-z0-9-]+\b/.test(content),
      `npm-installed local Claude skill must localize every KnowzCode-owned agent identifier: ${file}`
    );
    expect(
      !/\/knowzcode:[a-z0-9-]+\b/.test(content),
      `npm-installed local Claude skill must localize namespaced slash-command references: ${file}`
    );
    if (/\bknowz:(?:reader|writer)\b/.test(content)) retainedExternalKnowzRole = true;
    for (const match of content.matchAll(/Agent\s*\(\s*subagent_type\s*=\s*["']([a-z0-9-]+)["']/g)) {
      if (knowzCodeAgentRoles.has(match[1])) installedLocalRoleCall = true;
    }
  }
  for (const [resource, sources] of claudePluginResourceReferences) {
    const localizedPath = localizedClaudeResourcePath(resource);
    if (!localizedPath) continue;
    const installedPath = join(ordinaryClaudeTarget, localizedPath);
    expect(
      existsSync(installedPath),
      `npm-installed Claude resource is missing: ${localizedPath} (declared by ${sources.join(', ')})`
    );
    const expectedContentPath = (resource.startsWith('docs/')
      ? join(ordinaryClaudeTarget, 'knowzcode', resource)
      : join(ordinaryClaudeTarget, '.claude', resource)).replace(/\\/g, '/');
    const escapedExpectedPath = expectedContentPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const source of sources) {
      const installedSource = join(
        ordinaryClaudeTarget,
        '.claude',
        relative(join(ROOT, 'knowzcode'), source)
      );
      expectFileContains(
        installedSource,
        new RegExp(escapedExpectedPath),
        `npm-installed Claude content must point at its installed resource: ${installedSource} -> ${expectedContentPath}`
      );
    }
  }
  for (const file of [
    ...listMarkdownFiles(join(ordinaryClaudeTarget, '.claude', 'skills')),
    ...listMarkdownFiles(join(ordinaryClaudeTarget, '.claude', 'agents')),
  ]) {
    expectFileNotContains(
      file,
      /\$\{CLAUDE_PLUGIN_ROOT\}/,
      `npm-installed local Claude content must not retain plugin-only resource roots: ${file}`
    );
  }
  expect(installedLocalRoleCall, 'npm-installed KnowzCode local skills must retain at least one exact bare local agent role call');
  expect(retainedExternalKnowzRole, 'KnowzCode-only local install must preserve scoped Knowz reader/writer references when no local Knowz agents exist');
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
  const obsoleteOwnedSkillFile = join(ordinaryClaudeTarget, '.claude', 'skills', 'work', 'obsolete-from-prior-package.md');
  writeFileSync(obsoleteOwnedSkillFile, '# stale packaged file\n');
  execFileSync(
    process.execPath,
    [claudeTeamsCli, 'upgrade', '--target', ordinaryClaudeTarget, '--platforms', 'claude', '--force'],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, HOME: ordinaryClaudeTarget } }
  );
  expect(!existsSync(obsoleteOwnedSkillFile), 'Claude upgrade must replace each manifest-owned packaged skill directory and remove obsolete files');
} catch (error) {
  expect(false, `Ordinary Claude install smoke test failed: ${error.stderr || error.message}`);
} finally {
  rmSync(ordinaryClaudeTarget, { recursive: true, force: true });
}

const globalClaudeResourceRoot = mkdtempSync(join(tmpdir(), 'knowzcode-claude-global-resources-'));
try {
  const project = join(globalClaudeResourceRoot, 'project');
  const home = join(globalClaudeResourceRoot, 'home');
  mkdirSync(project, { recursive: true });
  mkdirSync(home, { recursive: true });
  execFileSync(
    process.execPath,
    [claudeTeamsCli, 'install', '--target', project, '--platforms', 'claude', '--global', '--force'],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, HOME: home, USERPROFILE: home } }
  );
  const validateGlobalClaudeResources = (phase) => {
    for (const [resource, sources] of claudePluginResourceReferences) {
      const expectedContentPath = (resource.startsWith('docs/')
        ? join(project, 'knowzcode', resource)
        : join(home, '.claude', resource)).replace(/\\/g, '/');
      const expectedTargetPath = expectedContentPath;
      expect(
        existsSync(expectedTargetPath),
        `Global npm-${phase} Claude resource is missing: ${expectedTargetPath}`
      );
      for (const source of sources) {
        const installedSource = join(home, '.claude', relative(join(ROOT, 'knowzcode'), source));
        const escapedExpectedPath = expectedContentPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        expectFileContains(
          installedSource,
          new RegExp(escapedExpectedPath),
          `Global npm-${phase} Claude content must point at its installed resource: ${installedSource} -> ${expectedContentPath}`
        );
      }
    }
  };
  validateGlobalClaudeResources('installed');
  execFileSync(
    process.execPath,
    [claudeTeamsCli, 'upgrade', '--target', project, '--platforms', 'claude', '--global', '--force'],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, HOME: home, USERPROFILE: home } }
  );
  validateGlobalClaudeResources('upgraded');
} catch (error) {
  expect(false, `Global Claude resource localization smoke test failed: ${error.stderr || error.message}`);
} finally {
  rmSync(globalClaudeResourceRoot, { recursive: true, force: true });
}

// Claude marketplace settings are a shared mutable file. A symlink at that
// exact destination must fail before framework/components are written or
// removed, for install, upgrade, and uninstall alike.
const claudeSettingsSymlinkRoot = mkdtempSync(join(tmpdir(), 'knowzcode-claude-settings-symlink-'));
try {
  const project = join(claudeSettingsSymlinkRoot, 'project');
  const home = join(claudeSettingsSymlinkRoot, 'home');
  const outside = join(claudeSettingsSymlinkRoot, 'outside-settings.json');
  mkdirSync(join(project, '.claude'), { recursive: true });
  mkdirSync(home, { recursive: true });
  writeFileSync(outside, '{\n  "outside": "preserve"\n}\n');
  symlinkSync(outside, join(project, '.claude', 'settings.json'), 'file');
  const installProjectBefore = snapshotDirectory(project);
  const installOutsideBefore = readFileSync(outside, 'utf8');
  let installRejected = false;
  try {
    execFileSync(
      process.execPath,
      [claudeTeamsCli, 'install', '--target', project, '--platforms', 'claude', '--force'],
      { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, HOME: home } }
    );
  } catch {
    installRejected = true;
  }
  expect(installRejected, 'Claude install must reject a symlinked marketplace settings file');
  expect(stableJson(snapshotDirectory(project)) === stableJson(installProjectBefore), 'Rejected Claude settings symlink install must preserve the project snapshot');
  expect(readFileSync(outside, 'utf8') === installOutsideBefore, 'Rejected Claude settings symlink install must preserve the external file');

  rmSync(join(project, '.claude', 'settings.json'), { force: true });
  execFileSync(
    process.execPath,
    [claudeTeamsCli, 'install', '--target', project, '--platforms', 'claude', '--force'],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, HOME: home } }
  );
  const managedSettings = join(project, '.claude', 'settings.json');
  writeFileSync(outside, readFileSync(managedSettings));
  rmSync(managedSettings, { force: true });
  symlinkSync(outside, managedSettings, 'file');

  for (const operation of ['upgrade', 'uninstall']) {
    const projectBefore = snapshotDirectory(project);
    const outsideBefore = readFileSync(outside, 'utf8');
    let rejected = false;
    try {
      execFileSync(
        process.execPath,
        [claudeTeamsCli, operation, '--target', project, '--force'],
        { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, HOME: home } }
      );
    } catch {
      rejected = true;
    }
    expect(rejected, `Claude ${operation} must reject a symlinked marketplace settings file`);
    expect(stableJson(snapshotDirectory(project)) === stableJson(projectBefore), `Rejected Claude settings symlink ${operation} must preserve every managed component`);
    expect(readFileSync(outside, 'utf8') === outsideBefore, `Rejected Claude settings symlink ${operation} must preserve the external file`);
  }
} catch (error) {
  expect(false, `Claude settings symlink lifecycle smoke failed: ${error.stderr || error.message}`);
} finally {
  rmSync(claudeSettingsSymlinkRoot, { recursive: true, force: true });
}

// Pre-manifest exact KnowzCode components may be adopted, while a generic
// directory named knowzcode without the version ownership marker is preserved.
for (const operation of ['upgrade', 'uninstall']) {
  const legacyRoot = mkdtempSync(join(tmpdir(), `knowzcode-legacy-${operation}-`));
  try {
    const project = join(legacyRoot, 'project');
    const home = join(legacyRoot, 'home');
    const legacyAgent = join(project, '.claude', 'agents', 'builder.md');
    const legacySkill = join(project, '.claude', 'skills', 'work', 'SKILL.md');
    mkdirSync(dirname(legacyAgent), { recursive: true });
    mkdirSync(dirname(legacySkill), { recursive: true });
    mkdirSync(join(project, 'knowzcode'), { recursive: true });
    mkdirSync(home, { recursive: true });
    writeFileSync(legacyAgent, readFileSync(join(ROOT, 'knowzcode', 'agents', 'builder.md')));
    writeFileSync(legacySkill, readFileSync(join(ROOT, 'knowzcode', 'skills', 'work', 'SKILL.md')));
    writeFileSync(join(project, 'knowzcode', '.knowzcode-version'), '0.20.0\n');

    execFileSync(
      process.execPath,
      [claudeTeamsCli, operation, '--target', project, '--force'],
      { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, HOME: home } }
    );
    if (operation === 'upgrade') {
      const manifest = join(project, '.claude', '.knowzcode-managed.json');
      expect(existsSync(manifest), 'Legacy Claude upgrade must adopt exact historical components into an ownership manifest');
      expect(
        readFileSync(join(project, '.claude', 'agents', 'builder.md'), 'utf8').includes('<!-- KnowzCode managed component: claude -->'),
        'Legacy Claude upgrade must add a recoverable exact ownership marker'
      );
    } else {
      expect(!existsSync(legacyAgent), 'Legacy Claude uninstall must remove an exact historical agent');
      expect(!existsSync(dirname(legacySkill)), 'Legacy Claude uninstall must remove an exact historical skill');
      expect(!existsSync(join(project, 'knowzcode')), 'Legacy uninstall may remove only a framework with a valid version marker');
    }
  } catch (error) {
    expect(false, `Legacy Claude ${operation} lifecycle smoke failed: ${error.stderr || error.message}`);
  } finally {
    rmSync(legacyRoot, { recursive: true, force: true });
  }
}

const unownedFrameworkRoot = mkdtempSync(join(tmpdir(), 'knowzcode-unowned-framework-'));
try {
  const userFile = join(unownedFrameworkRoot, 'knowzcode', 'user-owned.md');
  mkdirSync(dirname(userFile), { recursive: true });
  writeFileSync(userFile, '# User-owned directory\n');
  const beforeInstall = snapshotDirectory(unownedFrameworkRoot);
  let installRejected = false;
  try {
    execFileSync(
      process.execPath,
      [claudeTeamsCli, 'install', '--target', unownedFrameworkRoot, '--platforms', 'codex', '--force'],
      { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, HOME: VALIDATOR_HOME } }
    );
  } catch {
    installRejected = true;
  }
  expect(installRejected, 'Install must reject an unowned existing knowzcode framework directory');
  expect(stableJson(snapshotDirectory(unownedFrameworkRoot)) === stableJson(beforeInstall), 'Rejected unowned framework install must preserve the complete snapshot');
  execFileSync(
    process.execPath,
    [claudeTeamsCli, 'uninstall', '--target', unownedFrameworkRoot, '--force'],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, HOME: VALIDATOR_HOME } }
  );
  expect(readFileSync(userFile, 'utf8') === '# User-owned directory\n', 'Uninstall must preserve a knowzcode directory without a valid ownership marker');
} catch (error) {
  expect(false, `Unowned framework preservation smoke failed: ${error.stderr || error.message}`);
} finally {
  rmSync(unownedFrameworkRoot, { recursive: true, force: true });
}

const localKnowzMatrixTarget = mkdtempSync(join(tmpdir(), 'knowzcode-knowz-local-matrix-'));
try {
  const knowzCli = join(ROOT, 'knowz', 'bin', 'knowz-mcp.mjs');
  execFileSync(
    process.execPath,
    [knowzCli, 'install', '--target', localKnowzMatrixTarget, '--platforms', 'claude', '--force'],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, HOME: localKnowzMatrixTarget } }
  );
  execFileSync(
    process.execPath,
    [claudeTeamsCli, 'install', '--target', localKnowzMatrixTarget, '--platforms', 'claude', '--force'],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, HOME: localKnowzMatrixTarget } }
  );
  const localSpawnPrompts = join(localKnowzMatrixTarget, '.claude', 'skills', 'work', 'references', 'spawn-prompts.md');
  expectFileContains(localSpawnPrompts, /\bwriter\b/, 'KnowzCode local + marker-owned Knowz local must retain a bare writer reference');
  expectFileNotContains(localSpawnPrompts, /\bknowz:(?:reader|writer)\b/, 'KnowzCode local + Knowz local must localize Knowz agent references');
} catch (error) {
  expect(false, `KnowzCode + local Knowz namespace matrix failed: ${error.stderr || error.message}`);
} finally {
  rmSync(localKnowzMatrixTarget, { recursive: true, force: true });
}

const pluginKnowzMatrixTarget = mkdtempSync(join(tmpdir(), 'knowzcode-knowz-plugin-matrix-'));
try {
  const knowzCli = join(ROOT, 'knowz', 'bin', 'knowz-mcp.mjs');
  execFileSync(
    process.execPath,
    [knowzCli, 'install', '--target', pluginKnowzMatrixTarget, '--platforms', 'claude', '--force'],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, HOME: pluginKnowzMatrixTarget } }
  );
  const pluginRegistry = join(pluginKnowzMatrixTarget, '.claude', 'plugins', 'installed_plugins.json');
  mkdirSync(dirname(pluginRegistry), { recursive: true });
  writeFileSync(pluginRegistry, JSON.stringify({
    plugins: {
      'knowz@knowz-skills': [{ scope: 'user', version: '1.0.0' }],
    },
  }, null, 2) + '\n');
  execFileSync(
    process.execPath,
    [claudeTeamsCli, 'install', '--target', pluginKnowzMatrixTarget, '--platforms', 'claude', '--force'],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, HOME: pluginKnowzMatrixTarget } }
  );
  const pluginSpawnPrompts = join(pluginKnowzMatrixTarget, '.claude', 'skills', 'work', 'references', 'spawn-prompts.md');
  expectFileContains(pluginSpawnPrompts, /\bknowz:writer\b/, 'Knowz plugin preference must keep external Knowz agent references scoped even when local agents coexist');
} catch (error) {
  expect(false, `KnowzCode + Knowz plugin namespace matrix failed: ${error.stderr || error.message}`);
} finally {
  rmSync(pluginKnowzMatrixTarget, { recursive: true, force: true });
}

const unownedKnowzAgentTarget = mkdtempSync(join(tmpdir(), 'knowzcode-unowned-knowz-agent-'));
try {
  const agentDir = join(unownedKnowzAgentTarget, '.claude', 'agents');
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(join(agentDir, 'reader.md'), '# Unrelated Reader\n');
  writeFileSync(join(agentDir, 'writer.md'), '# Unrelated Writer\n');
  execFileSync(
    process.execPath,
    [claudeTeamsCli, 'install', '--target', unownedKnowzAgentTarget, '--platforms', 'claude', '--force'],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, HOME: unownedKnowzAgentTarget } }
  );
  const unownedSpawnPrompts = join(unownedKnowzAgentTarget, '.claude', 'skills', 'work', 'references', 'spawn-prompts.md');
  expectFileContains(unownedSpawnPrompts, /\bknowz:writer\b/, 'Unowned same-name reader/writer files must not trigger Knowz role localization');
  expectFileContains(join(agentDir, 'reader.md'), /Unrelated Reader/, 'KnowzCode install must preserve unrelated same-name reader agent');
  expectFileContains(join(agentDir, 'writer.md'), /Unrelated Writer/, 'KnowzCode install must preserve unrelated same-name writer agent');
} catch (error) {
  expect(false, `Unowned Knowz agent namespace matrix failed: ${error.stderr || error.message}`);
} finally {
  rmSync(unownedKnowzAgentTarget, { recursive: true, force: true });
}

const malformedOrdinaryClaudeTarget = mkdtempSync(join(tmpdir(), 'knowzcode-claude-ordinary-malformed-'));
try {
  const claudeDir = join(malformedOrdinaryClaudeTarget, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  const settingsPath = join(claudeDir, 'settings.json');
  const malformedSentinel = '{ malformed ordinary settings: preserve exactly\n';
  writeFileSync(settingsPath, malformedSentinel);
  const before = snapshotDirectory(malformedOrdinaryClaudeTarget);
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
  expect(
    stableJson(snapshotDirectory(malformedOrdinaryClaudeTarget)) === stableJson(before),
    'Failed ordinary Claude install preflight must preserve the complete target snapshot'
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

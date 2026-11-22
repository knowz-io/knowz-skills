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

// Claude Code expands ${CLAUDE_PLUGIN_ROOT} only in content it injects itself: a
// skill's SKILL.md body and an agent definition body. Files the model opens from
// disk later (references/*.md, skill-level CLAUDE.md) arrive unexpanded, and the
// variable is not in the Bash environment. So the variable is allowed only in
// SKILL.md and agents/*.md, and every other file names package files by a path
// relative to itself. Each declaration is a required resource of the package.
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
  const expandedByClaude = basename(file) === 'SKILL.md'
    || relative(join(ROOT, 'knowzcode', 'agents'), file).split(/[\\/]/).length === 1;
  if (!expandedByClaude) {
    expect(
      !raw.includes('${CLAUDE_PLUGIN_ROOT}'),
      `\${CLAUDE_PLUGIN_ROOT} is not expanded outside SKILL.md and agent definitions; use a file-relative path: ${file}`
    );
  }
  // Hosts other than Claude Code never expand the variable, so SKILL.md pairs each
  // declaration with a path relative to the skill; every relative path must resolve.
  if (basename(file) === 'SKILL.md') {
    for (const match of raw.matchAll(/`\$\{CLAUDE_PLUGIN_ROOT\}\/[^`]+`(?! \(`[^`]+` from this skill's directory\))/g)) {
      expect(false, `Plugin-root reference needs a relative-path companion for other hosts: ${file}: ${match[0]}`);
    }
  }
  if (!relative(join(ROOT, 'knowzcode', 'skills'), file).startsWith('..')) {
    for (const match of raw.matchAll(/`((?:\.\.\/)+[A-Za-z0-9_./-]+\.md)`/g)) {
      expect(
        existsSync(join(dirname(file), match[1])),
        `Relative package path does not resolve from ${file}: ${match[1]}`
      );
    }
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
  'docs/enterprise-compliance.md',
];
expect(claudePluginResourceReferences.size > 0, 'Claude package must declare its required plugin resources with ${CLAUDE_PLUGIN_ROOT}');
let packedKnowzCodeFiles = new Set();
try {
  // On Windows `npm` is npm.cmd, which execFileSync cannot spawn without a
  // shell. Prefer npm's JS entry point (exposed by npm run as npm_execpath).
  const npmCli = process.env.npm_execpath;
  const [npmCommand, npmArgs, npmShell] = npmCli && /\.(c|m)?js$/i.test(npmCli)
    ? [process.execPath, [npmCli], false]
    : ['npm', [], process.platform === 'win32'];
  const packResult = JSON.parse(execFileSync(
    npmCommand,
    [...npmArgs, 'pack', '--dry-run', '--json', '--ignore-scripts'],
    { cwd: join(ROOT, 'knowzcode'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: npmShell }
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
}

// Codex never expands Claude plugin variables, so its package must not use them.
for (const file of listMarkdownFiles(join(ROOT, 'plugins', 'knowzcode', 'skills'))) {
  expect(
    !readFileSync(file, 'utf8').includes('${CLAUDE_PLUGIN_ROOT}'),
    `Codex package must not reference \${CLAUDE_PLUGIN_ROOT}: ${file}`
  );
}

// A skill's Markdown links to its own supporting files must resolve in the
// package that ships it (a missing references/*.md is otherwise only found at
// run time, inside the host).
for (const skillsRoot of [join(ROOT, 'knowzcode', 'skills'), join(ROOT, 'plugins', 'knowzcode', 'skills')]) {
  for (const file of listMarkdownFiles(skillsRoot)) {
    const raw = readFileSync(file, 'utf8');
    for (const match of raw.matchAll(/\]\(((?:\.\.?\/)*[A-Za-z0-9_-][A-Za-z0-9_./-]*\.md)(?:#[^)]*)?\)/g)) {
      expect(
        existsSync(join(dirname(file), match[1])),
        `Skill link does not resolve from ${file}: ${match[1]}`
      );
    }
  }
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
    ['filtered relay progress', /Relay progress bridge/],
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
    // Host-capability wording: the Claude plugin text names no environment variable.
    ['Agent fork capability gate', /gate it on current capability\/version[\s\S]{0,120}conversation-fork is available[\s\S]{0,80}fresh capsule/i],
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

const knowzCodexSkillRoot = join(ROOT, 'plugins', 'knowz', 'skills');
if (existsSync(knowzCodexSkillRoot)) {
  for (const entry of readdirSync(knowzCodexSkillRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillPath = join(knowzCodexSkillRoot, entry.name, 'SKILL.md');
    if (!existsSync(skillPath)) continue;
    if (entry.name === 'knowz-cli') {
      // This skill is imported from the independently versioned CLI release,
      // not generated by the MCP package. Preserve its release authority.
      const text = readFileSync(skillPath, 'utf8');
      const release = text.match(/CLI release: `((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)`\. Manifest SHA-256: `([a-f0-9]{64})`/);
      expect(Boolean(release), `Knowz CLI skill must carry released CLI version and manifest authority: ${skillPath}`);
      // The Claude plugin copy of this skill is shortened for the Claude directory
      // content policy, so the two bodies are not compared.
      if (release) {
        expect(text.includes(`npm i -g @knowzai/cli@${release[1]}`), `Knowz CLI skill must pin its own released CLI version: ${skillPath}`);
      }
      continue;
    }
    const generated = readFileSync(skillPath, 'utf8').match(/Generated by knowz-mcp v([0-9]+\.[0-9]+\.[0-9]+)/);
    expect(
      Boolean(generated),
      `Knowz Codex skill must carry a generated-version comment: ${skillPath}`
    );
    if (generated && sourcePackages.knowz?.version) {
      expect(
        generated[1] === sourcePackages.knowz.version,
        `Knowz Codex skill generated-version comment drift for ${skillPath}: ${generated[1]} !== ${sourcePackages.knowz.version}`
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
    // The Claude plugin copy of the security guideline is a short pointer (Claude
    // directory content policy); the Codex plugin keeps the full rule text.
    const claudePolicyDivergent = new Set(['guidelines/security.md']);
    for (const rel of srcFiles) {
      const pluginPath = join(pluginEnterprise, rel);
      if (!existsSync(pluginPath)) continue; // already reported by the set-diff above
      if (claudePolicyDivergent.has(rel.split('\\').join('/'))) continue;
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

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

const codexSupportDir = join(ROOT, 'plugins', 'knowzcode', 'knowzcode');
expect(existsSync(codexSupportDir) && statSync(codexSupportDir).isDirectory(), `Missing KnowzCode support directory: ${codexSupportDir}`);
expect(!existsSync(join(ROOT, 'plugins', 'knowzcode', 'agents')), 'Codex package should not ship Claude-only agents/ as active support content');

if (errors.length) {
  console.error('Platform surface validation failed:\n');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Platform surface validation passed.');

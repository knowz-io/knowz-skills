#!/usr/bin/env node

// Knowz MCP CLI — Zero-dependency Node.js installer
// Usage: npx knowz-mcp [install|uninstall|upgrade|detect] [options]

import { accessSync, constants as fsConstants, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, statSync } from 'fs';
import { createHash } from 'crypto';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PKG_ROOT = resolve(__dirname, '..');
const VERSION = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8')).version;

// ─── Enterprise Configuration ────────────────────────────────────────────────

const ENTERPRISE_CONFIG = (() => {
  const configPath = join(PKG_ROOT, 'enterprise.json');
  if (existsSync(configPath)) {
    try { return JSON.parse(readFileSync(configPath, 'utf8')); }
    catch { return {}; }
  }
  return {};
})();

const IS_ENTERPRISE = Object.keys(ENTERPRISE_CONFIG).filter(k => !k.startsWith('_')).length > 0;
const BRAND = ENTERPRISE_CONFIG.brand || 'Knowz';
const MCP_ENDPOINT = ENTERPRISE_CONFIG.mcp_endpoint || 'https://mcp.knowz.io/mcp';
const MCP_DEV_ENDPOINT = IS_ENTERPRISE ? MCP_ENDPOINT : 'https://mcp.dev.knowz.io/mcp';
const CODEX_BEARER_TOKEN_ENV_VAR = 'KNOWZ_API_KEY';
const CLAUDE_COMPONENT_MANIFEST = '.knowz-managed.json';
const CLAUDE_COMPONENT_MANIFEST_SCHEMA = 'knowz.claude-component-ownership/v1';
const CODEX_SKILL_MANIFEST = '.knowz-managed.json';
const CODEX_SKILL_MANIFEST_SCHEMA = 'knowz.codex-skill-ownership/v1';
const GEMINI_COMMAND_MANIFEST = '.knowz-managed.json';
const GEMINI_COMMAND_MANIFEST_SCHEMA = 'knowz.gemini-command-ownership/v1';
const GEMINI_MCP_MANIFEST = '.knowz-mcp-managed.json';
const GEMINI_MCP_MANIFEST_SCHEMA = 'knowz.gemini-mcp-ownership/v1';
const KNOWZCODE_GEMINI_MCP_MANIFEST = '.knowzcode-mcp-managed.json';
const KNOWZCODE_GEMINI_MCP_MANIFEST_SCHEMA = 'knowzcode.gemini-mcp-ownership/v1';
// These skills contain scripts/references that cannot be represented by the single-file
// platform_adapters.md format. Ship their complete package directories to the shared Codex/Gemini
// skill root alongside the generated lightweight MCP skills.
const PORTABLE_CODEX_SKILLS = Object.freeze(['knowz-api']);
const LEGACY_CLAUDE_SKILL_HEADINGS = Object.freeze({
  knowz: '# Knowz — Frictionless Knowledge Management',
  'knowz-auto': '# Knowz Auto - Frictionless Vault Awareness',
});
const LEGACY_CLAUDE_AGENT_HEADINGS = Object.freeze({
  'knowledge-worker.md': '# Knowledge Worker',
  'reader.md': '# Knowz Reader',
  'writer.md': '# Knowz Writer',
});

// ─── Colors ──────────────────────────────────────────────────────────────────

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const log = {
  info: (msg) => console.log(`${c.blue}[INFO]${c.reset} ${msg}`),
  ok: (msg) => console.log(`${c.green}[OK]${c.reset} ${msg}`),
  warn: (msg) => console.log(`${c.yellow}[WARN]${c.reset} ${msg}`),
  err: (msg) => console.error(`${c.red}[ERROR]${c.reset} ${msg}`),
};

// ─── Platform Definitions ────────────────────────────────────────────────────

const PLATFORMS = {
  claude: {
    name: 'Claude Code',
    detect: (dir) => existsSync(join(dir, '.claude')) || existsSync(join(dir, '.claude-plugin')),
  },
  codex: {
    name: 'OpenAI Codex',
    detect: (dir) => existsSync(join(dir, 'AGENTS.md')) || existsSync(join(dir, 'AGENTS.override.md')) || existsSync(join(dir, '.codex')) || existsSync(join(dir, '.agents')),
    templateHeader: '## OpenAI Codex (AGENTS.md)',
  },
  gemini: {
    name: 'Gemini CLI',
    detect: (dir) => existsSync(join(dir, 'GEMINI.md')) || existsSync(join(dir, '.gemini')),
    templateHeader: '## Google Gemini CLI (GEMINI.md)',
  },
};

// ─── CLI Argument Parser ─────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    command: null,
    target: process.cwd(),
    targetExplicit: false,
    platforms: [],
    force: false,
    global: false,
    mcpKey: null,
    mcpEndpoint: null,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === '--target' && i + 1 < args.length) {
      opts.target = resolve(args[++i]);
      opts.targetExplicit = true;
    } else if (arg === '--platforms' && i + 1 < args.length) {
      opts.platforms = args[++i].split(',').map((p) => p.trim().toLowerCase());
    } else if (arg === '--force') {
      opts.force = true;
    } else if (arg === '--global') {
      opts.global = true;
    } else if (arg === '--mcp-key' && i + 1 < args.length) {
      opts.mcpKey = args[++i].trim();
    } else if (arg === '--mcp-endpoint' && i + 1 < args.length) {
      opts.mcpEndpoint = args[++i].trim();
    } else if (arg === '--help' || arg === '-h') {
      opts.command = 'help';
    } else if (arg === '--version' || arg === '-v') {
      opts.command = 'version';
    } else if (!arg.startsWith('-') && !opts.command) {
      opts.command = arg.toLowerCase();
    }
    i++;
  }

  return opts;
}

// ─── Platform Detection ──────────────────────────────────────────────────────

function detectPlatforms(dir) {
  const detected = [];
  for (const [id, platform] of Object.entries(PLATFORMS)) {
    if (platform.detect(dir)) {
      detected.push(id);
    }
  }
  return detected;
}

// ─── File Helpers ────────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeTomlString(value) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function copyDirContents(src, dst) {
  ensureDir(dst);
  if (!existsSync(src)) return;

  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name);
    const dstPath = join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDirContents(srcPath, dstPath);
    } else {
      writeFileSync(dstPath, readFileSync(srcPath));
    }
  }
}

function copyClaudeSkillsForLocalInstall(src, dst) {
  ensureDir(dst);
  if (!existsSync(src)) return;

  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name);
    const dstPath = join(dst, entry.name);
    if (entry.isDirectory()) {
      copyClaudeSkillsForLocalInstall(srcPath, dstPath);
      continue;
    }
    const bytes = readFileSync(srcPath);
    if (!entry.name.endsWith('.md')) {
      writeFileSync(dstPath, bytes);
      continue;
    }
    // Marketplace plugin agents are registered as knowz:<role>; agents copied
    // into .claude/agents are registered by their bare filename. Rewrite only
    // the three Knowz-owned exact types so local installs never depend on fuzzy
    // suffix matching or on a marketplace plugin also being active.
    const localized = bytes.toString('utf8').replace(
      /\bknowz:(knowledge-worker|reader|writer)\b/g,
      '$1'
    );
    writeFileSync(dstPath, localized);
  }
}

function listRelativeFiles(root, prefix = '') {
  const files = [];
  if (!existsSync(root)) return files;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const relativePath = prefix ? join(prefix, entry.name) : entry.name;
    if (entry.isDirectory()) files.push(...listRelativeFiles(join(root, entry.name), relativePath));
    else if (entry.isFile()) files.push(relativePath);
  }
  return files;
}

function packagedCodexSkillEntries(codexTemplateSet) {
  const generated = [...codexTemplateSet.files.keys()]
    .map((relativePath) => relativePath.match(/^\.agents\/skills\/(knowz-[^/]+)\//)?.[1])
    .filter(Boolean);
  const portable = PORTABLE_CODEX_SKILLS.filter((entry) =>
    existsSync(join(PKG_ROOT, 'skills', entry, 'SKILL.md')));
  return [...new Set([...generated, ...portable])].sort();
}

function packagedClaudeComponents() {
  return {
    agents: readdirSync(join(PKG_ROOT, 'agents'))
      .filter((entry) => /^[a-z0-9-]+\.md$/.test(entry)).sort(),
    skills: readdirSync(join(PKG_ROOT, 'skills'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^[a-z0-9-]+$/.test(entry.name))
      .map((entry) => entry.name).sort(),
  };
}

function readClaudeComponentManifest(claudeDir, { strict = false } = {}) {
  const manifestPath = join(claudeDir, CLAUDE_COMPONENT_MANIFEST);
  if (!existsSync(manifestPath)) return { manifestPath, agents: [], skills: [] };
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (manifest?.schema !== CLAUDE_COMPONENT_MANIFEST_SCHEMA
        || manifest.owner !== 'knowz'
        || !Array.isArray(manifest.agents)
        || !Array.isArray(manifest.skills)
        || manifest.agents.some((entry) => typeof entry !== 'string'
          || !/^[a-z0-9-]+\.md$/.test(entry))
        || manifest.skills.some((entry) => typeof entry !== 'string'
          || !/^[a-z0-9-]+$/.test(entry))) {
      throw new TypeError('manifest must contain owned Claude agent files and skill directories');
    }
    return {
      manifestPath,
      agents: [...new Set(manifest.agents)].sort(),
      skills: [...new Set(manifest.skills)].sort(),
    };
  } catch (error) {
    if (strict) {
      throw new Error(
        `Cannot update managed Knowz Claude components because ${manifestPath} is invalid. `
        + `Existing components were preserved: ${error.message}`
      );
    }
    return { manifestPath, agents: [], skills: [] };
  }
}

function reconcileManagedClaudeComponents(claudeDir) {
  const previous = readClaudeComponentManifest(claudeDir, { strict: true });
  const current = packagedClaudeComponents();
  const currentAgents = new Set(current.agents);
  const currentSkills = new Set(current.skills);
  for (const entry of previous.agents) {
    if (!currentAgents.has(entry)) {
      log.info(`Removing stale manifest-owned Claude agent: ${entry}`);
      rmSync(join(claudeDir, 'agents', entry), { force: true });
    }
  }
  for (const entry of previous.skills) {
    if (!currentSkills.has(entry)) {
      log.info(`Removing stale manifest-owned Claude skill: ${entry}/`);
      rmSync(join(claudeDir, 'skills', entry), { recursive: true, force: true });
    }
  }
  ensureDir(claudeDir);
  writeFileSync(previous.manifestPath, JSON.stringify({
    schema: CLAUDE_COMPONENT_MANIFEST_SCHEMA,
    owner: 'knowz',
    version: VERSION,
    ...current,
  }, null, 2) + '\n');
}

function prepareManagedClaudeSkillsForCopy(claudeDir) {
  const previous = readClaudeComponentManifest(claudeDir, { strict: true });
  for (const entry of packagedClaudeComponents().skills) {
    const target = join(claudeDir, 'skills', entry);
    if (existsSync(target) && (
      previous.skills.includes(entry)
      || isLegacyManagedClaudeComponent(target, entry, 'skill')
    )) {
      rmSync(target, { recursive: true, force: true });
    }
  }
}

function readCodexSkillManifest(skillRoot, { strict = false } = {}) {
  const manifestPath = join(skillRoot, CODEX_SKILL_MANIFEST);
  if (!existsSync(manifestPath)) return { manifestPath, entries: [] };
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (manifest?.schema !== CODEX_SKILL_MANIFEST_SCHEMA
        || manifest.owner !== 'knowz'
        || !Array.isArray(manifest.entries)
        || manifest.entries.some((entry) => typeof entry !== 'string'
          || !/^knowz-[a-z0-9-]+$/.test(entry))) {
      throw new TypeError('manifest must contain owned knowz-* skill directories');
    }
    return { manifestPath, entries: [...new Set(manifest.entries)].sort() };
  } catch (error) {
    if (strict) {
      throw new Error(
        `Cannot update managed Knowz Codex skills because ${manifestPath} is invalid. `
        + `Existing skills were preserved: ${error.message}`
      );
    }
    return { manifestPath, entries: [] };
  }
}

function reconcileManagedCodexSkills(skillRoot, currentEntries) {
  const previous = readCodexSkillManifest(skillRoot, { strict: true });
  const current = new Set(currentEntries);
  for (const entry of previous.entries) {
    if (!current.has(entry)) {
      log.info(`Removing stale manifest-owned Codex skill: ${entry}/`);
      rmSync(join(skillRoot, entry), { recursive: true, force: true });
    }
  }
  ensureDir(skillRoot);
  writeFileSync(previous.manifestPath, JSON.stringify({
    schema: CODEX_SKILL_MANIFEST_SCHEMA,
    owner: 'knowz',
    version: VERSION,
    entries: [...current].sort(),
  }, null, 2) + '\n');
}

function prepareManagedCodexSkillsForCopy(skillRoot, currentEntries) {
  const previous = readCodexSkillManifest(skillRoot, { strict: true });
  for (const entry of currentEntries) {
    const target = join(skillRoot, entry);
    if (existsSync(target) && (
      previous.entries.includes(entry)
      || isLegacyManagedCodexSkill(target)
    )) {
      rmSync(target, { recursive: true, force: true });
    }
  }
}

function readGeminiCommandManifest(commandRoot, { strict = false } = {}) {
  const manifestPath = join(commandRoot, GEMINI_COMMAND_MANIFEST);
  if (!existsSync(manifestPath)) return { manifestPath, entries: [] };
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (manifest?.schema !== GEMINI_COMMAND_MANIFEST_SCHEMA
        || manifest.owner !== 'knowz'
        || !Array.isArray(manifest.entries)
        || manifest.entries.some((entry) => typeof entry !== 'string'
          || !/^[a-z0-9-]+\.toml$/.test(entry))) {
      throw new TypeError('manifest must contain owned Gemini command files');
    }
    return { manifestPath, entries: [...new Set(manifest.entries)].sort() };
  } catch (error) {
    if (strict) {
      throw new Error(
        `Cannot update managed Knowz Gemini commands because ${manifestPath} is invalid. `
        + `Existing commands were preserved: ${error.message}`
      );
    }
    return { manifestPath, entries: [] };
  }
}

function reconcileManagedGeminiCommands(commandRoot, currentEntries) {
  const previous = readGeminiCommandManifest(commandRoot, { strict: true });
  const current = new Set(currentEntries);
  for (const entry of previous.entries) {
    if (!current.has(entry)) {
      log.info(`Removing stale manifest-owned Gemini command: ${entry}`);
      rmSync(join(commandRoot, entry), { force: true });
    }
  }
  ensureDir(commandRoot);
  writeFileSync(previous.manifestPath, JSON.stringify({
    schema: GEMINI_COMMAND_MANIFEST_SCHEMA,
    owner: 'knowz',
    version: VERSION,
    entries: [...current].sort(),
  }, null, 2) + '\n');
}

function safeText(path) {
  try { return readFileSync(path, 'utf8'); } catch { return ''; }
}

function isLegacyManagedClaudeComponent(path, entry, kind) {
  const markerPath = kind === 'skill' ? join(path, 'SKILL.md') : path;
  const content = safeText(markerPath);
  const expectedName = kind === 'skill' ? entry : entry.replace(/\.md$/, '');
  if (!new RegExp(`^name:\\s*${escapeRegExp(expectedName)}\\s*$`, 'm').test(content)) return false;
  const expectedHeading = kind === 'skill'
    ? LEGACY_CLAUDE_SKILL_HEADINGS[entry]
    : LEGACY_CLAUDE_AGENT_HEADINGS[entry];
  if (!expectedHeading || !content.split(/\r?\n/).includes(expectedHeading)) return false;
  return kind === 'skill' || /^description:\s*["']Knowz:/m.test(content);
}

function isLegacyManagedCodexSkill(path) {
  return /<!-- Generated by knowz-mcp v[^>]+ -->/.test(safeText(join(path, 'SKILL.md')));
}

function isLegacyManagedGeminiCommand(path, entry) {
  return safeText(path).startsWith(`# .gemini/commands/knowz/${entry}\n`);
}

function readClaudeOwnershipForUninstall(claudeDir) {
  const manifestPath = join(claudeDir, CLAUDE_COMPONENT_MANIFEST);
  if (existsSync(manifestPath)) return readClaudeComponentManifest(claudeDir, { strict: true });
  const packaged = packagedClaudeComponents();
  return {
    manifestPath,
    agents: packaged.agents.filter((entry) => isLegacyManagedClaudeComponent(
      join(claudeDir, 'agents', entry), entry, 'agent'
    )),
    skills: packaged.skills.filter((entry) => isLegacyManagedClaudeComponent(
      join(claudeDir, 'skills', entry), entry, 'skill'
    )),
  };
}

function readCodexOwnershipForUninstall(skillRoot) {
  const manifestPath = join(skillRoot, CODEX_SKILL_MANIFEST);
  if (existsSync(manifestPath)) return readCodexSkillManifest(skillRoot, { strict: true });
  const entries = existsSync(skillRoot)
    ? readdirSync(skillRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^knowz-[a-z0-9-]+$/.test(entry.name))
      .map((entry) => entry.name)
      .filter((entry) => isLegacyManagedCodexSkill(join(skillRoot, entry)))
      .sort()
    : [];
  return { manifestPath, entries };
}

function readGeminiOwnershipForUninstall(commandRoot) {
  const manifestPath = join(commandRoot, GEMINI_COMMAND_MANIFEST);
  if (existsSync(manifestPath)) return readGeminiCommandManifest(commandRoot, { strict: true });
  const entries = existsSync(commandRoot)
    ? readdirSync(commandRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /^[a-z0-9-]+\.toml$/.test(entry.name))
      .map((entry) => entry.name)
      .filter((entry) => isLegacyManagedGeminiCommand(join(commandRoot, entry), entry))
      .sort()
    : [];
  return { manifestPath, entries };
}

function assertSafeDestination(boundary, target, label, expectedKind = null) {
  const root = resolve(boundary);
  const destination = resolve(target);
  const rel = relative(root, destination);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`${label} escapes its authorized installation boundary`);
  }
  let cursor = root;
  for (const segment of rel.split(/[\\/]/).filter(Boolean)) {
    cursor = join(cursor, segment);
    try {
      const stat = lstatSync(cursor);
      if (stat.isSymbolicLink()) throw new Error(`${label} traverses a symbolic link: ${cursor}`);
      if (cursor !== destination && !stat.isDirectory()) {
        throw new Error(`${label} has a non-directory ancestor: ${cursor}`);
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  if (existsSync(destination) && expectedKind) {
    const stat = lstatSync(destination);
    if (expectedKind === 'file' && !stat.isFile()) throw new Error(`${label} must be a regular file`);
    if (expectedKind === 'directory' && !stat.isDirectory()) throw new Error(`${label} must be a directory`);
  }
  let writablePath = existsSync(destination) ? destination : dirname(destination);
  while (!existsSync(writablePath) && writablePath !== dirname(writablePath)) {
    writablePath = dirname(writablePath);
  }
  accessSync(writablePath, fsConstants.W_OK);
}

function preflightInstallation(dir, selectedPlatforms, opts, templates) {
  const base = installBase(dir, opts);
  const home = selectedPlatforms.includes('codex') ? getHomeDir() : null;
  if (selectedPlatforms.some((platform) => !Object.hasOwn(PLATFORMS, platform))) {
    throw new Error('Unknown platform selection; expected claude, codex, gemini, or all');
  }

  if (selectedPlatforms.includes('claude')) {
    const claudeDir = join(base, '.claude');
    assertSafeDestination(base, claudeDir, 'Claude installation root', 'directory');
    const manifest = readClaudeComponentManifest(claudeDir, { strict: true });
    assertSafeDestination(base, manifest.manifestPath, 'Claude ownership manifest', 'file');
    const components = packagedClaudeComponents();
    for (const entry of components.agents) {
      const target = join(claudeDir, 'agents', entry);
      assertSafeDestination(base, target, `Claude agent ${entry}`, 'file');
      if (existsSync(target) && !manifest.agents.includes(entry)
          && !isLegacyManagedClaudeComponent(target, entry, 'agent')) {
        throw new Error(`Refusing to overwrite unmanaged Claude agent: ${target}`);
      }
    }
    for (const entry of components.skills) {
      const target = join(claudeDir, 'skills', entry);
      assertSafeDestination(base, target, `Claude skill ${entry}`, 'directory');
      if (existsSync(target) && !manifest.skills.includes(entry)
          && !isLegacyManagedClaudeComponent(target, entry, 'skill')) {
        throw new Error(`Refusing to overwrite unmanaged Claude skill: ${target}`);
      }
      for (const relativePath of listRelativeFiles(join(PKG_ROOT, 'skills', entry))) {
        assertSafeDestination(base, join(target, relativePath),
          `Claude skill ${entry} file ${relativePath}`, 'file');
      }
    }
  }

  const codexTemplateSet = templates.get('codex');
  if (selectedPlatforms.some((platform) => platform === 'codex' || platform === 'gemini')
      && codexTemplateSet) {
    const skillRoot = join(base, '.agents', 'skills');
    assertSafeDestination(base, skillRoot, 'Codex/Gemini shared skill root', 'directory');
    const manifest = readCodexSkillManifest(skillRoot, { strict: true });
    assertSafeDestination(base, manifest.manifestPath, 'Codex skill ownership manifest', 'file');
    const entries = packagedCodexSkillEntries(codexTemplateSet);
    for (const entry of entries) {
      const target = join(skillRoot, entry);
      assertSafeDestination(base, target, `Codex skill ${entry}`, 'directory');
      if (existsSync(target) && !manifest.entries.includes(entry)
          && !isLegacyManagedCodexSkill(target)) {
        throw new Error(`Refusing to overwrite unmanaged Codex skill: ${target}`);
      }
    }
    for (const relativePath of codexTemplateSet.files.keys()) {
      assertSafeDestination(base, join(base, relativePath),
        `Codex generated file ${relativePath}`, 'file');
    }
    for (const entry of PORTABLE_CODEX_SKILLS) {
      if (!entries.includes(entry)) continue;
      const target = join(skillRoot, entry);
      for (const relativePath of listRelativeFiles(join(PKG_ROOT, 'skills', entry))) {
        assertSafeDestination(base, join(target, relativePath),
          `Portable Codex skill ${entry} file ${relativePath}`, 'file');
      }
    }
  }

  if (selectedPlatforms.includes('gemini')) {
    const commandRoot = join(base, '.gemini', 'commands', 'knowz');
    assertSafeDestination(base, commandRoot, 'Gemini command root', 'directory');
    const manifest = readGeminiCommandManifest(commandRoot, { strict: true });
    assertSafeDestination(base, manifest.manifestPath, 'Gemini command ownership manifest', 'file');
    for (const relativePath of templates.get('gemini')?.files?.keys?.() ?? []) {
      const entry = relativePath.match(/^\.gemini\/commands\/knowz\/([^/]+\.toml)$/)?.[1];
      if (!entry) continue;
      const target = join(commandRoot, entry);
      assertSafeDestination(base, target, `Gemini command ${entry}`, 'file');
      if (existsSync(target) && !manifest.entries.includes(entry)
          && !isLegacyManagedGeminiCommand(target, entry)) {
        throw new Error(`Refusing to overwrite unmanaged Gemini command: ${target}`);
      }
    }
    const settingsPath = join(base, '.gemini', 'settings.json');
    assertSafeDestination(base, settingsPath, 'Gemini settings', 'file');
    const mcpManifestPath = join(base, '.gemini', GEMINI_MCP_MANIFEST);
    assertSafeDestination(base, mcpManifestPath, 'Gemini MCP ownership manifest', 'file');
    assertSafeDestination(base, join(base, '.gemini', KNOWZCODE_GEMINI_MCP_MANIFEST),
      'shared KnowzCode Gemini MCP ownership manifest', 'file');
    readGeminiSettingsOrThrow(settingsPath);
    readGeminiMcpOwnershipManifest(settingsPath, { strict: true });
  }

  if (selectedPlatforms.includes('codex')) {
    assertSafeDestination(home, getCodexConfigPath(), 'Codex MCP configuration', 'file');
  }
}

// ─── Adapter Template Parser ─────────────────────────────────────────────────

function injectVersion(content) {
  return content.replace(/vX\.Y\.Z/g, `v${VERSION}`);
}

function extractSection(content, headerIdx) {
  const afterHeader = content.slice(headerIdx);
  const nextSection = afterHeader.search(/\r?\n---\r?\n\r?\n## /);
  return nextSection !== -1 ? afterHeader.slice(0, nextSection) : afterHeader;
}

function extractFence(text, lang, startFrom = 0) {
  const marker = '```' + lang;
  const fenceStart = text.indexOf(marker, startFrom);
  if (fenceStart === -1) return null;
  const contentStart = text.indexOf('\n', fenceStart) + 1;
  let depth = 0;
  let pos = contentStart;
  while (pos < text.length) {
    const nextFence = text.indexOf('\n```', pos);
    if (nextFence === -1) return null;
    const afterBackticks = nextFence + 4;
    const charAfter = afterBackticks < text.length ? text[afterBackticks] : undefined;
    if (charAfter && /\w/.test(charAfter)) {
      depth++;
    } else {
      if (depth === 0) {
        return { content: text.slice(contentStart, nextFence), endIdx: afterBackticks };
      }
      depth--;
    }
    pos = afterBackticks;
  }
  return null;
}

function parseCodexSection(section) {
  const files = new Map();

  // Skill files: #### .agents/skills/knowz-{name}/SKILL.md headers
  const headerRegex = /#### (\.agents\/skills\/knowz-[\w-]+\/SKILL\.md)/g;
  const headers = [];
  let match;
  while ((match = headerRegex.exec(section)) !== null) {
    headers.push({ filepath: match[1], index: match.index });
  }

  for (let i = 0; i < headers.length; i++) {
    const start = headers[i].index;
    const end = i + 1 < headers.length ? headers[i + 1].index : section.length;
    const subSection = section.slice(start, end);
    const fence = extractFence(subSection, 'markdown');
    if (fence) {
      files.set(headers[i].filepath, { content: fence.content, lang: 'markdown' });
    }
  }

  // No primary adapter file for knowz-mcp (we don't write AGENTS.md)
  return { primary: null, files };
}

function parseGeminiSection(section) {
  const files = new Map();

  // Extract TOML blocks: ```toml fences with # .gemini/commands/knowz/{name}.toml comment
  let searchFrom = 0;
  while (true) {
    const fenceStart = section.indexOf('```toml', searchFrom);
    if (fenceStart === -1) break;
    const contentStart = section.indexOf('\n', fenceStart) + 1;
    const fenceEnd = section.indexOf('\n```', contentStart);
    if (fenceEnd === -1) break;
    const tomlContent = section.slice(contentStart, fenceEnd);
    const pathMatch = tomlContent.match(/^# (\.gemini\/commands\/knowz\/[\w-]+\.toml)/);
    if (pathMatch) {
      files.set(pathMatch[1], { content: tomlContent, lang: 'toml' });
    }
    searchFrom = fenceEnd + 4;
  }

  // Skills are shared via .agents/skills/ — Gemini reads that directory as an alias.
  // No .gemini/skills/ parsing needed. Only TOML commands are Gemini-specific.
  return { primary: null, files };
}

function parseAdapterTemplates() {
  const adaptersPath = join(PKG_ROOT, 'platform_adapters.md');
  if (!existsSync(adaptersPath)) {
    log.warn('platform_adapters.md not found — adapter generation will be skipped');
    return new Map();
  }

  const content = readFileSync(adaptersPath, 'utf8');
  const templates = new Map();

  for (const [id, platform] of Object.entries(PLATFORMS)) {
    if (!platform.templateHeader) continue;

    const headerIdx = content.indexOf(platform.templateHeader);
    if (headerIdx === -1) continue;

    const section = extractSection(content, headerIdx);
    let result;
    switch (id) {
      case 'gemini': result = parseGeminiSection(section); break;
      case 'codex': result = parseCodexSection(section); break;
      default: continue;
    }
    if (result) templates.set(id, result);
  }

  return templates;
}

// ─── MCP Config Helpers ──────────────────────────────────────────────────────

function readJsonObjectOrThrow(path, label) {
  if (!existsSync(path)) return {};
  let value;
  try {
    value = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`${label} is malformed; preserving it unchanged: ${error.message}`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must contain one JSON object; preserving it unchanged`);
  }
  return value;
}

function readGeminiSettingsOrThrow(path) {
  const settings = readJsonObjectOrThrow(path, 'Gemini settings');
  if (settings.mcpServers !== undefined
      && (!settings.mcpServers || typeof settings.mcpServers !== 'object'
        || Array.isArray(settings.mcpServers))) {
    throw new Error('Gemini settings mcpServers must be an object; preserving settings unchanged');
  }
  if (settings.mcpServers?.knowz !== undefined
      && (!settings.mcpServers.knowz || typeof settings.mcpServers.knowz !== 'object'
        || Array.isArray(settings.mcpServers.knowz))) {
    throw new Error('Gemini settings mcpServers.knowz must be an object; preserving settings unchanged');
  }
  return settings;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function geminiEntryDigest(entry) {
  return createHash('sha256').update(canonicalJson(entry)).digest('hex');
}

function readGeminiMcpOwnershipManifest(settingsPath, {
  strict = false,
  owner = 'knowz',
} = {}) {
  const isKnowzCode = owner === 'knowzcode';
  const manifestPath = join(
    dirname(settingsPath),
    isKnowzCode ? KNOWZCODE_GEMINI_MCP_MANIFEST : GEMINI_MCP_MANIFEST
  );
  if (!existsSync(manifestPath)) return { manifestPath, digest: null };
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const schema = isKnowzCode
      ? KNOWZCODE_GEMINI_MCP_MANIFEST_SCHEMA
      : GEMINI_MCP_MANIFEST_SCHEMA;
    if (manifest?.schema !== schema || manifest.owner !== owner
        || typeof manifest.entry_digest !== 'string'
        || !/^[a-f0-9]{64}$/.test(manifest.entry_digest)) {
      throw new TypeError('manifest must contain the owned Gemini entry digest');
    }
    return { manifestPath, digest: manifest.entry_digest };
  } catch (error) {
    if (strict) {
      throw new Error(`Cannot update managed Gemini MCP settings because ${manifestPath} is invalid: ${error.message}`);
    }
    return { manifestPath, digest: null };
  }
}

function writeGeminiMcpManifest(manifestPath, digest) {
  writeFileSync(manifestPath, JSON.stringify({
    schema: GEMINI_MCP_MANIFEST_SCHEMA,
    owner: 'knowz',
    version: VERSION,
    entry_digest: digest,
  }, null, 2) + '\n');
}

function isRegularFileWithoutSymlinkTraversal(boundary, target) {
  const root = resolve(boundary);
  const destination = resolve(target);
  const rel = relative(root, destination);
  if (rel === '..' || rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
      || isAbsolute(rel)) return false;
  let cursor = root;
  const segments = rel.split(/[\\/]+/).filter(Boolean);
  try {
    for (const [index, segment] of segments.entries()) {
      cursor = join(cursor, segment);
      const stat = lstatSync(cursor);
      if (stat.isSymbolicLink()) return false;
      if (index < segments.length - 1 && !stat.isDirectory()) return false;
      if (index === segments.length - 1) return stat.isFile();
    }
  } catch {
    return false;
  }
  return false;
}

function hasKnowzCodeGeminiInstallation(settingsPath) {
  const projectDir = dirname(dirname(settingsPath));
  const managedCommand = join(projectDir, '.gemini', 'commands', 'knowzcode', 'work.toml');
  const primaryAdapter = join(projectDir, 'GEMINI.md');
  const versionMarker = join(projectDir, 'knowzcode', '.knowzcode-version');
  try {
    if (!isRegularFileWithoutSymlinkTraversal(projectDir, managedCommand)
        || !isRegularFileWithoutSymlinkTraversal(projectDir, primaryAdapter)
        || !isRegularFileWithoutSymlinkTraversal(projectDir, versionMarker)) return false;
    const command = readFileSync(managedCommand, 'utf8');
    const adapter = readFileSync(primaryAdapter, 'utf8');
    const version = readFileSync(versionMarker, 'utf8').trim();
    return /^# Generated by KnowzCode v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\r?$/m.test(command)
      && /^<!-- Generated by KnowzCode v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)? -->\r?$/m.test(adapter)
      && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version);
  } catch {
    return false;
  }
}

function claimSharedGeminiMcpEntry(settingsPath) {
  const settings = readGeminiSettingsOrThrow(settingsPath);
  const current = settings.mcpServers?.knowz;
  if (!current) return false;
  const currentDigest = geminiEntryDigest(current);
  const manifest = readGeminiMcpOwnershipManifest(settingsPath, { strict: true });
  if (manifest.digest === currentDigest) return true;
  const knowzCodeManifest = readGeminiMcpOwnershipManifest(settingsPath, {
    strict: false,
    owner: 'knowzcode',
  });
  if (!hasKnowzCodeGeminiInstallation(settingsPath)
      || knowzCodeManifest.digest !== currentDigest) return false;
  ensureDir(dirname(settingsPath));
  writeGeminiMcpManifest(manifest.manifestPath, currentDigest);
  log.info('Shared custody of the verified KnowzCode-owned Gemini MCP configuration.');
  return true;
}

function writeOwnedGeminiMcpEntry(settingsPath, entry) {
  const settings = readGeminiSettingsOrThrow(settingsPath);
  const manifest = readGeminiMcpOwnershipManifest(settingsPath, { strict: true });
  const current = settings.mcpServers?.knowz;
  const ownsCurrent = Boolean(current && manifest.digest === geminiEntryDigest(current));
  if (ownsCurrent) {
    const knowzCodeManifest = readGeminiMcpOwnershipManifest(settingsPath, {
      strict: false,
      owner: 'knowzcode',
    });
    if (knowzCodeManifest.digest === geminiEntryDigest(current)
        && hasKnowzCodeGeminiInstallation(settingsPath)) {
      log.info('Preserved co-owned Gemini Knowz MCP configuration.');
      return 'shared';
    }
  }
  if (current && !ownsCurrent) {
    if (claimSharedGeminiMcpEntry(settingsPath)) return 'shared';
    if (existsSync(manifest.manifestPath)) rmSync(manifest.manifestPath, { force: true });
    log.info('Preserved existing unowned Gemini Knowz MCP configuration.');
    return 'preserved';
  }
  ensureDir(dirname(settingsPath));
  if (!settings.mcpServers) settings.mcpServers = {};
  settings.mcpServers.knowz = entry;
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  writeGeminiMcpManifest(manifest.manifestPath, geminiEntryDigest(entry));
  return ownsCurrent ? 'updated' : 'created';
}

// Gemini: .gemini/settings.json with mcpServers.knowz
function writeGeminiMcpConfig(settingsPath, apiKey, projectPath, endpoint) {
  return writeOwnedGeminiMcpEntry(settingsPath, {
    httpUrl: endpoint || MCP_ENDPOINT,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'X-Project-Path': projectPath,
    },
  });
}

function writeGeminiMcpOAuthConfig(settingsPath, endpoint) {
  return writeOwnedGeminiMcpEntry(settingsPath, {
    httpUrl: endpoint || MCP_ENDPOINT,
    authProviderType: 'dynamic_discovery',
  });
}

function hasGeminiOAuthConfig(settingsPath) {
  if (!existsSync(settingsPath)) return false;
  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    return !!(settings.mcpServers?.knowz?.authProviderType);
  } catch { return false; }
}

function removeGeminiMcpConfig(settingsPath) {
  const manifest = readGeminiMcpOwnershipManifest(settingsPath, { strict: true });
  if (!manifest.digest) return false;
  const settings = readGeminiSettingsOrThrow(settingsPath);
  const current = settings.mcpServers?.knowz;
  const ownsCurrent = Boolean(current && manifest.digest === geminiEntryDigest(current));
  const knowzCodeManifest = readGeminiMcpOwnershipManifest(settingsPath, {
    strict: false,
    owner: 'knowzcode',
  });
  const knowzCodeOwnsCurrent = Boolean(
    current && knowzCodeManifest.digest === geminiEntryDigest(current)
  );
  let removedEntry = false;
  if (ownsCurrent && !(knowzCodeOwnsCurrent && hasKnowzCodeGeminiInstallation(settingsPath))) {
    delete settings.mcpServers.knowz;
    if (Object.keys(settings.mcpServers).length === 0) delete settings.mcpServers;
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
    removedEntry = true;
  }
  rmSync(manifest.manifestPath, { force: true });
  return removedEntry;
}

function updateOwnedGeminiMcpEndpoint(settingsPath, endpoint) {
  const manifest = readGeminiMcpOwnershipManifest(settingsPath, { strict: true });
  if (!manifest.digest) return false;
  const settings = readGeminiSettingsOrThrow(settingsPath);
  const current = settings.mcpServers?.knowz;
  if (!current || manifest.digest !== geminiEntryDigest(current)) return false;
  const knowzCodeManifest = readGeminiMcpOwnershipManifest(settingsPath, {
    strict: false,
    owner: 'knowzcode',
  });
  if (knowzCodeManifest.digest === geminiEntryDigest(current)
      && hasKnowzCodeGeminiInstallation(settingsPath)) return false;
  const updated = { ...current, httpUrl: endpoint };
  delete updated.url;
  delete updated.type;
  writeOwnedGeminiMcpEntry(settingsPath, updated);
  return true;
}

function hasGeminiMcpConfig(settingsPath) {
  if (!existsSync(settingsPath)) return false;
  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    return !!(settings.mcpServers && settings.mcpServers.knowz);
  } catch { return false; }
}

function getHomeDir() {
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (!homeDir || homeDir === '~') {
    throw new Error('HOME or USERPROFILE is required for global or Codex configuration operations.');
  }
  return homeDir;
}

function getCodexConfigPath() {
  return join(getHomeDir(), '.codex', 'config.toml');
}

function getTomlTableRegex(tableName) {
  return new RegExp(
    `^\\[${escapeRegExp(tableName)}\\]\\r?\\n(?:^(?!\\[).*(?:\\r?\\n|$))*`,
    'm'
  );
}

function upsertTomlTable(content, tableName, block) {
  const regex = getTomlTableRegex(tableName);
  if (regex.test(content)) {
    return content.replace(regex, block);
  }
  const trimmed = content.trimEnd();
  return trimmed ? `${trimmed}\n\n${block}` : block;
}

function removeTomlTable(content, tableName) {
  const regex = getTomlTableRegex(tableName);
  const next = content.replace(regex, '').replace(/\n{3,}/g, '\n\n').trimEnd();
  return next ? `${next}\n` : '';
}

function parseCodexMcpConfig(configPath) {
  if (!existsSync(configPath)) return null;
  try {
    const content = readFileSync(configPath, 'utf8');
    const match = content.match(getTomlTableRegex('mcp_servers.knowz'));
    if (!match) return null;
    const block = match[0];
    return {
      url: block.match(/^\s*url\s*=\s*"([^"]+)"/m)?.[1] || null,
      bearerTokenEnvVar: block.match(/^\s*bearer_token_env_var\s*=\s*"([^"]+)"/m)?.[1] || null,
      projectPath: block.match(/^\s*http_headers\s*=\s*\{[^}]*X-Project-Path\s*=\s*"([^"]+)"[^}]*\}/m)?.[1] || null,
      rawBlock: block,
    };
  } catch {
    return null;
  }
}

// Codex: shared ~/.codex/config.toml entry under [mcp_servers.knowz]
function writeCodexMcpConfig(configPath, projectPath, endpoint, tokenEnvVar = CODEX_BEARER_TOKEN_ENV_VAR) {
  endpoint = endpoint || MCP_ENDPOINT;
  ensureDir(dirname(configPath));
  const existing = existsSync(configPath) ? readFileSync(configPath, 'utf8') : '';
  const block = [
    '[mcp_servers.knowz]',
    `url = "${escapeTomlString(endpoint)}"`,
    `bearer_token_env_var = "${escapeTomlString(tokenEnvVar)}"`,
    `http_headers = { X-Project-Path = "${escapeTomlString(projectPath)}" }`,
    '',
  ].join('\n');
  writeFileSync(configPath, upsertTomlTable(existing, 'mcp_servers.knowz', block));
}

function removeCodexMcpConfig(configPath, expectedProjectPath) {
  if (!existsSync(configPath)) return false;
  const parsed = parseCodexMcpConfig(configPath);
  if (!parsed?.projectPath || resolve(parsed.projectPath) !== resolve(expectedProjectPath)) return false;
  const existing = readFileSync(configPath, 'utf8');
  const next = removeTomlTable(existing, 'mcp_servers.knowz');
  if (existing === next) return false;
  writeFileSync(configPath, next);
  return true;
}

function hasCodexMcpConfig(configPath) {
  return !!parseCodexMcpConfig(configPath);
}

function hasLegacyProjectCodexMcpConfig(configPath) {
  if (!existsSync(configPath)) return false;
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    return !!(config.servers?.knowz || config.mcpServers?.knowz);
  } catch {
    return false;
  }
}

function removeLegacyProjectCodexMcpConfig(configPath) {
  if (!existsSync(configPath)) return false;
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    let changed = false;
    if (config.servers?.knowz) {
      delete config.servers.knowz;
      if (Object.keys(config.servers).length === 0) delete config.servers;
      changed = true;
    }
    if (config.mcpServers?.knowz) {
      delete config.mcpServers.knowz;
      if (Object.keys(config.mcpServers).length === 0) delete config.mcpServers;
      changed = true;
    }
    if (changed) {
      writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
      return true;
    }
  } catch { /* ignore */ }
  return false;
}

// Cross-format API key extraction — checks both mcpServers.knowz and servers.knowz
function extractKeyFromMcpConfig(configPath) {
  if (!existsSync(configPath)) return null;
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    const knowz = config.mcpServers?.knowz || config.servers?.knowz;
    if (!knowz) return null;
    const authHeader = knowz.headers?.Authorization || knowz.headers?.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7).trim();
    }
    if (knowz.env?.KNOWZ_API_KEY) {
      return knowz.env.KNOWZ_API_KEY.trim();
    }
    return null;
  } catch { return null; }
}

function discoverApiKey(dir) {
  // 1. Existing .gemini/settings.json (check OAuth first, then API key)
  const geminiSettingsPath = join(dir, '.gemini', 'settings.json');
  if (hasGeminiOAuthConfig(geminiSettingsPath)) {
    return { key: null, source: 'existing Gemini OAuth config', isOAuth: true };
  }
  const geminiKey = extractKeyFromMcpConfig(geminiSettingsPath);
  if (geminiKey) return { key: geminiKey, source: 'existing Gemini config' };

  // 2. KNOWZ_API_KEY env var
  const envKey = process.env.KNOWZ_API_KEY?.trim();
  if (envKey) return { key: envKey, source: 'KNOWZ_API_KEY environment variable' };

  // 2.5 Existing Codex shared config paired with an environment variable
  const codexConfig = parseCodexMcpConfig(getCodexConfigPath());
  if (codexConfig?.bearerTokenEnvVar) {
    const configuredEnvKey = process.env[codexConfig.bearerTokenEnvVar]?.trim();
    if (configuredEnvKey) {
      return {
        key: configuredEnvKey,
        source: `Codex shared config (${codexConfig.bearerTokenEnvVar})`,
      };
    }
  }

  // 3. Cross-platform configs
  const crossPlatformSources = [
    { path: join(dir, '.mcp.json'), label: 'project MCP config (.mcp.json)' },
    { path: join(dir, '.vscode', 'mcp.json'), label: 'VS Code / Copilot config' },
    { path: join(dir, '.cursor', 'mcp.json'), label: 'Cursor config' },
    { path: join(dir, '.claude', 'settings.local.json'), label: 'Claude Code config' },
  ];
  for (const { path, label } of crossPlatformSources) {
    const key = extractKeyFromMcpConfig(path);
    if (key) return { key, source: label };
  }

  return null;
}

// ─── Interactive Prompts ─────────────────────────────────────────────────────

async function promptPlatforms(detected) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ids = Object.keys(PLATFORMS);

  console.log('');
  console.log(`${c.bold}Select platforms to install for:${c.reset}`);
  console.log('');
  ids.forEach((id, i) => {
    const p = PLATFORMS[id];
    const tag = detected.includes(id) ? ` ${c.green}(detected)${c.reset}` : '';
    console.log(`  [${i + 1}] ${p.name}${tag}`);
  });
  console.log(`  [A] All platforms`);
  console.log(`  [S] Skip`);
  console.log('');

  const answer = await rl.question('Select platforms (comma-separated, e.g. 1,2): ');
  rl.close();

  const trimmed = answer.trim().toUpperCase();
  if (trimmed === 'S' || trimmed === '') return [];
  if (trimmed === 'A') return ids;

  const selected = [];
  for (const part of trimmed.split(',')) {
    const num = parseInt(part.trim(), 10);
    if (num >= 1 && num <= ids.length) {
      selected.push(ids[num - 1]);
    }
  }
  return [...new Set(selected)];
}

async function promptConfirm(message, defaultYes = false) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const hint = defaultYes ? '[Y/n]' : '[y/N]';
  const answer = await rl.question(`${message} ${hint}: `);
  rl.close();
  const val = answer.trim().toLowerCase();
  if (val === '') return defaultYes;
  return val === 'y' || val === 'yes';
}

// ─── Installation Detection ──────────────────────────────────────────────────

function installBase(dir, opts = {}) {
  return opts.global ? getHomeDir() : dir;
}

function isInstalled(dir, opts = {}) {
  const base = installBase(dir, opts);
  // Check for knowz-mcp installed components
  return (
    existsSync(join(base, '.claude', CLAUDE_COMPONENT_MANIFEST)) ||
    existsSync(join(base, '.claude', 'skills', 'knowz')) ||
    existsSync(join(base, '.agents', 'skills', CODEX_SKILL_MANIFEST)) ||
    existsSync(join(base, '.agents', 'skills', 'knowz-ask')) ||
    existsSync(join(base, '.gemini', 'commands', 'knowz'))
  );
}

function detectInstalledPlatforms(dir, opts = {}) {
  const base = installBase(dir, opts);
  const installed = [];
  if (existsSync(join(base, '.claude', CLAUDE_COMPONENT_MANIFEST))
      || existsSync(join(base, '.claude', 'skills', 'knowz'))) installed.push('claude');
  // Skills in .agents/skills/ are shared — detect Codex by skills, Gemini by TOML commands
  if (existsSync(join(base, '.agents', 'skills', CODEX_SKILL_MANIFEST))
      || existsSync(join(base, '.agents', 'skills', 'knowz-ask'))) installed.push('codex');
  if (existsSync(join(base, '.gemini', 'commands', 'knowz', GEMINI_COMMAND_MANIFEST))
      || existsSync(join(base, '.gemini', 'commands', 'knowz'))) installed.push('gemini');
  return installed;
}

function hasKnowzCode(dir) {
  return existsSync(join(dir, 'knowzcode')) || existsSync(join(dir, '.claude', 'skills', 'work'));
}

// ─── Install Logic ───────────────────────────────────────────────────────────

function installClaude(dir, opts) {
  const homeDir = opts.global ? getHomeDir() : null;
  const claudeDir = opts.global
    ? join(homeDir, '.claude')
    : join(dir, '.claude');

  log.info(`Installing Claude Code components to ${claudeDir}/`);

  // Preflight has already proved every existing same-name directory is either
  // manifest-owned or an exact legacy Knowz install. Recreate those skill
  // directories so files removed from a newer package cannot survive upgrade.
  prepareManagedClaudeSkillsForCopy(claudeDir);
  copyDirContents(join(PKG_ROOT, 'agents'), join(claudeDir, 'agents'));
  copyClaudeSkillsForLocalInstall(join(PKG_ROOT, 'skills'), join(claudeDir, 'skills'));
  reconcileManagedClaudeComponents(claudeDir);

  log.ok(`Claude Code: skills + agents installed to ${claudeDir}/`);
  return [claudeDir + '/skills/', claudeDir + '/agents/'];
}

function installCodexGemini(dir, selectedPlatforms, opts, templates) {
  const installedFiles = [];
  const installBase = opts.global ? getHomeDir() : dir;

  // Skills always go to .agents/skills/ — shared by both Codex and Gemini
  const codexTemplateSet = templates.get('codex');
  if (codexTemplateSet) {
    const currentEntries = packagedCodexSkillEntries(codexTemplateSet);
    // Replace only exact manifest-owned (or exact generated-legacy) skill
    // directories, keeping all unrelated shared .agents/skills entries intact.
    prepareManagedCodexSkillsForCopy(join(installBase, '.agents', 'skills'), currentEntries);
    for (const [relativePath, { content }] of codexTemplateSet.files) {
      let filePath;
      filePath = join(installBase, relativePath);
      ensureDir(dirname(filePath));
      writeFileSync(filePath, injectVersion(content));
      installedFiles.push(filePath);
    }
    let portableFileCount = 0;
    for (const entry of PORTABLE_CODEX_SKILLS) {
      if (!currentEntries.includes(entry)) continue;
      const source = join(PKG_ROOT, 'skills', entry);
      const target = join(installBase, '.agents', 'skills', entry);
      copyDirContents(source, target);
      for (const relativePath of listRelativeFiles(source)) {
        installedFiles.push(join(target, relativePath));
        portableFileCount++;
      }
    }
    reconcileManagedCodexSkills(join(installBase, '.agents', 'skills'), currentEntries);
    log.ok(`Skills: ${codexTemplateSet.files.size + portableFileCount} file(s) installed to .agents/skills/`);
  }

  // Gemini TOML commands go to .gemini/commands/knowz/
  if (selectedPlatforms.includes('gemini')) {
    const geminiTemplateSet = templates.get('gemini');
    if (geminiTemplateSet && geminiTemplateSet.files.size > 0) {
      for (const [relativePath, { content }] of geminiTemplateSet.files) {
        const filePath = join(installBase, relativePath);
        ensureDir(dirname(filePath));
        writeFileSync(filePath, injectVersion(content));
        installedFiles.push(filePath);
      }
      const commandEntries = [...new Set([...geminiTemplateSet.files.keys()]
        .map((relativePath) => relativePath.match(/^\.gemini\/commands\/knowz\/([^/]+\.toml)$/)?.[1])
        .filter(Boolean))].sort();
      reconcileManagedGeminiCommands(join(installBase, '.gemini', 'commands', 'knowz'), commandEntries);
      log.ok(`Gemini CLI: ${geminiTemplateSet.files.size} TOML command(s) installed`);
    }
  }

  return installedFiles;
}

async function configureMcp(dir, selectedPlatforms, opts) {
  const needsCodex = selectedPlatforms.includes('codex');
  const needsGemini = selectedPlatforms.includes('gemini');
  const installBase = opts.global ? getHomeDir() : dir;

  // Claude MCP is configured via /knowz setup inside Claude Code — not by this CLI
  if (!needsCodex && !needsGemini) {
    if (selectedPlatforms.includes('claude')) {
      log.info('Claude Code MCP: configure inside Claude Code via /knowz setup or /knowz register');
    }
    return;
  }

  // Check for existing config
  const geminiSettingsPath = join(installBase, '.gemini', 'settings.json');
  const codexConfigPath = needsCodex ? getCodexConfigPath() : null;

  const geminiConfigured = needsGemini && hasGeminiMcpConfig(geminiSettingsPath);
  const codexConfigured = needsCodex && hasCodexMcpConfig(codexConfigPath);

  if (geminiConfigured) claimSharedGeminiMcpEntry(geminiSettingsPath);

  if (geminiConfigured && codexConfigured) {
    log.info('MCP already configured for all selected platforms');
    return;
  }
  if (geminiConfigured && !needsCodex) {
    log.info('Gemini MCP already configured');
    return;
  }
  if (codexConfigured && !needsGemini) {
    log.info('Codex MCP already configured');
    return;
  }

  // Try CLI flag first
  if (opts.mcpKey) {
    const endpoint = opts.mcpEndpoint || MCP_ENDPOINT;
    if (needsCodex && !codexConfigured) {
      process.env[CODEX_BEARER_TOKEN_ENV_VAR] = opts.mcpKey;
      writeCodexMcpConfig(codexConfigPath, dir, endpoint);
      log.ok(`Codex MCP configured in ${codexConfigPath} (${endpoint})`);
      log.info(`Persist ${CODEX_BEARER_TOKEN_ENV_VAR} in your shell before starting Codex.`);
    }
    if (needsGemini && !geminiConfigured) {
      writeGeminiMcpConfig(geminiSettingsPath, opts.mcpKey, dir, endpoint);
      log.ok(`Gemini MCP configured with API key in .gemini/settings.json (${endpoint})`);
    }
    return;
  }

  // Discover existing key
  const discovered = discoverApiKey(installBase);

  if (discovered?.isOAuth && needsGemini && !geminiConfigured) {
    writeGeminiMcpOAuthConfig(geminiSettingsPath, opts.mcpEndpoint);
    log.ok(`Gemini MCP configured with OAuth in .gemini/settings.json (${opts.mcpEndpoint || MCP_ENDPOINT})`);
    log.info('Run /mcp auth knowz in Gemini CLI to complete authentication.');
  }

  if (discovered?.key) {
    const last4 = discovered.key.slice(-4);
    const reuse = await promptConfirm(
      `Found existing API key (ending ...${last4}) from ${discovered.source}. Use this key?`,
      true
    );

    if (reuse) {
      const endpoint = opts.mcpEndpoint || MCP_ENDPOINT;
      if (needsCodex && !codexConfigured) {
        writeCodexMcpConfig(codexConfigPath, dir, endpoint);
        log.ok(`Codex MCP configured in ${codexConfigPath} (${endpoint})`);
        log.info(`Ensure ${CODEX_BEARER_TOKEN_ENV_VAR} is set before starting Codex.`);
      }
      if (needsGemini && !geminiConfigured) {
        writeGeminiMcpConfig(geminiSettingsPath, discovered.key, dir, endpoint);
        log.ok(`Gemini MCP configured with API key in .gemini/settings.json (${endpoint})`);
      }
      return;
    }
  }

  // No key found — prompt
  if (!discovered) {
    console.log('');
    console.log(`${c.bold}MCP Configuration${c.reset}`);
    console.log('');
    console.log('No existing API key found. Options:');
    console.log('  1. Enter API key now');
    if (needsGemini) console.log('  2. Use OAuth (Gemini only — browser auth)');
    console.log(`  ${needsGemini ? '3' : '2'}. Skip MCP configuration`);
    console.log('');

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question('Choose: ');
    rl.close();
    const choice = answer.trim();

    if (choice === '1') {
      const rl2 = createInterface({ input: process.stdin, output: process.stdout });
      const apiKey = await rl2.question('Enter API key: ');
      rl2.close();
      const key = apiKey.trim();
      if (!key) { log.warn('No key entered — skipping MCP configuration'); return; }

      const endpoint = opts.mcpEndpoint || MCP_ENDPOINT;
      if (needsCodex && !codexConfigured) {
        process.env[CODEX_BEARER_TOKEN_ENV_VAR] = key;
        writeCodexMcpConfig(codexConfigPath, dir, endpoint);
        log.ok(`Codex MCP configured in ${codexConfigPath} (${endpoint})`);
        log.info(`Persist ${CODEX_BEARER_TOKEN_ENV_VAR} in your shell before starting Codex.`);
      }
      if (needsGemini && !geminiConfigured) {
        writeGeminiMcpConfig(geminiSettingsPath, key, dir, endpoint);
        log.ok(`Gemini MCP configured with API key in .gemini/settings.json (${endpoint})`);
      }
    } else if (choice === '2' && needsGemini) {
      writeGeminiMcpOAuthConfig(geminiSettingsPath, opts.mcpEndpoint);
      log.ok(`Gemini MCP configured with OAuth in .gemini/settings.json (${opts.mcpEndpoint || MCP_ENDPOINT})`);
      log.info('Run /mcp auth knowz in Gemini CLI to complete authentication.');
      if (needsCodex) {
        log.warn('Codex shared config is API-key based in this installer; skipping Codex MCP config');
        log.info('Run: npx knowz-mcp install --mcp-key <key> --platforms codex');
      }
    } else {
      log.info('Skipping MCP configuration. Configure later with:');
      log.info(`  codex mcp add knowz --url ${opts.mcpEndpoint || MCP_ENDPOINT} --bearer-token-env-var ${CODEX_BEARER_TOKEN_ENV_VAR}`);
      log.info('  npx knowz-mcp install --mcp-key <key> --platforms gemini');
    }
  }

  // Claude reminder
  if (selectedPlatforms.includes('claude')) {
    log.info('Claude Code MCP: configure inside Claude Code via /knowz setup or /knowz register');
  }
}

// ─── Commands ────────────────────────────────────────────────────────────────

function cmdDetect(opts) {
  const dir = opts.target;
  const base = installBase(dir, opts);
  const detected = detectPlatforms(dir);
  const installed = detectInstalledPlatforms(dir, opts);

  console.log('');
  console.log(`${c.bold}${BRAND} MCP — Platform Detection${c.reset}`);
  console.log(`  Target: ${dir}`);
  console.log('');

  for (const [id, platform] of Object.entries(PLATFORMS)) {
    const det = detected.includes(id);
    const inst = installed.includes(id);
    let status;
    if (inst) status = `${c.green}installed${c.reset}`;
    else if (det) status = `${c.yellow}detected (not installed)${c.reset}`;
    else status = `${c.dim}not detected${c.reset}`;
    console.log(`  ${platform.name.padEnd(18)} ${status}`);
  }

  // MCP config status
  console.log('');
  console.log(`  ${c.bold}MCP Config:${c.reset}`);
  const geminiPath = join(base, '.gemini', 'settings.json');
  const codexConfigPath = getCodexConfigPath();
  const legacyCodexProjectPath = join(dir, '.mcp.json');
  const codexConfig = parseCodexMcpConfig(codexConfigPath);
  console.log(`  Gemini (.gemini/settings.json): ${hasGeminiMcpConfig(geminiPath) ? c.green + 'configured' + c.reset : c.dim + 'not configured' + c.reset}`);
  console.log(`  Codex (${codexConfigPath}): ${codexConfig ? c.green + 'configured' + c.reset : c.dim + 'not configured' + c.reset}`);
  if (codexConfig?.bearerTokenEnvVar) {
    const envStatus = process.env[codexConfig.bearerTokenEnvVar]?.trim()
      ? c.green + 'set' + c.reset
      : c.yellow + 'not set' + c.reset;
    console.log(`  Codex token env (${codexConfig.bearerTokenEnvVar}): ${envStatus}`);
  }
  if (hasLegacyProjectCodexMcpConfig(legacyCodexProjectPath)) {
    console.log(`  Legacy Codex (.mcp.json):      ${c.yellow}detected${c.reset}`);
  }

  if (hasKnowzCode(dir)) {
    console.log('');
    console.log(`  ${c.cyan}KnowzCode detected${c.reset} — MCP configuration will be shared`);
  }

  console.log('');
}

async function cmdInstall(opts) {
  const dir = opts.target;

  console.log('');
  console.log(`${c.bold}${BRAND} MCP v${VERSION} — Install${c.reset}`);
  console.log(`  Target: ${dir}`);
  console.log('');

  // Resolve platforms
  let selectedPlatforms = opts.platforms;
  if (selectedPlatforms.includes('all')) {
    selectedPlatforms = Object.keys(PLATFORMS);
  }

  if (selectedPlatforms.length === 0) {
    const detected = detectPlatforms(dir);
    if (detected.length > 0 && opts.force) {
      selectedPlatforms = detected;
    } else if (detected.length > 0) {
      selectedPlatforms = await promptPlatforms(detected);
    } else {
      log.warn('No platforms detected. Use --platforms to specify (claude,codex,gemini,all)');
      return;
    }
  }

  if (selectedPlatforms.length === 0) {
    log.info('No platforms selected.');
    return;
  }

  const platformNames = selectedPlatforms.map(id => PLATFORMS[id]?.name || id).join(', ');
  log.info(`Installing for: ${platformNames}`);

  // Check existing installation
  if (!opts.force && isInstalled(dir, opts)) {
    const already = detectInstalledPlatforms(dir, opts);
    log.warn(`${BRAND} MCP is already installed for: ${already.join(', ')}`);
    const proceed = await promptConfirm('Reinstall (overwrite)?', false);
    if (!proceed) { log.info('Cancelled.'); return; }
  }

  // Parse adapter templates for Codex/Gemini
  const templates = parseAdapterTemplates();
  preflightInstallation(dir, selectedPlatforms, opts, templates);

  // Install per platform
  const allFiles = [];

  if (selectedPlatforms.includes('claude')) {
    allFiles.push(...installClaude(dir, opts));
  }

  const codexGeminiPlatforms = selectedPlatforms.filter(p => p !== 'claude');
  if (codexGeminiPlatforms.length > 0) {
    allFiles.push(...installCodexGemini(dir, selectedPlatforms, opts, templates));
  }

  // Configure MCP
  await configureMcp(dir, selectedPlatforms, opts);

  // Coexistence note
  if (hasKnowzCode(dir)) {
    console.log('');
    log.info(`${c.cyan}KnowzCode detected${c.reset} — both plugins share the same MCP server entry`);
  }

  // Summary
  console.log('');
  console.log(`${c.green}${c.bold}${BRAND} MCP v${VERSION} installed successfully!${c.reset}`);
  console.log('');
  console.log(`  ${c.bold}Installed:${c.reset} ${platformNames}`);
  console.log('');
  console.log(`  ${c.bold}Next steps:${c.reset}`);
  if (selectedPlatforms.includes('claude')) {
    console.log('    Claude Code: /knowz register  or  /knowz setup <api-key>');
  }
  if (selectedPlatforms.includes('codex')) {
    console.log(`    Codex:       codex mcp add knowz --url ${opts.mcpEndpoint || MCP_ENDPOINT} --bearer-token-env-var ${CODEX_BEARER_TOKEN_ENV_VAR}`);
    console.log(`                  then set ${CODEX_BEARER_TOKEN_ENV_VAR} and restart Codex`);
  }
  if (selectedPlatforms.includes('gemini')) {
    console.log('    Gemini:      /knowz-setup  or  /mcp auth knowz');
  }
  console.log('');
}

async function cmdUninstall(opts) {
  const dir = opts.target;
  const base = installBase(dir, opts);

  console.log('');
  console.log(`${c.bold}${BRAND} MCP — Uninstall${c.reset}`);
  console.log(`  Target: ${dir}`);
  console.log('');

  if (!opts.force) {
    const proceed = await promptConfirm(`Remove ${BRAND} MCP components from this project?`, false);
    if (!proceed) { log.info('Cancelled.'); return; }
  }

  const removed = [];

  // Resolve every ownership manifest before deleting anything. A malformed
  // manifest fails closed and preserves the complete installation.
  const claudeDir = join(base, '.claude');
  assertSafeDestination(base, claudeDir, 'Claude installation root', 'directory');
  assertSafeDestination(base, join(claudeDir, CLAUDE_COMPONENT_MANIFEST),
    'Claude ownership manifest', 'file');
  const claudeManifest = readClaudeOwnershipForUninstall(claudeDir);
  const codexSkillRoot = join(base, '.agents', 'skills');
  assertSafeDestination(base, codexSkillRoot, 'Codex skill root', 'directory');
  assertSafeDestination(base, join(codexSkillRoot, CODEX_SKILL_MANIFEST),
    'Codex skill ownership manifest', 'file');
  const codexManifest = readCodexOwnershipForUninstall(codexSkillRoot);
  const geminiCommandRoot = join(base, '.gemini', 'commands', 'knowz');
  assertSafeDestination(base, geminiCommandRoot, 'Gemini command root', 'directory');
  assertSafeDestination(base, join(geminiCommandRoot, GEMINI_COMMAND_MANIFEST),
    'Gemini command ownership manifest', 'file');
  const geminiManifest = readGeminiOwnershipForUninstall(geminiCommandRoot);
  for (const entry of claudeManifest.agents) {
    assertSafeDestination(base, join(claudeDir, 'agents', entry), `Claude agent ${entry}`, 'file');
  }
  for (const entry of claudeManifest.skills) {
    assertSafeDestination(base, join(claudeDir, 'skills', entry), `Claude skill ${entry}`, 'directory');
  }
  for (const entry of codexManifest.entries) {
    assertSafeDestination(base, join(codexSkillRoot, entry), `Codex skill ${entry}`, 'directory');
  }
  for (const entry of geminiManifest.entries) {
    assertSafeDestination(base, join(geminiCommandRoot, entry), `Gemini command ${entry}`, 'file');
  }
  const geminiSettingsPath = join(base, '.gemini', 'settings.json');
  const geminiMcpManifestPath = join(base, '.gemini', GEMINI_MCP_MANIFEST);
  const codexConfigPath = getCodexConfigPath();
  const legacyCodexProjectPath = join(dir, '.mcp.json');
  assertSafeDestination(base, geminiSettingsPath, 'Gemini settings', 'file');
  assertSafeDestination(base, geminiMcpManifestPath, 'Gemini MCP ownership manifest', 'file');
  assertSafeDestination(base, join(base, '.gemini', KNOWZCODE_GEMINI_MCP_MANIFEST),
    'shared KnowzCode Gemini MCP ownership manifest', 'file');
  assertSafeDestination(getHomeDir(), codexConfigPath, 'Codex MCP configuration', 'file');
  readGeminiSettingsOrThrow(geminiSettingsPath);
  readGeminiMcpOwnershipManifest(geminiSettingsPath, { strict: true });
  if (!opts.global) {
    assertSafeDestination(dir, legacyCodexProjectPath, 'Legacy project MCP configuration', 'file');
    readJsonObjectOrThrow(legacyCodexProjectPath, 'Legacy project MCP configuration');
  }

  for (const skill of claudeManifest.skills) {
    const skillPath = join(claudeDir, 'skills', skill);
    if (existsSync(skillPath)) {
      rmSync(skillPath, { recursive: true, force: true });
      removed.push(`.claude/skills/${skill}/`);
    }
  }
  for (const agent of claudeManifest.agents) {
    const agentPath = join(claudeDir, 'agents', agent);
    if (existsSync(agentPath)) {
      rmSync(agentPath, { force: true });
      removed.push(`.claude/agents/${agent}`);
    }
  }
  if (existsSync(claudeManifest.manifestPath)) {
    rmSync(claudeManifest.manifestPath, { force: true });
    removed.push('.claude/.knowz-managed.json');
  }

  for (const entry of codexManifest.entries) {
    const skillPath = join(codexSkillRoot, entry);
    if (existsSync(skillPath)) {
      rmSync(skillPath, { recursive: true, force: true });
      removed.push(`.agents/skills/${entry}/`);
    }
  }
  if (existsSync(codexManifest.manifestPath)) {
    rmSync(codexManifest.manifestPath, { force: true });
    removed.push('.agents/skills/.knowz-managed.json');
  }

  for (const entry of geminiManifest.entries) {
    const commandPath = join(geminiCommandRoot, entry);
    if (existsSync(commandPath)) {
      rmSync(commandPath, { force: true });
      removed.push(`.gemini/commands/knowz/${entry}`);
    }
  }
  if (existsSync(geminiManifest.manifestPath)) {
    rmSync(geminiManifest.manifestPath, { force: true });
    removed.push('.gemini/commands/knowz/.knowz-managed.json');
  }

  // MCP config removal
  if (removeGeminiMcpConfig(geminiSettingsPath)) {
    removed.push('Gemini MCP config (.gemini/settings.json)');
  }
  if (removeCodexMcpConfig(codexConfigPath, dir)) {
    removed.push(`Codex MCP config (${codexConfigPath})`);
  }
  if (!opts.global && removeLegacyProjectCodexMcpConfig(legacyCodexProjectPath)) {
    removed.push('Legacy Codex MCP config (.mcp.json)');
  }

  if (removed.length === 0) {
    log.info('No installed components found.');
  } else {
    console.log(`  ${c.bold}Removed:${c.reset}`);
    for (const item of removed) {
      console.log(`    - ${item}`);
    }
    console.log('');
    console.log(`  ${c.bold}Preserved:${c.reset} knowz-vaults.md, knowz-pending.md (user data)`);
  }

  console.log('');
}

async function cmdUpgrade(opts) {
  const dir = opts.target;

  console.log('');
  console.log(`${c.bold}${BRAND} MCP v${VERSION} — Upgrade${c.reset}`);
  console.log(`  Target: ${dir}`);
  console.log('');

  if (!isInstalled(dir, opts)) {
    log.err(`No ${BRAND} MCP installation found. Run \`npx knowz-mcp install\` first.`);
    return;
  }

  const installed = detectInstalledPlatforms(dir, opts);
  log.info(`Found installation for: ${installed.join(', ')}`);

  // Re-install for detected platforms
  opts.force = true;
  opts.platforms = installed;

  const templates = parseAdapterTemplates();
  preflightInstallation(dir, installed, opts, templates);

  if (installed.includes('claude')) {
    installClaude(dir, opts);
  }

  const hasNonClaude = installed.includes('codex') || installed.includes('gemini');
  if (hasNonClaude) {
    installCodexGemini(dir, installed, opts, templates);
  }

  // Preserve MCP config — don't touch it during upgrade
  const geminiPath = join(installBase(dir, opts), '.gemini', 'settings.json');
  if (hasGeminiMcpConfig(geminiPath)) {
    log.info('Preserved: Gemini MCP config (.gemini/settings.json)');

    // Update endpoint if --mcp-endpoint provided
    if (opts.mcpEndpoint) {
      const settings = readGeminiSettingsOrThrow(geminiPath);
      const currentEndpoint = settings.mcpServers?.knowz?.httpUrl || settings.mcpServers?.knowz?.url;
      if (currentEndpoint !== opts.mcpEndpoint) {
        if (updateOwnedGeminiMcpEndpoint(geminiPath, opts.mcpEndpoint)) {
          log.ok(`Updated Gemini MCP endpoint to ${opts.mcpEndpoint}`);
          log.info('Run /mcp auth knowz in Gemini CLI to re-authenticate with the new endpoint.');
        } else {
          log.info('Requested Gemini MCP endpoint was not applied because the entry is shared or unowned; preserved it unchanged.');
        }
      }
    }
  }
  const codexConfigPath = getCodexConfigPath();
  if (hasCodexMcpConfig(codexConfigPath)) {
    log.info(`Preserved: Codex MCP config (${codexConfigPath})`);
    if (opts.mcpEndpoint) {
      const codexConfig = parseCodexMcpConfig(codexConfigPath);
      if (codexConfig?.url && codexConfig.url !== opts.mcpEndpoint) {
        writeCodexMcpConfig(
          codexConfigPath,
          codexConfig.projectPath || dir,
          opts.mcpEndpoint,
          codexConfig.bearerTokenEnvVar || CODEX_BEARER_TOKEN_ENV_VAR
        );
        log.ok(`Updated Codex MCP endpoint to ${opts.mcpEndpoint}`);
      }
    }
  }

  console.log('');
  console.log(`${c.green}${c.bold}${BRAND} MCP upgraded to v${VERSION}${c.reset}`);
  console.log('');
}

function cmdHelp() {
  console.log(`
${c.bold}${BRAND} MCP v${VERSION}${c.reset}
Frictionless knowledge management via the ${BRAND} MCP server.

${c.bold}Usage:${c.reset}
  npx knowz-mcp <command> [options]

${c.bold}Commands:${c.reset}
  install       Install skills plus shared/project MCP config for detected platforms
  uninstall     Remove all installed components (preserves user data)
  upgrade       Update skills/agents to latest version (preserves MCP config)
  detect        Show detected platforms and installation status

${c.bold}Options:${c.reset}
  --target <dir>       Project directory (default: current directory)
  --platforms <list>   Comma-separated: claude,codex,gemini,all
  --mcp-key <key>      API key for MCP server configuration
  --mcp-endpoint <url> Custom MCP server endpoint
  --global             Install to user-level dirs (~/.claude/, ~/.agents/skills/, ~/.gemini/commands/)
  --force              Overwrite existing installation without prompting
  --version, -v        Show version
  --help, -h           Show this help

${c.bold}Examples:${c.reset}
  npx knowz-mcp install                              Auto-detect platforms and install
  npx knowz-mcp install --platforms claude,codex      Install for specific platforms
  npx knowz-mcp install --mcp-key ukz_abc123          Install with API key
  npx knowz-mcp install --global                     Install to user-level directories
  npx knowz-mcp upgrade                              Update to latest version
  npx knowz-mcp uninstall --force                    Remove without prompting

${c.bold}After installation:${c.reset}
  Claude Code:  /knowz register  or  /knowz setup <api-key>
  Codex:        codex mcp add knowz --url ${MCP_ENDPOINT} --bearer-token-env-var ${CODEX_BEARER_TOKEN_ENV_VAR}
                set ${CODEX_BEARER_TOKEN_ENV_VAR} and restart Codex
  Gemini:       /knowz-setup     or  /mcp auth knowz
`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv);

  switch (opts.command) {
    case 'version':
      console.log(VERSION);
      break;
    case 'help':
      cmdHelp();
      break;
    case 'detect':
      cmdDetect(opts);
      break;
    case 'install':
      await cmdInstall(opts);
      break;
    case 'uninstall':
      await cmdUninstall(opts);
      break;
    case 'upgrade':
      await cmdUpgrade(opts);
      break;
    default:
      if (opts.command) {
        log.err(`Unknown command: ${opts.command}`);
      }
      cmdHelp();
      break;
  }
}

main().catch((err) => {
  log.err(err.message);
  process.exit(1);
});

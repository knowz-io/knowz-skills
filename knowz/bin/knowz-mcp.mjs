#!/usr/bin/env node

// Knowz MCP CLI — Zero-dependency Node.js installer
// Usage: npx knowz-mcp [install|uninstall|upgrade|detect] [options]

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, statSync } from 'fs';
import { join, resolve, dirname } from 'path';
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

function removeStaleFiles(sourceDir, targetDir) {
  if (!existsSync(targetDir) || !existsSync(sourceDir)) return;

  const sourceFiles = new Set(
    readdirSync(sourceDir).filter((f) => f.endsWith('.md'))
  );

  for (const entry of readdirSync(targetDir)) {
    if (entry.endsWith('.md') && !sourceFiles.has(entry)) {
      const stale = join(targetDir, entry);
      if (existsSync(stale) && statSync(stale).isFile()) {
        log.info(`Removing stale file: ${stale}`);
        rmSync(stale, { force: true });
      }
    }
  }
}

function removeStaleEntries(sourceDir, targetDir) {
  if (!existsSync(targetDir) || !existsSync(sourceDir)) return;

  const sourceEntries = new Set(readdirSync(sourceDir));

  for (const entry of readdirSync(targetDir)) {
    if (!sourceEntries.has(entry)) {
      const stale = join(targetDir, entry);
      log.info(`Removing stale entry: ${stale}`);
      rmSync(stale, { recursive: true, force: true });
    }
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

// Gemini: .gemini/settings.json with mcpServers.knowz
function writeGeminiMcpConfig(settingsPath, apiKey, projectPath, endpoint) {
  endpoint = endpoint || MCP_ENDPOINT;
  ensureDir(dirname(settingsPath));
  let settings = {};
  if (existsSync(settingsPath)) {
    try { settings = JSON.parse(readFileSync(settingsPath, 'utf8')); } catch { settings = {}; }
  }
  if (!settings.mcpServers) settings.mcpServers = {};
  settings.mcpServers.knowz = {
    httpUrl: endpoint,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'X-Project-Path': projectPath,
    },
  };
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
}

function writeGeminiMcpOAuthConfig(settingsPath, endpoint) {
  endpoint = endpoint || MCP_ENDPOINT;
  ensureDir(dirname(settingsPath));
  let settings = {};
  if (existsSync(settingsPath)) {
    try { settings = JSON.parse(readFileSync(settingsPath, 'utf8')); } catch { settings = {}; }
  }
  if (!settings.mcpServers) settings.mcpServers = {};
  settings.mcpServers.knowz = {
    httpUrl: endpoint,
    authProviderType: 'dynamic_discovery',
  };
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
}

function hasGeminiOAuthConfig(settingsPath) {
  if (!existsSync(settingsPath)) return false;
  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    return !!(settings.mcpServers?.knowz?.authProviderType);
  } catch { return false; }
}

function removeGeminiMcpConfig(settingsPath) {
  if (!existsSync(settingsPath)) return false;
  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    if (settings.mcpServers && settings.mcpServers.knowz) {
      delete settings.mcpServers.knowz;
      if (Object.keys(settings.mcpServers).length === 0) delete settings.mcpServers;
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
      return true;
    }
  } catch { /* ignore */ }
  return false;
}

function hasGeminiMcpConfig(settingsPath) {
  if (!existsSync(settingsPath)) return false;
  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    return !!(settings.mcpServers && settings.mcpServers.knowz);
  } catch { return false; }
}

function getHomeDir() {
  return process.env.HOME || process.env.USERPROFILE || '~';
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

function removeCodexMcpConfig(configPath) {
  if (!existsSync(configPath)) return false;
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

function isInstalled(dir) {
  // Check for knowz-mcp installed components
  return (
    existsSync(join(dir, '.claude', 'skills', 'knowz')) ||
    existsSync(join(dir, '.agents', 'skills', 'knowz-ask')) ||
    existsSync(join(dir, '.gemini', 'skills', 'knowz-ask'))
  );
}

function detectInstalledPlatforms(dir) {
  const installed = [];
  if (existsSync(join(dir, '.claude', 'skills', 'knowz'))) installed.push('claude');
  // Skills in .agents/skills/ are shared — detect Codex by skills, Gemini by TOML commands
  if (existsSync(join(dir, '.agents', 'skills', 'knowz-ask'))) installed.push('codex');
  if (existsSync(join(dir, '.gemini', 'commands', 'knowz'))) installed.push('gemini');
  return installed;
}

function hasKnowzCode(dir) {
  return existsSync(join(dir, 'knowzcode')) || existsSync(join(dir, '.claude', 'skills', 'work'));
}

// ─── Install Logic ───────────────────────────────────────────────────────────

function installClaude(dir, opts) {
  const claudeDir = opts.global
    ? join(process.env.HOME || process.env.USERPROFILE || '~', '.claude')
    : join(dir, '.claude');

  log.info(`Installing Claude Code components to ${claudeDir}/`);

  if (opts.force) {
    removeStaleFiles(join(PKG_ROOT, 'agents'), join(claudeDir, 'agents'));
    removeStaleEntries(join(PKG_ROOT, 'skills'), join(claudeDir, 'skills'));
  }

  copyDirContents(join(PKG_ROOT, 'agents'), join(claudeDir, 'agents'));
  copyDirContents(join(PKG_ROOT, 'skills'), join(claudeDir, 'skills'));

  log.ok(`Claude Code: skills + agents installed to ${claudeDir}/`);
  return [claudeDir + '/skills/', claudeDir + '/agents/'];
}

function installCodexGemini(dir, selectedPlatforms, opts, templates) {
  const installedFiles = [];
  const homeDir = process.env.HOME || process.env.USERPROFILE || '~';

  // Skills always go to .agents/skills/ — shared by both Codex and Gemini
  const codexTemplateSet = templates.get('codex');
  if (codexTemplateSet) {
    for (const [relativePath, { content }] of codexTemplateSet.files) {
      let filePath;
      if (opts.global && relativePath.startsWith('.agents/skills/')) {
        filePath = join(homeDir, relativePath);
      } else {
        filePath = join(dir, relativePath);
      }
      ensureDir(dirname(filePath));
      writeFileSync(filePath, injectVersion(content));
      installedFiles.push(filePath);
    }
    log.ok(`Skills: ${codexTemplateSet.files.size} file(s) installed to .agents/skills/`);
  }

  // Gemini TOML commands go to .gemini/commands/knowz/
  if (selectedPlatforms.includes('gemini')) {
    const geminiTemplateSet = templates.get('gemini');
    if (geminiTemplateSet && geminiTemplateSet.files.size > 0) {
      for (const [relativePath, { content }] of geminiTemplateSet.files) {
        const filePath = join(dir, relativePath);
        ensureDir(dirname(filePath));
        writeFileSync(filePath, injectVersion(content));
        installedFiles.push(filePath);
      }
      log.ok(`Gemini CLI: ${geminiTemplateSet.files.size} TOML command(s) installed`);
    }
  }

  // Clean up legacy .gemini/skills/knowz-* from older installations
  const geminiSkillDir = join(dir, '.gemini', 'skills');
  if (existsSync(geminiSkillDir)) {
    let cleaned = 0;
    for (const entry of readdirSync(geminiSkillDir)) {
      if (entry.startsWith('knowz-')) {
        rmSync(join(geminiSkillDir, entry), { recursive: true, force: true });
        cleaned++;
      }
    }
    if (cleaned > 0) {
      log.info(`Migrated ${cleaned} skill(s) from .gemini/skills/ to .agents/skills/`);
    }
  }

  return installedFiles;
}

async function configureMcp(dir, selectedPlatforms, opts) {
  const needsCodex = selectedPlatforms.includes('codex');
  const needsGemini = selectedPlatforms.includes('gemini');

  // Claude MCP is configured via /knowz setup inside Claude Code — not by this CLI
  if (!needsCodex && !needsGemini) {
    if (selectedPlatforms.includes('claude')) {
      log.info('Claude Code MCP: configure inside Claude Code via /knowz setup or /knowz register');
    }
    return;
  }

  // Check for existing config
  const geminiSettingsPath = join(dir, '.gemini', 'settings.json');
  const codexConfigPath = getCodexConfigPath();

  const geminiConfigured = needsGemini && hasGeminiMcpConfig(geminiSettingsPath);
  const codexConfigured = needsCodex && hasCodexMcpConfig(codexConfigPath);

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
  const discovered = discoverApiKey(dir);

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
  const detected = detectPlatforms(dir);
  const installed = detectInstalledPlatforms(dir);

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
  const geminiPath = join(dir, '.gemini', 'settings.json');
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
  if (!opts.force && isInstalled(dir)) {
    const already = detectInstalledPlatforms(dir);
    log.warn(`${BRAND} MCP is already installed for: ${already.join(', ')}`);
    const proceed = await promptConfirm('Reinstall (overwrite)?', false);
    if (!proceed) { log.info('Cancelled.'); return; }
  }

  // Parse adapter templates for Codex/Gemini
  const templates = parseAdapterTemplates();

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
  const homeDir = process.env.HOME || process.env.USERPROFILE || '~';

  console.log('');
  console.log(`${c.bold}${BRAND} MCP — Uninstall${c.reset}`);
  console.log(`  Target: ${dir}`);
  console.log('');

  if (!opts.force) {
    const proceed = await promptConfirm(`Remove ${BRAND} MCP components from this project?`, false);
    if (!proceed) { log.info('Cancelled.'); return; }
  }

  const removed = [];

  // Claude components
  const claudeSkillDir = join(dir, '.claude', 'skills');
  for (const skill of ['knowz', 'knowz-auto']) {
    const skillPath = join(claudeSkillDir, skill);
    if (existsSync(skillPath)) {
      rmSync(skillPath, { recursive: true, force: true });
      removed.push(`.claude/skills/${skill}/`);
    }
  }
  const claudeAgentDir = join(dir, '.claude', 'agents');
  for (const agent of ['reader.md', 'writer.md', 'knowledge-worker.md']) {
    const agentPath = join(claudeAgentDir, agent);
    if (existsSync(agentPath)) {
      rmSync(agentPath, { force: true });
      removed.push(`.claude/agents/${agent}`);
    }
  }

  // Codex skills
  const agentsSkillDir = join(dir, '.agents', 'skills');
  if (existsSync(agentsSkillDir)) {
    for (const entry of readdirSync(agentsSkillDir)) {
      if (entry.startsWith('knowz-')) {
        rmSync(join(agentsSkillDir, entry), { recursive: true, force: true });
        removed.push(`.agents/skills/${entry}/`);
      }
    }
  }

  // Global Codex skills
  const globalAgentsSkillDir = join(homeDir, '.agents', 'skills');
  if (existsSync(globalAgentsSkillDir)) {
    for (const entry of readdirSync(globalAgentsSkillDir)) {
      if (entry.startsWith('knowz-')) {
        rmSync(join(globalAgentsSkillDir, entry), { recursive: true, force: true });
        removed.push(`~/.agents/skills/${entry}/`);
      }
    }
  }

  // Gemini commands
  const geminiCmdDir = join(dir, '.gemini', 'commands', 'knowz');
  if (existsSync(geminiCmdDir)) {
    rmSync(geminiCmdDir, { recursive: true, force: true });
    removed.push('.gemini/commands/knowz/');
  }

  // MCP config removal
  const geminiSettingsProject = join(dir, '.gemini', 'settings.json');
  if (removeGeminiMcpConfig(geminiSettingsProject)) {
    removed.push('Gemini MCP config (.gemini/settings.json)');
  }
  const codexConfigPath = getCodexConfigPath();
  if (removeCodexMcpConfig(codexConfigPath)) {
    removed.push(`Codex MCP config (${codexConfigPath})`);
  }
  const legacyCodexProjectPath = join(dir, '.mcp.json');
  if (removeLegacyProjectCodexMcpConfig(legacyCodexProjectPath)) {
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

  if (!isInstalled(dir)) {
    log.err(`No ${BRAND} MCP installation found. Run \`npx knowz-mcp install\` first.`);
    return;
  }

  const installed = detectInstalledPlatforms(dir);
  log.info(`Found installation for: ${installed.join(', ')}`);

  // Re-install for detected platforms
  opts.force = true;
  opts.platforms = installed;

  const templates = parseAdapterTemplates();

  if (installed.includes('claude')) {
    installClaude(dir, opts);
  }

  const hasNonClaude = installed.includes('codex') || installed.includes('gemini');
  if (hasNonClaude) {
    // Stale cleanup for shared skills in .agents/skills/
    const agentsSkillDir = join(dir, '.agents', 'skills');
    if (existsSync(agentsSkillDir)) {
      const codexTemplateSet = templates.get('codex');
      if (codexTemplateSet) {
        const currentPaths = new Set([...codexTemplateSet.files.keys()]);
        for (const entry of readdirSync(agentsSkillDir)) {
          if (entry.startsWith('knowz-') && !currentPaths.has(`.agents/skills/${entry}/SKILL.md`)) {
            log.info(`Removing stale skill: .agents/skills/${entry}/`);
            rmSync(join(agentsSkillDir, entry), { recursive: true, force: true });
          }
        }
      }
    }

    // Stale TOML commands
    if (installed.includes('gemini')) {
      const tomlDir = join(dir, '.gemini', 'commands', 'knowz');
      if (existsSync(tomlDir)) {
        const geminiTemplateSet = templates.get('gemini');
        if (geminiTemplateSet) {
          const currentPaths = new Set([...geminiTemplateSet.files.keys()]);
          for (const f of readdirSync(tomlDir)) {
            if (f.endsWith('.toml') && !currentPaths.has(`.gemini/commands/knowz/${f}`)) {
              log.info(`Removing stale command: .gemini/commands/knowz/${f}`);
              rmSync(join(tomlDir, f), { force: true });
            }
          }
        }
      }
    }

    installCodexGemini(dir, installed, opts, templates);
  }

  // Preserve MCP config — don't touch it during upgrade
  const geminiPath = join(dir, '.gemini', 'settings.json');
  if (hasGeminiMcpConfig(geminiPath)) {
    log.info('Preserved: Gemini MCP config (.gemini/settings.json)');

    // Update endpoint if --mcp-endpoint provided
    if (opts.mcpEndpoint) {
      try {
        const settings = JSON.parse(readFileSync(geminiPath, 'utf8'));
        const currentEndpoint = settings.mcpServers?.knowz?.httpUrl || settings.mcpServers?.knowz?.url;
        if (currentEndpoint !== opts.mcpEndpoint) {
          settings.mcpServers.knowz.httpUrl = opts.mcpEndpoint;
          delete settings.mcpServers.knowz.url;
          delete settings.mcpServers.knowz.type;
          writeFileSync(geminiPath, JSON.stringify(settings, null, 2) + '\n');
          log.ok(`Updated Gemini MCP endpoint to ${opts.mcpEndpoint}`);
          log.info('Run /mcp auth knowz in Gemini CLI to re-authenticate with the new endpoint.');
        }
      } catch { /* ignore */ }
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
  npx knowz-mcp install --mcp-key kz_live_abc123     Install with API key
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


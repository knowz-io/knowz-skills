#!/usr/bin/env node

// KnowzCode CLI — Zero-dependency Node.js installer
// Usage: npx knowzcode [install|uninstall|upgrade|detect] [options]

import { existsSync, mkdirSync, cpSync, readFileSync, writeFileSync, readdirSync, rmSync, statSync } from 'fs';
import { join, resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PKG_ROOT = resolve(__dirname, '..');
const VERSION = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8')).version;

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
    adapterPath: null, // Claude uses .claude/ dir structure, not a single adapter file
  },
  codex: {
    name: 'OpenAI Codex',
    detect: (dir) => existsSync(join(dir, 'AGENTS.md')) || existsSync(join(dir, 'AGENTS.override.md')) || existsSync(join(dir, '.codex')) || existsSync(join(dir, '.agents')),
    adapterPath: (dir) => join(dir, 'AGENTS.md'),
    templateHeader: '## OpenAI Codex (AGENTS.md)',
  },
  gemini: {
    name: 'Gemini CLI',
    detect: (dir) => existsSync(join(dir, 'GEMINI.md')) || existsSync(join(dir, '.gemini')),
    adapterPath: (dir) => join(dir, 'GEMINI.md'),
    templateHeader: '## Google Gemini CLI (GEMINI.md)',
  },
  cursor: {
    name: 'Cursor',
    detect: (dir) => existsSync(join(dir, '.cursor', 'rules')) || existsSync(join(dir, '.cursorrules')),
    adapterPath: (dir) => join(dir, '.cursor', 'rules', 'knowzcode.mdc'),
    templateHeader: '## Cursor (`.cursor/rules/knowzcode.mdc`)',
  },
  copilot: {
    name: 'GitHub Copilot',
    detect: (dir) => existsSync(join(dir, '.github', 'copilot-instructions.md')) || existsSync(join(dir, '.github')),
    adapterPath: (dir) => join(dir, '.github', 'copilot-instructions.md'),
    templateHeader: '## GitHub Copilot',
  },
  windsurf: {
    name: 'Windsurf',
    detect: (dir) => existsSync(join(dir, '.windsurf', 'rules')) || existsSync(join(dir, '.windsurfrules')),
    adapterPath: (dir) => join(dir, '.windsurf', 'rules', 'knowzcode.md'),
    templateHeader: '## Windsurf (`.windsurf/rules/knowzcode.md`)',
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
    clean: false,
    global: false,
    verbose: false,
    agentTeams: false,
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
    } else if (arg === '--clean') {
      opts.clean = true;
    } else if (arg === '--global') {
      opts.global = true;
    } else if (arg === '--agent-teams') {
      opts.agentTeams = true;
    } else if (arg === '--verbose') {
      opts.verbose = true;
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

// ─── Adapter Template Parser ─────────────────────────────────────────────────
// Returns Map<platformId, { primary: string, files: Map<relativePath, { content, lang }> }>

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
  // Track nested fences to find the matching closing fence
  let depth = 0;
  let pos = contentStart;
  while (pos < text.length) {
    const nextFence = text.indexOf('\n```', pos);
    if (nextFence === -1) return null;
    const afterBackticks = nextFence + 4;
    const charAfter = afterBackticks < text.length ? text[afterBackticks] : undefined;
    if (charAfter && /\w/.test(charAfter)) {
      // Opening fence (```bash, ```json, etc.)
      depth++;
    } else {
      // Closing fence (``` followed by whitespace/newline/EOF)
      if (depth === 0) {
        return { content: text.slice(contentStart, nextFence), endIdx: afterBackticks };
      }
      depth--;
    }
    pos = afterBackticks;
  }
  return null;
}

function parseCopilotSection(section) {
  const files = new Map();

  // Section A: copilot-instructions.md (first ```markdown before ### B.)
  const sectionBIdx = section.indexOf('### B.');
  const sectionA = sectionBIdx !== -1 ? section.slice(0, sectionBIdx) : section;
  const primaryFence = extractFence(sectionA, 'markdown');
  if (!primaryFence) return null;

  // Section B: prompt files (#### knowzcode-*.prompt.md headers)
  const headerRegex = /#### (knowzcode-[\w-]+\.prompt\.md)/g;
  const headers = [];
  let match;
  while ((match = headerRegex.exec(section)) !== null) {
    headers.push({ filename: match[1], index: match.index });
  }

  const sectionCIdx = section.indexOf('### C.');
  for (let i = 0; i < headers.length; i++) {
    const start = headers[i].index;
    const end = i + 1 < headers.length
      ? headers[i + 1].index
      : (sectionCIdx !== -1 && sectionCIdx > start ? sectionCIdx : section.length);
    const subSection = section.slice(start, end);

    const fenceOpen = subSection.indexOf('```markdown');
    if (fenceOpen === -1) continue;
    const contentStart = subSection.indexOf('\n', fenceOpen) + 1;
    // Use lastIndexOf to handle prompt files that contain inner code fences
    const lastFenceClose = subSection.lastIndexOf('\n```');
    if (lastFenceClose <= contentStart) continue;

    files.set(`.github/prompts/${headers[i].filename}`, {
      content: subSection.slice(contentStart, lastFenceClose),
      lang: 'markdown',
    });
  }

  // Section C: .vscode/mcp.json
  if (sectionCIdx !== -1) {
    const sectionDIdx = section.indexOf('### D.', sectionCIdx);
    const sectionC = section.slice(sectionCIdx, sectionDIdx !== -1 ? sectionDIdx : section.length);
    const jsonFence = extractFence(sectionC, 'json');
    if (jsonFence) {
      files.set('.vscode/mcp.json', { content: jsonFence.content, lang: 'json' });
    }
  }

  return { primary: primaryFence.content, files };
}

function parseGeminiSection(section) {
  const files = new Map();

  // Extract TOML blocks: ```toml fences with # .gemini/commands/knowzcode/{name}.toml comment
  let searchFrom = 0;
  while (true) {
    const fenceStart = section.indexOf('```toml', searchFrom);
    if (fenceStart === -1) break;
    const contentStart = section.indexOf('\n', fenceStart) + 1;
    const fenceEnd = section.indexOf('\n```', contentStart);
    if (fenceEnd === -1) break;
    const tomlContent = section.slice(contentStart, fenceEnd);
    const pathMatch = tomlContent.match(/^# (\.gemini\/commands\/knowzcode\/[\w-]+\.toml)/);
    if (pathMatch) {
      files.set(pathMatch[1], { content: tomlContent, lang: 'toml' });
    }
    searchFrom = fenceEnd + 4;
  }

  // Skill files: #### .gemini/skills/knowzcode-{name}/SKILL.md headers
  const skillRegex = /#### (\.gemini\/skills\/knowzcode-[\w-]+\/SKILL\.md)/g;
  const skillHeaders = [];
  let skillMatch;
  while ((skillMatch = skillRegex.exec(section)) !== null) {
    skillHeaders.push({ filepath: skillMatch[1], index: skillMatch.index });
  }
  // Subagent files: #### .gemini/agents/knowzcode-{name}.md headers
  const agentRegex = /#### (\.gemini\/agents\/knowzcode-[\w-]+\.md)/g;
  const agentHeaders = [];
  let agentMatch;
  while ((agentMatch = agentRegex.exec(section)) !== null) {
    agentHeaders.push({ filepath: agentMatch[1], index: agentMatch.index });
  }
  // Combine all subsection headers for boundary detection
  const allSubHeaders = [...skillHeaders, ...agentHeaders].sort((a, b) => a.index - b.index);

  for (let i = 0; i < allSubHeaders.length; i++) {
    const start = allSubHeaders[i].index;
    const end = i + 1 < allSubHeaders.length ? allSubHeaders[i + 1].index : section.length;
    const subSection = section.slice(start, end);
    const fence = extractFence(subSection, 'markdown');
    if (fence) {
      files.set(allSubHeaders[i].filepath, { content: fence.content, lang: 'markdown' });
    }
  }

  // Primary: ```markdown fence (GEMINI.md) — extract from content BEFORE first skill/subagent header
  const firstSubHeader = allSubHeaders.length > 0 ? allSubHeaders[0].index : section.length;
  const primarySection = section.slice(0, firstSubHeader);
  const primaryFence = extractFence(primarySection, 'markdown');
  if (!primaryFence) return null;

  return { primary: primaryFence.content, files };
}

function parseCodexSection(section) {
  const files = new Map();

  // Primary: first ```markdown fence (AGENTS.md)
  const primaryFence = extractFence(section, 'markdown');
  if (!primaryFence) return null;

  // Skill files: #### .agents/skills/knowzcode-{name}/SKILL.md headers
  const headerRegex = /#### (\.agents\/skills\/knowzcode-[\w-]+\/SKILL\.md)/g;
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

  return { primary: primaryFence.content, files };
}

function parseSimpleSection(section) {
  const primaryFence = extractFence(section, 'markdown');
  if (!primaryFence) return null;
  return { primary: primaryFence.content, files: new Map() };
}

function parseAdapterTemplates() {
  const adaptersPath = join(PKG_ROOT, 'knowzcode', 'platform_adapters.md');
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
      case 'copilot': result = parseCopilotSection(section); break;
      case 'gemini': result = parseGeminiSection(section); break;
      case 'codex': result = parseCodexSection(section); break;
      default: result = parseSimpleSection(section); break;
    }
    if (result) templates.set(id, result);
  }

  return templates;
}

// ─── File Copy Helpers ───────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
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

function listFilesRecursive(dir, base = dir) {
  const files = [];
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(full, base));
    } else {
      files.push(full);
    }
  }
  return files;
}

// ─── Marketplace Config ──────────────────────────────────────────────────────

function setMarketplaceConfig(claudeDir) {
  ensureDir(claudeDir);
  const settingsFile = join(claudeDir, 'settings.json');
  let settings = {};

  if (existsSync(settingsFile)) {
    try {
      settings = JSON.parse(readFileSync(settingsFile, 'utf8'));
    } catch {
      settings = {};
    }
  }

  if (!settings.extraKnownMarketplaces) settings.extraKnownMarketplaces = {};
  settings.extraKnownMarketplaces['knowz-skills'] = {
    source: { source: 'url', url: 'https://github.com/knowz-io/knowz-skills.git' },
  };
  // Migrate old keys if present
  delete settings.extraKnownMarketplaces.knowzcode;
  delete settings.extraKnownMarketplaces['knowzcode-marketplace'];
  delete settings.extraKnownMarketplaces['knowz-marketplace'];
  delete settings.extraKnownMarketplaces['knowz-plugins'];

  writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + '\n');
}

function removeMarketplaceConfig(claudeDir) {
  const settingsFile = join(claudeDir, 'settings.json');
  if (!existsSync(settingsFile)) return;

  try {
    const settings = JSON.parse(readFileSync(settingsFile, 'utf8'));
    if (settings.extraKnownMarketplaces) {
      delete settings.extraKnownMarketplaces['knowz-skills'];
      delete settings.extraKnownMarketplaces['knowz-plugins']; // clean up old key
      delete settings.extraKnownMarketplaces['knowzcode-marketplace']; // clean up old key
      delete settings.extraKnownMarketplaces.knowzcode; // clean up old key too
      writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + '\n');
    }
  } catch {
    // Ignore parse errors
  }
}

// ─── Gemini MCP Config Helpers ────────────────────────────────────────────────

function writeGeminiMcpConfig(settingsPath, apiKey, projectPath, endpoint) {
  endpoint = endpoint || 'https://mcp.knowz.io/mcp';
  ensureDir(dirname(settingsPath));
  let settings = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    } catch {
      settings = {};
    }
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
  endpoint = endpoint || 'https://mcp.knowz.io/mcp';
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
  } catch {
    return false;
  }
}

function removeGeminiMcpConfig(settingsPath) {
  if (!existsSync(settingsPath)) return false;
  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    if (settings.mcpServers && settings.mcpServers.knowz) {
      delete settings.mcpServers.knowz;
      if (Object.keys(settings.mcpServers).length === 0) {
        delete settings.mcpServers;
      }
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
      return true;
    }
  } catch {
    // Ignore parse errors
  }
  return false;
}

function hasGeminiMcpConfig(settingsPath) {
  if (!existsSync(settingsPath)) return false;
  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    return !!(settings.mcpServers && settings.mcpServers.knowz);
  } catch {
    return false;
  }
}

function extractKeyFromMcpConfig(configPath) {
  if (!existsSync(configPath)) return null;
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    const knowz = config.mcpServers?.knowz;
    if (!knowz) return null;
    const authHeader = knowz.headers?.Authorization || knowz.headers?.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7).trim();
    }
    if (knowz.env?.KNOWZ_API_KEY) {
      return knowz.env.KNOWZ_API_KEY.trim();
    }
    return null;
  } catch {
    return null;
  }
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

// ─── Stale File Cleanup ─────────────────────────────────────────────────────

function removeStaleFiles(sourceDir, targetDir) {
  if (!existsSync(targetDir) || !existsSync(sourceDir)) return;

  const sourceFiles = new Set(
    readdirSync(sourceDir)
      .filter((f) => f.endsWith('.md'))
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

// ─── Tracker & Log Initializers ──────────────────────────────────────────────

function initTracker(filePath) {
  writeFileSync(filePath, `# KnowzCode - Status Map

**Purpose:** This document tracks the development status of all implementable components (NodeIDs) defined in \`knowzcode_architecture.md\`.

---
**Progress: 0%**
---

| Status | WorkGroupID | Node ID | Label | Dependencies | Logical Grouping | Spec Link | Classification | Notes / Issues |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| | | | | | | | | |

---
### Status Legend:

*   ⚪️ **\`[TODO]\`**: Task is defined and ready to be picked up if dependencies are met.
*   📝 **\`[NEEDS_SPEC]\`**: Node has been identified but requires a detailed specification.
*   ◆ **\`[WIP]\`**: Work In Progress. The KnowzCode AI Agent is currently working on this node.
*   🟢 **\`[VERIFIED]\`**: Node has been implemented and verified.
*   ❗ **\`[ISSUE]\`**: A significant issue or blocker has been identified.

---
*(This table will be populated as you define your architecture and NodeIDs.)*
`);
}

function initLog(filePath) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  writeFileSync(filePath, `# KnowzCode - Operational Record

**Purpose:** Chronological record of significant events, decisions, and verification outcomes.

---

## Section 1: Operational Log

---
**[NEWEST ENTRIES APPEAR HERE - DO NOT REMOVE THIS MARKER]**
---
**Type:** SystemInitialization
**Timestamp:** ${ts}
**NodeID(s):** Project-Wide
**Logged By:** knowzcode-cli
**Details:**
KnowzCode framework installed via \`npx knowzcode\`.
- Framework files initialized
- Ready for first feature
---

## Section 2: Reference Quality Criteria (ARC-Based Verification)

### Core Quality Criteria
1.  **Maintainability:** Ease of modification, clarity of code and design.
2.  **Reliability:** Robustness of error handling, fault tolerance.
3.  **Testability:** Adequacy of unit test coverage, ease of testing.
4.  **Performance:** Responsiveness, efficiency in resource utilization.
5.  **Security:** Resistance to common vulnerabilities.

### Structural Criteria
6.  **Readability:** Code clarity, adherence to naming conventions.
7.  **Complexity Management:** Avoidance of overly complex logic.
8.  **Modularity:** Adherence to Single Responsibility Principle.
9.  **Code Duplication (DRY):** Minimization of redundant code.
10. **Standards Compliance:** Adherence to language best practices.

*(Refer to these criteria during ARC-Based Verification.)*
`);
}

// ─── Interactive Prompt ──────────────────────────────────────────────────────

async function promptPlatforms(detected) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ids = Object.keys(PLATFORMS);

  console.log('');
  console.log(`${c.bold}Select platforms to generate adapters for:${c.reset}`);
  console.log('');
  ids.forEach((id, i) => {
    const p = PLATFORMS[id];
    const tag = detected.includes(id) ? ` ${c.green}(detected)${c.reset}` : '';
    console.log(`  [${i + 1}] ${p.name}${tag}`);
  });
  console.log(`  [A] All platforms`);
  console.log(`  [S] Skip adapters (core framework only)`);
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

// ─── Agent Teams Enablement ──────────────────────────────────────────────────

function enableAgentTeams(claudeDir, isGlobal) {
  ensureDir(claudeDir);
  const settingsFile = join(claudeDir, isGlobal ? 'settings.json' : 'settings.local.json');

  let settings = {};
  if (existsSync(settingsFile)) {
    try {
      settings = JSON.parse(readFileSync(settingsFile, 'utf8'));
    } catch {
      settings = {};
    }
  }

  if (!settings.env) settings.env = {};
  settings.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '1';

  writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + '\n');
  log.ok(`Agent Teams enabled in ${settingsFile}`);
}

// ─── Installation Scanner ────────────────────────────────────────────────────

function scanExistingInstallation(kcDir, dir) {
  const result = {
    version: null,
    specs: [],
    trackerEntries: 0,
    logEntries: 0,
    hasArchitecture: false,
    hasProject: false,
    hasPreferences: false,
    hasOrchestration: false,
    workgroups: [],
    installedPlatforms: [],
    customizedFiles: [],
  };

  // Version
  const versionFile = join(kcDir, '.knowzcode-version');
  if (existsSync(versionFile)) {
    result.version = readFileSync(versionFile, 'utf8').trim();
  }

  // Specs
  const specsDir = join(kcDir, 'specs');
  if (existsSync(specsDir)) {
    result.specs = readdirSync(specsDir).filter(f => f.endsWith('.md') && f !== 'Readme.md');
  }

  // Tracker entries (look for non-empty table rows — rows starting with |)
  const trackerFile = join(kcDir, 'knowzcode_tracker.md');
  if (existsSync(trackerFile)) {
    const content = readFileSync(trackerFile, 'utf8');
    const rows = content.split('\n').filter(line => /^\|[^:|\-]/.test(line) && !/^\| Status/.test(line) && line.trim() !== '| | | | | | | | | |');
    result.trackerEntries = rows.length;
  }

  // Log entries (count --- delimited entries beyond SystemInitialization)
  const logFile = join(kcDir, 'knowzcode_log.md');
  if (existsSync(logFile)) {
    const content = readFileSync(logFile, 'utf8');
    const typeMatches = content.match(/\*\*Type:\*\*/g);
    result.logEntries = typeMatches ? Math.max(0, typeMatches.length - 1) : 0; // -1 for SystemInitialization
  }

  // Architecture — check if edited (compare size to source template)
  const archFile = join(kcDir, 'knowzcode_architecture.md');
  const srcArch = join(PKG_ROOT, 'knowzcode', 'knowzcode_architecture.md');
  if (existsSync(archFile)) {
    const installedSize = statSync(archFile).size;
    const templateSize = existsSync(srcArch) ? statSync(srcArch).size : 0;
    result.hasArchitecture = installedSize !== templateSize;
  }

  // Project config
  const projectFile = join(kcDir, 'knowzcode_project.md');
  const srcProject = join(PKG_ROOT, 'knowzcode', 'knowzcode_project.md');
  if (existsSync(projectFile)) {
    const installedSize = statSync(projectFile).size;
    const templateSize = existsSync(srcProject) ? statSync(srcProject).size : 0;
    result.hasProject = installedSize !== templateSize;
  }

  // Preferences
  result.hasPreferences = existsSync(join(kcDir, 'user_preferences.md'));

  // Orchestration
  const orchFile = join(kcDir, 'knowzcode_orchestration.md');
  const srcOrch = join(PKG_ROOT, 'knowzcode', 'knowzcode_orchestration.md');
  if (existsSync(orchFile)) {
    const installedSize = statSync(orchFile).size;
    const templateSize = existsSync(srcOrch) ? statSync(srcOrch).size : 0;
    result.hasOrchestration = installedSize !== templateSize;
  }

  // Workgroups
  const wgDir = join(kcDir, 'workgroups');
  if (existsSync(wgDir)) {
    result.workgroups = readdirSync(wgDir).filter(f => f !== 'README.md');
  }

  // Installed platforms
  const adapterChecks = {
    claude: () => existsSync(join(dir, '.claude', 'skills')) || existsSync(join(dir, '.claude', 'agents')),
    codex: () => existsSync(join(dir, 'AGENTS.md')),
    gemini: () => existsSync(join(dir, 'GEMINI.md')),
    cursor: () => existsSync(join(dir, '.cursor', 'rules', 'knowzcode.mdc')),
    copilot: () => existsSync(join(dir, '.github', 'copilot-instructions.md')),
    windsurf: () => existsSync(join(dir, '.windsurf', 'rules', 'knowzcode.md')),
  };
  for (const [id, check] of Object.entries(adapterChecks)) {
    if (check()) result.installedPlatforms.push(id);
  }

  // Customized files — compare framework .md files against source templates
  const srcKc = join(PKG_ROOT, 'knowzcode');
  const userEditable = ['knowzcode_architecture.md', 'knowzcode_project.md', 'environment_context.md', 'user_preferences.md', 'knowzcode_orchestration.md'];
  for (const entry of userEditable) {
    const installed = join(kcDir, entry);
    const source = join(srcKc, entry);
    if (existsSync(installed) && existsSync(source)) {
      if (statSync(installed).size !== statSync(source).size) {
        result.customizedFiles.push(entry);
      }
    }
  }

  return result;
}

function displayInstallationSummary(scan, dir) {
  console.log(`  ${c.bold}KnowzCode v${scan.version || 'unknown'} detected${c.reset}`);
  console.log('');

  // User data
  const hasData = scan.specs.length > 0 || scan.trackerEntries > 0 || scan.logEntries > 0 ||
    scan.hasArchitecture || scan.hasProject || scan.hasPreferences || scan.workgroups.length > 0;

  if (hasData) {
    console.log('  Your data:');
    if (scan.specs.length > 0) {
      const specNames = scan.specs.slice(0, 5).map(s => s.replace('.md', '')).join(', ');
      const more = scan.specs.length > 5 ? `, +${scan.specs.length - 5} more` : '';
      console.log(`    ${String(scan.specs.length).padStart(2)} spec(s)         (${specNames}${more})`);
    }
    if (scan.trackerEntries > 0) console.log(`    ${String(scan.trackerEntries).padStart(2)} tracker entries`);
    if (scan.logEntries > 0) console.log(`    ${String(scan.logEntries).padStart(2)} log entries`);
    if (scan.hasArchitecture) console.log('    Architecture     customized');
    if (scan.hasProject) console.log('    Project config   customized');
    if (scan.hasPreferences) console.log('    Preferences      configured');
    if (scan.hasOrchestration) console.log('    Orchestration    customized');
    if (scan.workgroups.length > 0) console.log(`    ${String(scan.workgroups.length).padStart(2)} active workgroup(s)`);
  } else {
    console.log('  Your data:      (no customizations detected)');
  }

  // Platforms
  const detected = detectPlatforms(dir);
  console.log('');
  console.log('  Platforms:');
  for (const [id, platform] of Object.entries(PLATFORMS)) {
    const installed = scan.installedPlatforms.includes(id);
    const det = detected.includes(id);
    let status;
    if (installed) status = `${c.green}installed${c.reset}`;
    else if (det) status = `${c.yellow}detected (not installed)${c.reset}`;
    else status = `${c.dim}not installed${c.reset}`;
    console.log(`    ${platform.name.padEnd(18)} ${status}`);
  }
}

function isAdapterInstalled(platformId, dir) {
  const checks = {
    claude: () => existsSync(join(dir, '.claude', 'skills')) || existsSync(join(dir, '.claude', 'agents')),
    codex: () => existsSync(join(dir, 'AGENTS.md')),
    gemini: () => existsSync(join(dir, 'GEMINI.md')),
    cursor: () => existsSync(join(dir, '.cursor', 'rules', 'knowzcode.mdc')),
    copilot: () => existsSync(join(dir, '.github', 'copilot-instructions.md')),
    windsurf: () => existsSync(join(dir, '.windsurf', 'rules', 'knowzcode.md')),
  };
  return checks[platformId] ? checks[platformId]() : false;
}

// ─── Adapter Generation (shared helper) ──────────────────────────────────────

async function generateAdapters(dir, selectedPlatforms, opts) {
  const templates = parseAdapterTemplates();
  const adapterFiles = [];
  let agentTeamsEnabled = false;

  for (const platformId of selectedPlatforms) {
    const platform = PLATFORMS[platformId];

    if (platformId === 'claude') {
      const claudeDir = opts.global ? join(process.env.HOME || process.env.USERPROFILE || '~', '.claude') : join(dir, '.claude');

      log.info(`Installing Claude Code components to ${claudeDir}/`);

      if (opts.force) {
        removeStaleFiles(join(PKG_ROOT, 'agents'), join(claudeDir, 'agents'));
        removeStaleEntries(join(PKG_ROOT, 'skills'), join(claudeDir, 'skills'));
      }

      // Clean up stale .claude/commands/ from pre-v0.7.0 installs
      const oldCommandsDir = join(claudeDir, 'commands');
      if (existsSync(oldCommandsDir)) {
        rmSync(oldCommandsDir, { recursive: true, force: true });
        log.info('Removed stale .claude/commands/ (migrated to skills/)');
      }

      copyDirContents(join(PKG_ROOT, 'agents'), join(claudeDir, 'agents'));
      copyDirContents(join(PKG_ROOT, 'skills'), join(claudeDir, 'skills'));
      setMarketplaceConfig(claudeDir);
      adapterFiles.push(claudeDir + '/agents/', claudeDir + '/skills/');
    } else {
      const templateSet = templates.get(platformId);
      if (!templateSet) {
        log.warn(`No adapter template found for ${platform.name} — skipping`);
        continue;
      }

      const adapterFile = platform.adapterPath(dir);
      ensureDir(dirname(adapterFile));
      writeFileSync(adapterFile, injectVersion(templateSet.primary));
      adapterFiles.push(adapterFile);
      log.ok(`${platform.name} adapter: ${adapterFile}`);

      let skippedGeminiSkills = false;
      for (const [relativePath, { content }] of templateSet.files) {
        // Skip .gemini/skills/ when codex is co-installed — Gemini CLI reads .agents/skills/ as alias
        if (platformId === 'gemini' && relativePath.startsWith('.gemini/skills/') && selectedPlatforms.includes('codex')) {
          skippedGeminiSkills = true;
          continue;
        }
        let filePath;
        if (platformId === 'codex' && opts.global && relativePath.startsWith('.agents/skills/')) {
          const homeDir = process.env.HOME || process.env.USERPROFILE || '~';
          filePath = join(homeDir, relativePath);
        } else if (platformId === 'gemini' && opts.global && relativePath.startsWith('.gemini/skills/')) {
          const homeDir = process.env.HOME || process.env.USERPROFILE || '~';
          filePath = join(homeDir, relativePath);
        } else {
          filePath = join(dir, relativePath);
        }
        ensureDir(dirname(filePath));
        writeFileSync(filePath, injectVersion(content));
        adapterFiles.push(filePath);
      }
      if (skippedGeminiSkills) {
        log.info('Gemini skills: using .agents/skills/ (shared with Codex)');
      }
      if (templateSet.files.size > 0) {
        log.ok(`  + ${templateSet.files.size} additional file(s)`);
      }

      if (platformId === 'codex') {
        const legacySkillDir = join(dir, '.codex', 'skills', 'kc');
        if (existsSync(legacySkillDir)) {
          log.info('Removing legacy .codex/skills/kc/ (migrated to .agents/skills/)');
          rmSync(legacySkillDir, { recursive: true, force: true });
        }
        if (opts.global) {
          const homeDir = process.env.HOME || process.env.USERPROFILE || '~';
          const legacyGlobal = join(homeDir, '.codex', 'skills', 'kc');
          if (existsSync(legacyGlobal)) {
            log.info('Removing legacy global ~/.codex/skills/kc/');
            rmSync(legacyGlobal, { recursive: true, force: true });
          }
        }
        // Clean up duplicate .gemini/skills/ when codex is co-installed with gemini
        if (selectedPlatforms.includes('gemini')) {
          const geminiSkillDir = join(dir, '.gemini', 'skills');
          if (existsSync(geminiSkillDir)) {
            let cleaned = false;
            for (const entry of readdirSync(geminiSkillDir)) {
              if (entry.startsWith('knowzcode-')) {
                rmSync(join(geminiSkillDir, entry), { recursive: true, force: true });
                cleaned = true;
              }
            }
            if (cleaned) {
              log.info('Removed duplicate .gemini/skills/knowzcode-* (using .agents/skills/ instead)');
            }
          }
        }
      }
    }
  }

  // Gemini MCP config offer (OAuth default)
  if (selectedPlatforms.includes('gemini') && !opts.global) {
    const settingsPath = join(dir, '.gemini', 'settings.json');

    if (opts.mcpKey) {
      // --mcp-key flag: explicit API key mode, skip prompts
      writeGeminiMcpConfig(settingsPath, opts.mcpKey, dir, opts.mcpEndpoint);
      log.ok(`Gemini MCP configured with API key in .gemini/settings.json (${opts.mcpEndpoint || 'https://mcp.knowz.io/mcp'})`);
    } else if (opts.force) {
      // --force without --mcp-key: write OAuth config (default)
      writeGeminiMcpOAuthConfig(settingsPath, opts.mcpEndpoint);
      log.ok(`Gemini MCP configured with OAuth in .gemini/settings.json (${opts.mcpEndpoint || 'https://mcp.knowz.io/mcp'})`);
      log.info('Run /mcp auth knowz in Gemini CLI to complete authentication.');
    } else {
      // Interactive flow (OAuth-first)
      console.log('');
      console.log(`${c.bold}Gemini MCP Configuration${c.reset}`);
      console.log(`MCP enables vector search, vault access, and AI-powered Q&A.`);

      const discovered = discoverApiKey(dir);
      let done = false;

      // [1] Existing config (OAuth or API key) → offer to keep
      if (discovered?.isOAuth || discovered?.source === 'existing Gemini config') {
        const desc = discovered.isOAuth ? 'OAuth' : `API key (ending ...${discovered.key?.slice(-4)})`;
        log.info(`MCP already configured with ${desc}`);
        const keep = await promptConfirm('Keep existing config?', true);
        if (keep) {
          // Update endpoint if user selected a different one
          if (opts.mcpEndpoint && existsSync(settingsPath)) {
            try {
              const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
              const currentEndpoint = settings.mcpServers?.knowz?.httpUrl || settings.mcpServers?.knowz?.url;
              if (currentEndpoint && currentEndpoint !== opts.mcpEndpoint) {
                settings.mcpServers.knowz.httpUrl = opts.mcpEndpoint;
                delete settings.mcpServers.knowz.url;
                delete settings.mcpServers.knowz.type;
                writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
                log.ok(`Keeping auth config, updated endpoint to ${opts.mcpEndpoint}`);
                log.info('Run /mcp auth knowz in Gemini CLI to re-authenticate with the new endpoint.');
              } else {
                log.ok('Keeping existing Gemini MCP config.');
              }
            } catch {
              log.ok('Keeping existing Gemini MCP config.');
            }
          } else {
            log.ok('Keeping existing Gemini MCP config.');
          }
          done = true;
        }
      }

      if (!done) {
        // [2] Offer OAuth (default) or API key
        console.log(`\n  ${c.bold}OAuth${c.reset} (recommended) — authenticate via browser on first use`);
        console.log(`  ${c.bold}API Key${c.reset} — enter a key now\n`);
        const useOAuth = await promptConfirm('Use OAuth? (recommended)', true);
        if (useOAuth) {
          writeGeminiMcpOAuthConfig(settingsPath, opts.mcpEndpoint);
          log.ok(`Gemini MCP configured with OAuth (${opts.mcpEndpoint || 'https://mcp.knowz.io/mcp'})`);
          log.info('Run /mcp auth knowz in Gemini CLI to complete authentication.');
        } else {
          // Fall back to API key entry
          let keyDone = false;
          if (discovered?.key) {
            const suffix = discovered.key.slice(-4);
            log.info(`Found API key from ${discovered.source} (ending ...${suffix})`);
            const useIt = await promptConfirm('Use this key?', true);
            if (useIt) {
              writeGeminiMcpConfig(settingsPath, discovered.key, dir, opts.mcpEndpoint);
              log.ok(`Gemini MCP configured with API key in .gemini/settings.json (${opts.mcpEndpoint || 'https://mcp.knowz.io/mcp'})`);
              keyDone = true;
            }
          }
          if (!keyDone) {
            const rl = createInterface({ input: process.stdin, output: process.stdout });
            const apiKey = await rl.question('Enter your KnowzCode API key (or press Enter to skip): ');
            rl.close();
            if (apiKey.trim()) {
              writeGeminiMcpConfig(settingsPath, apiKey.trim(), dir, opts.mcpEndpoint);
              log.ok(`Gemini MCP configured with API key in .gemini/settings.json (${opts.mcpEndpoint || 'https://mcp.knowz.io/mcp'})`);
            } else {
              log.warn('No key provided — configure later with /knowz setup.');
            }
          }
        }
      }
    }
  }

  // Agent Teams
  const agentTeamsClaudeDir = opts.global
    ? join(process.env.HOME || process.env.USERPROFILE || '~', '.claude')
    : join(dir, '.claude');
  if (opts.agentTeams) {
    enableAgentTeams(agentTeamsClaudeDir, opts.global);
    agentTeamsEnabled = true;
  } else if (selectedPlatforms.includes('claude') && !opts.force) {
    console.log('');
    console.log(`${c.bold}Agent Teams${c.reset} enables multi-agent coordination where specialized`);
    console.log(`teammates handle each workflow phase. ${c.dim}(experimental)${c.reset}`);
    const wantTeams = await promptConfirm('Enable Agent Teams? (recommended for Claude Code)');
    if (wantTeams) {
      enableAgentTeams(agentTeamsClaudeDir, opts.global);
      agentTeamsEnabled = true;
    }
  }

  return { adapterFiles, agentTeamsEnabled };
}

// ─── Commands ────────────────────────────────────────────────────────────────

// DETECT
function cmdDetect(opts) {
  const dir = opts.target;
  console.log('');
  console.log(`${c.bold}KnowzCode Platform Detection${c.reset}`);
  console.log(`${c.dim}Scanning: ${dir}${c.reset}`);
  console.log('');

  const detected = detectPlatforms(dir);
  const hasKnowzcode = existsSync(join(dir, 'knowzcode'));

  console.log(`  KnowzCode framework: ${hasKnowzcode ? `${c.green}installed${c.reset}` : `${c.dim}not found${c.reset}`}`);

  if (hasKnowzcode) {
    const versionFile = join(dir, 'knowzcode', '.knowzcode-version');
    if (existsSync(versionFile)) {
      const ver = readFileSync(versionFile, 'utf8').trim();
      console.log(`  Installed version:   ${c.cyan}${ver}${c.reset}`);
    }
  }

  console.log('');
  console.log(`  ${c.bold}Platforms:${c.reset}`);

  for (const [id, platform] of Object.entries(PLATFORMS)) {
    const found = detected.includes(id);
    const indicator = found ? `${c.green}detected${c.reset}` : `${c.dim}not detected${c.reset}`;
    console.log(`    ${platform.name.padEnd(18)} ${indicator}`);
  }

  console.log('');
  if (detected.length === 0) {
    console.log(`  No platforms detected. Run ${c.cyan}npx knowzcode install${c.reset} to set up.`);
  } else {
    console.log(`  ${detected.length} platform(s) detected.`);
  }
  console.log('');
}

// INSTALL
async function cmdInstall(opts) {
  const dir = opts.target;
  const kcDir = join(dir, 'knowzcode');

  console.log('');
  console.log(`${c.bold}KnowzCode Install${c.reset}`);
  console.log(`${c.dim}Target: ${dir}${c.reset}`);
  console.log('');

  // Check for existing installation — guided flow instead of hard exit
  if (existsSync(kcDir) && !opts.force) {
    const scan = scanExistingInstallation(kcDir, dir);
    displayInstallationSummary(scan, dir);
    console.log('');
    console.log('  Options:');
    console.log('  [1] Add/change platform adapters only');
    console.log('  [2] Reinstall framework (preserves your data)');
    console.log('  [3] Cancel');
    console.log('');

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question('Select: ');
    rl.close();

    const choice = answer.trim();
    if (choice === '1') return cmdAddPlatforms(opts);
    if (choice === '2') { opts.force = true; /* fall through to install */ }
    else return;
  }

  if (!existsSync(dir)) {
    log.err('Target directory does not exist: ' + dir);
    process.exit(1);
  }

  // Detect reinstall — preserve user data unless --clean
  const isReinstall = existsSync(join(kcDir, '.knowzcode-version'));
  const preserveFiles = isReinstall && !opts.clean ? new Set([
    'knowzcode_tracker.md', 'knowzcode_log.md',
    'knowzcode_architecture.md', 'knowzcode_project.md',
    'environment_context.md', 'user_preferences.md',
    'knowzcode_orchestration.md',
  ]) : new Set();

  // 1. Copy knowzcode/ template directory
  log.info(isReinstall ? 'Reinstalling core framework...' : 'Installing core framework...');
  const srcKc = join(PKG_ROOT, 'knowzcode');
  ensureDir(kcDir);
  ensureDir(join(kcDir, 'specs'));
  ensureDir(join(kcDir, 'workgroups'));
  ensureDir(join(kcDir, 'prompts'));

  // Create workgroups/README.md (workgroups/ is gitignored and excluded from npm)
  writeFileSync(join(kcDir, 'workgroups', 'README.md'), '# WorkGroups\n\nSession-specific WorkGroup files are stored here.\nThis directory is gitignored — contents are local to each checkout.\n');

  // Copy .md files (skip tracker and log — generate fresh; skip preserved files on reinstall)
  for (const entry of readdirSync(srcKc)) {
    const srcPath = join(srcKc, entry);
    const stat = statSync(srcPath);
    if (stat.isFile() && entry.endsWith('.md') && entry !== 'knowzcode_tracker.md' && entry !== 'knowzcode_log.md') {
      if (preserveFiles.has(entry) && existsSync(join(kcDir, entry))) {
        if (opts.verbose) log.info(`Preserved: ${entry}`);
        continue;
      }
      writeFileSync(join(kcDir, entry), readFileSync(srcPath));
    } else if (stat.isFile() && !entry.endsWith('.md')) {
      // Copy non-md files, handling gitignore.template → .gitignore rename
      if (entry === 'gitignore.template') {
        writeFileSync(join(kcDir, '.gitignore'), readFileSync(srcPath));
      } else {
        writeFileSync(join(kcDir, entry), readFileSync(srcPath));
      }
    }
  }

  // Copy prompts/
  if (existsSync(join(srcKc, 'prompts'))) {
    copyDirContents(join(srcKc, 'prompts'), join(kcDir, 'prompts'));
  }

  // Copy specs readme — don't overwrite if specs/ already has user content
  const specsDir = join(kcDir, 'specs');
  const userSpecs = existsSync(specsDir) ? readdirSync(specsDir).filter(f => f.endsWith('.md') && f !== 'Readme.md') : [];
  if (userSpecs.length === 0 && existsSync(join(srcKc, 'specs', 'Readme.md'))) {
    writeFileSync(join(kcDir, 'specs', 'Readme.md'), readFileSync(join(srcKc, 'specs', 'Readme.md')));
  }

  // Copy enterprise/ if exists
  if (existsSync(join(srcKc, 'enterprise'))) {
    copyDirContents(join(srcKc, 'enterprise'), join(kcDir, 'enterprise'));
  }

  // Initialize tracker and log — only create fresh if not preserving
  if (!preserveFiles.has('knowzcode_tracker.md') || !existsSync(join(kcDir, 'knowzcode_tracker.md'))) {
    initTracker(join(kcDir, 'knowzcode_tracker.md'));
  }
  if (!preserveFiles.has('knowzcode_log.md') || !existsSync(join(kcDir, 'knowzcode_log.md'))) {
    initLog(join(kcDir, 'knowzcode_log.md'));
  }

  // Write version marker
  writeFileSync(join(kcDir, '.knowzcode-version'), VERSION + '\n');

  if (isReinstall && preserveFiles.size > 0) {
    const preserved = [];
    if (preserveFiles.has('knowzcode_tracker.md') && existsSync(join(kcDir, 'knowzcode_tracker.md'))) preserved.push('tracker');
    if (preserveFiles.has('knowzcode_log.md') && existsSync(join(kcDir, 'knowzcode_log.md'))) preserved.push('log');
    if (preserveFiles.has('knowzcode_architecture.md') && existsSync(join(kcDir, 'knowzcode_architecture.md'))) preserved.push('architecture');
    if (preserveFiles.has('knowzcode_project.md') && existsSync(join(kcDir, 'knowzcode_project.md'))) preserved.push('project config');
    if (preserveFiles.has('environment_context.md') && existsSync(join(kcDir, 'environment_context.md'))) preserved.push('environment');
    if (preserveFiles.has('user_preferences.md') && existsSync(join(kcDir, 'user_preferences.md'))) preserved.push('preferences');
    if (preserveFiles.has('knowzcode_orchestration.md') && existsSync(join(kcDir, 'knowzcode_orchestration.md'))) preserved.push('orchestration');
    log.ok(`Core framework reinstalled (preserved: ${preserved.join(', ')})`);
  } else {
    log.ok('Core framework installed');
  }

  // 2. Platform detection + selection
  const detected = detectPlatforms(dir);
  let selectedPlatforms;

  if (opts.platforms.length > 0) {
    if (opts.platforms.includes('all')) {
      selectedPlatforms = Object.keys(PLATFORMS);
    } else {
      selectedPlatforms = opts.platforms.filter((p) => p in PLATFORMS);
    }
  } else if (opts.force && opts.platforms.length === 0 && !isReinstall) {
    // Non-interactive mode with --force on fresh install: install for detected platforms only
    selectedPlatforms = detected;
  } else if (opts.force && opts.platforms.length === 0 && isReinstall) {
    // Reinstall: re-generate for already-installed platforms
    const scan = scanExistingInstallation(kcDir, dir);
    selectedPlatforms = scan.installedPlatforms.length > 0 ? scan.installedPlatforms : detected;
  } else {
    selectedPlatforms = await promptPlatforms(detected);
  }

  // 3. Generate adapters (using shared helper)
  const { adapterFiles, agentTeamsEnabled } = await generateAdapters(dir, selectedPlatforms, opts);

  // 4. Summary
  console.log('');
  console.log(`${c.green}${c.bold}Installation complete!${c.reset}`);
  console.log('');
  console.log('  Framework:  ' + kcDir + '/');
  if (adapterFiles.length > 0) {
    console.log('  Adapters:');
    for (const f of adapterFiles) {
      console.log('    ' + f);
    }
  }
  if (agentTeamsEnabled) {
    console.log('  Agent Teams: enabled');
  }
  console.log('');
  console.log(`${c.bold}Next steps:${c.reset}`);
  if (!isReinstall) {
    console.log('  1. Edit knowzcode/knowzcode_project.md — set project name, stack, standards');
    console.log('  2. Edit knowzcode/environment_context.md — configure build/test commands');
  }
  if (selectedPlatforms.includes('claude')) {
    const step = isReinstall ? 1 : 3;
    console.log(`  ${step}. Install the KnowzCode plugin (recommended):`);
    console.log('     /plugin install knowzcode@knowz-skills');
    console.log(`  ${step + 1}. Start building:`);
    console.log('     /knowzcode:work "Your first feature"');
    console.log('');
    console.log('  Note: Commands also work without plugin as /work, /plan, /fix, etc.');
  } else if (!isReinstall) {
    console.log('  3. Start building: use knowzcode/prompts/[LOOP_1A]__Propose_Change_Set.md');
  }
  console.log('');
}

// ADD-PLATFORMS
async function cmdAddPlatforms(opts) {
  const dir = opts.target;
  const kcDir = join(dir, 'knowzcode');

  console.log('');
  console.log(`${c.bold}KnowzCode — Add/Change Platforms${c.reset}`);
  console.log(`${c.dim}Target: ${dir}${c.reset}`);
  console.log('');

  if (!existsSync(kcDir)) {
    log.err('No KnowzCode installation found. Run `npx knowzcode install` first.');
    process.exit(1);
  }

  const scan = scanExistingInstallation(kcDir, dir);
  const detected = detectPlatforms(dir);
  const ids = Object.keys(PLATFORMS);

  // Show platform status
  console.log(`${c.bold}Platform status:${c.reset}`);
  console.log('');
  ids.forEach((id, i) => {
    const p = PLATFORMS[id];
    const installed = scan.installedPlatforms.includes(id);
    const det = detected.includes(id);
    let tag = '';
    if (installed) tag = ` ${c.green}(installed)${c.reset}`;
    else if (det) tag = ` ${c.yellow}(detected)${c.reset}`;
    console.log(`  [${i + 1}] ${p.name}${tag}`);
  });
  console.log(`  [A] All platforms`);
  console.log(`  [S] Cancel`);
  console.log('');

  let selectedPlatforms;
  if (opts.platforms.length > 0) {
    if (opts.platforms.includes('all')) {
      selectedPlatforms = ids;
    } else {
      selectedPlatforms = opts.platforms.filter((p) => p in PLATFORMS);
    }
  } else {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question('Select platforms (comma-separated, e.g. 1,2): ');
    rl.close();

    const trimmed = answer.trim().toUpperCase();
    if (trimmed === 'S' || trimmed === '') return;
    if (trimmed === 'A') {
      selectedPlatforms = ids;
    } else {
      selectedPlatforms = [];
      for (const part of trimmed.split(',')) {
        const num = parseInt(part.trim(), 10);
        if (num >= 1 && num <= ids.length) selectedPlatforms.push(ids[num - 1]);
      }
      selectedPlatforms = [...new Set(selectedPlatforms)];
    }
  }

  if (selectedPlatforms.length === 0) return;

  // Confirm regeneration for already-installed platforms
  const toRegenerate = selectedPlatforms.filter(id => scan.installedPlatforms.includes(id));
  const toAdd = selectedPlatforms.filter(id => !scan.installedPlatforms.includes(id));

  if (toRegenerate.length > 0 && !opts.force) {
    const names = toRegenerate.map(id => PLATFORMS[id].name).join(', ');
    const confirmed = await promptConfirm(`${names} already installed. Regenerate adapter(s)?`);
    if (!confirmed) {
      // Only generate the new ones
      selectedPlatforms = toAdd;
      if (selectedPlatforms.length === 0) return;
    }
  }

  const { adapterFiles, agentTeamsEnabled } = await generateAdapters(dir, selectedPlatforms, opts);

  console.log('');
  log.ok('Platform adapters updated');
  if (adapterFiles.length > 0) {
    for (const f of adapterFiles) {
      console.log('    ' + f);
    }
  }
  if (agentTeamsEnabled) {
    console.log('  Agent Teams: enabled');
  }
  console.log('');
}

// UNINSTALL
async function cmdUninstall(opts) {
  const dir = opts.target;
  const kcDir = join(dir, 'knowzcode');

  console.log('');
  console.log(`${c.bold}KnowzCode Uninstall${c.reset}`);
  console.log(`${c.dim}Target: ${dir}${c.reset}`);
  console.log('');

  // Scan for installed components
  const components = [];

  if (existsSync(kcDir)) {
    components.push({ label: 'Core framework', path: kcDir });
  }

  // Claude Code components
  const claudeDir = join(dir, '.claude');
  for (const sub of ['commands', 'agents', 'skills']) {
    const p = join(claudeDir, sub);
    if (existsSync(p)) {
      components.push({ label: `Claude Code ${sub}`, path: p });
    }
  }

  // Platform adapter files
  const adapterChecks = {
    codex: join(dir, 'AGENTS.md'),
    gemini: join(dir, 'GEMINI.md'),
    cursor: join(dir, '.cursor', 'rules', 'knowzcode.mdc'),
    copilot: join(dir, '.github', 'copilot-instructions.md'),
    windsurf: join(dir, '.windsurf', 'rules', 'knowzcode.md'),
  };

  for (const [id, path] of Object.entries(adapterChecks)) {
    if (existsSync(path)) {
      components.push({ label: `${PLATFORMS[id].name} adapter`, path });
    }
  }

  // Additional platform-specific files/directories
  const copilotPromptsDir = join(dir, '.github', 'prompts');
  if (existsSync(copilotPromptsDir)) {
    for (const f of readdirSync(copilotPromptsDir)) {
      if ((f.startsWith('knowzcode-') || f.startsWith('kc-')) && f.endsWith('.prompt.md')) {
        components.push({ label: `Copilot prompt: ${f}`, path: join(copilotPromptsDir, f) });
      }
    }
  }
  const vscodeMcp = join(dir, '.vscode', 'mcp.json');
  if (existsSync(vscodeMcp)) {
    components.push({ label: 'VS Code MCP config', path: vscodeMcp });
  }
  const geminiCmdDir = join(dir, '.gemini', 'commands', 'knowzcode');
  if (existsSync(geminiCmdDir)) {
    components.push({ label: 'Gemini commands (knowzcode/)', path: geminiCmdDir });
  }
  // Legacy: old kc/ command dir
  const oldGeminiCmdDir = join(dir, '.gemini', 'commands', 'kc');
  if (existsSync(oldGeminiCmdDir)) {
    components.push({ label: 'Gemini commands — old prefix (kc/)', path: oldGeminiCmdDir });
  }
  // Gemini skills: .gemini/skills/knowzcode-*
  const geminiSkillDir = join(dir, '.gemini', 'skills');
  if (existsSync(geminiSkillDir)) {
    for (const entry of readdirSync(geminiSkillDir)) {
      if (entry.startsWith('knowzcode-') || entry.startsWith('kc-')) {
        components.push({ label: `Gemini skill (${entry}/)`, path: join(geminiSkillDir, entry) });
      }
    }
  }
  const globalGeminiSkillDir = join(process.env.HOME || process.env.USERPROFILE || '~', '.gemini', 'skills');
  if (existsSync(globalGeminiSkillDir)) {
    for (const entry of readdirSync(globalGeminiSkillDir)) {
      if (entry.startsWith('knowzcode-') || entry.startsWith('kc-')) {
        components.push({ label: `Gemini skill — global (~/.gemini/skills/${entry}/)`, path: join(globalGeminiSkillDir, entry) });
      }
    }
  }
  // Gemini subagents: .gemini/agents/knowzcode-*.md
  const geminiAgentDir = join(dir, '.gemini', 'agents');
  if (existsSync(geminiAgentDir)) {
    for (const entry of readdirSync(geminiAgentDir)) {
      if ((entry.startsWith('knowzcode-') || entry.startsWith('kc-')) && entry.endsWith('.md')) {
        components.push({ label: `Gemini subagent (${entry})`, path: join(geminiAgentDir, entry) });
      }
    }
  }
  // New path: .agents/skills/knowzcode-*
  const agentsSkillDir = join(dir, '.agents', 'skills');
  if (existsSync(agentsSkillDir)) {
    for (const entry of readdirSync(agentsSkillDir)) {
      if (entry.startsWith('knowzcode-') || entry.startsWith('kc-')) {
        components.push({ label: `Codex skill (${entry}/)`, path: join(agentsSkillDir, entry) });
      }
    }
  }
  const globalAgentsSkillDir = join(process.env.HOME || process.env.USERPROFILE || '~', '.agents', 'skills');
  if (existsSync(globalAgentsSkillDir)) {
    for (const entry of readdirSync(globalAgentsSkillDir)) {
      if (entry.startsWith('knowzcode-') || entry.startsWith('kc-')) {
        components.push({ label: `Codex skill — global (~/.agents/skills/${entry}/)`, path: join(globalAgentsSkillDir, entry) });
      }
    }
  }
  // Legacy path: .codex/skills/kc (remove on uninstall)
  const legacyCodexSkillDir = join(dir, '.codex', 'skills', 'kc');
  if (existsSync(legacyCodexSkillDir)) {
    components.push({ label: 'Codex skills — legacy (.codex/skills/kc/)', path: legacyCodexSkillDir });
  }
  const legacyGlobalCodexSkillDir = join(process.env.HOME || process.env.USERPROFILE || '~', '.codex', 'skills', 'kc');
  if (existsSync(legacyGlobalCodexSkillDir)) {
    components.push({ label: 'Codex skills — legacy global (~/.codex/skills/kc/)', path: legacyGlobalCodexSkillDir });
  }

  if (components.length === 0) {
    log.info('No KnowzCode installation found.');
    return;
  }

  console.log('  Components found:');
  for (const comp of components) {
    console.log(`    ${comp.label}: ${comp.path}`);
  }
  console.log('');

  // Ask about preserving user data
  let preserveUserData = false;
  if (existsSync(kcDir) && !opts.force) {
    preserveUserData = await promptConfirm('Preserve user data (specs/, architecture, tracker, log)?');
  }

  if (!opts.force) {
    const confirmed = await promptConfirm('Remove all listed components?');
    if (!confirmed) {
      log.info('Uninstall cancelled.');
      return;
    }
  }

  const removed = [];

  // Remove components
  for (const comp of components) {
    if (comp.path === kcDir && preserveUserData) {
      // Selective removal — keep user data
      const preserve = ['specs', 'knowzcode_architecture.md', 'knowzcode_tracker.md', 'knowzcode_log.md', 'knowzcode_project.md'];

      for (const entry of readdirSync(kcDir)) {
        if (preserve.includes(entry)) continue;
        const entryPath = join(kcDir, entry);
        rmSync(entryPath, { recursive: true, force: true });
      }
      removed.push(comp.label + ' (user data preserved)');
    } else {
      rmSync(comp.path, { recursive: true, force: true });
      removed.push(comp.label);
    }
  }

  // Clean up marketplace config from settings.json
  removeMarketplaceConfig(claudeDir);

  // Clean up Gemini MCP config (remove only knowz entry, preserve other settings)
  const geminiSettingsProject = join(dir, '.gemini', 'settings.json');
  if (removeGeminiMcpConfig(geminiSettingsProject)) {
    removed.push('Gemini MCP config (.gemini/settings.json)');
  }
  const homeDir2 = process.env.HOME || process.env.USERPROFILE || '~';
  const geminiSettingsUser = join(homeDir2, '.gemini', 'settings.json');
  if (removeGeminiMcpConfig(geminiSettingsUser)) {
    removed.push('Gemini MCP config (~/.gemini/settings.json)');
  }

  console.log('');
  log.ok('Uninstall complete');
  console.log('  Removed:');
  for (const r of removed) {
    console.log(`    ${r}`);
  }
  console.log('');
}

// UPGRADE
async function cmdUpgrade(opts) {
  const dir = opts.target;
  const kcDir = join(dir, 'knowzcode');

  console.log('');
  console.log(`${c.bold}KnowzCode Upgrade${c.reset}`);
  console.log(`${c.dim}Target: ${dir}${c.reset}`);
  console.log('');

  if (!existsSync(kcDir)) {
    log.err('No KnowzCode installation found. Run `npx knowzcode install` first.');
    process.exit(1);
  }

  // Read current version
  const versionFile = join(kcDir, '.knowzcode-version');
  const currentVersion = existsSync(versionFile) ? readFileSync(versionFile, 'utf8').trim() : 'unknown';

  if (currentVersion === VERSION && !opts.force) {
    log.info(`Already at version ${VERSION}. Use --force to reinstall.`);
    return;
  }

  log.info(`Upgrading: ${currentVersion} → ${VERSION}`);

  // Files to preserve (never overwrite)
  const preserveFiles = new Set([
    'knowzcode_tracker.md',
    'knowzcode_log.md',
    'knowzcode_architecture.md',
    'knowzcode_project.md',
    'environment_context.md',
    'user_preferences.md',
  ]);
  const preserveDirs = new Set(['specs', 'workgroups']);

  // Files to replace (always update)
  const srcKc = join(PKG_ROOT, 'knowzcode');

  // Update .md files
  for (const entry of readdirSync(srcKc)) {
    const srcPath = join(srcKc, entry);
    const dstPath = join(kcDir, entry);
    const stat = statSync(srcPath);

    if (stat.isFile()) {
      if (preserveFiles.has(entry)) {
        if (opts.verbose) log.info(`Preserved: ${entry}`);
        continue;
      }
      // Handle gitignore.template → .gitignore rename
      if (entry === 'gitignore.template') {
        writeFileSync(join(kcDir, '.gitignore'), readFileSync(srcPath));
        if (opts.verbose) log.info('Updated: .gitignore (from gitignore.template)');
      } else {
        writeFileSync(dstPath, readFileSync(srcPath));
        if (opts.verbose) log.info(`Updated: ${entry}`);
      }
    }
  }

  // Update prompts/ (always replace)
  if (existsSync(join(srcKc, 'prompts'))) {
    const promptsDst = join(kcDir, 'prompts');
    // Remove old prompts, copy new ones
    if (existsSync(promptsDst)) rmSync(promptsDst, { recursive: true, force: true });
    copyDirContents(join(srcKc, 'prompts'), promptsDst);
    if (opts.verbose) log.info('Updated: prompts/');
  }

  // Update enterprise/ (always replace)
  if (existsSync(join(srcKc, 'enterprise'))) {
    const entDst = join(kcDir, 'enterprise');
    if (existsSync(entDst)) rmSync(entDst, { recursive: true, force: true });
    copyDirContents(join(srcKc, 'enterprise'), entDst);
    if (opts.verbose) log.info('Updated: enterprise/');
  }

  // Update Claude Code components if present
  const claudeDir = join(dir, '.claude');
  if (existsSync(join(claudeDir, 'agents')) || existsSync(join(claudeDir, 'skills'))) {
    log.info('Updating Claude Code components...');

    // Clean up stale .claude/commands/ from pre-v0.7.0 installs
    const oldCommandsDir = join(claudeDir, 'commands');
    if (existsSync(oldCommandsDir)) {
      rmSync(oldCommandsDir, { recursive: true, force: true });
      log.info('Removed stale .claude/commands/ (migrated to skills/)');
    }

    // Remove stale files before copying
    removeStaleFiles(join(PKG_ROOT, 'agents'), join(claudeDir, 'agents'));
    removeStaleEntries(join(PKG_ROOT, 'skills'), join(claudeDir, 'skills'));
    copyDirContents(join(PKG_ROOT, 'agents'), join(claudeDir, 'agents'));
    copyDirContents(join(PKG_ROOT, 'skills'), join(claudeDir, 'skills'));
    // Ensure marketplace config is up to date
    setMarketplaceConfig(claudeDir);
  }

  // Regenerate adapters for detected platforms
  const detected = detectPlatforms(dir);
  const templates = parseAdapterTemplates();
  const regenerated = [];

  for (const platformId of detected) {
    if (platformId === 'claude') continue; // Already handled above
    const platform = PLATFORMS[platformId];
    if (!platform.adapterPath) continue;

    const adapterFile = platform.adapterPath(dir);
    if (!existsSync(adapterFile)) continue; // Only update existing adapters

    const templateSet = templates.get(platformId);
    if (!templateSet) continue;

    // Update primary adapter file
    writeFileSync(adapterFile, injectVersion(templateSet.primary));
    regenerated.push(platform.name);

    // Regenerate additional files
    const currentPaths = new Set();
    for (const [relativePath, { content }] of templateSet.files) {
      // Skip .gemini/skills/ when codex is co-installed — Gemini CLI reads .agents/skills/ as alias
      if (platformId === 'gemini' && relativePath.startsWith('.gemini/skills/') && detected.includes('codex')) {
        continue;
      }
      const filePath = join(dir, relativePath);
      ensureDir(dirname(filePath));
      writeFileSync(filePath, injectVersion(content));
      currentPaths.add(relativePath);
    }

    // Stale file cleanup for platform-owned directories
    if (platformId === 'copilot') {
      const promptsDir = join(dir, '.github', 'prompts');
      if (existsSync(promptsDir)) {
        for (const f of readdirSync(promptsDir)) {
          if (f.startsWith('knowzcode-') && f.endsWith('.prompt.md') && !currentPaths.has(`.github/prompts/${f}`)) {
            log.info(`Removing stale prompt: ${f}`);
            rmSync(join(promptsDir, f), { force: true });
          }
          // Migration: remove old kc-*.prompt.md files superseded by knowzcode-*
          if (f.startsWith('kc-') && f.endsWith('.prompt.md')) {
            log.info(`Removing old-prefix prompt: ${f}`);
            rmSync(join(promptsDir, f), { force: true });
          }
        }
      }
    } else if (platformId === 'gemini') {
      // Migration: remove old .gemini/commands/kc/ directory superseded by knowzcode/
      const oldTomlDir = join(dir, '.gemini', 'commands', 'kc');
      if (existsSync(oldTomlDir)) {
        log.info('Removing old-prefix .gemini/commands/kc/ (superseded by knowzcode/)');
        rmSync(oldTomlDir, { recursive: true, force: true });
      }
      const tomlDir = join(dir, '.gemini', 'commands', 'knowzcode');
      if (existsSync(tomlDir)) {
        for (const f of readdirSync(tomlDir)) {
          if (f.endsWith('.toml') && !currentPaths.has(`.gemini/commands/knowzcode/${f}`)) {
            log.info(`Removing stale command: ${f}`);
            rmSync(join(tomlDir, f), { force: true });
          }
        }
      }
      // Stale skill cleanup: .gemini/skills/knowzcode-* (skip if codex handles skills via .agents/skills/)
      if (!detected.includes('codex')) {
        const geminiSkillDir = join(dir, '.gemini', 'skills');
        if (existsSync(geminiSkillDir)) {
          for (const entry of readdirSync(geminiSkillDir)) {
            if (entry.startsWith('knowzcode-') && !currentPaths.has(`.gemini/skills/${entry}/SKILL.md`)) {
              log.info(`Removing stale Gemini skill: ${entry}/`);
              rmSync(join(geminiSkillDir, entry), { recursive: true, force: true });
            }
            // Migration: remove old kc-* skill dirs superseded by knowzcode-*
            if (entry.startsWith('kc-')) {
              log.info(`Removing old-prefix Gemini skill: ${entry}/`);
              rmSync(join(geminiSkillDir, entry), { recursive: true, force: true });
            }
          }
        }
      }
      // Stale subagent cleanup: .gemini/agents/knowzcode-*.md
      const geminiAgentDir = join(dir, '.gemini', 'agents');
      if (existsSync(geminiAgentDir)) {
        for (const entry of readdirSync(geminiAgentDir)) {
          if (entry.startsWith('knowzcode-') && entry.endsWith('.md') && !currentPaths.has(`.gemini/agents/${entry}`)) {
            log.info(`Removing stale Gemini subagent: ${entry}`);
            rmSync(join(geminiAgentDir, entry), { force: true });
          }
          // Migration: remove old kc-*.md agent files superseded by knowzcode-*
          if (entry.startsWith('kc-') && entry.endsWith('.md')) {
            log.info(`Removing old-prefix Gemini subagent: ${entry}`);
            rmSync(join(geminiAgentDir, entry), { force: true });
          }
        }
      }
    } else if (platformId === 'codex') {
      const skillDir = join(dir, '.agents', 'skills');
      if (existsSync(skillDir)) {
        for (const entry of readdirSync(skillDir)) {
          if (entry.startsWith('knowzcode-') && !currentPaths.has(`.agents/skills/${entry}/SKILL.md`)) {
            log.info(`Removing stale skill: ${entry}/`);
            rmSync(join(skillDir, entry), { recursive: true, force: true });
          }
          // Migration: remove old kc-* skill dirs superseded by knowzcode-*
          if (entry.startsWith('kc-')) {
            log.info(`Removing old-prefix skill: ${entry}/`);
            rmSync(join(skillDir, entry), { recursive: true, force: true });
          }
        }
      }
      // Migration: remove legacy .codex/skills/kc/ if present
      const legacySkillDir = join(dir, '.codex', 'skills', 'kc');
      if (existsSync(legacySkillDir)) {
        log.info('Removing legacy .codex/skills/kc/ (migrated to .agents/skills/)');
        rmSync(legacySkillDir, { recursive: true, force: true });
      }
      // Clean up duplicate .gemini/skills/ when codex is co-installed with gemini
      if (detected.includes('gemini')) {
        const geminiSkillDir = join(dir, '.gemini', 'skills');
        if (existsSync(geminiSkillDir)) {
          let cleaned = false;
          for (const entry of readdirSync(geminiSkillDir)) {
            if (entry.startsWith('knowzcode-') || entry.startsWith('kc-')) {
              rmSync(join(geminiSkillDir, entry), { recursive: true, force: true });
              cleaned = true;
            }
          }
          if (cleaned) {
            log.info('Removed duplicate .gemini/skills/knowzcode-* (using .agents/skills/ instead)');
          }
        }
      }
    }
  }

  // Check for global codex skills
  const homeDir = process.env.HOME || process.env.USERPROFILE || '~';
  const globalAgentsSkillDir = join(homeDir, '.agents', 'skills');
  if (existsSync(globalAgentsSkillDir)) {
    const codexTemplateSet = templates.get('codex');
    if (codexTemplateSet) {
      const currentPaths = new Set([...codexTemplateSet.files.keys()]);
      // Stale cleanup
      for (const entry of readdirSync(globalAgentsSkillDir)) {
        if (entry.startsWith('knowzcode-') && !currentPaths.has(`.agents/skills/${entry}/SKILL.md`)) {
          log.info(`Removing stale global skill: ${entry}/`);
          rmSync(join(globalAgentsSkillDir, entry), { recursive: true, force: true });
        }
        // Migration: remove old kc-* skill dirs superseded by knowzcode-*
        if (entry.startsWith('kc-')) {
          log.info(`Removing old-prefix global skill: ${entry}/`);
          rmSync(join(globalAgentsSkillDir, entry), { recursive: true, force: true });
        }
      }
      // Regenerate global skills
      for (const [relativePath, { content }] of codexTemplateSet.files) {
        if (relativePath.startsWith('.agents/skills/')) {
          const filePath = join(homeDir, relativePath);
          ensureDir(dirname(filePath));
          writeFileSync(filePath, injectVersion(content));
        }
      }
      log.info('Updated global Codex skills');
    }
  }
  // Migration: remove legacy global .codex/skills/kc/ if present
  const legacyGlobalSkillDir = join(homeDir, '.codex', 'skills', 'kc');
  if (existsSync(legacyGlobalSkillDir)) {
    log.info('Removing legacy global ~/.codex/skills/kc/ (migrated to ~/.agents/skills/)');
    rmSync(legacyGlobalSkillDir, { recursive: true, force: true });
  }

  // Check for global Gemini skills
  const globalGeminiSkillDir = join(homeDir, '.gemini', 'skills');
  if (existsSync(globalGeminiSkillDir)) {
    const geminiTemplateSet = templates.get('gemini');
    if (geminiTemplateSet) {
      const currentPaths = new Set([...geminiTemplateSet.files.keys()]);
      // Stale cleanup
      for (const entry of readdirSync(globalGeminiSkillDir)) {
        if (entry.startsWith('knowzcode-') && !currentPaths.has(`.gemini/skills/${entry}/SKILL.md`)) {
          log.info(`Removing stale global Gemini skill: ${entry}/`);
          rmSync(join(globalGeminiSkillDir, entry), { recursive: true, force: true });
        }
        // Migration: remove old kc-* skill dirs superseded by knowzcode-*
        if (entry.startsWith('kc-')) {
          log.info(`Removing old-prefix global Gemini skill: ${entry}/`);
          rmSync(join(globalGeminiSkillDir, entry), { recursive: true, force: true });
        }
      }
      // Regenerate global skills
      for (const [relativePath, { content }] of geminiTemplateSet.files) {
        if (relativePath.startsWith('.gemini/skills/')) {
          const filePath = join(homeDir, relativePath);
          ensureDir(dirname(filePath));
          writeFileSync(filePath, injectVersion(content));
        }
      }
      log.info('Updated global Gemini skills');
    }
  }

  // Preserve Gemini MCP config during upgrade (don't overwrite user's API key)
  const geminiSettingsPath = join(dir, '.gemini', 'settings.json');
  const geminiMcpPreserved = hasGeminiMcpConfig(geminiSettingsPath);
  if (geminiMcpPreserved) {
    // Update endpoint if user selected a different one (preserve auth method)
    if (opts.mcpEndpoint) {
      try {
        const settings = JSON.parse(readFileSync(geminiSettingsPath, 'utf8'));
        const currentEndpoint = settings.mcpServers?.knowz?.httpUrl || settings.mcpServers?.knowz?.url;
        if (currentEndpoint && currentEndpoint !== opts.mcpEndpoint) {
          settings.mcpServers.knowz.httpUrl = opts.mcpEndpoint;
          delete settings.mcpServers.knowz.url;
          delete settings.mcpServers.knowz.type;
          writeFileSync(geminiSettingsPath, JSON.stringify(settings, null, 2) + '\n');
          log.ok(`Updated Gemini MCP endpoint to ${opts.mcpEndpoint}`);
          log.info('Run /mcp auth knowz in Gemini CLI to re-authenticate with the new endpoint.');
        } else if (opts.verbose) {
          log.info('Preserved: Gemini MCP config (.gemini/settings.json)');
        }
      } catch {
        if (opts.verbose) log.info('Preserved: Gemini MCP config (.gemini/settings.json)');
      }
    } else if (opts.verbose) {
      log.info('Preserved: Gemini MCP config (.gemini/settings.json)');
    }
  }

  // Offer to add detected-but-uninstalled platforms
  const uninstalled = detected.filter(id => !isAdapterInstalled(id, dir));
  if (uninstalled.length > 0 && !opts.force) {
    const names = uninstalled.map(id => PLATFORMS[id].name).join(', ');
    log.info(`New platforms detected: ${names}`);
    const addNew = await promptConfirm('Generate adapters for these platforms?');
    if (addNew) {
      await generateAdapters(dir, uninstalled, opts);
      regenerated.push(...uninstalled.map(id => PLATFORMS[id].name + ' (new)'));
    }
  }

  // Write new version
  writeFileSync(versionFile, VERSION + '\n');

  console.log('');
  log.ok(`Upgraded to ${VERSION}`);
  console.log('');
  console.log(`  ${c.bold}Preserved:${c.reset} specs/, tracker, log, architecture, project config${geminiMcpPreserved ? ', Gemini MCP config' : ''}`);
  console.log(`  ${c.bold}Updated:${c.reset}   loop, prompts, adapters, enterprise templates`);
  if (regenerated.length > 0) {
    console.log(`  ${c.bold}Adapters:${c.reset}  ${regenerated.join(', ')}`);
  }
  console.log('');
}

// HELP
function cmdHelp() {
  console.log(`
${c.bold}KnowzCode CLI${c.reset} v${VERSION}
Platform-agnostic AI development methodology

${c.bold}Usage:${c.reset}
  npx knowzcode                          Interactive mode
  npx knowzcode install [options]        Install (preserves data on reinstall)
  npx knowzcode add-platforms [options]  Add/change platform adapters only
  npx knowzcode uninstall [options]      Remove KnowzCode
  npx knowzcode upgrade [options]        Upgrade preserving user data
  npx knowzcode detect                   Show detected platforms (dry run)

${c.bold}Options:${c.reset}
  --target <path>      Target directory (default: current directory)
  --platforms <list>   Comma-separated: claude,codex,gemini,cursor,copilot,windsurf,all
  --force              Skip confirmation prompts
  --clean              Full reset on reinstall (disables data preservation)
  --global             Install Claude Code to ~/.claude/, Codex skills to ~/.agents/skills/, Gemini skills to ~/.gemini/skills/
  --mcp-key <key>      Override OAuth default with API key for Gemini MCP
  --mcp-endpoint <url> MCP server URL (default: production)
  --agent-teams        Enable Agent Teams in .claude/settings.local.json
  --verbose            Show detailed output
  -h, --help           Show this help
  -v, --version        Show version

${c.bold}Examples:${c.reset}
  npx knowzcode install --platforms claude,cursor
  npx knowzcode install --platforms all --force
  npx knowzcode add-platforms --platforms cursor
  npx knowzcode upgrade --target ./my-project
  npx knowzcode uninstall --force
  npx knowzcode detect
`);
}

// INTERACTIVE
async function cmdInteractive(opts) {
  console.log('');
  console.log(`${c.bold}  ╔═══════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bold}  ║          KnowzCode v${VERSION.padEnd(14)}    ║${c.reset}`);
  console.log(`${c.bold}  ║  AI Development Methodology Installer ║${c.reset}`);
  console.log(`${c.bold}  ╚═══════════════════════════════════════╝${c.reset}`);
  console.log('');

  if (!opts.targetExplicit) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(`  Project directory: ${c.dim}(Enter to keep current)${c.reset}\n  [${opts.target}]: `);
    rl.close();
    const trimmed = answer.trim();
    if (trimmed) {
      const resolved = resolve(trimmed);
      if (!existsSync(resolved)) {
        log.warn(`Directory not found: ${resolved}`);
        log.info('Creating directory...');
        mkdirSync(resolved, { recursive: true });
      }
      opts.target = resolved;
    }
  }

  if (!opts.mcpEndpoint) {
    console.log('');
    console.log(`  ${c.bold}MCP Server Environment${c.reset}`);
    console.log(`  1) Knowz Production  ${c.dim}(https://mcp.knowz.io/mcp)${c.reset}`);
    console.log(`  2) Knowz Development ${c.dim}(https://mcp.dev.knowz.io/mcp)${c.reset}`);
    console.log(`  3) Self-hosted       ${c.dim}(enter custom URL)${c.reset}`);
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const envAnswer = await rl.question(`\n  Select environment ${c.dim}[1]${c.reset}: `);
    rl.close();
    const envChoice = envAnswer.trim();
    if (envChoice === '2') {
      opts.mcpEndpoint = 'https://mcp.dev.knowz.io/mcp';
    } else if (envChoice === '3') {
      const rl2 = createInterface({ input: process.stdin, output: process.stdout });
      const customUrl = await rl2.question('  Enter MCP server URL: ');
      rl2.close();
      if (customUrl.trim()) {
        opts.mcpEndpoint = customUrl.trim();
      } else {
        opts.mcpEndpoint = 'https://mcp.knowz.io/mcp';
        log.warn('No URL provided — defaulting to production.');
      }
    } else {
      opts.mcpEndpoint = 'https://mcp.knowz.io/mcp';
    }
    log.ok(`MCP endpoint: ${opts.mcpEndpoint}`);
    console.log('');
  }

  const dir = opts.target;
  const kcDir = join(dir, 'knowzcode');
  const detected = detectPlatforms(dir);

  if (detected.length > 0) {
    log.info('Detected platforms: ' + detected.map((d) => PLATFORMS[d].name).join(', '));
  }

  if (existsSync(kcDir)) {
    // Always scan and display existing installation
    const scan = scanExistingInstallation(kcDir, dir);
    displayInstallationSummary(scan, dir);
    console.log('');

    const versionFile = join(kcDir, '.knowzcode-version');
    const currentVersion = existsSync(versionFile) ? readFileSync(versionFile, 'utf8').trim() : 'unknown';

    if (currentVersion !== VERSION) {
      // Version mismatch — upgrade is the primary action
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      console.log(`  ${c.yellow}Update available: ${currentVersion} → ${VERSION}${c.reset}`);
      console.log('');
      console.log('  [1] Upgrade to v' + VERSION + ' (preserves all your data)');
      console.log('  [2] Add/change platform adapters');
      console.log('  [3] Reinstall framework (preserves your data)');
      console.log('  [4] Uninstall');
      console.log('  [5] Exit');
      console.log('');
      const answer = await rl.question('Select action: ');
      rl.close();

      const choice = answer.trim();
      if (choice === '1') return cmdUpgrade(opts);
      if (choice === '2') return cmdAddPlatforms(opts);
      if (choice === '3') return cmdInstall({ ...opts, force: true });
      if (choice === '4') return cmdUninstall(opts);
      return;
    } else {
      // Same version — add platforms is the primary action
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      console.log('');
      console.log('  [1] Add/change platform adapters');
      console.log('  [2] Reinstall framework (preserves your data)');
      console.log('  [3] Uninstall');
      console.log('  [4] Exit');
      console.log('');
      const answer = await rl.question('Select action: ');
      rl.close();

      const choice = answer.trim();
      if (choice === '1') return cmdAddPlatforms(opts);
      if (choice === '2') return cmdInstall({ ...opts, force: true });
      if (choice === '3') return cmdUninstall(opts);
      return;
    }
  } else {
    log.info('No existing installation found. Starting install...');
    console.log('');
    return cmdInstall(opts);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv);

  switch (opts.command) {
    case 'install':
      return cmdInstall(opts);
    case 'add-platforms':
      return cmdAddPlatforms(opts);
    case 'uninstall':
      return cmdUninstall(opts);
    case 'upgrade':
      return cmdUpgrade(opts);
    case 'detect':
      return cmdDetect(opts);
    case 'help':
      return cmdHelp();
    case 'version':
      console.log(VERSION);
      return;
    default:
      return cmdInteractive(opts);
  }
}

main().catch((err) => {
  log.err(err.message);
  process.exit(1);
});

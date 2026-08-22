#!/usr/bin/env node

// KnowzCode CLI — Zero-dependency Node.js installer
// Usage: npx @knowzai/knowzcode [install|uninstall|upgrade|detect] [options]

import {
  accessSync,
  constants as fsConstants,
  existsSync,
  mkdirSync,
  cpSync,
  lstatSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'fs';
import { createHash } from 'crypto';
import { join, resolve, dirname, basename, relative, isAbsolute } from 'path';
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
// In enterprise mode, dev endpoint collapses to the enterprise endpoint (single environment)
const MCP_DEV_ENDPOINT = IS_ENTERPRISE ? MCP_ENDPOINT : 'https://mcp.dev.knowz.io/mcp';
const HOME_DIR = process.env.HOME || process.env.USERPROFILE || '~';
const MANAGED_CODEX_ADAPTER_MARKER = '<!-- KnowzCode managed adapter: codex -->';
const CODEX_SKILL_MANIFEST = '.knowzcode-managed.json';
const CODEX_SKILL_MANIFEST_SCHEMA = 'knowzcode.codex-skill-ownership/v1';
const CLAUDE_COMPONENT_MANIFEST = '.knowzcode-managed.json';
const CLAUDE_COMPONENT_MANIFEST_SCHEMA = 'knowzcode.claude-component-ownership/v1';
const MANAGED_CLAUDE_COMPONENT_MARKER = '<!-- KnowzCode managed component: claude -->';
const COPILOT_MCP_MANIFEST = '.knowzcode-mcp-managed.json';
const COPILOT_MCP_MANIFEST_SCHEMA = 'knowzcode.copilot-mcp-ownership/v1';
const GEMINI_MCP_MANIFEST = '.knowzcode-mcp-managed.json';
const GEMINI_MCP_MANIFEST_SCHEMA = 'knowzcode.gemini-mcp-ownership/v1';
const KNOWZ_GEMINI_MCP_MANIFEST = '.knowz-mcp-managed.json';
const KNOWZ_GEMINI_MCP_MANIFEST_SCHEMA = 'knowz.gemini-mcp-ownership/v1';

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
    forceLocalSkills: false,
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
    } else if (arg === '--force-local-skills') {
      opts.forceLocalSkills = true;
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

function isManagedCodexAdapter(filePath) {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) return false;
  const content = safeReadText(filePath);
  return content.includes(MANAGED_CODEX_ADAPTER_MARKER)
    || hasGeneratedKnowzCodeMarker(content);
}

function hasGeneratedKnowzCodeMarker(content) {
  return /^(?:<!-- Generated by KnowzCode v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?: \/knowzcode:setup)? -->|# Generated by KnowzCode v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\r?$/m.test(content);
}

function codexSkillNames(templateSet) {
  const names = new Set();
  for (const relativePath of templateSet?.files?.keys?.() ?? []) {
    const match = relativePath.match(/^\.agents\/skills\/(knowzcode-[^/]+)\//);
    if (match) names.add(match[1]);
  }
  return [...names].sort();
}

function isLegacyManagedCodexSkill(skillRoot, entry, templateSet = null) {
  const path = join(skillRoot, entry, 'SKILL.md');
  const installed = safeReadText(path);
  if (hasGeneratedKnowzCodeMarker(installed)) return true;
  const templates = templateSet ?? parseAdapterTemplates().get('codex');
  const expected = templates?.files?.get?.(`.agents/skills/${entry}/SKILL.md`)?.content;
  return typeof expected === 'string' && installed === injectVersion(expected);
}

function readCodexSkillManifest(skillRoot, { strict = false } = {}) {
  const manifestPath = join(skillRoot, CODEX_SKILL_MANIFEST);
  if (!existsSync(manifestPath)) return { manifestPath, entries: [] };
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (
      manifest?.schema !== CODEX_SKILL_MANIFEST_SCHEMA
      || manifest.owner !== 'knowzcode'
      || !Array.isArray(manifest.entries)
      || manifest.entries.some((entry) => typeof entry !== 'string' || !/^knowzcode-[a-z0-9-]+$/.test(entry))
    ) {
      throw new TypeError('manifest must contain an owned list of knowzcode-* skill directory names');
    }
    return { manifestPath, entries: [...new Set(manifest.entries)].sort() };
  } catch (error) {
    if (strict) {
      throw new Error(
        `Cannot update managed Codex skills because ${manifestPath} is invalid. `
        + `The existing skills were preserved unchanged: ${error.message}`
      );
    }
    return { manifestPath, entries: [] };
  }
}

function reconcileManagedCodexSkills(skillRoot, currentEntries) {
  const previous = readCodexSkillManifest(skillRoot, { strict: true });
  const current = new Set(currentEntries);
  for (const entry of previous.entries) {
    if (current.has(entry)) continue;
    const stale = join(skillRoot, entry);
    if (existsSync(stale)) {
      log.info(`Removing stale manifest-owned Codex skill: ${entry}/`);
      rmSync(stale, { recursive: true, force: true });
    }
  }
  ensureDir(skillRoot);
  writeFileSync(previous.manifestPath, JSON.stringify({
    schema: CODEX_SKILL_MANIFEST_SCHEMA,
    owner: 'knowzcode',
    version: VERSION,
    entries: [...current].sort(),
  }, null, 2) + '\n');
}

function packagedClaudeComponents() {
  return {
    agents: readdirSync(join(PKG_ROOT, 'agents')).filter((entry) => /^[a-z0-9-]+\.md$/.test(entry)).sort(),
    skills: readdirSync(join(PKG_ROOT, 'skills')).filter((entry) => /^[a-z0-9-]+$/.test(entry)).sort(),
  };
}

function readClaudeComponentManifest(claudeDir, { strict = false } = {}) {
  const manifestPath = join(claudeDir, CLAUDE_COMPONENT_MANIFEST);
  if (!existsSync(manifestPath)) return { manifestPath, agents: [], skills: [] };
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (
      manifest?.schema !== CLAUDE_COMPONENT_MANIFEST_SCHEMA
      || manifest.owner !== 'knowzcode'
      || !Array.isArray(manifest.agents)
      || !Array.isArray(manifest.skills)
      || manifest.agents.some((entry) => typeof entry !== 'string' || !/^[a-z0-9-]+\.md$/.test(entry))
      || manifest.skills.some((entry) => typeof entry !== 'string' || !/^[a-z0-9-]+$/.test(entry))
    ) {
      throw new TypeError('manifest must contain owned Claude agent files and skill directory names');
    }
    return {
      manifestPath,
      agents: [...new Set(manifest.agents)].sort(),
      skills: [...new Set(manifest.skills)].sort(),
    };
  } catch (error) {
    if (strict) {
      throw new Error(
        `Cannot update managed Claude components because ${manifestPath} is invalid. `
        + `The existing components were preserved unchanged: ${error.message}`
      );
    }
    return { manifestPath, agents: [], skills: [] };
  }
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
      .filter((entry) => entry.isDirectory() && /^knowzcode-[a-z0-9-]+$/.test(entry.name))
      .map((entry) => entry.name)
      .filter((entry) => isLegacyManagedCodexSkill(skillRoot, entry))
      .sort()
    : [];
  return { manifestPath, entries };
}

function isOwnedFrameworkDirectory(kcDir) {
  if (!existsSync(kcDir) || !statSync(kcDir).isDirectory()) return false;
  const versionFile = join(kcDir, '.knowzcode-version');
  if (!existsSync(versionFile) || !statSync(versionFile).isFile()) return false;
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(safeReadText(versionFile).trim());
}

function claudeComponentIdentity(content) {
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] ?? '';
  const name = frontmatter.match(/^name:\s*(.+?)\s*$/m)?.[1] ?? '';
  const description = frontmatter.match(/^description:\s*(.+?)\s*$/m)?.[1] ?? '';
  return name && description ? `${name}\n${description}` : '';
}

function isLegacyManagedClaudeComponent(path, entry, kind) {
  if (!existsSync(path)) return false;
  const markerFile = statSync(path).isDirectory() ? join(path, 'SKILL.md') : path;
  const installed = safeReadText(markerFile);
  if (installed.includes(MANAGED_CLAUDE_COMPONENT_MARKER)) return true;
  if (!entry || !kind) return false;
  const packagedPath = kind === 'skill'
    ? join(PKG_ROOT, 'skills', entry, 'SKILL.md')
    : join(PKG_ROOT, 'agents', entry);
  const packaged = safeReadText(packagedPath);
  const expectedIdentities = new Set([
    claudeComponentIdentity(packaged),
    claudeComponentIdentity(localizeClaudeSkillContent(packaged)),
    claudeComponentIdentity(localizeClaudeSkillContent(packaged, {
      localKnowzRoles: new Set(['reader', 'writer']),
    })),
  ]);
  expectedIdentities.delete('');
  return expectedIdentities.has(claudeComponentIdentity(installed));
}

function markManagedClaudeComponents(claudeDir) {
  const components = packagedClaudeComponents();
  const files = [
    ...components.agents.map((entry) => join(claudeDir, 'agents', entry)),
    ...components.skills.map((entry) => join(claudeDir, 'skills', entry, 'SKILL.md')),
  ];
  for (const path of files) {
    const content = safeReadText(path);
    if (!content || content.includes(MANAGED_CLAUDE_COMPONENT_MARKER)) continue;
    const marked = content.replace(
      /^(---\r?\n[\s\S]*?\r?\n---\r?\n)/,
      `$1${MANAGED_CLAUDE_COMPONENT_MARKER}\n`
    );
    if (marked === content) {
      throw new Error(`Cannot mark generated Claude component because it lacks frontmatter: ${path}`);
    }
    writeFileSync(path, marked);
  }
}

function writeClaudeComponentManifest(claudeDir) {
  const components = packagedClaudeComponents();
  ensureDir(claudeDir);
  writeFileSync(join(claudeDir, CLAUDE_COMPONENT_MANIFEST), JSON.stringify({
    schema: CLAUDE_COMPONENT_MANIFEST_SCHEMA,
    owner: 'knowzcode',
    version: VERSION,
    ...components,
  }, null, 2) + '\n');
}

function prepareManagedClaudeComponentsForCopy(claudeDir) {
  const previous = readClaudeComponentManifest(claudeDir, { strict: true });
  const current = packagedClaudeComponents();
  const currentAgents = new Set(current.agents);
  const currentSkills = new Set(current.skills);
  for (const entry of previous.agents) {
    if (!currentAgents.has(entry)) rmSync(join(claudeDir, 'agents', entry), { force: true });
  }
  for (const entry of previous.skills) {
    if (!currentSkills.has(entry)) rmSync(join(claudeDir, 'skills', entry), { recursive: true, force: true });
  }
  for (const entry of current.skills) {
    const target = join(claudeDir, 'skills', entry);
    if (existsSync(target) && (
      previous.skills.includes(entry)
      || isLegacyManagedClaudeComponent(target, entry, 'skill')
    )) {
      rmSync(target, { recursive: true, force: true });
    }
  }
}

// ─── Stack Detection ─────────────────────────────────────────────────────────
// Non-interactive probe of the project directory. Returns detected values for
// knowzcode_project.md Stack table and installer summary. Empty strings where
// detection fails — the /knowzcode:setup skill fills the rest interactively.

function safeReadJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

function safeReadText(path) {
  try { return readFileSync(path, 'utf8'); } catch { return ''; }
}

function detectStack(dir) {
  const stack = {
    language: '', backendFramework: '', frontendFramework: '',
    database: '', ormOdm: '', testingUnit: '', testingE2E: '',
    keyLibraries: '', packageManager: '',
    testCommand: '', buildCommand: '',
  };

  // Node / JS / TS
  const pkgPath = join(dir, 'package.json');
  if (existsSync(pkgPath)) {
    const pkg = safeReadJson(pkgPath) || {};
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    stack.language = deps.typescript ? 'TypeScript' : 'JavaScript';
    if (deps.next) stack.frontendFramework = 'Next.js';
    else if (deps.react) stack.frontendFramework = 'React';
    else if (deps.vue) stack.frontendFramework = 'Vue';
    else if (deps.svelte || deps['@sveltejs/kit']) stack.frontendFramework = 'Svelte';
    else if (deps['@angular/core']) stack.frontendFramework = 'Angular';
    if (deps['@nestjs/core']) stack.backendFramework = 'NestJS';
    else if (deps.express) stack.backendFramework = 'Express';
    else if (deps.fastify) stack.backendFramework = 'Fastify';
    else if (deps.koa) stack.backendFramework = 'Koa';
    else if (deps['@hapi/hapi'] || deps.hapi) stack.backendFramework = 'Hapi';
    if (deps.vitest) stack.testingUnit = 'Vitest';
    else if (deps.jest) stack.testingUnit = 'Jest';
    else if (deps.mocha) stack.testingUnit = 'Mocha';
    else if (deps.ava) stack.testingUnit = 'AVA';
    if (deps['@playwright/test'] || deps.playwright) stack.testingE2E = 'Playwright';
    else if (deps.cypress) stack.testingE2E = 'Cypress';
    if (deps.prisma || deps['@prisma/client']) stack.ormOdm = 'Prisma';
    else if (deps['drizzle-orm']) stack.ormOdm = 'Drizzle';
    else if (deps.typeorm) stack.ormOdm = 'TypeORM';
    else if (deps.sequelize) stack.ormOdm = 'Sequelize';
    else if (deps.mongoose) stack.ormOdm = 'Mongoose';
    if (pkg.scripts?.test) stack.testCommand = 'npm test';
    if (pkg.scripts?.build) stack.buildCommand = 'npm run build';
    if (existsSync(join(dir, 'pnpm-lock.yaml'))) stack.packageManager = 'pnpm';
    else if (existsSync(join(dir, 'yarn.lock'))) stack.packageManager = 'Yarn';
    else if (existsSync(join(dir, 'bun.lockb')) || existsSync(join(dir, 'bun.lock'))) stack.packageManager = 'Bun';
    else stack.packageManager = 'npm';
    return stack;
  }

  // Python
  const pyproject = join(dir, 'pyproject.toml');
  const hasPython = existsSync(pyproject) || existsSync(join(dir, 'requirements.txt')) || existsSync(join(dir, 'setup.py')) || existsSync(join(dir, 'Pipfile'));
  if (hasPython) {
    stack.language = 'Python';
    const content = safeReadText(pyproject) + safeReadText(join(dir, 'requirements.txt')) + safeReadText(join(dir, 'Pipfile'));
    if (/fastapi/i.test(content)) stack.backendFramework = 'FastAPI';
    else if (/\bdjango\b/i.test(content)) stack.backendFramework = 'Django';
    else if (/\bflask\b/i.test(content)) stack.backendFramework = 'Flask';
    else if (/\bstarlette\b/i.test(content)) stack.backendFramework = 'Starlette';
    if (/\bpytest\b/i.test(content)) stack.testingUnit = 'pytest';
    else if (existsSync(join(dir, 'tests'))) stack.testingUnit = 'unittest';
    if (/\bplaywright\b/i.test(content)) stack.testingE2E = 'Playwright';
    if (/sqlalchemy/i.test(content)) stack.ormOdm = 'SQLAlchemy';
    else if (/\btortoise\b/i.test(content)) stack.ormOdm = 'Tortoise ORM';
    if (existsSync(join(dir, 'poetry.lock'))) stack.packageManager = 'Poetry';
    else if (existsSync(join(dir, 'uv.lock'))) stack.packageManager = 'uv';
    else if (existsSync(join(dir, 'Pipfile.lock'))) stack.packageManager = 'pipenv';
    else stack.packageManager = 'pip';
    stack.testCommand = stack.testingUnit === 'pytest' ? 'pytest' : 'python -m unittest';
    return stack;
  }

  // .NET
  const dotnetProjects = readdirSync(dir).filter(f => /\.(csproj|fsproj|vbproj|sln|slnx)$/i.test(f));
  if (dotnetProjects.length > 0) {
    const hasFs = dotnetProjects.some(p => p.endsWith('.fsproj'));
    stack.language = hasFs ? 'F#' : 'C#';
    stack.packageManager = 'NuGet';
    stack.testCommand = 'dotnet test';
    stack.buildCommand = 'dotnet build';
    const testProjects = dotnetProjects.filter(p => /(?:\.(Tests?|Specs?)|\.IntegrationTests)\.(csproj|fsproj)$/i.test(p));
    if (testProjects.length > 0) {
      const testContent = safeReadText(join(dir, testProjects[0]));
      if (/xunit/i.test(testContent)) stack.testingUnit = 'xUnit';
      else if (/\bnunit\b/i.test(testContent)) stack.testingUnit = 'NUnit';
      else if (/mstest/i.test(testContent)) stack.testingUnit = 'MSTest';
    }
    const mainProjects = dotnetProjects.filter(p => !testProjects.includes(p) && /\.(csproj|fsproj)$/i.test(p));
    if (mainProjects.length > 0) {
      const mainContent = safeReadText(join(dir, mainProjects[0]));
      if (/Microsoft\.AspNetCore/i.test(mainContent)) stack.backendFramework = 'ASP.NET Core';
      else if (/Microsoft\.NET\.Sdk\.Web/i.test(mainContent)) stack.backendFramework = 'ASP.NET Core';
      if (/EntityFrameworkCore|Microsoft\.EntityFrameworkCore/i.test(mainContent)) stack.ormOdm = 'EF Core';
      else if (/Dapper/i.test(mainContent)) stack.ormOdm = 'Dapper';
    }
    return stack;
  }

  // Go
  if (existsSync(join(dir, 'go.mod'))) {
    stack.language = 'Go';
    stack.packageManager = 'go modules';
    stack.testCommand = 'go test ./...';
    stack.buildCommand = 'go build ./...';
    stack.testingUnit = 'testing (stdlib)';
    const goMod = safeReadText(join(dir, 'go.mod'));
    if (/gin-gonic\/gin/.test(goMod)) stack.backendFramework = 'Gin';
    else if (/gofiber\/fiber/.test(goMod)) stack.backendFramework = 'Fiber';
    else if (/labstack\/echo/.test(goMod)) stack.backendFramework = 'Echo';
    else if (/go-chi\/chi/.test(goMod)) stack.backendFramework = 'chi';
    return stack;
  }

  // Rust
  if (existsSync(join(dir, 'Cargo.toml'))) {
    stack.language = 'Rust';
    stack.packageManager = 'Cargo';
    stack.testCommand = 'cargo test';
    stack.buildCommand = 'cargo build';
    stack.testingUnit = 'cargo test';
    const cargo = safeReadText(join(dir, 'Cargo.toml'));
    if (/\baxum\b/.test(cargo)) stack.backendFramework = 'Axum';
    else if (/\brocket\b/.test(cargo)) stack.backendFramework = 'Rocket';
    else if (/\bactix-web\b/.test(cargo)) stack.backendFramework = 'Actix-web';
    return stack;
  }

  // Ruby
  if (existsSync(join(dir, 'Gemfile'))) {
    stack.language = 'Ruby';
    stack.packageManager = 'Bundler';
    const gemfile = safeReadText(join(dir, 'Gemfile'));
    if (/\brails\b/i.test(gemfile)) stack.backendFramework = 'Rails';
    else if (/sinatra/i.test(gemfile)) stack.backendFramework = 'Sinatra';
    if (/rspec/i.test(gemfile)) stack.testingUnit = 'RSpec';
    else if (/minitest/i.test(gemfile)) stack.testingUnit = 'Minitest';
    stack.testCommand = stack.testingUnit === 'RSpec' ? 'bundle exec rspec' : 'bundle exec rake test';
    return stack;
  }

  return stack;
}

// ─── Template Personalization ────────────────────────────────────────────────
// Fresh-install only: rewrite knowzcode_project.md Stack table with detected
// values. Architecture template already ships as an empty stub so no rewrite
// needed there. Interactive personalization (Goal, preferences, etc.) is the
// /knowzcode:setup skill's responsibility.

const PROJECT_STACK_EMPTY_BLOCK = `| Language | | |
| Backend Framework | | |
| Frontend Framework | | |
| Database | | |
| ORM/ODM | | |
| Testing (Unit) | | |
| Testing (E2E) | | |
| Key Libraries | | |`;

function personalizeProjectFile(kcDir, stack) {
  const projectFile = join(kcDir, 'knowzcode_project.md');
  if (!existsSync(projectFile)) return false;
  const content = readFileSync(projectFile, 'utf8');
  if (!content.includes(PROJECT_STACK_EMPTY_BLOCK)) return false;
  const filled = [
    `| Language | ${stack.language} | |`,
    `| Backend Framework | ${stack.backendFramework} | |`,
    `| Frontend Framework | ${stack.frontendFramework} | |`,
    `| Database | ${stack.database} | |`,
    `| ORM/ODM | ${stack.ormOdm} | |`,
    `| Testing (Unit) | ${stack.testingUnit} | |`,
    `| Testing (E2E) | ${stack.testingE2E} | |`,
    `| Key Libraries | ${stack.keyLibraries} | |`,
  ].join('\n');
  writeFileSync(projectFile, content.replace(PROJECT_STACK_EMPTY_BLOCK, filled));
  return true;
}

function summarizeStack(stack) {
  const filled = [];
  const empty = [];
  const rows = [
    ['Language', stack.language],
    ['Backend', stack.backendFramework],
    ['Frontend', stack.frontendFramework],
    ['Database', stack.database],
    ['ORM/ODM', stack.ormOdm],
    ['Testing (Unit)', stack.testingUnit],
    ['Testing (E2E)', stack.testingE2E],
    ['Package Manager', stack.packageManager],
    ['Test Command', stack.testCommand],
    ['Build Command', stack.buildCommand],
  ];
  for (const [label, value] of rows) {
    if (value) filled.push(`${label}=${value}`);
    else empty.push(label);
  }
  return { filled, empty };
}

function hasCodexAdapterInstalled(dir) {
  return (
    isManagedCodexAdapter(join(dir, 'AGENTS.md')) ||
    existsSync(join(dir, '.agents', 'skills', CODEX_SKILL_MANIFEST))
  );
}

function hasPackagedClaudeComponents(dir) {
  const claudeDir = join(dir, '.claude');
  if (existsSync(join(claudeDir, CLAUDE_COMPONENT_MANIFEST))) return true;
  const packaged = packagedClaudeComponents();
  const agents = packaged.agents.some((entry) => isLegacyManagedClaudeComponent(
    join(claudeDir, 'agents', entry), entry, 'agent'
  ));
  const skills = packaged.skills.some((entry) => isLegacyManagedClaudeComponent(
    join(claudeDir, 'skills', entry), entry, 'skill'
  ));
  return agents || skills;
}

// ─── Claude Code Plugin Detection ────────────────────────────────────────────
// Reads ~/.claude/plugins/installed_plugins.json to decide whether the
// marketplace plugin is already providing /knowzcode:* skills + agents. When
// it is, the Claude branch of generateAdapters skips the .claude/skills/ and
// .claude/agents/ copy to avoid duplicating every command.

// Semver-style comparison. Returns negative if a<b, 0 if equal, positive if a>b.
// Treats non-numeric segments (pre-release tags, "unknown") as 0 and falls back
// to string compare when both sides lack numeric parts.
function compareVersions(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 0;
  const pa = String(a).split(/[.+-]/).map((s) => (/^\d+$/.test(s) ? parseInt(s, 10) : NaN));
  const pb = String(b).split(/[.+-]/).map((s) => (/^\d+$/.test(s) ? parseInt(s, 10) : NaN));
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = Number.isFinite(pa[i]) ? pa[i] : 0;
    const nb = Number.isFinite(pb[i]) ? pb[i] : 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

function findClaudePluginEntry(pluginId, targetDir) {
  if (!HOME_DIR || HOME_DIR === '~') return { installed: false };
  const registryPath = join(HOME_DIR, '.claude', 'plugins', 'installed_plugins.json');
  if (!existsSync(registryPath)) return { installed: false };
  const registry = safeReadJson(registryPath);
  const entries = registry?.plugins?.[pluginId];
  if (!Array.isArray(entries) || entries.length === 0) return { installed: false };
  // Preserve path case on case-sensitive filesystems. Lowercasing on Linux can
  // incorrectly activate a plugin installed for a different project whose
  // path differs only by case.
  const normalize = (p) => {
    if (!p) return '';
    const normalized = resolve(p);
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
  };
  const target = normalize(targetDir);
  const match = entries.find((e) => {
    if (!e) return false;
    if (e.scope === 'user') return true;
    if (e.scope === 'project' && normalize(e.projectPath) === target) return true;
    return false;
  });
  if (!match) return { installed: false };
  return { installed: true, entry: match };
}

function detectKnowzCodePlugin(targetDir) {
  const match = findClaudePluginEntry('knowzcode@knowz-skills', targetDir);
  if (!match.installed) return match;
  const { entry } = match;
  const version = typeof entry.version === 'string' && entry.version !== 'unknown' ? entry.version : null;
  const stale = version ? compareVersions(version, VERSION) < 0 : false;
  return { installed: true, scope: entry.scope, version: version || 'unknown', stale };
}

function detectKnowzPlugin(targetDir) {
  const match = findClaudePluginEntry('knowz@knowz-skills', targetDir);
  if (!match.installed) return match;
  return { installed: true, scope: match.entry.scope };
}

// Shared handler for the "plugin is active" branch — called from both
// generateAdapters (install) and cmdUpgrade. Warns on stale plugin versions,
// wires marketplace config, and cleans up any leftover local skills/agents.
async function applyPluginActivePath(dir, claudeDir, plugin, opts, adapterFiles) {
  if (plugin.stale) {
    log.warn(`KnowzCode plugin v${plugin.version} is older than this CLI (v${VERSION}).`);
    log.warn(`Run \`/plugin update knowzcode@knowz-skills\` in Claude Code to pick up new skills.`);
    log.warn(`Or re-run with --force-local-skills to copy bundled skills into .claude/ as an override.`);
  } else {
    log.info(`KnowzCode plugin detected (${plugin.scope} scope, v${plugin.version}) — skills and agents provided by plugin; skipping .claude/skills/ + .claude/agents/ copy.`);
  }
  setMarketplaceConfig(claudeDir);
  if (adapterFiles) adapterFiles.push(`${claudeDir}/ (skills & agents provided by plugin)`);
  await maybeCleanupLocalSkills(dir, opts);
}

// Remove .claude/skills/knowzcode-* and matching agents from prior npx installs
// after the marketplace plugin has taken over. Runs only when the plugin is
// detected (the caller gates this).
async function maybeCleanupLocalSkills(dir, opts) {
  const claudeDir = join(dir, '.claude');
  const skillsDir = join(claudeDir, 'skills');
  const agentsDir = join(claudeDir, 'agents');
  const manifest = readClaudeComponentManifest(claudeDir, { strict: true });
  if (!existsSync(manifest.manifestPath)) return;
  const dupSkills = manifest.skills.filter((entry) => existsSync(join(skillsDir, entry)));
  const dupAgents = manifest.agents.filter((entry) => existsSync(join(agentsDir, entry)));
  if (dupSkills.length === 0 && dupAgents.length === 0) {
    rmSync(manifest.manifestPath, { force: true });
    return;
  }
  const total = dupSkills.length + dupAgents.length;
  log.warn(`Found ${total} leftover item(s) from a prior npx install that now duplicate the plugin:`);
  for (const e of dupSkills) console.log(`    .claude/skills/${e}`);
  for (const f of dupAgents) console.log(`    .claude/agents/${f}`);
  const confirmed = opts.force || (await promptConfirm('Remove these duplicates?', true));
  if (!confirmed) {
    log.info('Skipped cleanup — duplicates remain.');
    return;
  }
  for (const e of dupSkills) rmSync(join(skillsDir, e), { recursive: true, force: true });
  for (const f of dupAgents) rmSync(join(agentsDir, f), { force: true });
  rmSync(manifest.manifestPath, { force: true });
  log.ok(`Removed ${total} duplicate item(s) from .claude/`);
}

// ─── Adapter Template Parser ─────────────────────────────────────────────────
// Returns Map<platformId, { primary: string, files: Map<relativePath, { content, lang }> }>

function injectVersion(content) {
  return content.replace(/vX\.Y\.Z/g, `v${VERSION}`);
}

function renderManagedGeneratedSurface(content, relativePath = '') {
  const rendered = injectVersion(content);
  if (hasGeneratedKnowzCodeMarker(rendered) || rendered.includes(MANAGED_CODEX_ADAPTER_MARKER)) {
    return rendered;
  }
  const marker = relativePath.endsWith('.toml')
    ? `# Generated by KnowzCode v${VERSION}`
    : `<!-- Generated by KnowzCode v${VERSION} -->`;
  if (/^---\r?\n/.test(rendered)) {
    return rendered.replace(/^(---\r?\n[\s\S]*?\r?\n---\r?\n)/, `$1${marker}\n`);
  }
  return `${marker}\n${rendered}`;
}

function isOwnedGeneratedSurface(path, packagedContent) {
  if (!existsSync(path) || !statSync(path).isFile()) return false;
  const installed = safeReadText(path);
  return hasGeneratedKnowzCodeMarker(installed)
    || installed.includes(MANAGED_CODEX_ADAPTER_MARKER)
    || installed === injectVersion(packagedContent);
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

function extractFirstFence(text, startFrom = 0) {
  const fenceRegex = /```([A-Za-z0-9_-]*)/g;
  fenceRegex.lastIndex = startFrom;
  const match = fenceRegex.exec(text);
  if (!match) return null;

  const lang = match[1] || '';
  const contentStart = text.indexOf('\n', match.index) + 1;
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
        return { content: text.slice(contentStart, nextFence), endIdx: afterBackticks, lang };
      }
      depth--;
    }
    pos = afterBackticks;
  }
  return null;
}

function looksLikeRelativeFilePath(value) {
  return /^[./\w-][^\r\n]*[\\/][^\r\n]+$/.test(value) || /^[./\w-]+\.[A-Za-z0-9_-]+$/.test(value);
}

function parseHeaderFileSections(section, headerRegex) {
  const headers = [];
  let match;
  while ((match = headerRegex.exec(section)) !== null) {
    if (looksLikeRelativeFilePath(match[1])) {
      headers.push({ filepath: match[1], index: match.index });
    }
  }

  const files = new Map();
  for (let i = 0; i < headers.length; i++) {
    const start = headers[i].index;
    const end = i + 1 < headers.length ? headers[i + 1].index : section.length;
    const subSection = section.slice(start, end);
    const fence = extractFirstFence(subSection);
    if (fence) {
      files.set(headers[i].filepath, { content: fence.content, lang: fence.lang || 'markdown' });
    }
  }

  return { headers, files };
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
  const { headers, files } = parseHeaderFileSections(section, /^#### ([^\r\n]+)$/gm);
  const firstHeaderIdx = headers.length > 0 ? headers[0].index : section.length;
  const primarySection = section.slice(0, firstHeaderIdx);
  const primaryFence = extractFence(primarySection, 'markdown');
  if (!primaryFence) return null;

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

  // Normalize CRLF so generated files are byte-identical across checkouts
  // (core.autocrlf on Windows would otherwise ship CRLF via npm pack).
  const content = readFileSync(adaptersPath, 'utf8').replace(/\r\n/g, '\n');
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

function copilotMcpTemplate(templateSet) {
  const template = templateSet?.files?.get?.('.vscode/mcp.json')?.content;
  if (typeof template !== 'string') return null;
  let parsed;
  try {
    parsed = JSON.parse(injectVersion(template));
  } catch (error) {
    throw new Error(`Packaged Copilot MCP template is invalid JSON: ${error.message}`);
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object'
      || !parsed.servers || Array.isArray(parsed.servers) || typeof parsed.servers !== 'object'
      || !parsed.servers.knowz || Array.isArray(parsed.servers.knowz) || typeof parsed.servers.knowz !== 'object'
      || !Array.isArray(parsed.inputs)
      || parsed.inputs.some((entry) => !entry || Array.isArray(entry) || typeof entry !== 'object'
        || typeof entry.id !== 'string' || !entry.id)) {
    throw new Error('Packaged Copilot MCP template must define servers.knowz and named inputs.');
  }
  return parsed;
}

function readCopilotMcpSettings(path) {
  if (!existsSync(path)) return { servers: {}, inputs: [] };
  let settings;
  try {
    settings = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot update Copilot MCP settings because ${path} is invalid JSON: ${error.message}`);
  }
  if (!settings || Array.isArray(settings) || typeof settings !== 'object'
      || (settings.servers !== undefined
        && (!settings.servers || Array.isArray(settings.servers) || typeof settings.servers !== 'object'))
      || (settings.inputs !== undefined && !Array.isArray(settings.inputs))
      || (Array.isArray(settings.inputs) && settings.inputs.some((entry) => (
        !entry || Array.isArray(entry) || typeof entry !== 'object' || typeof entry.id !== 'string'
      )))) {
    throw new Error(`Cannot update Copilot MCP settings because ${path} has an incompatible structure.`);
  }
  return settings;
}

function readCopilotMcpManifest(vscodeDir, { strict = false } = {}) {
  const manifestPath = join(vscodeDir, COPILOT_MCP_MANIFEST);
  if (!existsSync(manifestPath)) return { manifestPath, serverDigest: null, inputs: [] };
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (manifest?.schema !== COPILOT_MCP_MANIFEST_SCHEMA
        || manifest.owner !== 'knowzcode'
        || (manifest.server_digest !== null
          && (typeof manifest.server_digest !== 'string' || !/^[a-f0-9]{64}$/.test(manifest.server_digest)))
        || !Array.isArray(manifest.inputs)
        || manifest.inputs.some((entry) => !entry || typeof entry !== 'object'
          || typeof entry.id !== 'string' || !/^[a-z0-9_-]+$/.test(entry.id)
          || typeof entry.digest !== 'string' || !/^[a-f0-9]{64}$/.test(entry.digest))) {
      throw new TypeError('manifest must declare owned Copilot server/input entries');
    }
    return {
      manifestPath,
      serverDigest: manifest.server_digest,
      inputs: [...new Map(manifest.inputs.map((entry) => [entry.id, entry])).values()]
        .sort((left, right) => left.id.localeCompare(right.id)),
    };
  } catch (error) {
    if (strict) {
      throw new Error(`Cannot update managed Copilot MCP entries because ${manifestPath} is invalid: ${error.message}`);
    }
    return { manifestPath, serverDigest: null, inputs: [] };
  }
}

function copilotEntryDigest(entry) {
  return createHash('sha256').update(canonicalJson(entry)).digest('hex');
}

function preflightCopilotMcp(dir, templateSet) {
  const template = copilotMcpTemplate(templateSet);
  if (!template) return null;
  const vscodeDir = join(dir, '.vscode');
  const settingsPath = join(vscodeDir, 'mcp.json');
  assertDirectoryOrMissing(vscodeDir, 'the Copilot MCP configuration root', dir);
  assertFileOrMissing(settingsPath, 'the Copilot MCP settings target', dir);
  assertFileOrMissing(join(vscodeDir, COPILOT_MCP_MANIFEST),
    'the Copilot MCP ownership manifest target', dir);
  const settings = readCopilotMcpSettings(settingsPath);
  const manifest = readCopilotMcpManifest(vscodeDir, { strict: true });
  return { template, settingsPath, manifest };
}

function mergeCopilotMcpConfig(dir, templateSet) {
  const state = preflightCopilotMcp(dir, templateSet);
  if (!state) return false;
  const { template, settingsPath } = state;
  const settings = readCopilotMcpSettings(settingsPath);
  const manifest = readCopilotMcpManifest(dirname(settingsPath), { strict: true });
  const wasExactLegacy = existsSync(settingsPath)
    && JSON.stringify(settings) === JSON.stringify(template);
  const currentServer = settings.servers?.knowz;
  let serverOwned = wasExactLegacy || Boolean(
    currentServer && manifest.serverDigest === copilotEntryDigest(currentServer)
  );
  const inputDigests = new Map(manifest.inputs.map((entry) => [entry.id, entry.digest]));
  if (!settings.servers) settings.servers = {};
  if (serverOwned || !Object.hasOwn(settings.servers, 'knowz')) {
    settings.servers.knowz = template.servers.knowz;
    serverOwned = true;
  }
  if (!settings.inputs) settings.inputs = [];
  for (const expected of template.inputs) {
    const index = settings.inputs.findIndex((entry) => entry.id === expected.id);
    const ownsExisting = index >= 0
      && inputDigests.get(expected.id) === copilotEntryDigest(settings.inputs[index]);
    if (wasExactLegacy || ownsExisting) {
      if (index >= 0) settings.inputs[index] = expected;
      else settings.inputs.push(expected);
      inputDigests.set(expected.id, copilotEntryDigest(expected));
    } else if (index < 0) {
      settings.inputs.push(expected);
      inputDigests.set(expected.id, copilotEntryDigest(expected));
    } else {
      inputDigests.delete(expected.id);
    }
  }
  ensureDir(dirname(settingsPath));
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  writeFileSync(manifest.manifestPath, JSON.stringify({
    schema: COPILOT_MCP_MANIFEST_SCHEMA,
    owner: 'knowzcode',
    version: VERSION,
    server_digest: serverOwned ? copilotEntryDigest(settings.servers.knowz) : null,
    inputs: [...inputDigests.entries()]
      .map(([id, digest]) => ({ id, digest }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  }, null, 2) + '\n');
  return true;
}

function removeManagedCopilotMcpConfig(dir, templateSet) {
  const state = preflightCopilotMcp(dir, templateSet);
  if (!state) return false;
  const { settingsPath, manifest } = state;
  if (!existsSync(manifest.manifestPath)) return false;
  const settings = readCopilotMcpSettings(settingsPath);
  if (manifest.serverDigest && settings.servers?.knowz
      && manifest.serverDigest === copilotEntryDigest(settings.servers.knowz)) {
    delete settings.servers.knowz;
  }
  if (settings.servers && Object.keys(settings.servers).length === 0) delete settings.servers;
  if (Array.isArray(settings.inputs)) {
    const ownedInputs = new Map(manifest.inputs.map((entry) => [entry.id, entry.digest]));
    settings.inputs = settings.inputs.filter((entry) => (
      ownedInputs.get(entry.id) !== copilotEntryDigest(entry)
    ));
    if (settings.inputs.length === 0) delete settings.inputs;
  }
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  rmSync(manifest.manifestPath, { force: true });
  return true;
}

function assertNoSymlinkBelowBoundary(path, boundary, label) {
  if (!boundary) return;
  const root = resolve(boundary);
  const target = resolve(path);
  const rel = relative(root, target);
  if (rel === '..' || rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(rel)) {
    throw new Error(`Cannot install KnowzCode because ${label} escapes its mutation root: ${path}`);
  }
  let current = root;
  for (const segment of rel.split(/[\\/]+/).filter(Boolean)) {
    current = join(current, segment);
    try {
      if (lstatSync(current).isSymbolicLink()) {
        throw new Error(`Cannot install KnowzCode because ${label} traverses a symbolic link: ${current}`);
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
}

function assertDirectoryOrMissing(path, label, boundary = null) {
  assertNoSymlinkBelowBoundary(path, boundary, label);
  if (existsSync(path) && !statSync(path).isDirectory()) {
    throw new Error(`Cannot install KnowzCode because ${label} is not a directory: ${path}`);
  }
  let writableAncestor = path;
  while (!existsSync(writableAncestor)) {
    const parent = dirname(writableAncestor);
    if (parent === writableAncestor) break;
    writableAncestor = parent;
  }
  if (!existsSync(writableAncestor) || !statSync(writableAncestor).isDirectory()) {
    throw new Error(`Cannot install KnowzCode because ${label} has a non-directory ancestor: ${writableAncestor}`);
  }
  accessSync(writableAncestor, fsConstants.R_OK | fsConstants.W_OK);
}

function assertFileOrMissing(path, label, boundary = null) {
  assertNoSymlinkBelowBoundary(path, boundary, label);
  if (existsSync(path)) {
    if (!statSync(path).isFile()) {
      throw new Error(`Cannot install KnowzCode because ${label} is not a file: ${path}`);
    }
    accessSync(path, fsConstants.R_OK | fsConstants.W_OK);
    return;
  }
  assertDirectoryOrMissing(dirname(path), `${label} parent`, boundary);
}

function preflightFrameworkTarget(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new Error(`Target directory does not exist or is not a directory: ${dir}`);
  }
  accessSync(dir, fsConstants.R_OK | fsConstants.W_OK);
  const srcKc = join(PKG_ROOT, 'knowzcode');
  if (!existsSync(srcKc) || !statSync(srcKc).isDirectory()) {
    throw new Error(`Packaged KnowzCode framework is missing: ${srcKc}`);
  }
  const kcDir = join(dir, 'knowzcode');
  assertDirectoryOrMissing(kcDir, 'the framework target', dir);
  if (existsSync(kcDir)) {
    if (!isOwnedFrameworkDirectory(kcDir)) {
      throw new Error(
        `Cannot install or upgrade KnowzCode because the existing framework directory is not owned by this installer: ${kcDir}`
      );
    }
    for (const entry of ['specs', 'workgroups', 'prompts', 'contracts', 'enterprise']) {
      assertDirectoryOrMissing(join(kcDir, entry), `knowzcode/${entry}`, dir);
    }
  }
}

function preflightInstallFrameworkFiles(dir, preserveFiles) {
  const srcKc = join(PKG_ROOT, 'knowzcode');
  const kcDir = join(dir, 'knowzcode');
  const checkCopyTree = (sourceRoot, targetRoot, label) => {
    if (!existsSync(sourceRoot)) return;
    for (const sourceFile of listFilesRecursive(sourceRoot)) {
      assertFileOrMissing(join(targetRoot, relative(sourceRoot, sourceFile)), label, dir);
    }
  };

  assertFileOrMissing(join(kcDir, 'workgroups', 'README.md'), 'the WorkGroup README target', dir);
  for (const entry of readdirSync(srcKc, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (entry.name === 'knowzcode_tracker.md' || entry.name === 'knowzcode_log.md') continue;
    const destinationName = entry.name === 'gitignore.template' ? '.gitignore' : entry.name;
    const destination = join(kcDir, destinationName);
    if (preserveFiles.has(entry.name) && existsSync(destination)) continue;
    assertFileOrMissing(destination, `the framework file target ${destinationName}`, dir);
  }
  checkCopyTree(join(srcKc, 'prompts'), join(kcDir, 'prompts'), 'a framework prompt target');
  assertFileOrMissing(join(kcDir, 'specs', 'Readme.md'), 'the framework specs readme target', dir);
  checkCopyTree(join(srcKc, 'contracts'), join(kcDir, 'contracts'), 'a framework contract target');
  checkCopyTree(join(srcKc, 'enterprise'), join(kcDir, 'enterprise'), 'an enterprise framework target');
  checkCopyTree(join(PKG_ROOT, 'docs'), join(kcDir, 'docs'), 'a framework documentation target');
  for (const entry of ['knowzcode_tracker.md', 'knowzcode_log.md']) {
    const destination = join(kcDir, entry);
    if (preserveFiles.has(entry) && existsSync(destination)) continue;
    assertFileOrMissing(destination, `the framework state target ${entry}`, dir);
  }
  assertFileOrMissing(join(kcDir, '.knowzcode-version'), 'the framework version target', dir);
}

function preflightUpgradeFrameworkFiles(dir, preserveFiles) {
  const srcKc = join(PKG_ROOT, 'knowzcode');
  const kcDir = join(dir, 'knowzcode');
  for (const entry of readdirSync(srcKc, { withFileTypes: true })) {
    if (!entry.isFile() || preserveFiles.has(entry.name)) continue;
    const destinationName = entry.name === 'gitignore.template' ? '.gitignore' : entry.name;
    assertFileOrMissing(join(kcDir, destinationName), `the upgraded framework target ${destinationName}`, dir);
  }
  for (const [sourceRoot, entry] of [
    [srcKc, 'prompts'],
    [srcKc, 'contracts'],
    [srcKc, 'enterprise'],
    [PKG_ROOT, 'docs'],
  ]) {
    if (existsSync(join(sourceRoot, entry))) {
      assertDirectoryOrMissing(join(kcDir, entry), `the upgraded framework directory ${entry}`, dir);
    }
  }
  assertFileOrMissing(join(kcDir, '.knowzcode-version'), 'the upgraded framework version target', dir);
}

function preflightAdapterGeneration(dir, selectedPlatforms, opts, preparedTemplates = null) {
  preflightFrameworkTarget(dir);
  const templates = preparedTemplates ?? parseAdapterTemplates();
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (opts.global && (!homeDir || homeDir === '~')) {
    throw new Error('Global installation requires HOME or USERPROFILE to resolve to an explicit directory.');
  }
  const unsupportedGlobalPlatforms = opts.global
    ? selectedPlatforms.filter((platform) => platform !== 'claude' && platform !== 'codex')
    : [];
  if (unsupportedGlobalPlatforms.length > 0) {
    throw new Error(
      `Global installation supports only Claude and Codex; install ${unsupportedGlobalPlatforms.join(', ')} into an explicit project target.`
    );
  }
  if (opts.global) {
    assertDirectoryOrMissing(homeDir, 'the global home', homeDir);
    if (existsSync(homeDir)) accessSync(homeDir, fsConstants.R_OK | fsConstants.W_OK);
  }

  for (const platformId of selectedPlatforms) {
    if (!(platformId in PLATFORMS)) throw new Error(`Unknown platform: ${platformId}`);
    if (platformId !== 'claude' && !templates.has(platformId)) {
      throw new Error(`Packaged adapter template is missing for ${PLATFORMS[platformId].name}.`);
    }
    if (platformId !== 'claude') {
      const templateSet = templates.get(platformId);
      if (!(platformId === 'codex' && opts.global)) {
        const adapterPath = PLATFORMS[platformId].adapterPath(dir);
        assertFileOrMissing(adapterPath, `${PLATFORMS[platformId].name} adapter target`, dir);
        if (platformId !== 'codex' && existsSync(adapterPath)
            && !isOwnedGeneratedSurface(adapterPath, templateSet.primary)) {
          throw new Error(
            `Cannot install KnowzCode because the unowned ${PLATFORMS[platformId].name} adapter already exists: ${adapterPath}`
          );
        }
      }
      for (const [relativePath, { content, lang }] of templateSet.files) {
        const targetPath = opts.global && relativePath.startsWith('.agents/skills/')
          ? join(homeDir, relativePath)
          : join(dir, relativePath);
        assertFileOrMissing(
          targetPath,
          `${PLATFORMS[platformId].name} generated target`,
          opts.global && relativePath.startsWith('.agents/skills/') ? homeDir : dir
        );
        if (existsSync(targetPath)
            && platformId !== 'codex'
            && lang !== 'json'
            && !isOwnedGeneratedSurface(targetPath, content)) {
          throw new Error(
            `Cannot install KnowzCode because the unowned ${PLATFORMS[platformId].name} generated target already exists: ${targetPath}`
          );
        }
      }
    }
  }

  if (selectedPlatforms.includes('copilot')) {
    preflightCopilotMcp(dir, templates.get('copilot'));
  }

  if (selectedPlatforms.includes('claude')) {
    const claudeDir = opts.global ? join(homeDir, '.claude') : join(dir, '.claude');
    const claudeBoundary = opts.global ? homeDir : dir;
    assertDirectoryOrMissing(claudeDir, 'the Claude configuration target', claudeBoundary);
    assertDirectoryOrMissing(join(claudeDir, 'agents'), 'the Claude agent target', claudeBoundary);
    assertDirectoryOrMissing(join(claudeDir, 'skills'), 'the Claude skill target', claudeBoundary);
    assertFileOrMissing(join(claudeDir, CLAUDE_COMPONENT_MANIFEST), 'the Claude ownership manifest target', claudeBoundary);
    const manifest = readClaudeComponentManifest(claudeDir, { strict: true });
    const willCopyComponents = opts.forceLocalSkills || opts.global || !detectKnowzCodePlugin(dir).installed;
    if (willCopyComponents) {
      const packaged = packagedClaudeComponents();
      for (const entry of packaged.agents) {
        const targetPath = join(claudeDir, 'agents', entry);
        assertFileOrMissing(targetPath, 'the Claude generated agent target', claudeBoundary);
        if (existsSync(targetPath) && !manifest.agents.includes(entry)
            && !isLegacyManagedClaudeComponent(targetPath, entry, 'agent')) {
          throw new Error(`Cannot install KnowzCode because the unowned Claude agent target already exists: ${targetPath}`);
        }
      }
      for (const entry of packaged.skills) {
        const targetPath = join(claudeDir, 'skills', entry);
        assertDirectoryOrMissing(targetPath, 'the Claude generated skill target', claudeBoundary);
        if (existsSync(targetPath) && !manifest.skills.includes(entry)
            && !isLegacyManagedClaudeComponent(targetPath, entry, 'skill')) {
          throw new Error(`Cannot install KnowzCode because the unowned Claude skill target already exists: ${targetPath}`);
        }
        const sourcePath = join(PKG_ROOT, 'skills', entry);
        for (const sourceFile of listFilesRecursive(sourcePath)) {
          assertFileOrMissing(
            join(targetPath, relative(sourcePath, sourceFile)),
            'the Claude generated skill file target',
            claudeBoundary
          );
        }
      }
    }
    assertFileOrMissing(join(claudeDir, 'settings.json'),
      'the Claude marketplace settings target', claudeBoundary);
    readMarketplaceSettings(claudeDir);
    if (opts.agentTeams) readAgentTeamsSettings(claudeDir, opts.global);
  }

  if (selectedPlatforms.includes('gemini') && !opts.global) {
    const geminiDir = join(dir, '.gemini');
    assertDirectoryOrMissing(geminiDir, 'the Gemini configuration target', dir);
    const settingsPath = join(geminiDir, 'settings.json');
    assertFileOrMissing(settingsPath, 'the Gemini settings target', dir);
    assertFileOrMissing(join(geminiDir, GEMINI_MCP_MANIFEST),
      'the Gemini MCP ownership manifest target', dir);
    assertFileOrMissing(join(geminiDir, KNOWZ_GEMINI_MCP_MANIFEST),
      'the shared Knowz Gemini MCP ownership manifest', dir);
    readGeminiMcpManifest(settingsPath, { strict: true });
    if (existsSync(settingsPath)) readGeminiSettingsForMutation(settingsPath);
  }

  if (selectedPlatforms.includes('codex')) {
    const agentsRoot = opts.global ? join(homeDir, '.agents') : join(dir, '.agents');
    const skillRoot = join(agentsRoot, 'skills');
    const codexBoundary = opts.global ? homeDir : dir;
    assertDirectoryOrMissing(agentsRoot, 'the Codex agent target', codexBoundary);
    assertDirectoryOrMissing(skillRoot, 'the Codex skill target', codexBoundary);
    assertFileOrMissing(join(skillRoot, CODEX_SKILL_MANIFEST), 'the Codex ownership manifest target', codexBoundary);
    const manifest = readCodexSkillManifest(skillRoot, { strict: true });
    const manifestEntries = new Set(manifest.entries);
    for (const entry of codexSkillNames(templates.get('codex'))) {
      const existing = join(skillRoot, entry);
      if (existsSync(existing) && !manifestEntries.has(entry)
          && !isLegacyManagedCodexSkill(skillRoot, entry, templates.get('codex'))) {
        throw new Error(
          `Cannot install KnowzCode because the unowned Codex skill target already exists: ${existing}. `
          + 'The existing entry was preserved unchanged; move it or explicitly adopt it before retrying.'
        );
      }
    }
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

function localKnowzAgentRoles(claudeDir) {
  const roles = new Set();
  for (const role of ['reader', 'writer']) {
    const path = join(claudeDir, 'agents', `${role}.md`);
    if (!existsSync(path) || !lstatSync(path).isFile()) continue;
    const content = safeReadText(path);
    const ownedFrontmatter = new RegExp(`^---\\r?\\n[\\s\\S]*?^name:\\s*${role}\\s*$[\\s\\S]*?^description:\\s*["']Knowz:`, 'm');
    const ownedHeading = new RegExp(`^# Knowz ${role[0].toUpperCase()}${role.slice(1)}\\s*$`, 'm');
    if (ownedFrontmatter.test(content) && ownedHeading.test(content)) roles.add(role);
  }
  return roles;
}

function localizeClaudeSkillContent(content, {
  localKnowzRoles = new Set(),
  claudeResourceRoot = '.claude',
  projectResourceRoot = '.',
} = {}) {
  const ownRoles = new Set(packagedClaudeComponents().agents.map((entry) => entry.replace(/\.md$/, '')));
  const normalizedClaudeRoot = claudeResourceRoot.replace(/\\/g, '/').replace(/\/$/, '');
  const normalizedProjectRoot = projectResourceRoot.replace(/\\/g, '/').replace(/\/$/, '');
  let localized = content.replace(
    /\$\{CLAUDE_PLUGIN_ROOT\}\/([A-Za-z0-9._/-]+)/g,
    (match, resource) => {
      if (resource.startsWith('skills/') || resource.startsWith('agents/')) {
        return `${normalizedClaudeRoot}/${resource}`;
      }
      if (resource.startsWith('docs/')) return `${normalizedProjectRoot}/knowzcode/${resource}`;
      return match;
    }
  );
  localized = localized.replace(/\bknowzcode:([a-z0-9-]+)\b/g, (match, role) => (
    ownRoles.has(role) ? role : match
  ));
  localized = localized.replace(/\bknowz:(reader|writer)\b/g, (match, role) => (
    localKnowzRoles.has(role) ? role : match
  ));
  // A wildcard is prose, not an invocable command. Translate it explicitly so
  // a local install never advertises the invalid bare command `/*`.
  localized = localized.replace(/\/knowzcode:\*/g, 'a local KnowzCode slash command');
  return localized.replace(/\/knowzcode:([a-z0-9-]+)\b/g, '/$1');
}

function copyLocalizedClaudeSkills(src, dst, localization = {}) {
  ensureDir(dst);
  if (!existsSync(src)) return;
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name);
    const dstPath = join(dst, entry.name);
    if (entry.isDirectory()) copyLocalizedClaudeSkills(srcPath, dstPath, localization);
    else {
      const content = readFileSync(srcPath);
      writeFileSync(dstPath, entry.name.endsWith('.md') ? localizeClaudeSkillContent(content.toString('utf8'), localization) : content);
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

function readMarketplaceSettings(claudeDir) {
  const settingsFile = join(claudeDir, 'settings.json');
  let settings = {};

  if (existsSync(settingsFile)) {
    try {
      settings = JSON.parse(readFileSync(settingsFile, 'utf8'));
    } catch (error) {
      throw new Error(
        `Cannot update the Claude marketplace because ${settingsFile} is not valid JSON. `
        + `The existing file was preserved unchanged: ${error.message}`
      );
    }
  }

  if (settings === null || Array.isArray(settings) || typeof settings !== 'object') {
    throw new Error(
      `Cannot update the Claude marketplace because ${settingsFile} must contain a JSON object. `
      + 'The existing file was preserved unchanged.'
    );
  }
  if (
    settings.extraKnownMarketplaces !== undefined
    && (
      settings.extraKnownMarketplaces === null
      || Array.isArray(settings.extraKnownMarketplaces)
      || typeof settings.extraKnownMarketplaces !== 'object'
    )
  ) {
    throw new Error(
      `Cannot update the Claude marketplace because extraKnownMarketplaces in ${settingsFile} must be a JSON object. `
      + 'The existing file was preserved unchanged.'
    );
  }

  return { settingsFile, settings };
}

function setMarketplaceConfig(claudeDir) {
  const { settingsFile, settings } = readMarketplaceSettings(claudeDir);
  ensureDir(claudeDir);

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

function removeMarketplaceConfig(claudeDir, targetDir) {
  const settingsFile = join(claudeDir, 'settings.json');
  if (!existsSync(settingsFile)) return;

  try {
    const settings = JSON.parse(readFileSync(settingsFile, 'utf8'));
    const marketplaces = settings?.extraKnownMarketplaces;
    // `knowz-skills` is shared by the Knowz and KnowzCode plugins. Keep it when
    // the Knowz plugin is still active for this user/project.
    const keepSharedMarketplace = detectKnowzPlugin(targetDir).installed
      || detectKnowzCodePlugin(targetDir).installed;
    const ownedKeys = [
      ...(keepSharedMarketplace ? [] : ['knowz-skills']),
      'knowz-plugins',
      'knowzcode-marketplace',
      'knowzcode',
    ];
    if (marketplaces && typeof marketplaces === 'object' && !Array.isArray(marketplaces)
        && ownedKeys.some((key) => Object.hasOwn(marketplaces, key))) {
      for (const key of ownedKeys) delete marketplaces[key];
      writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + '\n');
    }
  } catch {
    // Ignore parse errors
  }
}

// ─── Gemini MCP Config Helpers ────────────────────────────────────────────────

function readGeminiSettingsForMutation(settingsPath) {
  let settings = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    } catch (error) {
      throw new Error(
        `Cannot update Gemini MCP settings because ${settingsPath} is not valid JSON. `
        + `The existing file was preserved unchanged: ${error.message}`
      );
    }
  }
  if (settings === null || Array.isArray(settings) || typeof settings !== 'object') {
    throw new Error(
      `Cannot update Gemini MCP settings because ${settingsPath} must contain a JSON object. `
      + 'The existing file was preserved unchanged.'
    );
  }
  if (settings.mcpServers !== undefined
      && (settings.mcpServers === null || Array.isArray(settings.mcpServers) || typeof settings.mcpServers !== 'object')) {
    throw new Error(
      `Cannot update Gemini MCP settings because mcpServers in ${settingsPath} must be a JSON object. `
      + 'The existing file was preserved unchanged.'
    );
  }
  if (settings.mcpServers?.knowz !== undefined
      && (settings.mcpServers.knowz === null
        || Array.isArray(settings.mcpServers.knowz)
        || typeof settings.mcpServers.knowz !== 'object')) {
    throw new Error(
      `Cannot update Gemini MCP settings because mcpServers.knowz in ${settingsPath} must be a JSON object. `
      + 'The existing file was preserved unchanged.'
    );
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

function readGeminiMcpManifest(settingsPath, {
  strict = false,
  owner = 'knowzcode',
} = {}) {
  const isKnowz = owner === 'knowz';
  const manifestPath = join(
    dirname(settingsPath),
    isKnowz ? KNOWZ_GEMINI_MCP_MANIFEST : GEMINI_MCP_MANIFEST
  );
  if (!existsSync(manifestPath)) return { manifestPath, digest: null };
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const schema = isKnowz
      ? KNOWZ_GEMINI_MCP_MANIFEST_SCHEMA
      : GEMINI_MCP_MANIFEST_SCHEMA;
    if (manifest?.schema !== schema
        || manifest.owner !== owner
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
    owner: 'knowzcode',
    version: VERSION,
    entry_digest: digest,
  }, null, 2) + '\n');
}

function hasKnowzGeminiInstallation(settingsPath) {
  const projectDir = dirname(dirname(settingsPath));
  const manifestPath = join(dirname(settingsPath), 'commands', 'knowz', '.knowz-managed.json');
  const commandPath = join(dirname(settingsPath), 'commands', 'knowz', 'ask.toml');
  try {
    assertNoSymlinkBelowBoundary(manifestPath, projectDir, 'the shared Knowz Gemini command manifest');
    assertNoSymlinkBelowBoundary(commandPath, projectDir, 'the shared Knowz Gemini command');
    const manifestStat = lstatSync(manifestPath);
    const commandStat = lstatSync(commandPath);
    if (!manifestStat.isFile() || manifestStat.isSymbolicLink()
        || !commandStat.isFile() || commandStat.isSymbolicLink()) return false;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    return manifest?.schema === 'knowz.gemini-command-ownership/v1'
      && manifest.owner === 'knowz'
      && Array.isArray(manifest.entries)
      && manifest.entries.includes('ask.toml')
      // Tolerate CRLF: earlier Knowz releases installed commands with CRLF on Windows.
      && readFileSync(commandPath, 'utf8').replace(/\r\n/g, '\n').startsWith('# .gemini/commands/knowz/ask.toml\n');
  } catch {
    return false;
  }
}

function claimSharedGeminiMcpEntry(settingsPath) {
  const settings = readGeminiSettingsForMutation(settingsPath);
  const current = settings.mcpServers?.knowz;
  if (!current) return false;
  const currentDigest = geminiEntryDigest(current);
  const manifest = readGeminiMcpManifest(settingsPath, { strict: true });
  if (manifest.digest === currentDigest) return true;
  const knowzManifest = readGeminiMcpManifest(settingsPath, {
    strict: false,
    owner: 'knowz',
  });
  if (!hasKnowzGeminiInstallation(settingsPath)
      || knowzManifest.digest !== currentDigest) return false;
  ensureDir(dirname(settingsPath));
  writeGeminiMcpManifest(manifest.manifestPath, currentDigest);
  log.info('Shared custody of the verified Knowz-owned Gemini MCP configuration.');
  return true;
}

function writeOwnedGeminiMcpEntry(settingsPath, entry) {
  const settings = readGeminiSettingsForMutation(settingsPath);
  const manifest = readGeminiMcpManifest(settingsPath, { strict: true });
  const current = settings.mcpServers?.knowz;
  const ownsCurrent = Boolean(current && manifest.digest === geminiEntryDigest(current));
  if (ownsCurrent) {
    const knowzManifest = readGeminiMcpManifest(settingsPath, {
      strict: false,
      owner: 'knowz',
    });
    if (knowzManifest.digest === geminiEntryDigest(current)
        && hasKnowzGeminiInstallation(settingsPath)) {
      log.info('Preserved co-owned Gemini Knowz MCP configuration.');
      return 'shared';
    }
  }
  if (current && !ownsCurrent) {
    if (claimSharedGeminiMcpEntry(settingsPath)) return 'shared';
    // Another Knowz surface or the user owns this shared entry. Relinquish any
    // stale claim and preserve the entry byte-for-byte.
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

function reportGeminiMcpWrite(outcome, successMessage) {
  if (outcome === 'shared') {
    log.info('Gemini MCP request not applied because the existing entry has active shared custody; preserved it unchanged.');
    return false;
  }
  if (outcome === 'preserved') {
    log.warn('Gemini MCP request not applied because the existing entry is unowned; preserved it unchanged.');
    return false;
  }
  log.ok(successMessage);
  return true;
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
  const manifest = readGeminiMcpManifest(settingsPath, { strict: true });
  if (!manifest.digest) return false;
  const settings = readGeminiSettingsForMutation(settingsPath);
  const current = settings.mcpServers?.knowz;
  const ownsCurrent = Boolean(current && manifest.digest === geminiEntryDigest(current));
  const knowzManifest = readGeminiMcpManifest(settingsPath, {
    strict: false,
    owner: 'knowz',
  });
  const knowzOwnsCurrent = Boolean(
    current && knowzManifest.digest === geminiEntryDigest(current)
  );
  let removedEntry = false;
  if (ownsCurrent && !(knowzOwnsCurrent && hasKnowzGeminiInstallation(settingsPath))) {
    delete settings.mcpServers.knowz;
    if (Object.keys(settings.mcpServers).length === 0) delete settings.mcpServers;
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
    removedEntry = true;
  }
  rmSync(manifest.manifestPath, { force: true });
  return removedEntry;
}

function updateOwnedGeminiMcpEndpoint(settingsPath, endpoint) {
  const manifest = readGeminiMcpManifest(settingsPath, { strict: true });
  if (!manifest.digest) return false;
  const settings = readGeminiSettingsForMutation(settingsPath);
  const current = settings.mcpServers?.knowz;
  if (!current || manifest.digest !== geminiEntryDigest(current)) return false;
  const knowzManifest = readGeminiMcpManifest(settingsPath, {
    strict: false,
    owner: 'knowz',
  });
  if (knowzManifest.digest === geminiEntryDigest(current)
      && hasKnowzGeminiInstallation(settingsPath)) return false;
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
KnowzCode framework installed via \`npx @knowzai/knowzcode\`.
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

function readAgentTeamsSettings(claudeDir, isGlobal) {
  const settingsFile = join(claudeDir, isGlobal ? 'settings.json' : 'settings.local.json');

  let settings = {};
  if (existsSync(settingsFile)) {
    try {
      settings = JSON.parse(readFileSync(settingsFile, 'utf8'));
    } catch (error) {
      throw new Error(
        `Cannot enable Agent Teams because ${settingsFile} is not valid JSON. `
        + `The existing file was preserved unchanged: ${error.message}`
      );
    }
  }

  if (settings === null || Array.isArray(settings) || typeof settings !== 'object') {
    throw new Error(
      `Cannot enable Agent Teams because ${settingsFile} must contain a JSON object. `
      + 'The existing file was preserved unchanged.'
    );
  }
  if (settings.env !== undefined && (settings.env === null || Array.isArray(settings.env) || typeof settings.env !== 'object')) {
    throw new Error(
      `Cannot enable Agent Teams because env in ${settingsFile} must be a JSON object. `
      + 'The existing file was preserved unchanged.'
    );
  }

  return { settingsFile, settings };
}

function enableAgentTeams(claudeDir, isGlobal) {
  const { settingsFile, settings } = readAgentTeamsSettings(claudeDir, isGlobal);
  ensureDir(claudeDir);

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
    claude: () => hasPackagedClaudeComponents(dir),
    codex: () => hasCodexAdapterInstalled(dir),
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
  const templates = parseAdapterTemplates();
  const ownsPrimary = (id, path) => {
    const primary = templates.get(id)?.primary;
    return typeof primary === 'string' && isOwnedGeneratedSurface(path, primary);
  };
  const checks = {
    claude: () => hasPackagedClaudeComponents(dir),
    codex: () => hasCodexAdapterInstalled(dir),
    gemini: () => ownsPrimary('gemini', join(dir, 'GEMINI.md')),
    cursor: () => ownsPrimary('cursor', join(dir, '.cursor', 'rules', 'knowzcode.mdc')),
    copilot: () => ownsPrimary('copilot', join(dir, '.github', 'copilot-instructions.md')),
    windsurf: () => ownsPrimary('windsurf', join(dir, '.windsurf', 'rules', 'knowzcode.md')),
  };
  return checks[platformId] ? checks[platformId]() : false;
}

// ─── Adapter Generation (shared helper) ──────────────────────────────────────

async function generateAdapters(dir, selectedPlatforms, opts, preparedTemplates = null) {
  const templates = preflightAdapterGeneration(dir, selectedPlatforms, opts, preparedTemplates);
  const adapterFiles = [];
  let agentTeamsEnabled = false;
  let claudePluginActive = false;
  let claudePluginStale = false;

  for (const platformId of selectedPlatforms) {
    const platform = PLATFORMS[platformId];

    if (platformId === 'claude') {
      const claudeDir = opts.global ? join(process.env.HOME || process.env.USERPROFILE || '~', '.claude') : join(dir, '.claude');
      const plugin = opts.forceLocalSkills || opts.global ? { installed: false } : detectKnowzCodePlugin(dir);

      log.info(`Installing Claude Code components to ${claudeDir}/`);

      if (plugin.installed) {
        claudePluginActive = !plugin.stale;
        claudePluginStale = plugin.stale;
        await applyPluginActivePath(dir, claudeDir, plugin, opts, adapterFiles);
      } else {
        prepareManagedClaudeComponentsForCopy(claudeDir);
        const knowzPlugin = detectKnowzPlugin(dir);
        const localKnowzRoles = knowzPlugin.installed ? new Set() : localKnowzAgentRoles(claudeDir);
        const claudeResourceRoot = claudeDir;
        copyLocalizedClaudeSkills(join(PKG_ROOT, 'agents'), join(claudeDir, 'agents'), {
          localKnowzRoles,
          claudeResourceRoot,
          projectResourceRoot: dir,
        });
        copyLocalizedClaudeSkills(join(PKG_ROOT, 'skills'), join(claudeDir, 'skills'), {
          localKnowzRoles,
          claudeResourceRoot,
          projectResourceRoot: dir,
        });
        markManagedClaudeComponents(claudeDir);
        writeClaudeComponentManifest(claudeDir);
        setMarketplaceConfig(claudeDir);
        adapterFiles.push(claudeDir + '/agents/', claudeDir + '/skills/');
      }
    } else {
      const templateSet = templates.get(platformId);
      if (!templateSet) {
        log.warn(`No adapter template found for ${platform.name} — skipping`);
        continue;
      }

      const adapterFile = platform.adapterPath(dir);
      const skipGlobalCodexPrimary = opts.global && platformId === 'codex';
      const unmanagedCodexAdapter = platformId === 'codex'
        && existsSync(adapterFile)
        && !isManagedCodexAdapter(adapterFile);
      if (skipGlobalCodexPrimary) {
        log.info('Global Codex install updates HOME skills only; project AGENTS.md is unchanged.');
      } else if (unmanagedCodexAdapter) {
        log.warn(`Preserved unmanaged AGENTS.md unchanged: ${adapterFile}`);
        log.info('Codex skills remain the command surface; add the optional KnowzCode AGENTS summary manually if desired.');
      } else {
        ensureDir(dirname(adapterFile));
        writeFileSync(adapterFile, renderManagedGeneratedSurface(templateSet.primary));
        adapterFiles.push(adapterFile);
        log.ok(`${platform.name} adapter: ${adapterFile}`);
      }

      for (const [relativePath, { content }] of templateSet.files) {
        if (platformId === 'copilot' && relativePath === '.vscode/mcp.json') continue;
        let filePath;
        if (opts.global && relativePath.startsWith('.agents/skills/')) {
          const homeDir = process.env.HOME || process.env.USERPROFILE || '~';
          filePath = join(homeDir, relativePath);
        } else {
          filePath = join(dir, relativePath);
        }
        ensureDir(dirname(filePath));
        writeFileSync(
          filePath,
          relativePath.endsWith('.json')
            ? injectVersion(content)
            : renderManagedGeneratedSurface(content, relativePath)
        );
        adapterFiles.push(filePath);
      }
      if (templateSet.files.size > 0) {
        log.ok(`  + ${templateSet.files.size} additional file(s)`);
      }

      if (platformId === 'copilot') {
        mergeCopilotMcpConfig(dir, templateSet);
      }

      if (platformId === 'codex') {
        const homeDir = process.env.HOME || process.env.USERPROFILE;
        const skillRoot = opts.global
          ? join(homeDir, '.agents', 'skills')
          : join(dir, '.agents', 'skills');
        reconcileManagedCodexSkills(skillRoot, codexSkillNames(templateSet));
      }
    }
  }

  // Gemini MCP config offer (OAuth default)
  if (selectedPlatforms.includes('gemini') && !opts.global) {
    const settingsPath = join(dir, '.gemini', 'settings.json');

    if (opts.mcpKey) {
      // --mcp-key flag: explicit API key mode, skip prompts
      reportGeminiMcpWrite(
        writeGeminiMcpConfig(settingsPath, opts.mcpKey, dir, opts.mcpEndpoint),
        `Gemini MCP configured with API key in .gemini/settings.json (${opts.mcpEndpoint || MCP_ENDPOINT})`
      );
    } else if (opts.force) {
      // --force without --mcp-key: write OAuth config (default)
      const applied = reportGeminiMcpWrite(
        writeGeminiMcpOAuthConfig(settingsPath, opts.mcpEndpoint),
        `Gemini MCP configured with OAuth in .gemini/settings.json (${opts.mcpEndpoint || MCP_ENDPOINT})`
      );
      if (applied) log.info('Run /mcp auth knowz in Gemini CLI to complete authentication.');
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
          // Claim only when the existing entry is proven to be owned by the
          // installed Knowz package; arbitrary user entries remain unclaimed.
          claimSharedGeminiMcpEntry(settingsPath);
          // Update endpoint if user selected a different one
          if (opts.mcpEndpoint && existsSync(settingsPath)) {
            if (updateOwnedGeminiMcpEndpoint(settingsPath, opts.mcpEndpoint)) {
              log.ok(`Keeping auth config, updated endpoint to ${opts.mcpEndpoint}`);
              log.info('Run /mcp auth knowz in Gemini CLI to re-authenticate with the new endpoint.');
            } else {
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
          const applied = reportGeminiMcpWrite(
            writeGeminiMcpOAuthConfig(settingsPath, opts.mcpEndpoint),
            `Gemini MCP configured with OAuth (${opts.mcpEndpoint || MCP_ENDPOINT})`
          );
          if (applied) log.info('Run /mcp auth knowz in Gemini CLI to complete authentication.');
        } else {
          // Fall back to API key entry
          let keyDone = false;
          if (discovered?.key) {
            const suffix = discovered.key.slice(-4);
            log.info(`Found API key from ${discovered.source} (ending ...${suffix})`);
            const useIt = await promptConfirm('Use this key?', true);
            if (useIt) {
              reportGeminiMcpWrite(
                writeGeminiMcpConfig(settingsPath, discovered.key, dir, opts.mcpEndpoint),
                `Gemini MCP configured with API key in .gemini/settings.json (${opts.mcpEndpoint || MCP_ENDPOINT})`
              );
              keyDone = true;
            }
          }
          if (!keyDone) {
            const rl = createInterface({ input: process.stdin, output: process.stdout });
            const apiKey = await rl.question(`Enter your ${BRAND} API key (or press Enter to skip): `);
            rl.close();
            if (apiKey.trim()) {
              reportGeminiMcpWrite(
                writeGeminiMcpConfig(settingsPath, apiKey.trim(), dir, opts.mcpEndpoint),
                `Gemini MCP configured with API key in .gemini/settings.json (${opts.mcpEndpoint || MCP_ENDPOINT})`
              );
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
  if (opts.agentTeams && selectedPlatforms.includes('claude')) {
    enableAgentTeams(agentTeamsClaudeDir, opts.global);
    agentTeamsEnabled = true;
  } else if (opts.agentTeams) {
    log.warn('--agent-teams applies only when the Claude platform is selected; no Claude settings were changed.');
  } else if (selectedPlatforms.includes('claude') && !opts.force) {
    log.info('Agent Teams remains disabled by default; use --agent-teams only when peer coordination is needed.');
  }

  return { adapterFiles, agentTeamsEnabled, claudePluginActive, claudePluginStale };
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
    console.log(`  No platforms detected. Run ${c.cyan}npx @knowzai/knowzcode install${c.reset} to set up.`);
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

  // Resolve every requested platform and validate all mutation targets/settings
  // before writing the framework. A failed preflight must leave the project and
  // user configuration byte-for-byte unchanged.
  const detected = detectPlatforms(dir);
  let selectedPlatforms;
  if (opts.platforms.length > 0) {
    if (opts.platforms.includes('all')) {
      selectedPlatforms = Object.keys(PLATFORMS);
    } else {
      selectedPlatforms = opts.platforms.filter((p) => p in PLATFORMS);
    }
  } else if (opts.force && opts.platforms.length === 0 && !isReinstall) {
    selectedPlatforms = detected;
  } else if (opts.force && opts.platforms.length === 0 && isReinstall) {
    const scan = scanExistingInstallation(kcDir, dir);
    selectedPlatforms = scan.installedPlatforms.length > 0 ? scan.installedPlatforms : detected;
  } else {
    selectedPlatforms = await promptPlatforms(detected);
  }
  const preparedTemplates = preflightAdapterGeneration(dir, selectedPlatforms, opts);
  preflightInstallFrameworkFiles(dir, preserveFiles);

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

  // Copy machine-readable portable contracts. These are versioned framework
  // files, not user-authored specs, so installs and upgrades keep them current.
  if (existsSync(join(srcKc, 'contracts'))) {
    copyDirContents(join(srcKc, 'contracts'), join(kcDir, 'contracts'));
  }

  // Copy enterprise/ if exists
  if (existsSync(join(srcKc, 'enterprise'))) {
    copyDirContents(join(srcKc, 'enterprise'), join(kcDir, 'enterprise'));
  }

  // User-facing documentation referenced by installed setup skills lives at
  // knowzcode/docs/ in the target project.
  if (existsSync(join(PKG_ROOT, 'docs'))) {
    copyDirContents(join(PKG_ROOT, 'docs'), join(kcDir, 'docs'));
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

  // 1b. Personalize templates on fresh install (reinstall preserves user edits above)
  let stackSummary = null;
  if (!isReinstall) {
    const stack = detectStack(dir);
    personalizeProjectFile(kcDir, stack);
    stackSummary = summarizeStack(stack);
    if (stackSummary.filled.length > 0) {
      log.ok(`Stack detected: ${stackSummary.filled.join(', ')}`);
    } else {
      log.warn('Stack not detected — no known project files (package.json, pyproject.toml, *.csproj, go.mod, Cargo.toml, Gemfile) in target directory');
    }
  }

  // 3. Generate adapters (using shared helper)
  const { adapterFiles, agentTeamsEnabled, claudePluginActive, claudePluginStale } = await generateAdapters(
    dir,
    selectedPlatforms,
    opts,
    preparedTemplates
  );

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
  const claudeCommandPrefix = claudePluginActive || claudePluginStale ? '/knowzcode:' : '/';
  const setupCommand = selectedPlatforms.includes('claude')
    ? `${claudeCommandPrefix}setup`
    : selectedPlatforms.includes('codex') ? '$knowzcode-setup' : 'the KnowzCode setup workflow';
  if (!isReinstall) {
    if (stackSummary && stackSummary.empty.length > 0) {
      console.log(`  1. Run ${setupCommand} in your AI tool to fill these interactively:`);
      console.log(`     Goal, Core Problem, Architecture style, user preferences,`);
      console.log(`     and stack fields still empty (${stackSummary.empty.join(', ')})`);
    } else {
      console.log(`  1. Run ${setupCommand} in your AI tool to fill Goal, Core Problem, and preferences`);
    }
    console.log('  2. Or edit knowzcode/knowzcode_project.md and knowzcode/user_preferences.md directly');
  }
  if (selectedPlatforms.includes('claude')) {
    const step = isReinstall ? 1 : 3;
    if (claudePluginActive) {
      console.log(`  ${step}. Plugin is active — commands available as /knowzcode:work, /knowzcode:explore, etc.`);
      console.log(`  ${step + 1}. Start building:`);
      console.log('     /knowzcode:work "Your first feature"');
    } else if (claudePluginStale) {
      console.log(`  ${step}. Update the KnowzCode plugin to match this CLI:`);
      console.log('     /plugin update knowzcode@knowz-skills');
      console.log('     (or re-run npx install --force-local-skills to override with bundled skills)');
      console.log(`  ${step + 1}. Start building once updated:`);
      console.log('     /knowzcode:work "Your first feature"');
    } else {
      console.log(`  ${step}. Start building with the installed local command:`);
      console.log('     /work "Your first feature"');
      console.log(`  ${step + 1}. Optional: install the plugin for namespaced /knowzcode:* commands:`);
      console.log('     /plugin install knowzcode@knowz-skills');
      console.log('');
      console.log('  Local commands: /work, /explore, /fix, etc.');
    }
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
    log.err('No KnowzCode installation found. Run `npx @knowzai/knowzcode install` first.');
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
  const uninstallHome = process.env.HOME || process.env.USERPROFILE;
  if (opts.global && !uninstallHome) {
    throw new Error('Cannot uninstall global components because HOME/USERPROFILE is unavailable.');
  }

  console.log('');
  console.log(`${c.bold}KnowzCode Uninstall${c.reset}`);
  console.log(`${c.dim}Target: ${dir}${c.reset}`);
  console.log('');

  // Scan for installed components
  const components = [];

  if (!opts.global && existsSync(kcDir)) {
    assertDirectoryOrMissing(kcDir, 'the framework uninstall target', dir);
    assertFileOrMissing(join(kcDir, '.knowzcode-version'), 'the framework ownership marker', dir);
  }
  if (!opts.global && isOwnedFrameworkDirectory(kcDir)) {
    components.push({ label: 'Core framework', path: kcDir });
  } else if (!opts.global && existsSync(kcDir)) {
    log.warn(`Preserving unowned framework directory without a valid version marker: ${kcDir}`);
  }

  const addComponent = (label, path) => {
    if (existsSync(path) && !components.some((component) => component.path === path)) {
      components.push({ label, path });
    }
  };

  // Claude Code components. Remove only manifest-owned destinations; the
  // enclosing .claude directories can contain unrelated user content.
  const claudeDir = opts.global ? join(uninstallHome, '.claude') : join(dir, '.claude');
  const claudeBoundary = opts.global ? uninstallHome : dir;
  assertDirectoryOrMissing(claudeDir, 'the Claude uninstall root', claudeBoundary);
  assertFileOrMissing(join(claudeDir, CLAUDE_COMPONENT_MANIFEST),
    'the Claude ownership manifest', claudeBoundary);
  const claudeManifest = readClaudeOwnershipForUninstall(claudeDir);
  for (const entry of claudeManifest.agents) {
    assertFileOrMissing(join(claudeDir, 'agents', entry),
      `the Claude agent uninstall target ${entry}`, claudeBoundary);
    addComponent(`Claude Code agent (${entry})`, join(claudeDir, 'agents', entry));
  }
  for (const entry of claudeManifest.skills) {
    assertDirectoryOrMissing(join(claudeDir, 'skills', entry),
      `the Claude skill uninstall target ${entry}`, claudeBoundary);
    addComponent(`Claude Code skill (${entry}/)`, join(claudeDir, 'skills', entry));
  }
  if (existsSync(claudeManifest.manifestPath)) {
    addComponent('Claude Code ownership manifest', claudeManifest.manifestPath);
  }

  // Platform adapter files
  const adapterChecks = {
    codex: join(dir, 'AGENTS.md'),
    gemini: join(dir, 'GEMINI.md'),
    cursor: join(dir, '.cursor', 'rules', 'knowzcode.mdc'),
    copilot: join(dir, '.github', 'copilot-instructions.md'),
    windsurf: join(dir, '.windsurf', 'rules', 'knowzcode.md'),
  };
  const templates = parseAdapterTemplates();

  for (const [id, path] of (opts.global ? [] : Object.entries(adapterChecks))) {
    assertFileOrMissing(path, `${PLATFORMS[id].name} adapter uninstall target`, dir);
    const owned = id === 'codex'
      ? isManagedCodexAdapter(path)
      : isOwnedGeneratedSurface(path, templates.get(id)?.primary ?? '');
    if (owned) addComponent(`${PLATFORMS[id].name} adapter`, path);
  }

  // Additional platform-specific files/directories
  for (const [platformId, templateSet] of (opts.global ? [] : templates)) {
    if (platformId === 'codex' || platformId === 'claude') continue;
    for (const [relativePath, { content }] of templateSet.files) {
      // Exact packaged paths are the manifest for non-Codex generated files.
      // Shared JSON settings are handled structurally below and are never
      // deleted as whole files.
      if (relativePath.endsWith('.json')) continue;
      const generatedPath = join(dir, relativePath);
      assertFileOrMissing(generatedPath,
        `${PLATFORMS[platformId].name} generated uninstall target`, dir);
      if (isOwnedGeneratedSurface(generatedPath, content)) {
        addComponent(`${PLATFORMS[platformId].name} generated file`, generatedPath);
      }
    }
  }

  // Codex skills are removed only when named by KnowzCode's ownership manifest.
  if (!opts.global) {
    const agentsSkillDir = join(dir, '.agents', 'skills');
    assertDirectoryOrMissing(agentsSkillDir, 'the local Codex skill uninstall root', dir);
    assertFileOrMissing(join(agentsSkillDir, CODEX_SKILL_MANIFEST),
      'the local Codex ownership manifest', dir);
    const localCodexManifest = readCodexOwnershipForUninstall(agentsSkillDir);
    for (const entry of localCodexManifest.entries) {
      assertDirectoryOrMissing(join(agentsSkillDir, entry),
        `the local Codex skill uninstall target ${entry}`, dir);
      addComponent(`Codex skill (${entry}/)`, join(agentsSkillDir, entry));
    }
    if (localCodexManifest.entries.length > 0 || existsSync(localCodexManifest.manifestPath)) {
      addComponent('Codex skill ownership manifest', localCodexManifest.manifestPath);
    }
  }

  // User-level cleanup is opt-in. A project-local uninstall must never mutate
  // HOME, and even global cleanup is restricted to manifest-owned entries.
  if (opts.global) {
    const globalAgentsSkillDir = join(uninstallHome, '.agents', 'skills');
    assertDirectoryOrMissing(globalAgentsSkillDir, 'the global Codex skill uninstall root', uninstallHome);
    assertFileOrMissing(join(globalAgentsSkillDir, CODEX_SKILL_MANIFEST),
      'the global Codex ownership manifest', uninstallHome);
    const globalCodexManifest = readCodexOwnershipForUninstall(globalAgentsSkillDir);
    for (const entry of globalCodexManifest.entries) {
      assertDirectoryOrMissing(join(globalAgentsSkillDir, entry),
        `the global Codex skill uninstall target ${entry}`, uninstallHome);
      addComponent(`Codex skill — global (~/.agents/skills/${entry}/)`, join(globalAgentsSkillDir, entry));
    }
    if (globalCodexManifest.entries.length > 0 || existsSync(globalCodexManifest.manifestPath)) {
      addComponent('Codex global skill ownership manifest', globalCodexManifest.manifestPath);
    }
  }

  const copilotTemplateSet = templates.get('copilot');
  const copilotManifestPath = join(dir, '.vscode', COPILOT_MCP_MANIFEST);
  const hasManagedCopilotMcp = !opts.global && existsSync(copilotManifestPath);
  if (hasManagedCopilotMcp) preflightCopilotMcp(dir, copilotTemplateSet);
  const geminiSettingsProject = join(dir, '.gemini', 'settings.json');
  const geminiManifestProject = join(dir, '.gemini', GEMINI_MCP_MANIFEST);
  const knowzGeminiManifestProject = join(dir, '.gemini', KNOWZ_GEMINI_MCP_MANIFEST);
  const hasManagedGeminiMcp = !opts.global && existsSync(geminiManifestProject);
  if (hasManagedGeminiMcp) {
    assertFileOrMissing(geminiManifestProject, 'the Gemini MCP ownership manifest uninstall target', dir);
    assertFileOrMissing(geminiSettingsProject, 'the project Gemini settings uninstall target', dir);
    assertFileOrMissing(knowzGeminiManifestProject,
      'the shared Knowz Gemini MCP ownership manifest', dir);
    readGeminiMcpManifest(geminiSettingsProject, { strict: true });
    readGeminiSettingsForMutation(geminiSettingsProject);
  }

  if (components.length === 0 && !hasManagedCopilotMcp && !hasManagedGeminiMcp) {
    log.info('No KnowzCode installation found.');
    return;
  }
  const removeClaudeConfig = components.some((component) => component.label.startsWith('Claude Code'));
  const removeGeminiConfig = hasManagedGeminiMcp
    || components.some((component) => component.label.startsWith('Google Gemini'));

  // Validate every shared configuration mutation before deleting a single
  // component. This keeps refused uninstalls byte-for-byte unchanged.
  if (removeClaudeConfig) {
    assertFileOrMissing(join(claudeDir, 'settings.json'),
      'the Claude marketplace settings uninstall target', claudeBoundary);
    readMarketplaceSettings(claudeDir);
  }
  if (removeGeminiConfig) {
    assertFileOrMissing(geminiSettingsProject, 'the project Gemini settings uninstall target', dir);
    if (existsSync(geminiSettingsProject)) readGeminiSettingsForMutation(geminiSettingsProject);
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

  // Shared settings are mutated only when the matching managed platform was
  // actually part of this uninstall.
  if (removeClaudeConfig) removeMarketplaceConfig(claudeDir, dir);

  // Clean up Gemini MCP config (remove only knowz entry, preserve other settings)
  if (removeGeminiConfig && removeGeminiMcpConfig(geminiSettingsProject)) {
    removed.push('Gemini MCP config (.gemini/settings.json)');
  }
  if (hasManagedCopilotMcp && removeManagedCopilotMcpConfig(dir, copilotTemplateSet)) {
    removed.push('Copilot MCP entries (.vscode/mcp.json)');
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
    log.err('No KnowzCode installation found. Run `npx @knowzai/knowzcode install` first.');
    process.exit(1);
  }

  // Read current version
  const versionFile = join(kcDir, '.knowzcode-version');
  const currentVersion = existsSync(versionFile) ? readFileSync(versionFile, 'utf8').trim() : 'unknown';

  if (currentVersion === VERSION && !opts.force) {
    log.info(`Already at version ${VERSION}. Use --force to reinstall.`);
    return;
  }

  const detected = detectPlatforms(dir);
  const installedPlatforms = detected.filter((platformId) => isAdapterInstalled(platformId, dir));
  const hadLocalCodexAdapter = installedPlatforms.includes('codex');
  const explicitlyRequestedPlatforms = opts.platforms.length > 0
    ? (opts.platforms.includes('all') ? Object.keys(PLATFORMS) : opts.platforms.filter((platformId) => platformId in PLATFORMS))
    : null;
  if (opts.global) {
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    if (homeDir && existsSync(join(homeDir, '.agents', 'skills', CODEX_SKILL_MANIFEST))
        && !installedPlatforms.includes('codex')) {
      installedPlatforms.push('codex');
    }
    if (homeDir && existsSync(join(homeDir, '.claude', CLAUDE_COMPONENT_MANIFEST))
        && !installedPlatforms.includes('claude')) {
      installedPlatforms.push('claude');
    }
  }
  const upgradePlatforms = explicitlyRequestedPlatforms
    ? installedPlatforms.filter((platformId) => explicitlyRequestedPlatforms.includes(platformId))
    : installedPlatforms;
  const templates = parseAdapterTemplates();
  preflightAdapterGeneration(
    dir,
    upgradePlatforms,
    { ...opts, globalCodexSkillsOnly: opts.global && upgradePlatforms.includes('codex') && !hadLocalCodexAdapter },
    templates
  );

  log.info(`Upgrading: ${currentVersion} → ${VERSION}`);

  // Files to preserve (never overwrite)
  const preserveFiles = new Set([
    'knowzcode_tracker.md',
    'knowzcode_log.md',
    'knowzcode_architecture.md',
    'knowzcode_project.md',
    'environment_context.md',
    'user_preferences.md',
    'knowzcode_orchestration.md',
  ]);
  preflightUpgradeFrameworkFiles(dir, preserveFiles);

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

  // Update portable schema contracts (always replace).
  if (existsSync(join(srcKc, 'contracts'))) {
    const contractsDst = join(kcDir, 'contracts');
    if (existsSync(contractsDst)) rmSync(contractsDst, { recursive: true, force: true });
    copyDirContents(join(srcKc, 'contracts'), contractsDst);
    if (opts.verbose) log.info('Updated: contracts/');
  }

  // Update enterprise/ (always replace)
  if (existsSync(join(srcKc, 'enterprise'))) {
    const entDst = join(kcDir, 'enterprise');
    if (existsSync(entDst)) rmSync(entDst, { recursive: true, force: true });
    copyDirContents(join(srcKc, 'enterprise'), entDst);
    if (opts.verbose) log.info('Updated: enterprise/');
  }


  // Update packaged user documentation (always replace).
  if (existsSync(join(PKG_ROOT, 'docs'))) {
    const docsDst = join(kcDir, 'docs');
    if (existsSync(docsDst)) rmSync(docsDst, { recursive: true, force: true });
    copyDirContents(join(PKG_ROOT, 'docs'), docsDst);
    if (opts.verbose) log.info('Updated: docs/');
  }

  // Update Claude Code components if present
  const claudeRoot = opts.global ? process.env.HOME || process.env.USERPROFILE : dir;
  const claudeDir = join(claudeRoot, '.claude');
  const upgradePlugin = opts.forceLocalSkills || opts.global ? { installed: false } : detectKnowzCodePlugin(dir);
  const hasLocalClaudeComponents = hasPackagedClaudeComponents(claudeRoot);

  if (upgradePlatforms.includes('claude') && upgradePlugin.installed && hasLocalClaudeComponents) {
    // Plugin provides skills/agents — skip the refresh, but clean up any leftovers
    // from a prior npx install so the user doesn't end up with duplicate commands.
    await applyPluginActivePath(dir, claudeDir, upgradePlugin, opts, null);
  } else if (upgradePlatforms.includes('claude') && hasLocalClaudeComponents) {
    log.info('Updating Claude Code components...');

    prepareManagedClaudeComponentsForCopy(claudeDir);
    const knowzPlugin = detectKnowzPlugin(dir);
    const localKnowzRoles = knowzPlugin.installed ? new Set() : localKnowzAgentRoles(claudeDir);
    const claudeResourceRoot = claudeDir;
    copyLocalizedClaudeSkills(join(PKG_ROOT, 'agents'), join(claudeDir, 'agents'), {
      localKnowzRoles,
      claudeResourceRoot,
      projectResourceRoot: dir,
    });
    copyLocalizedClaudeSkills(join(PKG_ROOT, 'skills'), join(claudeDir, 'skills'), {
      localKnowzRoles,
      claudeResourceRoot,
      projectResourceRoot: dir,
    });
    markManagedClaudeComponents(claudeDir);
    writeClaudeComponentManifest(claudeDir);
    // Ensure marketplace config is up to date
    setMarketplaceConfig(claudeDir);
  }

  // Regenerate adapters for detected platforms
  const regenerated = [];

  for (const platformId of upgradePlatforms) {
    if (platformId === 'claude') continue; // Already handled above
    const platform = PLATFORMS[platformId];
    if (!platform.adapterPath) continue;

    // Presence of an arbitrary platform file proves that the platform exists,
    // not that KnowzCode owns its adapter. Only marker/manifest-owned Codex
    // surfaces participate in an upgrade.
    if (!isAdapterInstalled(platformId, dir)) continue;

    const adapterFile = platform.adapterPath(dir);
    if (!existsSync(adapterFile)) continue; // Only update existing adapters

    const templateSet = templates.get(platformId);
    if (!templateSet) continue;

    // Update primary adapter files only when KnowzCode owns them. Codex skills
    // can still be refreshed while an unrelated project AGENTS.md is preserved.
    if (opts.global && platformId === 'codex') {
      regenerated.push(`${platform.name} global skills`);
    } else if (platformId !== 'codex' || isManagedCodexAdapter(adapterFile)) {
      writeFileSync(adapterFile, renderManagedGeneratedSurface(templateSet.primary));
      regenerated.push(platform.name);
    } else {
      log.warn(`Preserved unmanaged AGENTS.md unchanged during upgrade: ${adapterFile}`);
      regenerated.push(`${platform.name} skills`);
    }

    // Regenerate additional files
    for (const [relativePath, { content }] of templateSet.files) {
      if (platformId === 'copilot' && relativePath === '.vscode/mcp.json') continue;
      const filePath = opts.global && relativePath.startsWith('.agents/skills/')
        ? join(process.env.HOME || process.env.USERPROFILE, relativePath)
        : join(dir, relativePath);
      ensureDir(dirname(filePath));
      writeFileSync(
        filePath,
        relativePath.endsWith('.json')
          ? injectVersion(content)
          : renderManagedGeneratedSurface(content, relativePath)
      );
    }
    if (platformId === 'copilot') mergeCopilotMcpConfig(dir, templateSet);

    // Only manifest-owned Codex entries support stale cleanup. Other platforms
    // have no ownership manifest in this release, so refresh exact packaged
    // destinations and preserve every unlisted legacy or user entry.
    if (platformId === 'codex') {
      const skillDir = opts.global
        ? join(process.env.HOME || process.env.USERPROFILE, '.agents', 'skills')
        : join(dir, '.agents', 'skills');
      reconcileManagedCodexSkills(skillDir, codexSkillNames(templateSet));
    }
  }

  // A project-local upgrade never mutates HOME. Global surfaces are refreshed
  // only under an explicit --global request, and cleanup is restricted to the
  // ownership manifest written by a prior KnowzCode global install.
  if (opts.global) {
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    const globalAgentsSkillDir = join(homeDir, '.agents', 'skills');
    if (upgradePlatforms.includes('codex') && existsSync(globalAgentsSkillDir)) {
      const codexTemplateSet = templates.get('codex');
      if (codexTemplateSet) {
        for (const [relativePath, { content }] of codexTemplateSet.files) {
          if (relativePath.startsWith('.agents/skills/')) {
            const filePath = join(homeDir, relativePath);
            ensureDir(dirname(filePath));
            writeFileSync(filePath, renderManagedGeneratedSurface(content, relativePath));
          }
        }
        reconcileManagedCodexSkills(globalAgentsSkillDir, codexSkillNames(codexTemplateSet));
        log.info('Updated manifest-owned global Codex skills');
      }
    }

  }

  // Preserve Gemini MCP config during upgrade (don't overwrite user's API key)
  const geminiSettingsPath = join(dir, '.gemini', 'settings.json');
  const geminiMcpPreserved = upgradePlatforms.includes('gemini') && hasGeminiMcpConfig(geminiSettingsPath);
  if (geminiMcpPreserved) {
    // Update endpoint if user selected a different one (preserve auth method)
    if (opts.mcpEndpoint) {
      try {
        const settings = readGeminiSettingsForMutation(geminiSettingsPath);
        const currentEndpoint = settings.mcpServers?.knowz?.httpUrl || settings.mcpServers?.knowz?.url;
        if (currentEndpoint && currentEndpoint !== opts.mcpEndpoint) {
          if (updateOwnedGeminiMcpEndpoint(geminiSettingsPath, opts.mcpEndpoint)) {
            log.ok(`Updated Gemini MCP endpoint to ${opts.mcpEndpoint}`);
            log.info('Run /mcp auth knowz in Gemini CLI to re-authenticate with the new endpoint.');
          } else {
            log.info('Requested Gemini MCP endpoint was not applied because the entry is shared or unowned; preserved it unchanged.');
          }
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
  if (!explicitlyRequestedPlatforms && uninstalled.length > 0 && !opts.force) {
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
  console.log(`  ${c.bold}Preserved:${c.reset} specs/, workgroups/, tracker, log, architecture, project config, environment, preferences, orchestration${geminiMcpPreserved ? ', Gemini MCP config' : ''}`);
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
  npx @knowzai/knowzcode                          Interactive mode
  npx @knowzai/knowzcode install [options]        Install (preserves data on reinstall)
  npx @knowzai/knowzcode add-platforms [options]  Add/change platform adapters only
  npx @knowzai/knowzcode uninstall [options]      Remove KnowzCode
  npx @knowzai/knowzcode upgrade [options]        Upgrade preserving user data
  npx @knowzai/knowzcode detect                   Show detected platforms (dry run)

${c.bold}Options:${c.reset}
  --target <path>      Target directory (default: current directory)
  --platforms <list>   Comma-separated: claude,codex,gemini,cursor,copilot,windsurf,all
  --force              Skip confirmation prompts
  --clean              Full reset on reinstall (disables data preservation)
  --global             Install Claude to ~/.claude/ and Codex skills to ~/.agents/skills/; Gemini cannot be combined (run it project-scoped)
  --mcp-key <key>      Override OAuth default with API key for Gemini MCP
  --mcp-endpoint <url> MCP server URL (default: production)
  --agent-teams        Enable Agent Teams in .claude/settings.local.json
  --verbose            Show detailed output
  -h, --help           Show this help
  -v, --version        Show version

${c.bold}Examples:${c.reset}
  npx @knowzai/knowzcode install --platforms claude,cursor
  npx @knowzai/knowzcode install --platforms all --force
  npx @knowzai/knowzcode add-platforms --platforms cursor
  npx @knowzai/knowzcode upgrade --target ./my-project
  npx @knowzai/knowzcode uninstall --force
  npx @knowzai/knowzcode detect
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
    if (IS_ENTERPRISE) {
      // Enterprise config provides the canonical endpoint — skip environment selection
      opts.mcpEndpoint = MCP_ENDPOINT;
      log.info(`Using ${BRAND} MCP endpoint: ${MCP_ENDPOINT}`);
    } else {
      console.log('');
      console.log(`  ${c.bold}MCP Server Environment${c.reset}`);
      console.log(`  1) ${BRAND} Production  ${c.dim}(${MCP_ENDPOINT})${c.reset}`);
      console.log(`  2) ${BRAND} Development ${c.dim}(${MCP_DEV_ENDPOINT})${c.reset}`);
      console.log(`  3) Self-hosted       ${c.dim}(enter custom URL)${c.reset}`);
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const envAnswer = await rl.question(`\n  Select environment ${c.dim}[1]${c.reset}: `);
      rl.close();
      const envChoice = envAnswer.trim();
      if (envChoice === '2') {
        opts.mcpEndpoint = MCP_DEV_ENDPOINT;
      } else if (envChoice === '3') {
        const rl2 = createInterface({ input: process.stdin, output: process.stdout });
        const customUrl = await rl2.question('  Enter MCP server URL: ');
        rl2.close();
        if (customUrl.trim()) {
          opts.mcpEndpoint = customUrl.trim();
        } else {
          opts.mcpEndpoint = MCP_ENDPOINT;
          log.warn('No URL provided — defaulting to production.');
        }
      } else {
        opts.mcpEndpoint = MCP_ENDPOINT;
      }
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

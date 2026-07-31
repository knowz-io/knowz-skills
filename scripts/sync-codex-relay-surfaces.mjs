#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceAdapter = join(ROOT, 'knowzcode', 'knowzcode', 'platform_adapters.md');
const pluginAdapter = join(ROOT, 'plugins', 'knowzcode', 'knowzcode', 'platform_adapters.md');
const checkOnly = process.argv.includes('--check');
const adaptersOnly = process.argv.includes('--adapters-only');
const knowzCodeAgentRoles = new Set(
  readdirSync(join(ROOT, 'knowzcode', 'agents'), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name.slice(0, -3))
);
const knowzCodeSkillNames = new Set(
  readdirSync(join(ROOT, 'knowzcode', 'skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
);

function listMarkdownFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listMarkdownFiles(path));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(path);
  }
  return files;
}

function scopeClaudePluginAgentCalls(content) {
  let scoped = content.replace(
    /(Agent\s*\(\s*subagent_type\s*=\s*["'])([a-z0-9-]+)(["'])/g,
    (match, prefix, role, suffix) => {
      if (knowzCodeAgentRoles.has(role)) return `${prefix}knowzcode:${role}${suffix}`;
      if (role === 'reader' || role === 'writer') return `${prefix}knowz:${role}${suffix}`;
      return match;
    }
  );
  scoped = scoped.replace(
    /((?:`subagent_type`|subagent_type)[^\r\n]{0,40}["'])([a-z0-9-]+)(["'])/g,
    (match, prefix, role, suffix) => (
      knowzCodeAgentRoles.has(role) ? `${prefix}knowzcode:${role}${suffix}` : match
    )
  );
  return scoped.replace(
    /(^|[\s`("'=])\/([a-z0-9-]+)\b/gm,
    (match, prefix, skill) => (
      knowzCodeSkillNames.has(skill) ? `${prefix}/knowzcode:${skill}` : match
    )
  );
}

const claudePluginSkillFiles = [
  ...listMarkdownFiles(join(ROOT, 'knowzcode', 'skills')),
  ...listMarkdownFiles(join(ROOT, 'knowzcode', 'agents')),
];
const scopedClaudePluginSkillContent = new Map(claudePluginSkillFiles.map((file) => {
  const current = readFileSync(file, 'utf8');
  return [file, { current, rendered: scopeClaudePluginAgentCalls(current) }];
}));

const surfaces = [
  ['.agents/skills/knowzcode-work/SKILL.md', 'plugins/knowzcode/skills/work/SKILL.md', 'knowzcode-work'],
  ['.agents/skills/knowzcode-explore/SKILL.md', 'plugins/knowzcode/skills/explore/SKILL.md', 'knowzcode-explore'],
  ['.agents/skills/knowzcode-fix/SKILL.md', 'plugins/knowzcode/skills/fix/SKILL.md', 'knowzcode-fix'],
  ['.agents/skills/knowzcode-audit/SKILL.md', 'plugins/knowzcode/skills/audit/SKILL.md', 'knowzcode-audit'],
  ['.agents/skills/knowzcode-regroup/SKILL.md', 'plugins/knowzcode/skills/regroup/SKILL.md', 'knowzcode-regroup'],
  ['.agents/skills/knowzcode-regroup-trigger/SKILL.md', 'plugins/knowzcode/skills/regroup-trigger/SKILL.md', 'knowzcode-regroup-trigger'],
  ['.agents/skills/knowzcode-relay/SKILL.md', 'plugins/knowzcode/skills/relay/SKILL.md', 'knowzcode-relay'],
  ['.agents/skills/knowzcode-work/references/relay-execution.md', 'plugins/knowzcode/skills/work/references/relay-execution.md', null],
  ['.agents/skills/knowzcode-continue/SKILL.md', 'plugins/knowzcode/skills/continue/SKILL.md', 'knowzcode-continue'],
  ['.agents/skills/knowzcode-setup/SKILL.md', 'plugins/knowzcode/skills/setup/SKILL.md', 'knowzcode-setup'],
  ['.agents/skills/knowzcode-status/SKILL.md', 'plugins/knowzcode/skills/status/SKILL.md', 'knowzcode-status'],
  ['.agents/skills/knowzcode-telemetry/SKILL.md', 'plugins/knowzcode/skills/telemetry/SKILL.md', 'knowzcode-telemetry'],
  ['.agents/skills/knowzcode-telemetry-setup/SKILL.md', 'plugins/knowzcode/skills/telemetry-setup/SKILL.md', 'knowzcode-telemetry-setup'],
  ['.agents/skills/knowzcode-start-work/SKILL.md', 'plugins/knowzcode/skills/start-work/SKILL.md', 'knowzcode-start-work'],
];

const frameworkMirrors = [
  'knowzcode_loop.md',
  'knowzcode_orchestration.md',
  'context_efficiency.md',
  'context_efficiency_runtime.mjs',
  'relay_execution.md',
  'claude_code_execution.md',
  'codex_execution.md',
];

const contractMirrors = [
  'context-capsule.schema.json',
  'agent-lineage.schema.json',
  'efficiency-event.schema.json',
];

const packagedSkillSources = new Set(
  surfaces.filter(([, sourcePath]) => sourcePath.endsWith('/SKILL.md')).map(([, sourcePath]) => sourcePath)
);
const packagedReferenceCount = surfaces.length - packagedSkillSources.size;
const missingGeneratedSkills = readdirSync(join(ROOT, 'plugins', 'knowzcode', 'skills'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => `plugins/knowzcode/skills/${entry.name}/SKILL.md`)
  .filter((sourcePath) => existsSync(join(ROOT, sourcePath)) && !packagedSkillSources.has(sourcePath));
if (missingGeneratedSkills.length) {
  throw new Error(`Codex plugin skills are missing generated adapter surfaces: ${missingGeneratedSkills.join(', ')}`);
}

function renderSurface(relativePath, sourcePath, generatedName) {
  const absoluteSource = join(ROOT, sourcePath);
  let content = readFileSync(absoluteSource, 'utf8').trimEnd();
  if (generatedName) {
    content = content.replace(/^name:\s*.+$/m, `name: ${generatedName}`);
  }
  // Packaged plugin skills live in unprefixed sibling directories (work,
  // continue, relay). Generated repository/global skills are renamed with the
  // knowzcode-* prefix, so sibling references must be rewritten for that
  // installed directory layout.
  content = content.replace(
    /\.\.\/work\/references\/relay-execution\.md/g,
    '../knowzcode-work/references/relay-execution.md'
  );
  content = content.replace(/Generated by KnowzCode v\d+\.\d+\.\d+/g, 'Generated by KnowzCode vX.Y.Z');
  return `#### ${relativePath}\n\n\`\`\`markdown\n${content}\n\`\`\`\n`;
}

function sectionBounds(text, relativePath) {
  const header = `#### ${relativePath}`;
  const start = text.indexOf(header);
  if (start === -1) return null;
  const nextSkill = text.indexOf('\n#### ', start + header.length);
  const nextSection = text.indexOf('\n### Codex MCP Configuration', start + header.length);
  const candidates = [nextSkill, nextSection].filter((value) => value !== -1);
  return { start, end: candidates.length ? Math.min(...candidates) + 1 : text.length };
}

let adapter = readFileSync(sourceAdapter, 'utf8');
const missing = [];

for (const [relativePath, sourcePath, generatedName] of surfaces) {
  const rendered = renderSurface(relativePath, sourcePath, generatedName);
  const bounds = sectionBounds(adapter, relativePath);
  if (!bounds) {
    missing.push(rendered);
    continue;
  }
  adapter = adapter.slice(0, bounds.start) + rendered + '\n' + adapter.slice(bounds.end);
}

if (missing.length) {
  const insertAt = adapter.indexOf('### Codex MCP Configuration');
  if (insertAt === -1) throw new Error('Codex MCP section not found in platform_adapters.md');
  adapter = adapter.slice(0, insertAt) + missing.join('\n') + '\n' + adapter.slice(insertAt);
}

if (checkOnly) {
  const sourceCurrent = readFileSync(sourceAdapter, 'utf8');
  const pluginCurrent = readFileSync(pluginAdapter, 'utf8');
  const stale = sourceCurrent !== adapter || pluginCurrent !== adapter;
  const claudePluginAgentScopeDrift = [...scopedClaudePluginSkillContent.entries()]
    .filter(([, value]) => value.current !== value.rendered)
    .map(([file]) => file.slice(ROOT.length + 1));
  const frameworkDrift = frameworkMirrors.filter((relativePath) =>
    readFileSync(join(ROOT, 'knowzcode', 'knowzcode', relativePath), 'utf8') !==
      readFileSync(join(ROOT, 'plugins', 'knowzcode', 'knowzcode', relativePath), 'utf8')
  );
  const contractDrift = contractMirrors.filter((relativePath) =>
    readFileSync(join(ROOT, 'knowzcode', 'knowzcode', 'contracts', relativePath), 'utf8') !==
      readFileSync(join(ROOT, 'plugins', 'knowzcode', 'knowzcode', 'contracts', relativePath), 'utf8')
  );
  if (stale || claudePluginAgentScopeDrift.length || frameworkDrift.length || contractDrift.length) {
    throw new Error(
      `Generated surfaces are stale; run scripts/sync-codex-relay-surfaces.mjs` +
      `${claudePluginAgentScopeDrift.length ? `\nUnscoped Claude plugin Agent roles: ${claudePluginAgentScopeDrift.join(', ')}` : ''}` +
      `${frameworkDrift.length ? `\nFramework drift: ${frameworkDrift.join(', ')}` : ''}` +
      `${contractDrift.length ? `\nContract drift: ${contractDrift.join(', ')}` : ''}`
    );
  }
  console.log(
    `Verified ${packagedSkillSources.size} packaged Codex plugin skills plus ${packagedReferenceCount} generated reference, `
    + `${frameworkMirrors.length} framework mirrors, ${contractMirrors.length} contracts, and adapter parity.`
  );
} else {
  for (const [file, value] of scopedClaudePluginSkillContent) {
    if (value.current !== value.rendered) writeFileSync(file, value.rendered);
  }
  writeFileSync(sourceAdapter, adapter);
  writeFileSync(pluginAdapter, adapter);
  if (!adaptersOnly) {
    for (const relativePath of frameworkMirrors) {
      writeFileSync(
        join(ROOT, 'plugins', 'knowzcode', 'knowzcode', relativePath),
        readFileSync(join(ROOT, 'knowzcode', 'knowzcode', relativePath), 'utf8')
      );
    }
    for (const relativePath of contractMirrors) {
      writeFileSync(
        join(ROOT, 'plugins', 'knowzcode', 'knowzcode', 'contracts', relativePath),
        readFileSync(join(ROOT, 'knowzcode', 'knowzcode', 'contracts', relativePath), 'utf8')
      );
    }
  }
  console.log(
    `Synchronized ${packagedSkillSources.size} packaged Codex plugin skills plus ${packagedReferenceCount} generated reference, `
    + `${adaptersOnly ? 'adapter parity only' : `${frameworkMirrors.length} framework mirrors and ${contractMirrors.length} contracts`}.`
  );
}

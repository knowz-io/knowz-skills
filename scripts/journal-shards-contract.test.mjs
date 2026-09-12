#!/usr/bin/env node
//
// Journal shard contract.
//
// Work events are recorded as immutable shards under knowzcode/journal/. The
// old behavior — every agent prepending a single shared knowzcode_log.md and
// rewriting rows in a shared knowzcode_tracker.md — produced write contention
// and merge conflicts whenever more than one agent finished work. These tests
// fail if a shipped instruction surface tells an agent to do that again.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Instruction surfaces shipped to agents. CHANGELOGs are excluded: they
// describe what the framework used to do, which is legitimately past tense.
const SURFACE_ROOTS = [
  'knowzcode/skills',
  'knowzcode/agents',
  'knowzcode/knowzcode',
  'knowzcode/.gemini',
  'plugins/knowzcode/skills',
  'plugins/knowzcode/knowzcode',
];

const SURFACE_EXTENSIONS = ['.md', '.toml'];

function listSurfaceFiles(relativeRoot) {
  const absoluteRoot = join(ROOT, relativeRoot);
  if (!existsSync(absoluteRoot)) return [];
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && entry.name !== 'CHANGELOG.md'
        && SURFACE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
        files.push(path);
      }
    }
  };
  walk(absoluteRoot);
  return files;
}

const surfaceFiles = SURFACE_ROOTS.flatMap(listSurfaceFiles);

// A line that both says "prepend" and names the log is an instruction to
// prepend unless it is explicitly negated ("never prepend", "do not prepend").
const NEGATED = /\b(never|not|don'?t|no longer|stop|avoid|instead of|rather than)\b/i;

// Prose wraps, so a negation can land on the previous line ("Agents no longer\n
// prepend to ..."). Test the match against the wrapped sentence — the line plus
// its predecessor — rather than the raw line alone.
function offendingLines(raw, pattern) {
  const lines = raw.split(/\r?\n/);
  return lines
    .map((line, index) => [index + 1, line, `${lines[index - 1] ?? ''} ${line}`])
    .filter(([, line, sentence]) => pattern.test(line) && !NEGATED.test(sentence))
    .map(([lineNumber, line]) => [lineNumber, line]);
}

test('no shipped surface instructs an agent to prepend knowzcode_log.md', () => {
  assert.ok(surfaceFiles.length > 0, 'expected to find shipped instruction surfaces');
  const violations = [];
  for (const file of surfaceFiles) {
    const raw = readFileSync(file, 'utf8');
    for (const [lineNumber, line] of offendingLines(raw, /prepend/i)) {
      if (/knowzcode_log/i.test(line)) {
        violations.push(`${relative(ROOT, file)}:${lineNumber}: ${line.trim()}`);
      }
    }
  }
  assert.deepEqual(
    violations,
    [],
    `Shipped surfaces must write journal shards, not prepend the shared log:\n${violations.join('\n')}`
  );
});

test('no shipped surface instructs an agent to write completion rows to the tracker', () => {
  const violations = [];
  const writeVerb = /\b(update|write|set|mark|refresh|change|append|edit|modify)\b/i;
  for (const file of surfaceFiles) {
    const raw = readFileSync(file, 'utf8');
    for (const [lineNumber, line] of offendingLines(raw, /knowzcode_tracker/i)) {
      // Only a write instruction is a violation. Reading the frozen archive for
      // pre-journal history stays allowed.
      if (writeVerb.test(line) && /\[WIP\]|\[VERIFIED\]|status|row|entr(y|ies)/i.test(line)) {
        violations.push(`${relative(ROOT, file)}:${lineNumber}: ${line.trim()}`);
      }
    }
  }
  assert.deepEqual(
    violations,
    [],
    `knowzcode_tracker.md is a frozen archive; status is derived from the journal:\n${violations.join('\n')}`
  );
});

test('no shipped surface asks agents to maintain a journal index file', () => {
  const violations = [];
  for (const file of surfaceFiles) {
    const raw = readFileSync(file, 'utf8');
    for (const [lineNumber, line] of offendingLines(raw, /journal\/index\.md/i)) {
      violations.push(`${relative(ROOT, file)}:${lineNumber}: ${line.trim()}`);
    }
  }
  assert.deepEqual(
    violations,
    [],
    `In-flight state is derived from the shard tree; there is no hand-maintained index:\n${violations.join('\n')}`
  );
});

test('the loop defines the journal shard contract', () => {
  const loop = readFileSync(join(ROOT, 'knowzcode', 'knowzcode', 'knowzcode_loop.md'), 'utf8');
  for (const [label, pattern] of [
    ['the shard path', /knowzcode\/journal\/YYYY-MM\/<WorkGroupID>\/YYYYMMDDTHHMMSSZ-<type>-<shortid>\.md/],
    ['immutability', /[Nn]ever edit or delete an existing shard/],
    ['corrections as new shards', /correction is a \*\*new shard\*\*/],
    ['in-flight derivation', /no `\*-arc-completion-\*\.md`|-\(arc-completion\|workgroup-abandoned\)-/],
    ['the archive freeze', /frozen archive/i],
    ['offline-first sync', /knowz_sync[\s\S]{0,400}pending/],
  ]) {
    assert.match(loop, pattern, `knowzcode_loop.md must document ${label}`);
  }
});

test('a shard carries every required frontmatter key', () => {
  const REQUIRED_KEYS = ['wgid', 'type', 'timestamp', 'agent', 'nodeids', 'knowz_sync', 'summary'];
  const fixture = `---
wgid: kc-feat-example-20260912-150000
type: arc-completion
timestamp: 2026-09-12T19:00:00Z
agent: closer
nodeids: [Authentication]
knowz_sync: pending
summary: One-line outcome
---

Body prose: verification, learnings, ripples.
`;

  const match = fixture.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(match, 'a shard must open with YAML frontmatter');

  const fields = Object.fromEntries(
    match[1]
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => {
        const entry = line.match(/^([A-Za-z0-9_]+):\s*(.+)$/);
        assert.ok(entry, `unparseable frontmatter line: ${line}`);
        return [entry[1], entry[2]];
      })
  );

  for (const key of REQUIRED_KEYS) {
    assert.ok(fields[key], `shard frontmatter must include ${key}`);
  }

  // The filename encodes a sortable UTC timestamp, the event type, and a short
  // id — not a bare UUID, which would not sort.
  const filename = '20260912T190000Z-arc-completion-a1b2.md';
  const parsed = filename.match(/^(\d{8}T\d{6}Z)-([a-z][a-z0-9-]*)-([0-9a-z]{4,8})\.md$/);
  assert.ok(parsed, `shard filename must be <timestamp>-<type>-<shortid>.md: ${filename}`);
  assert.equal(parsed[2], fields.type, 'filename type must match frontmatter type');
  assert.equal(
    parsed[1],
    fields.timestamp.replace(/[-:]/g, ''),
    'filename timestamp must match frontmatter timestamp'
  );

  // knowz is optional: pending is a complete record, and a synced shard holds
  // the knowledge id instead.
  assert.ok(
    fields.knowz_sync === 'pending' || fields.knowz_sync.length > 0,
    'knowz_sync must be "pending" or a knowledge id'
  );
});

test('the journal is not gitignored by the shipped template', () => {
  const template = readFileSync(
    join(ROOT, 'knowzcode', 'knowzcode', 'gitignore.template'),
    'utf8'
  );
  const ignoredPaths = template
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

  assert.ok(
    !ignoredPaths.some((line) => /^\/?journal\/?$/.test(line)),
    'journal shards are tracked in git and must not be gitignored'
  );
  // Session state stays local.
  assert.ok(ignoredPaths.includes('workgroups/'), 'workgroups/ must stay gitignored');
  assert.ok(ignoredPaths.includes('handoffs/'), 'handoffs/ must stay gitignored');
});

test('the CLI initializes a journal and freezes the log and tracker', () => {
  const cli = readFileSync(join(ROOT, 'knowzcode', 'bin', 'knowzcode.mjs'), 'utf8');
  assert.match(cli, /initJournalReadme/, 'the CLI must write a journal README');
  assert.match(cli, /ensureDir\(join\(kcDir, 'journal'\)\)/, 'the CLI must create journal/');
  assert.doesNotMatch(
    cli,
    /NEWEST ENTRIES APPEAR HERE/,
    'the archive stub must not carry a prepend marker'
  );
  assert.match(cli, /journalShards/, 'scanExistingInstallation must count journal shards');
});

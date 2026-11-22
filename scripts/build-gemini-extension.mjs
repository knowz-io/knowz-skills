#!/usr/bin/env node
// Assembles the KnowzCode Gemini CLI extension from knowzcode/.gemini into a
// self-contained directory with gemini-extension.json at its root.
//
//   node scripts/build-gemini-extension.mjs [--out <dir>]
//
// Gemini installs an extension from a release archive with the manifest at its
// root; .github/workflows/gemini-extension.yml publishes the output that way.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'knowzcode');
const GEMINI = join(SRC, '.gemini');
const outFlag = process.argv.indexOf('--out');
const OUT = resolve(outFlag > -1 ? process.argv[outFlag + 1] : join(ROOT, 'dist', 'gemini-knowzcode'));

const pkg = JSON.parse(readFileSync(join(SRC, 'package.json'), 'utf8'));

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

writeFileSync(
  join(OUT, 'gemini-extension.json'),
  `${JSON.stringify(
    {
      name: 'knowzcode',
      version: pkg.version,
      description: 'Structured AI development methodology with TDD, quality gates, and structured workflows.',
      contextFileName: 'GEMINI.md',
    },
    null,
    2,
  )}\n`,
);

cpSync(join(SRC, 'GEMINI.md'), join(OUT, 'GEMINI.md'));
cpSync(join(SRC, 'LICENSE'), join(OUT, 'LICENSE'));
for (const dir of ['commands', 'skills', 'agents']) {
  cpSync(join(GEMINI, dir), join(OUT, dir), { recursive: true });
}

// Commands shipped in a project point at .gemini/skills/<name>/SKILL.md. In an
// extension the skill lives in the extension directory, so activate it by name.
const commandDir = join(OUT, 'commands', 'knowzcode');
for (const file of readdirSync(commandDir).filter((name) => name.endsWith('.toml'))) {
  const path = join(commandDir, file);
  const rewritten = readFileSync(path, 'utf8')
    .replace(/^\s*# \.gemini\/commands\/[^\n]*\r?\n/, '')
    .replace(
      /Read \.gemini\/skills\/(knowzcode-[\w-]+)\/SKILL\.md for full instructions\./g,
      'Activate the `$1` skill and follow its instructions.',
    );
  if (/\.gemini\/skills\//.test(rewritten)) {
    throw new Error(`${file} still references a project-local skill path`);
  }
  writeFileSync(path, rewritten);
}

// The setup skill copies the framework into the project, so it carries the
// template files next to its SKILL.md.
const setupDir = join(OUT, 'skills', 'knowzcode-setup');
if (!existsSync(join(setupDir, 'SKILL.md'))) throw new Error('knowzcode-setup skill is missing');
cpSync(join(SRC, 'knowzcode'), join(setupDir, 'templates', 'knowzcode'), { recursive: true });
writeFileSync(
  join(setupDir, 'SKILL.md'),
  `${readFileSync(join(setupDir, 'SKILL.md'), 'utf8').trimEnd()}

## Template Source

The framework files ship with this skill in \`templates/knowzcode/\`, next to this
file. For step 3, copy that directory to \`knowzcode/\` in the project root,
honouring the Abort / Merge / Overwrite choice from step 1, then:

- rename \`knowzcode/gitignore.template\` to \`knowzcode/.gitignore\` when the project has none there
- create \`knowzcode/journal/\` and \`knowzcode/workgroups/\` if they are missing

The commands, skills, and agents come from the installed extension. Do not
generate \`.gemini/commands\`, \`.gemini/skills\`, or \`.gemini/agents\` copies in
the project.
`,
);

console.log(`Gemini extension knowzcode v${pkg.version} -> ${OUT}`);

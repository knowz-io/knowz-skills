#!/usr/bin/env node
// Compare against verified release assets, then exercise only disposable projects/HOMEs.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const options = {};
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 2) {
  assert.ok(
    ["--claude", "--codex", "--package-root"].includes(args[i]) && args[i + 1],
    "Use --claude RELEASE_SKILL --codex RELEASE_SKILL [--package-root INSTALLED_MCP_PACKAGE]",
  );
  options[args[i].slice(2)] = resolve(args[i + 1]);
}
assert.ok(
  options.claude && options.codex,
  "Both verified release skill assets are required.",
);
const expected = Object.fromEntries(
  ["claude", "codex"].map((platform) => [
    platform,
    readFileSync(options[platform], "utf8"),
  ]),
);
const packageRoot = options["package-root"] ?? join(repo, "knowz");
assert.equal(
  JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")).name,
  "@knowzai/mcp",
);
const metadata = (text) => {
  const found = text.match(
    /CLI release: `([^`]+)`\. Manifest SHA-256: `([a-f0-9]{64})`/,
  );
  assert.ok(
    found,
    "Expected verified release skill metadata, not a workspace preview.",
  );
  return { version: found[1], manifest: found[2] };
};
const release = metadata(expected.claude);
assert.deepEqual(metadata(expected.codex), release);
assert.equal(
  readFileSync(join(packageRoot, "skills/knowz-cli/SKILL.md"), "utf8"),
  expected.claude,
  "Installed MCP package must include the selected released CLI skill.",
);
assert.equal(
  expected.claude.split("---").slice(2).join("---"),
  expected.codex.split("---").slice(2).join("---"),
  "Claude and Codex release bodies must match.",
);
assert.ok(expected.claude.includes(`npm i -g @knowzai/cli@${release.version}`));
assert.doesNotMatch(
  expected.codex.split("---")[1],
  /allowed-tools|user-invocable/,
);
for (const [platform, path] of [
  ["claude", "knowz/skills/knowz-cli/SKILL.md"],
  ["codex", "plugins/knowz/skills/knowz-cli/SKILL.md"],
])
  assert.equal(
    readFileSync(join(repo, path), "utf8"),
    expected[platform],
    `${platform} published source differs from the selected release.`,
  );

const sandbox = mkdtempSync(join(tmpdir(), "knowz released skill lifecycle "));
const write = (path, text) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};
try {
  for (const platform of ["claude", "codex", "gemini"]) {
    const project = join(sandbox, `${platform} project ü`);
    const home = join(sandbox, `${platform} home ü`);
    mkdirSync(project, { recursive: true });
    mkdirSync(home, { recursive: true });
    const codexConfig = join(home, ".codex/config.toml");
    const geminiConfig = join(project, ".gemini/settings.json");
    const unrelatedMcp = { url: "http://127.0.0.1:9/unrelated" };
    write(
      codexConfig,
      '[mcp_servers.unrelated]\nurl = "http://127.0.0.1:9/unrelated"\n',
    );
    write(
      geminiConfig,
      JSON.stringify({
        theme: "preserve",
        mcpServers: { unrelated: unrelatedMcp },
      }),
    );
    const sentinels = new Map([
      [join(project, "knowz-vaults.md"), "# user vault routing\n"],
      [join(project, "knowz-pending.md"), "# user pending knowledge\n"],
      [
        join(project, ".agents/skills/knowz-user-owned/SKILL.md"),
        "# unrelated prefixed skill\n",
      ],
      [
        join(project, ".claude/skills/work/SKILL.md"),
        "# other product skill\n",
      ],
      [join(project, ".claude/agents/analyst.md"), "# other product agent\n"],
      [join(home, ".config/knowz/config.json"), '{"profile":"preserve"}\n'],
      [join(home, ".knowz/config.json"), '{"profile":"preserve"}\n'],
    ]);
    for (const [path, text] of sentinels) write(path, text);
    const environment = {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      CODEX_HOME: join(home, ".codex"),
      CLAUDE_CONFIG_DIR: join(home, ".claude"),
      XDG_CONFIG_HOME: join(home, ".config"),
      APPDATA: join(home, "AppData/Roaming"),
      LOCALAPPDATA: join(home, "AppData/Local"),
      KNOWZ_CONFIG_DIR: join(home, ".config/knowz"),
      KNOWZ_API_KEY: "",
    };
    const invoke = (operation) => {
      const result = spawnSync(
        process.execPath,
        [
          join(packageRoot, "bin/knowz-mcp.mjs"),
          operation,
          "--target",
          project,
          "--platforms",
          platform,
          "--force",
          "--mcp-key",
          "test-only-release-skill-key",
          "--mcp-endpoint",
          "http://127.0.0.1:9/mcp",
        ],
        { cwd: project, env: environment, encoding: "utf8", timeout: 30_000 },
      );
      assert.equal(
        result.status,
        0,
        `${platform} ${operation} failed: ${result.stderr}`,
      );
    };
    const skill = join(
      project,
      platform === "claude"
        ? ".claude/skills/knowz-cli/SKILL.md"
        : ".agents/skills/knowz-cli/SKILL.md",
    );
    const variant = platform === "claude" ? "claude" : "codex";
    const preserved = () => {
      for (const [path, text] of sentinels)
        assert.equal(
          readFileSync(path, "utf8"),
          text,
          `${platform} changed unrelated ${path}`,
        );
      assert.ok(
        readFileSync(codexConfig, "utf8").includes(
          '[mcp_servers.unrelated]\nurl = "http://127.0.0.1:9/unrelated"',
        ),
      );
      const settings = JSON.parse(readFileSync(geminiConfig, "utf8"));
      assert.equal(settings.theme, "preserve");
      assert.deepEqual(settings.mcpServers.unrelated, unrelatedMcp);
    };
    for (const operation of ["install", "install", "upgrade"]) {
      invoke(operation);
      assert.equal(
        readFileSync(skill, "utf8"),
        expected[variant],
        `${platform} ${operation} changed the released skill bytes.`,
      );
      const manifestPath = join(
        project,
        platform === "claude"
          ? ".claude/.knowz-managed.json"
          : ".agents/skills/.knowz-managed.json",
      );
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      assert.ok(
        (manifest.skills ?? manifest.entries).includes("knowz-cli"),
        `${platform} must explicitly own the installed CLI skill.`,
      );
      preserved();
    }
    invoke("uninstall");
    assert.equal(
      existsSync(skill),
      false,
      `${platform} must remove its owned released CLI skill.`,
    );
    preserved();
  }
  console.log(
    `Released CLI ${release.version} skill parity and isolated Claude/Codex/Gemini lifecycle passed.`,
  );
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}

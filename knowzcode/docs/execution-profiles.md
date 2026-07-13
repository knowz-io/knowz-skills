# Execution Profiles

KnowzCode on Claude Code supports four execution profiles that trade cost, quality, and parallelism. **`frontier` is the default** (Fable plans/specs/reviews, Opus builds).

The choice is yours and asked exactly once: `/knowzcode:setup` asks during setup, and if no `profile:` is configured, the first `/knowzcode:work` asks and saves your answer to `knowzcode/knowzcode_orchestration.md` — no run ever re-asks. Set `profile: teams` (or `--profile=teams`) any time to opt out of frontier's Fable cost.

| Profile | When to Use | Mode | Requires |
|---------|-------------|------|----------|
| `frontier` (default) | Fable plans/specs/reviews every change; Opus executes. The most capable planning, at higher cost; auto-falls back to Opus if Fable is unavailable. | Parallel / Sequential / Subagent (your choice) | Direct Anthropic API (or Claude Platform on AWS) for Fable |
| `teams` | Opt OUT of frontier's Fable cost — all agents use their frontmatter defaults (mostly Opus). No external dependencies. | Parallel / Sequential / Subagent (your choice) | Any Claude Code version, any provider |
| `advisor` | Cost-sensitive work where Sonnet + advisor-tool is acceptable quality. ~12% cheaper on coding tasks (per Anthropic benchmarks). | Parallel Teams (forced) | Claude Code v2.1.100+, direct Anthropic API |
| `classic` | Agent Teams unavailable, or you want deterministic single-threaded execution. | Subagent Delegation (forced) | — |

## How the `frontier` profile works

`frontier` routes the reasoning-heavy phases to Fable and the build to Opus:

| Agent | `frontier` |
|-------|-----------|
| analyst, architect, reviewer, security-officer, test-advisor, project-advisor, enterprise-enforcer | **fable** |
| builder, closer, smoke-tester, frontend-designer, microfix-specialist, knowledge-migrator, update-coordinator | opus |
| knowledge-liaison | sonnet |

The idea: Fable produces an *exhaustive, per-change specification* (every change enumerated, each with a dedicated VERIFY criterion), then Opus — itself state-of-the-art at agentic execution — implements against it. You get frontier judgment on both ends (Fable writes the spec at Gate #2 and audits the build as reviewer at Gate #3) without paying Fable's premium on the highest-token phase, building. `/knowzcode:explore` also runs its research agents on Fable under this profile.

For the rare job where the implementation itself needs frontier reasoning, add `--fable-execution` (or set `execute_on_fable: true`) to run the execution agents on Fable too.

## How the `advisor` profile works

Claude Code's advisor tool lets a Sonnet-based agent consult Opus mid-generation within a single API call. Under `advisor` profile, the agents listed below switch to Sonnet and get an advisor-guidance block in their spawn prompt:

| Agent | `advisor` | `teams` | `classic` |
|-------|-----------|---------|-----------|
| architect, analyst, security-officer, enterprise-enforcer | opus | opus | opus |
| builder, reviewer, closer, smoke-tester, microfix-specialist, frontend-designer | **sonnet** | opus | opus |
| knowledge-liaison, test-advisor, project-advisor | sonnet | sonnet | sonnet |
| knowledge-migrator, update-coordinator (utility) | opus | opus | opus |

Strategic agents (architect, analyst, security-officer, enterprise-enforcer) stay on Opus — the advisor tool adds no value where the whole task is reasoning.

## Configure

In `knowzcode/knowzcode_orchestration.md`:

```yaml
profile: frontier    # default; or: teams, advisor, classic
```

Or override per-invocation:

```bash
/knowzcode:work "build X" --profile=advisor
/knowzcode:work "build critical auth flow" --profile=frontier
/knowzcode:audit --profile=teams
```

## Graceful fallback

When `profile: advisor` is set but the environment can't support the advisor tool (e.g., `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1`, or `ANTHROPIC_BASE_URL` pointing to Bedrock/Vertex/custom endpoints), `/work` and `/audit` automatically fall back to `teams` with a clear message. Your workflow proceeds — you just don't get the cost savings.

Similarly, `profile: frontier` requires Fable, which runs on the direct Anthropic API (or Claude Platform on AWS) and needs 30-day data retention. If Fable is unavailable (e.g. `ANTHROPIC_BASE_URL` pointing at Bedrock/Vertex/Foundry), the planning/review agents fall back to Opus with a clear message and the run proceeds as an all-Opus flow.

## Conflicts

`--profile=advisor` with `--sequential` or `--subagent` is an error: the advisor profile requires Parallel Teams. Remove the conflicting flag, or choose `--profile=teams` if you want sequential/subagent execution.

## Roll back

Delete the `profile:` line from `knowzcode/knowzcode_orchestration.md` (or omit `--profile` on the CLI) to use the default (`frontier`). To restore the pre-0.19 all-Opus behavior, set `profile: teams`. No migration needed.

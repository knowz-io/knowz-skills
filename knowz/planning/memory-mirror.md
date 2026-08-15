# Plan — Mirroring Claude Code auto-memory into Knowz

**Status:** planning · **Date:** 2026-08-15 · **Owner:** Alex

Claude Code writes durable notes about a project to
`~/.claude/projects/<sanitized-cwd>/memory/*.md` — one fact per file, with YAML frontmatter and
`[[wikilinks]]` — plus a `MEMORY.md` index that is loaded into every session. On this machine the
knowz-platform project has 123 such notes.

They live only on one laptop. This plan makes them also live in Knowz, correctly, for every user —
not just as a one-off.

A working prototype exists on Alex's Mac (`~/.claude/hooks/`, 123 notes mirrored 2026-08-14). This
plan generalizes it and **fixes three correctness gaps proven by test** (§2).

---

## 1. Shape of the system

```
memory note written  →  hook notices, appends to queue  →  sync sends to Knowz
    (Claude Code)          (instant, offline, no auth)      (needs auth; manual)
```

Two deliberate properties:

- **The hook never touches the network.** It hashes a file and appends one line. It cannot fail,
  block, or slow a session. Everything that needs auth happens later.
- **The local note stays the source of truth.** Knowz holds a projection. Local memory is the
  free recall path (`MEMORY.md` is preloaded every session); Knowz is the durable, searchable,
  cross-machine store. Editing the Knowz copy is always wrong — it is overwritten by the next sync.

---

## 2. What the prototype gets wrong (verified 2026-08-15, not assumed)

| Change to a memory | Propagates today? | Why |
|---|---|---|
| **Create** a note | ✅ yes | `Write` fires the hook |
| **Update** a note's content | ✅ yes | `Edit`/`Write` fires; content hash differs → UPDATE |
| **Delete** a note | ❌ **no** | `rm` fires no `Write`/`Edit`. The hook never sees it. The Knowz item survives forever. |
| **Rename / re-slug** a note | ❌ **no** | Seen as a brand-new file → CREATE. The old slug is orphaned in Knowz as a duplicate. |
| **Title-only change** (edit the `MEMORY.md` index line) | ❌ **no** | The Knowz title is derived from `MEMORY.md`, but the change-detection hash is over the *note file*, which is unchanged. Title silently drifts. |

**Delete is the most damaging.** Claude Code's own memory instructions say to *"delete memories that
turn out to be wrong."* So the notes most important to retract are exactly the ones that never
retract — a wrong memory keeps being served from Knowz after being deleted locally.

**Title drift is the most insidious**, because ledger recovery (§5) matches on title. Drifted titles
degrade the recovery path silently.

### Root cause

Event capture alone is structurally insufficient. A hook only sees the events it is subscribed to,
on the machine it is installed on, while it is enabled. It cannot see deletions, out-of-band edits,
another machine, or anything that happened while it was off.

This is the same conclusion the Obsidian sync work reached:
> *client-side `knownFiles` diffing structurally cannot heal server-side mutations — reconciliation
> needs a fresh server-state read, and its delete plan needs two independent bounds.*

---

## 3. The fix: keep events, add reconciliation

Events stay (they make the common path instant). Add a **reconcile** pass that diffs *state*, not
events, and is the authority on what must happen.

Reconcile compares three things — the local memory directory, the ledger, and (optionally) the vault:

| Condition | Action |
|---|---|
| local file, not in ledger | **CREATE** (with the preflight in §4) |
| in ledger, content hash differs | **UPDATE** content |
| in ledger, title differs | **UPDATE** title |
| in ledger, **no local file** | **ORPHAN** → report only, never auto-delete (§3.1) |
| in vault, not in ledger, tagged `claude-code-memory` | **UNTRACKED** → report; likely a lost ledger (§5) |

Because reconcile derives everything from current state, it also self-heals a lost or truncated
queue, a period with the hook disabled, and a crash mid-sync.

### 3.1 Orphans: auto-FLAG, never auto-destroy

Two opposing risks have to be held at once:

- **Leaving it is not safe either.** Claude Code's memory rules say to *delete a memory that turns
  out to be wrong.* A retracted memory that survives in Knowz keeps surfacing in search and keeps
  informing answers — the exact harm the delete rule exists to prevent. "Report only" leaves that
  in place indefinitely.
- **Destroying it is irreversible**, and the failure modes are indistinguishable from normal
  operation: a wrong `--dir`, an empty directory, a fresh checkout, or a different project all look
  exactly like "everything was deleted locally."

The two are reconcilable because the dangerous half is *destruction*, not *marking*. So the actions
split:

**Automatic — flag.** When a tracked note has no local file, the mirrored item is immediately
retagged `claude-code-memory-orphaned` and gains a header:

> ⚠️ The local memory this mirrors was deleted on `<date>`. It may have been retracted as
> incorrect. Verify before relying on it.

This is safe, reversible, and neutralizes the bad-advice risk the moment reconcile runs — a search
hit still surfaces, but never unqualified.

**Manual — destroy.** Actual deletion is a separate, explicit command, because *"removed locally"
does not mean "delete from Knowz."* On 2026-08-14 two resolved 2026-03 incident notes were
deliberately dropped from the local index *because* they were safely in Knowz — the local index is a
hot cache meant to stay lean. Auto-delete would have destroyed exactly what the two-tier design
intends to keep.

When the user does destroy, the plan is bounded three ways — an item may only be removed if it is
(a) present in the ledger, **and** (b) tagged `claude-code-memory`, **and** (c) has no local file.
Anything outside the ledger is never touched.

Plus a blast-radius rail on **both** paths: if orphans exceed **20% of the corpus or 10 items**,
abort with a report instead of flagging or deleting anything. A fresh install or a mis-scoped run
can then never mass-mutate a vault.

---

## 4. Preventing duplicates

`create_knowledge` has **no idempotency key**, and `update_knowledge` requires an id, so the
slug→id ledger is the only thing preventing a duplicate on every edit. Two hardening rules:

1. **Preflight every CREATE with an exact-title search.** If a matching item already exists, adopt
   its id into the ledger instead of creating. This closes the crash window between "created in
   Knowz" and "recorded in the ledger" — the classic source of duplicates on retry. (Same discipline
   the `/knowz flush` action already applies.)
2. **Never fall through to CREATE on a failed UPDATE.** A missing target id stays queued and is
   reported. Downgrading a mutation to a create is how a vault ends up with two divergent copies.

---

## 4a. Store the knowledge id in the memory file, not only in the ledger

Write the id back into the note's own frontmatter on first successful sync:

```yaml
metadata:
  type: project
  knowzId: 9bc1c3fe-1d73-4006-8e3a-6e2f388676de
```

This is strictly better than a ledger alone, because provenance then travels **with the content**:

- **Rename/re-slug stops duplicating.** The file moves, the id moves with it → UPDATE, not CREATE.
  This is otherwise unfixable by any amount of event capture (§2).
- **Multi-machine stops duplicating.** A second machine reads the id from the file and updates the
  same item instead of creating a rival copy. This resolves open question §9.1.
- **Ledger loss becomes uninteresting** — no bucketed enumeration, no title matching, no working
  around `source` not persisting (§5).

Two costs, both manageable, both deliberate:

1. **The write changes the file, which re-triggers the hook.** Mitigation: record the *post-write*
   hash in the ledger in the same step, so the note is already reconciled and does not re-queue.
   Terminates after one write; must be implemented explicitly or it produces a spurious UPDATE per
   note.
2. **The frontmatter is Claude Code's format, not ours.** `metadata` is a nested map and an extra
   key is very likely tolerated, but a future harness version could validate or rewrite it. So the
   id in the file is treated as a *recovery seed*, and **the ledger stays authoritative for
   operations** — if the two disagree, the ledger wins and the file is re-stamped.

Keep both. The ledger is the operational index; the file-embedded id is what survives losing it.

---

## 5. The ledger, and recovering it

`knowz-memory-ledger.json` maps `slug → {id, hash, title, syncedAt}`. It is the only thing making an
edit an UPDATE. It must gain **`title`** (it currently stores only `id` + `hash`), which is what
makes title drift detectable at all.

- **Ordinary loss:** a `.json.bak` is written before every ledger write.
- **Total loss:** rebuild from the vault by **title** — because
  **`create_knowledge` accepts a `source` argument and never persists it** (verified: reads back
  `null` via both CLI and MCP), so provenance cannot be recovered from the item itself.
- Enumeration for a rebuild must be **bucketed** (`"Memory: A*"` … `Z`), because
  **`knowz knowledge list` cannot enumerate past 100 items**: `--page` is ignored (page 2 returns
  page 1 verbatim) and `--page-size` is capped at 100 server-side. A rebuild must abort rather than
  write a partial map — a partial map re-CREATEs every unseen item as a duplicate.

Both platform defects are filed separately; until fixed they constrain this design.

---

## 6. Setup UX

Added to `/knowz setup` **after** `knowz-vaults.md` exists (the vault file supplies the target).

**S5a — confirm the destination vault.** Resolve the default from `knowz-vaults.md`, then *show it
and ask*, offering the other configured vaults and a "don't mirror" option. Never silently inherit a
default for a background process that will write continuously.

```
Memory mirroring will write to:  Knowz Platform Agents  (29e10dfe…)
   [Use this vault]  [Choose another]  [Don't mirror memories]
```

**S5b — offer the hook** (Yes / No / What is this?), and install only on an explicit yes.

**S5c — disclose the manual step, prominently.** This is the requirement, not a nicety:

```
  Memory mirroring is ON.

  Capturing is automatic.  Sending is NOT.
  Run  /knowz flush   to send queued memories to Knowz.
  Run  /knowz status  to see how many are waiting.
```

A queue that fills silently and is never drained is a known local failure: 100 captures once sat
unflushed across three files, and 28 were marked flushed to vaults that no longer existed. The
disclosure and the status line below are what stop that recurring.

---

## 7. Status and flush integration

- **`/knowz status`** grows a memory-mirror block: pending count, orphan count, last sync, target
  vault. This is the anti-rot mechanism — the backlog is visible every time status is checked.
- **`/knowz flush`** drains the memory queue **as well as** the existing capture queue, reporting the
  two separately. One "flush" verb, not two. (The prototype's separate queue and separate drain is
  the main source of confusion today.)
- `/knowz status` should also flag orphans and untracked vault items, since those need a decision.

---

## 7a. This changes writing, not reading — and what would change reading

**The hook is write-only. It has no effect on recall.** Mirroring makes the notes *exist* in Knowz;
it does not make Claude *look* there. Recall today is entirely local: `MEMORY.md` is preloaded every
session and individual notes are surfaced automatically, at zero tool cost. Knowz is consulted only
when a tool call is deliberately made.

That is worth stating plainly because "my memories are in Knowz now" invites the assumption that
answers start consulting Knowz. They do not.

Three levers actually change recall, in increasing bluntness:

| Lever | Effect | Cost |
|---|---|---|
| **CLAUDE.md rule** | Changes behaviour — "search Knowz before answering X" | A tool call when it fires; must be *decided* |
| **SessionStart digest** (`knowz recall --inject`, already in the CLI) | Automatic context every session | Context budget every session; cannot know the question yet |
| *(nothing)* | Local-only, today's behaviour | Free |

A blanket "always search Knowz first" is the wrong rule — it is slow, costs tokens on every turn,
and duplicates what is already in context for free. The useful rule is narrow. Reach for Knowz when:

- the local index holds a *pointer* but not the detail;
- the question is about history — past WorkGroups, why something was decided, prior incidents;
- local memory appears to conflict with the live code.

The harness's own recall path (the `<system-reminder>` injection) is closed and cannot be pointed at
Knowz, so these three levers are the entire option space. Recommendation: a narrow CLAUDE.md rule;
treat the SessionStart digest as a separate, later decision with its own context budget.

---

## 8. Where the code lives

**The CLI owns hook installation and the sync engine; the skill calls it.**

`knowz hooks install` already exists and writes Claude Code hooks. A second, skill-owned hook
installer that does not know about the first is how you end up with two mechanisms fighting over
`settings.json`. Target commands:

- `knowz memory sync [--dry-run] [--reconcile]`
- `knowz memory status`
- `knowz memory orphans [--archive|--delete]`
- extend `knowz hooks install` with the memory-mirror hook

This also ships the capability to other machines and to customers, versioned and testable, instead
of leaving it as untracked scripts in one home directory.

### Phasing

| Phase | Scope | Where |
|---|---|---|
| **P0** | Add `title` to the ledger; stamp `metadata.knowzId` into notes (§4a); add reconcile + auto-flag orphans; close the delete/rename/title gaps | prototype scripts, Alex's Mac |
| **P1** | Setup step (S5a–c), status block, flush integration | `knowz-skills` |
| **P2** | Move engine into the CLI (`knowz memory *`); skill delegates; generalize off the hardcoded vault id | `knowz-platform/cli` |

P0 is worth doing first and standalone: it fixes real correctness on the machine that already has
123 mirrored notes, and it is what P1/P2 wrap.

---

## 9. Open questions

1. ~~**Multi-machine.**~~ **Resolved by §4a** — with the knowledge id stored in the note's own
   frontmatter, a second machine reads it and updates the same item instead of creating a rival
   copy. Independent ledgers no longer imply duplicates. (Still worth a real two-machine test
   before P2 ships to customers; concurrent edits to the same note remain last-write-wins.)
2. **Should `user`-type memories mirror at all?** They are personal-leaning and the work/personal
   tenant split is a hard rule. Current stance: not automatic; route deliberately. One item
   (`alex-employer-and-role`) is dual-targeted to both tenants by owner ruling.
3. **Archive vs delete default** for confirmed orphans (§3.1 proposes archive).
4. **Auto-drain?** A `Stop`-event drain would remove the manual step, at the cost of network calls
   in the session lifecycle and a much larger blast radius for a bug. Deliberately not proposed here.

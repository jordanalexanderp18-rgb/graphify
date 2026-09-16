---
type: "session-log"
purpose: "Continuity across agent sessions — decisions, context and dead ends"
consulted:
  - "[[AGENTS]]"
  - "[[ARCHITECTURE]]"
---

# Sessions

Agent containers are ephemeral. Conversation transcripts do not survive them;
only what is committed does. This file is the durable memory of *why* the code
looks the way it does — the part `git log` and [[CHANGELOG]] cannot carry.

`git log` answers **what changed**. This file answers **what we decided, what we
rejected, and what we already tried that did not work.**

## How to use this file

**At the start of a session:** read the newest 2–3 entries before touching code.
They carry the open threads and the things already ruled out.

**At the end of a session:** add one entry at the top of [[#Log]]. Commit it with
the work it describes, not as a separate housekeeping commit.

Write for an agent that has no other context. Prefer a rejected option with its
reason over a paragraph of narrative. If nothing worth remembering happened, add
nothing — an empty entry is worse than no entry.

## Entry format

Newest first. Copy this skeleton:

```markdown
## YYYY-MM-DD — short title

- **Branch:** `branch-name`
- **Touched:** [[file-or-module]], [[another]]

### Context
Why this session happened. One or two sentences.

### Decisions
- Chose X over Y because Z.

### Rejected
- Tried A — failed because B. Do not retry without B solved.

### Open
- What the next session should pick up.
```

Sections with nothing to say are omitted. `Rejected` is the highest-value
section: it is the only place a dead end gets recorded, and re-walking one
costs a whole session.

### Conventions

- **Wikilinks** (`[[ARCHITECTURE]]`) for anything in the repo. graphify's
  markdown extractor resolves them, so entries become real nodes in the graph
  and the log links itself to the code it describes.
- **Dates**, not session IDs — session IDs are not resolvable after the fact.
- **No secrets.** This file is committed and public. Reference where a
  credential lives, never its value.

## Reading it in Obsidian

The repository root opens directly as an Obsidian vault — the wikilinks and
frontmatter above are already in Obsidian's own format. For the code graph
alongside it:

```sh
graphify export obsidian --dir ~/vault    # one note per node, [[wikilinks]], graph.canvas
```

Pointing `--dir` at an existing vault is safe: graphify tracks the files it owns
in `.graphify_obsidian_manifest.json` and never overwrites notes it did not
write, nor your `.obsidian/` config.

### Keeping the log reachable

A note nothing links to and that links nowhere is invisible in Obsidian's graph.
It still exists on disk, but navigating never arrives at it, so it quietly stops
being memory. A log that reaches that state has failed without any error.

```sh
python scripts/vault_link_check.py ~/vault           # orphans, leaves, broken links
python scripts/vault_link_check.py ~/vault --strict  # exit 1 if any orphan exists
```

`graphify analyze` does not cover this. It reports isolated nodes but filters out
file nodes, and every vault note is a file node, so an orphan note is invisible
to it by construction.

## Log

## 2026-09-16 — Orphan check for vault notes

- **Branch:** `claude/session-history-c0kdq7` (PR #1)
- **Touched:** [[SESSIONS]], `scripts/vault_link_check.py`

### Context
A log only works while it stays reachable, and nothing warns when one stops
being. The check was prompted by an apparently orphaned `LESSONS` note in a
vault. Running it corrected that reading: the note is
`graphify-out/reflections/LESSONS` — generated output, not a hand-maintained log
that drifted. The check still earns its place, because a committed log can drift
and nothing else detects it, but the motivating example was misread.

### Decisions
- Added `scripts/vault_link_check.py`: reports orphans, leaves and broken links.
  Stdlib only, so it runs against a vault on a machine without graphify.
- Code fences and inline code are stripped before scanning. The entry template
  above contains example wikilinks that are not links; counting them would
  invent edges and mask a real orphan.

### Rejected
- Reusing `graphify analyze`. It reports isolated nodes but filters out file
  nodes, and every vault note is a file node, so it structurally cannot see an
  orphan note. Do not retry that path.
- Hand-adding wikilinks to orphans under `graphify-out/`. That tree is
  regenerated, so the edit is lost on the next `graphify update`. Reachability
  for generated artifacts belongs in a hand-written index note that links to
  them, never in the artifacts themselves.

### Open
- This repository is not a wikilink vault: by this measure 360 of its 364 notes
  are orphans, because it uses ordinary markdown links. The check is for an
  Obsidian vault, not for this repo — running it here is expected noise.
- First real vault scan: 8 notes. 5 under `negocio/` in a star around
  `prioridades` (4 of them leaves that link nowhere), 3 generated under
  `graphify-out/`, and `estandares/` holds no notes at all. The leaves are where
  linking would actually add navigability; the generated orphans are expected.

## 2026-09-15 — Establish durable session memory

- **Branch:** `claude/session-history-c0kdq7`
- **Touched:** [[SESSIONS]], [[AGENTS]]

### Context
Asked whether prior sessions were retained anywhere. Verified in-container that
they are not: the transcript at `~/.claude/projects/-home-user-graphify/` held
only the running session, and the account listed no earlier ones. Memory of the
codebase existed ([[CHANGELOG]], `worked/`, git history); memory of the
*reasoning* did not.

### Decisions
- Committed markdown in the repo, over any external store: it travels with the
  clone and survives container recycling, which is the actual failure mode.
- One root-level file rather than `docs/decisions/` — low friction matters more
  than taxonomy until the log is long enough to need splitting.
- Frontmatter + wikilinks so graphify ingests this file into its own graph; the
  session log becomes queryable through the same tooling as the code.
- Referenced from [[AGENTS]] so it loads at session start without being asked.

### Open
- The end-of-session write is convention, not enforcement. A `Stop` hook could
  prompt for it if entries start getting skipped.

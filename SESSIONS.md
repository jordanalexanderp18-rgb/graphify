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

## Log

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

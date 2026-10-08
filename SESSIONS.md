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

## 2026-10-08 — La productora: one front door for every content piece

- **Branch:** `claude/skin-analysis-9qepkz`
- **Touched:** `.claude/skills/productora/`, `.claude/skills/canvas-design/`,
  `.claude/skills/theme-factory/`, `.claude/skills/_vendor/anthropic-skills/`,
  `.claude/skills/reel-studio/SKILL.md`

### Context
After the first reel from the user's own footage, they asked for "una productora" (a
production studio) and authorized downloading every skill it needs.

### Decisions
- `productora` is an umbrella skill. It has a service menu that routes each piece to the
  skill that owns it, a brief template, a brand profile per client under `clientes/`,
  quality gates and delivery specs. Jordan is client zero.
- canvas-design and theme-factory were vendored from anthropics/skills under Apache-2.0;
  the fonts are SIL OFL. The audit found instructions only, and the showcase PDF has no
  actions. The commit is recorded in `_vendor/anthropic-skills/UPSTREAM`.
- Static pieces render with `scripts/render_slides.sh`. It uses the headless Chromium that
  ships in the image, opens `?slide=N` once per slide, and sets `--virtual-time-budget` so
  the fonts load. Seven slides take about 6 s.
- `scripts/finish_reel.sh` replaces mastering the voice alone. A mono voice mastered to
  −14 LUFS measured −11 LUFS once rendered as stereo. Mastering the final mix fixes that,
  and the CRF 19 copy capped at 9 Mbit/s is 16 MB with SSIM 0.99.
- First repurpose: the squat reel also became a 7-slide carousel and a reel cover. Both
  designs live in `productora/templates/`.
- The user wants to sell the productora as a service. `productora/VENTAS.md` holds the
  price list in CLP: per piece, with a launch price and a normal price, plus 3 monthly plans
  from $180.000 to $600.000. It also covers costs (Claude Max and HeyGen Creator, about
  $116.000 a month), equipment (a phone kit for about $40.000), the sales steps, a contract
  checklist and SII registration. The prices come from public October 2026 sources (Chile
  and LatAm) at about $900 per dollar, and the file cites them. The tax points are general
  guidance only: confirm with an accountant before the first sale.
- The studio's working name is "Pincheira Studio": the user said Pincheira should be in it,
  and they left the choice to me. The price list (`templates/tarifario.html`, 5 slides,
  "con video" and "sin video") and the recording guide for clients
  (`templates/guia-grabacion.html`) render with `render_slides.sh`. When the HTML has an
  `@page` rule, the script also prints `slides.pdf`. VENTAS.md now lists exactly the
  published prices.

### Open (added later the same day)
- The user's first test client is their partner, the next day. Their business or topic is
  still unknown. Write the script once the user says it, then follow the footage route.

### Rejected
- marcolang/marketing-skills (instagram-carousel) and hoodini/ai-agents-skills
  (yuv-reel-covers) were not vendored because neither has a LICENSE. The cover skill is
  also built around another person's face and brand.
- The third-party music skills (ElevenLabs and inference.sh generators) need paid APIs.
  Music comes from Instagram's in-app library instead.

### Open
- Client work needs a private repo, because this one is public. The user has to create it
  and grant the Claude GitHub App access.
- The productora has no name yet. Ask the user.
- The carousel copy was rendered without approval, under the user's "elige tú". Adjust it
  if they ask.

## 2026-10-08 — First reel cut from the user's own footage

- **Branch:** `claude/skin-analysis-9qepkz`
- **Touched:** `.claude/skills/reel-studio/` (SKILL.md section 4, `new-reel.sh` template
  argument, `template-footage/`)

### Context
The user disliked the talking-avatar test and wanted reels made from their real gym
videos. They put 3 originals in a Drive folder: 2019 clips, 4K HEVC, about 30 s and
145 MB each. For the topic and script they said "elige tú".

### Decisions
- The reel was edited locally with HyperFrames, not with HeyGen's Video Agent. Locally we
  can see the footage, cut on the reps and keep the brand captions. HeyGen supplies only the
  voice: `create_speech` with the cloned voice "Jor" cost 1 credit for 23 s and returns
  word timestamps.
- The footage set the topic. The clips are a bodyweight squat, a barbell back squat and a heavy
  squat with a spotter, so the reel is "3 levels of squat" and opens on the heaviest clip.
  It uses standard coaching cues only.
- The environment's network access is now Custom: package managers plus
  `drive.usercontent.google.com`, `drive.google.com` and `*.heygen.ai`. The user set it at
  claude.ai/code in the phone's browser, under session menu → "Editar entorno de nube".
  The Android app has no such option. The running container picked up the change within a minute.
- `template-footage/` keeps the composition, and `new-reel.sh <dir> template-footage`
  scaffolds a new project from it.

### Rejected
- HeyGen URL inputs (`files[]` with `url`, or a scene's `source.url`) are capped at 32 MB per
  video, so the 145 MB originals fail with `invalid_parameter`. HeyGen itself did fetch the
  public Drive link.
- A helper session from `create_session` cannot move the bytes from Drive to HeyGen's S3. It
  runs in the same environment and got the same policy denial. Fix the allowlist instead.
- Trimming the clips under the 30 MB chat limit was rejected because the user wanted the whole
  videos used.
- On the first try the user pasted the domains into "Script de configuración", the setup
  script, which would break session startup. Domains go in "Dominios permitidos" under
  "Personalizado".

### Open
- The Drive folder is shared as "Editor", so anyone with the link can edit it. The user was
  asked to switch it to "Lector".
- Three HeyGen direct-upload slots were created and never completed. They expire on their own.
- The reel has voice only. The user can add a track from Instagram's library at low volume.
- The render and the final MP4 live only in the scratchpad, not in git.

## 2026-10-08 — Free local video editing: HyperFrames, video-use, reel-studio

- **Branch:** `claude/skin-analysis-9qepkz`
- **Touched:** `.claude/skills/hyperframes*`, `media-use`, `general-video`,
  `embedded-captions`, `talking-head-recut`, `motion-graphics`, `video-use`,
  `.claude/skills/reel-studio/`, `.claude/skills/_vendor/`

### Context
The user asked to stop paying for editors (CapCut Pro) and have Claude do the
editing, using "the best skills". Paying for the avatar and voice (HeyGen) stays
open for them to decide.

### Decisions
- Researched the zhuyansen/awesome-claude-video-skills list (252 repos, each
  security-graded). Chose heygen-com/hyperframes (Apache-2.0, about 57k stars):
  14 skills, the core set plus the general-video, embedded-captions,
  talking-head-recut and motion-graphics workflows. Also chose browser-use/video-use
  (MIT) for cutting raw takes. Both were audited and vendored unmodified;
  the audited commits are in `_vendor/*/UPSTREAM`.
- HyperFrames telemetry is anonymous and documented; turn it off with
  `HYPERFRAMES_NO_TELEMETRY=1`. Set `HYPERFRAMES_SKIP_SKILLS=1` so `init` stops
  syncing skills into `~/.claude/skills`, because the project copies are canonical.
- huggingface.co is blocked by this environment's network policy. Parakeet v3
  (Spanish ASR) comes from the k2-fsa GitHub release instead. Its 4 files match
  the sha256 values HyperFrames pins byte for byte; `setup.sh` verifies them.
  Parakeet transcribes 30 s of Spanish in about 9.5 s on CPU, with word timings.
- video-use needs ElevenLabs Scribe, but `reel-studio/parakeet_to_scribe.py`
  writes a Scribe-shaped transcript and video-use's cache then skips the upload.
  Tested through `pack_transcripts.py`.
- Built a 15 s demo reel: Kokoro `em_alex` voice, round-trip-transcribed to verify
  the words, mastered to −13.6 LUFS, rendered in 39 s. `check` passes (layout,
  motion, 42/42 contrast). It is now `reel-studio/template/`.
- Brand: bg `#15100c`, fg `#f7efe6`, accent `#ff5400`, Anton plus JetBrains Mono.
  Inter is on HyperFrames' generic-font list.

### Rejected
- calesthio/OpenMontage (about 64k stars): AGPL and very large (700+ files). It
  wraps HyperFrames/Remotion, which we now use directly.
- remotion-dev/skills: no LICENSE (see the entry below). HyperFrames covers the same ground.
- The default whisper models (`small.en` and the rest) are English only and their
  downloads 403 here. Use `--engine parakeet --language es`.
- A Studio preview before render: it runs on this server and the user's phone
  cannot reach it. Send the MP4 with SendUserFile.

### Open
- Not yet tested on the user's own footage. `embedded-captions` matting
  (u2net from a GitHub release, reachable) has not run yet. Ask for a 10–20 s clip.
- The user put 2 clips on Google Drive (59 MB and 76 MB screen recordings) and said they
  had added the Drive domains to the environment's allowlist. The edit never took effect:
  this container and a brand-new helper session in the same environment (the account has
  only one, "Predeterminado") both got a 403 policy denial at CONNECT for
  `drive.usercontent.google.com`. Resolved later that day: the domains are now under Allowed
  domains (see the entry above). Their links are
  deliberately not stored here, because this repo is public and the files are shared by
  link. Download with
  `curl -L "https://drive.usercontent.google.com/download?id=<ID>&export=download&confirm=t"`.
  The Drive connector works with the user's account (metadata, permissions, search),
  but `download_file_content` refuses files over 10 MB, so it cannot carry video.
- The chat upload limit is about 30 MB. Original clips trimmed to 15–20 s at 1080p fit;
  screen recordings carry phone UI and lose quality, so ask for the original file.
- HeyGen is live: the user is on the Creator plan (600 credits a month) and owns a digital-twin
  avatar "Jor" with a cloned Spanish voice "Jor". The connector is the custom one at
  `https://mcp.heygen.com/mcp/v1` (tools `mcp__HeyGen__*`); the claude.ai directory only lists
  "HyperFrames by HeyGen", which has no avatar tools. For an exact script use
  `create_video_from_avatar`; the Video Agent rewrites scripts. The cloned voice also runs on
  the ElevenLabs engines inside HeyGen, so a separate ElevenLabs plan is not needed.
  The HeyGen media hosts (`*.heygen.ai`) were blocked at first. They are now allowed (see
  the entry above), so HeyGen audio and renders can be downloaded here.
  IDs are deliberately not stored here.
- The user expected reels cut from their own gym footage, not a talking avatar.
  `create_video_from_studio`, `create_video_agent` and `create_ai_clipping` accept
  `{"type":"url"}` sources, and HeyGen does fetch a public Drive direct link (it reported
  the file's exact size). URL inputs are capped at 32 MB per video, though, and the user's
  originals are about 145 MB each. Larger files go through `create_asset_upload`: PUT the
  bytes to the presigned URL on `heygen-resources-prod.s3-accelerate.amazonaws.com`
  (reachable here, valid 24 h), sending `Content-Type: video/mp4` and
  `x-amz-server-side-encryption: AES256`, then call `complete_asset_upload`. That needs the
  bytes in a container that can reach Drive. A helper session from `create_session` can do
  the transfer, but it cannot message back, so read its result with `list_events`.
- The auto-mode classifier blocks HeyGen renders as "Real-World Transactions" until the
  user OKs spending credits in the conversation. Ask before rendering, even for a test.
- Lint warns `nested_structure_needs_subcomposition` for the single-file template.
  That only affects how Studio displays the timeline; the render is correct.
- `pytest` here: test_skillgen fails because the clone is shallow (baseline
  commit 47042beb missing), and test_ollama_retry_cap fails because `openai`
  is not installed. Both are environmental: 5489 other tests pass, and CI runs `uv sync --all-extras`.

## 2026-10-08 — HeyGen and social/video skills, AI avatar route

- **Branch:** `claude/skin-analysis-9qepkz`
- **Touched:** `.claude/skills/heygen-*`, `.claude/skills/social`, `.claude/skills/video`, `.claude/skills/_vendor/`

### Context
The user (fitness account, wants content and AI rather than sales) asked for
every skill covering Instagram, WhatsApp and Facebook. They also want an AI
avatar that explains workouts for them, because they find talking on camera hard.

### Decisions
- Vendored `heygen-avatar` and `heygen-video` from heygen-com/skills (the
  official vendor, MIT). They talk only to the HeyGen MCP
  (`mcp.heygen.com`, OAuth, uses the user's paid plan credits).
  `update-check.sh` only curls the VERSION file from GitHub.
- Vendored `social` and `video` from coreyhaines31/marketingskills (MIT). Both
  are text only. The `curl` recipes in `social` read public APIs (Reddit, HN,
  Bluesky) and nothing else.
- License and audited commit for each source go in `.claude/skills/_vendor/<source>/`.
  `instagram-agent/` moved there too, so `.claude/skills/` holds only real skills.
- The auto-mode classifier blocks copying third-party code into the repo until
  the user approves it explicitly. Ask first.

### Rejected
- lharries/whatsapp-mcp: it reads every personal chat into local SQLite, needs a
  Go bridge on the user's machine, and is unofficial, so the number risks a ban.
  Do not install it without the user accepting those risks explicitly.
- The Facebook Graph skill on claudskills.com: unknown author, needs a Page
  token, and `social` already covers writing Facebook content.

### Open
- HeyGen is not connected yet. The user needs a HeyGen plan and
  `claude mcp add --transport http heygen https://mcp.heygen.com/mcp/v1/` on
  their own machine, then `/heygen-avatar` with a photo.
- The user has not applied the profile rewrite yet: name "Jordan Pincheira | Fitness",
  public creator account, highlights by topic.
- Proposed stack, awaiting the user's yes or no: HeyGen Creator, about US$29/month
  billed monthly. CapCut Pro is deferred. ElevenLabs is not needed because HeyGen
  clones the voice. Start with the account private and go public once videos work.
- Longer-term goal: use this content channel to promote the user's
  "Smart"/PowerPoint app. That app is not in this repo or on their GitHub
  (list_repos shows graphify only), so ask for it when that work starts.
  Update, 2026-10-08: Smart generates .pptx decks with AI for students and teachers
  in Chile (school talks, "disertaciones"). It starts from scratch in its own private repo,
  `smart-presentaciones`, kept separate from graphify. The GitHub integration cannot
  create repos (403 "Resource not accessible by integration"), so the user creates it
  and grants the Claude GitHub App access. The MVP plan (PLAN.md) goes in that repo:
  Netlify Function → claude-opus-5-5 structured output → PptxGenJS in the browser.
- remotion-dev/skills has no LICENSE. Do not vendor it; install it with
  `npx skills add remotion-dev/skills` on the user's machine.

## 2026-10-08 — Vendored instagram-agent-skill

- **Branch:** `claude/skin-analysis-9qepkz`
- **Touched:** `.claude/skills/ig-*`, `.claude/skills/_vendor/instagram-agent/`, `.gitignore`

### Context
The user found Jake Schincariol's instagram-agent-skill (13 Claude skills, MIT)
in an Instagram reel and asked for a malware check, then a copy in this repo.

### Decisions
- Audited upstream at the commit in `.claude/skills/_vendor/instagram-agent/UPSTREAM`
  before copying. Python is stdlib only, with no network, subprocess or eval.
  It only reads input you pass it and writes to `~/.claude/instagram/`. No
  hooks and no hidden Unicode. The SKILL.md files forbid auto-posting, DM
  automation and asking for passwords.
- `.gitignore`: `.claude/` became `.claude/*` with `!.claude/skills/**`, so only
  the skills are tracked. `settings.json` and other local state stay ignored.
- Vendored as-is, with no edits, so a re-audit against upstream is a plain diff.

### Open
- Hook scoring is tuned for English. Spanish hooks score lower. The same
  "lost $18,000" hook scored 81 in English and 60 in Spanish. A Spanish lexicon is
  possible follow-up work.
- These are not graphify code. Keep them out of `graphify/skills/` and skillgen.

## 2026-10-02 — Command board across agents

- **Branch:** `claude/session-history-c0kdq7` (restarted from v8 after PR #2 merged)
- **Touched:** [[SESSIONS]], `scripts/mando_install.py`

### Context
Three agents — Claude Code, Cursor, Gemini — on the same project, each starting
cold from its own idea of what matters, quietly contradicting each other. The
ask was a command centre with one of them in charge.

### Decisions
- One board, `MANDO.md`, versioned in the repo: orders in, status out. It
  travels with the clone, so the agents share it without depending on any
  conversation.
- Per-agent hooks generated from that one source — `AGENTS.md` (Claude),
  `.cursor/rules/mando.mdc` (Cursor), `GEMINI.md` (Gemini) — so there is one
  place to change what all three are told.
- Hooks are spliced between `<!-- mando:begin/end -->` markers, so a file the
  user also edits by hand keeps everything outside them and the generated text
  never duplicates.
- A blocked task must be marked `[!]` with a reason. An agent stopping silently
  is the expensive failure: the next one re-walks the same dead end.

### Rejected
- A live control channel from the cloud session to Cursor or Gemini on the
  user's machine. No bridge exists between this container and their Windows box.
  Orders travel through git; the local Claude Code is the only thing that can
  actually execute. Do not promise otherwise.

### Open
- Verified: installs onto a project with an existing `AGENTS.md` without losing
  its content, is idempotent, replaces a stale block between markers, and keeps
  hand-written text outside them.
- The board is written once and then left alone; nothing yet prunes finished
  tasks out of it.

## 2026-09-16 — Vault rules for agents

- **Branch:** `claude/session-history-c0kdq7` (restarted from v8 after PR #1 merged)
- **Touched:** [[SESSIONS]], `scripts/vault_scaffold.py`

### Context
An agent opened on the vault knows none of its conventions: it will happily edit
generated output, leave a note unlinked, or invent content to fill a gap. The
repo had `AGENTS.md` for exactly this; the vault had nothing.

### Decisions
- The scaffold now writes `AGENTS.md` and `.cursor/rules/vault.mdc` into the
  vault, so Claude Code and Cursor get the same rules from their own conventions.
- Added "do not invent content" as a rule. It comes from a real incident: a note
  turned out to be a stale duplicate, and the tempting fix was to write a
  plausible replacement from one line of context. A stub is recoverable; invented
  detail becomes indistinguishable from real notes within weeks.
- `--with-tools` copies the checker into the vault's `.tools/`, so an agent
  verifying its own work runs it from inside its working directory instead of
  triggering a read-outside-working-directory prompt.

### Rejected
- Copying graphify's own `.cursor/rules/graphify.mdc` into the vault. It is
  written for code ("codebase", "symbols", `graphify query`) and a vault of prose
  notes is not that. Wrong rules are worse than none — the agent follows them.

### Open
- Verified against a replica matching the live vault exactly (17 notes, 0
  orphans, 3 leaves, 0 broken links before; 18 and still clean after). The
  checker copied into `.tools/` runs correctly from inside the vault.

## 2026-09-16 — Vault scaffolding

- **Branch:** `claude/session-history-c0kdq7` (PR #1)
- **Touched:** [[SESSIONS]], `scripts/vault_scaffold.py`

### Context
The first vault scan found a star: one note linking four others, three orphans,
and an empty area folder. A vault with no entry point degrades into a pile —
notes exist and nothing points at them — so the gap was structural, not content.

### Decisions
- `scripts/vault_scaffold.py` writes one index note, a map-of-content note per
  area, and three templates. Templates matter because a note that is not linked
  when it is created almost never gets linked afterwards.
- Never overwrite: an existing note is skipped and reported, so the script is
  safe to re-run and safe against a vault that already has content.
- Generated artifacts are made reachable by linking *into* `graphify-out/` from
  a hand-written reference note, never by editing the artifacts.
- Files are written with `newline="\n"` so a vault synced across machines does
  not show every line as changed.

### Rejected
- Writing into the vault from the agent's own container. The vault is on the
  user's Windows machine and this container is a remote Linux box with no access
  to it; an installer the user runs is the only path that works.

### Open
- Verified on a replica of the real vault: 3 orphans and 0 broken links before,
  0 orphans and 0 broken links after, 8 notes to 17. The four `negocio/` leaves
  still link nowhere — that needs their content, not more structure.

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

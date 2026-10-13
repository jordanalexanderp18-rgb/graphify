## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)

## sessions

SESSIONS.md is this repo's session memory — decisions, rejected approaches and open threads
that git history cannot carry.

Rules:
- At session start, read the newest 2-3 entries in SESSIONS.md before touching code
- At session end, add an entry at the top of its Log section, committed alongside the work
- Check the Rejected sections before retrying an approach — a dead end costs a whole session

## heygen

The user's standing rule, given 2026-10-08: "No ocupes la HeyGen, siempre pregúntame."

Rules:
- Never call a HeyGen tool without asking the user in the conversation first, every time. Free
  calls count too (`list_voices`, `get_current_user`), not only the ones that spend credits
- An OK covers only the job it was given for. It does not carry over to the next piece or session
- Without an OK, take a route without HeyGen: the person's own recorded voice, the local voice
  (`hyperframes tts`), or no voice

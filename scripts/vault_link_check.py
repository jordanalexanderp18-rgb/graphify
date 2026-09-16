#!/usr/bin/env python3
"""Report orphan notes in an Obsidian vault.

An orphan is a note nothing links to and that links nowhere: it exists on disk
but no amount of navigating the graph reaches it, so in practice nobody reads
it. A LESSONS.md or SESSIONS.md that drifts into this state is the failure this
checks for -- the note is still there, it has just stopped being memory.

`graphify analyze` reports isolated nodes but deliberately skips file nodes
(analyze.py, the `_is_file_node` filter). Every vault note is a file node, so
that check cannot see this case; hence this script.

Usage:
    python scripts/vault_link_check.py ~/vault
    python scripts/vault_link_check.py ~/vault --strict     # exit 1 if orphans
    python scripts/vault_link_check.py ~/vault --quiet      # only the summary

Stdlib only -- it runs against a vault on a machine that need not have
graphify installed.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

# [[target]], [[target|alias]], [[target#heading]], [[folder/target]].
# The target stops at | # and ] so aliases and heading anchors never leak in.
_WIKILINK_RE = re.compile(r"\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]")
_FENCE_RE = re.compile(r"^\s*(```|~~~)")
_INLINE_CODE_RE = re.compile(r"`[^`\n]*`")

SKIP_DIRS = {".obsidian", ".git", ".trash", "node_modules", "__pycache__"}


def strip_code(text: str) -> str:
    """Drop fenced blocks and inline code so template examples aren't read as links.

    A doc that shows `[[file-or-module]]` inside a ```markdown fence is
    documenting the syntax, not linking. Counting those invents edges that the
    Obsidian graph itself will never draw, which would hide a real orphan.
    """
    out, in_fence, fence = [], False, ""
    for line in text.splitlines():
        m = _FENCE_RE.match(line)
        if m:
            if not in_fence:
                in_fence, fence = True, m.group(1)
                continue
            if line.strip().startswith(fence):
                in_fence = False
                continue
        if not in_fence:
            out.append(_INLINE_CODE_RE.sub("", line))
    return "\n".join(out)


def note_key(path: Path, root: Path) -> str:
    """Vault-relative path without the .md suffix, forward-slashed."""
    return path.relative_to(root).with_suffix("").as_posix()


def resolve(target: str, source: Path, root: Path, by_key: dict, by_stem: dict):
    """Resolve one wikilink target to a note, following Obsidian's own order.

    Obsidian tries the literal vault-relative path first, then a path relative
    to the linking note, then falls back to a unique basename match anywhere in
    the vault. A basename matching several notes is ambiguous, and Obsidian
    picks by proximity; treating it as unresolved would be a false orphan
    report, so an ambiguous hit still counts as a link.
    """
    t = target.strip().strip("/")
    if not t:
        return None
    t = t[:-3] if t.endswith(".md") else t

    if t in by_key:
        return by_key[t]

    rel = (source.parent / t).resolve()
    try:
        k = rel.relative_to(root.resolve()).as_posix()
    except ValueError:
        k = None
    if k and k in by_key:
        return by_key[k]

    hits = by_stem.get(Path(t).name, [])
    return hits[0] if hits else None


def main() -> int:
    ap = argparse.ArgumentParser(description="Report orphan notes in an Obsidian vault.")
    ap.add_argument("vault", type=Path, help="path to the vault root")
    ap.add_argument("--strict", action="store_true", help="exit 1 when orphans exist")
    ap.add_argument("--quiet", action="store_true", help="print only the summary")
    args = ap.parse_args()

    # Note names come from the vault, and vault titles carry emoji, check marks
    # and other symbols freely. A legacy Windows console is cp1252/cp850, which
    # encodes Latin accents fine but not those: printing one raises
    # UnicodeEncodeError and kills the run halfway through the report, so the
    # offending note is the last thing seen and it reads as a crash the script
    # caused. Degrade the character instead of the report.
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, OSError):
            pass

    root = args.vault.expanduser()
    if not root.is_dir():
        print(f"error: not a directory: {root}", file=sys.stderr)
        return 2

    notes = sorted(
        p for p in root.rglob("*.md")
        if not any(part in SKIP_DIRS for part in p.relative_to(root).parts)
    )
    if not notes:
        print(f"error: no .md notes under {root}", file=sys.stderr)
        return 2

    by_key = {note_key(p, root): p for p in notes}
    by_stem: dict[str, list[Path]] = {}
    for p in notes:
        by_stem.setdefault(p.stem, []).append(p)

    outgoing: dict[Path, set] = {p: set() for p in notes}
    incoming: dict[Path, set] = {p: set() for p in notes}
    unresolved: list[tuple[Path, str]] = []

    for p in notes:
        try:
            body = strip_code(p.read_text(encoding="utf-8", errors="replace"))
        except OSError as e:
            print(f"warning: cannot read {p}: {e}", file=sys.stderr)
            continue
        for m in _WIKILINK_RE.finditer(body):
            tgt = resolve(m.group(1), p, root, by_key, by_stem)
            if tgt is None:
                unresolved.append((p, m.group(1).strip()))
            elif tgt != p:  # a self-link does not connect a note to anything
                outgoing[p].add(tgt)
                incoming[tgt].add(p)

    orphans = [p for p in notes if not outgoing[p] and not incoming[p]]
    dangling = [p for p in notes if incoming[p] and not outgoing[p]]

    if not args.quiet:
        if orphans:
            print(f"ORPHANS ({len(orphans)}) - nothing links in, nothing links out:")
            for p in orphans:
                print(f"  {note_key(p, root)}")
            print()
        if dangling:
            print(f"LEAVES ({len(dangling)}) - reachable, but link nowhere themselves:")
            for p in dangling:
                print(f"  {note_key(p, root)}")
            print()
        if unresolved:
            print(f"BROKEN LINKS ({len(unresolved)}):")
            for src, tgt in unresolved:
                print(f"  {note_key(src, root)} -> [[{tgt}]]")
            print()

    print(
        f"{len(notes)} notes | {len(orphans)} orphans | "
        f"{len(dangling)} leaves | {len(unresolved)} broken links"
    )
    return 1 if (args.strict and orphans) else 0


if __name__ == "__main__":
    raise SystemExit(main())

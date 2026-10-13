#!/usr/bin/env python3
"""Free local transcription for video-use: Parakeet v3 (via HyperFrames) -> Scribe JSON.

video-use's transcribe.py uploads to ElevenLabs Scribe, but skips the upload when
<edit_dir>/transcripts/<stem>.json already exists. This script writes that file
from a local Parakeet run, so video-use works without an ElevenLabs key.

Parakeet drops most filler sounds ("eh", "mmm") that Scribe would tag. Silences
and retakes still show up as gaps between words, which is what cuts are built on.

Usage:
    python3 parakeet_to_scribe.py <video> [--edit-dir DIR] [--language es] [--force]
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

TOOLS = Path(os.environ.get("REEL_TOOLS", Path.home() / ".cache" / "reel-studio" / "tools"))
SPEAKER = "speaker_0"


def hyperframes_cmd() -> list[str]:
    local = TOOLS / "node_modules" / ".bin" / "hyperframes"
    if local.exists():
        return [str(local)]
    if shutil.which("hyperframes"):
        return ["hyperframes"]
    sys.exit("hyperframes CLI not found: run .claude/skills/reel-studio/setup.sh first")


def parakeet_words(video: Path, language: str) -> list[dict]:
    env = dict(os.environ, HYPERFRAMES_NO_TELEMETRY="1", DO_NOT_TRACK="1")
    with tempfile.TemporaryDirectory() as tmp:
        cmd = hyperframes_cmd() + [
            "transcribe", str(video), "--engine", "parakeet",
            "--language", language, "--dir", tmp, "--json",
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, env=env)
        if res.returncode != 0:
            sys.exit(f"hyperframes transcribe failed:\n{res.stdout[-800:]}{res.stderr[-800:]}")
        data = json.loads((Path(tmp) / "transcript.json").read_text())
    return data if isinstance(data, list) else data.get("words", [])


def to_scribe(words: list[dict], language: str) -> dict:
    """Interleave 'spacing' tokens between words, the way Scribe reports gaps."""
    out: list[dict] = []
    for w in words:
        text = (w.get("text") or "").strip()
        if not text:
            continue
        start, end = float(w["start"]), float(w["end"])
        if out:
            prev_end = out[-1]["end"]
            out.append({"text": " ", "start": prev_end, "end": max(prev_end, start),
                        "type": "spacing", "speaker_id": SPEAKER})
        out.append({"text": text, "start": start, "end": end, "type": "word", "speaker_id": SPEAKER})
    spoken = " ".join(w["text"] for w in out if w["type"] == "word")
    return {"language_code": language, "text": spoken, "words": out}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("video", type=Path)
    ap.add_argument("--edit-dir", type=Path, help="video-use edit dir (default: <video dir>/edit)")
    ap.add_argument("--language", default="es")
    ap.add_argument("--force", action="store_true", help="overwrite an existing transcript")
    args = ap.parse_args()

    video = args.video.resolve()
    if not video.exists():
        sys.exit(f"no such file: {video}")
    edit_dir = (args.edit_dir or (video.parent / "edit")).resolve()
    out_path = edit_dir / "transcripts" / f"{video.stem}.json"
    if out_path.exists() and not args.force:
        print(f"cached: {out_path}")
        return

    scribe = to_scribe(parakeet_words(video, args.language), args.language)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(scribe, ensure_ascii=False, indent=1))
    n = sum(1 for w in scribe["words"] if w["type"] == "word")
    print(f"wrote {out_path} ({n} words)")


if __name__ == "__main__":
    main()

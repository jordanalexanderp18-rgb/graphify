#!/usr/bin/env bash
# Scaffold a 1080x1920 HyperFrames reel project from the reel-studio template.
#
#   bash .claude/skills/reel-studio/new-reel.sh <project-dir>
#
# The project gets the template composition, its BRIEF.md, the brand fonts
# (copied from the vendored HyperFrames skills) and a local GSAP, so it renders
# with no network access. Run setup.sh first.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
skills="$(cd "$here/.." && pwd)"
TOOLS="${REEL_TOOLS:-$HOME/.cache/reel-studio/tools}"
HF="$TOOLS/node_modules/.bin/hyperframes"
dest="${1:?usage: new-reel.sh <project-dir>}"

[ -x "$HF" ] || { echo "hyperframes CLI missing: run $here/setup.sh first" >&2; exit 1; }
[ -e "$dest" ] && { echo "$dest already exists" >&2; exit 1; }

export HYPERFRAMES_NO_TELEMETRY=1 DO_NOT_TRACK=1 HYPERFRAMES_SKIP_SKILLS=1
"$HF" init "$dest" --non-interactive --example=blank --resolution=portrait --skill=general-video >/dev/null

cp "$here/template/index.html" "$here/template/BRIEF.md" "$dest/"
mkdir -p "$dest/assets/fonts"
cp "$skills/embedded-captions/modes/standard/fonts/files/anton-latin-400-normal.woff2" "$dest/assets/fonts/"
cp "$skills/hyperframes-creative/frame-presets/code-editorial/fonts/JetBrainsMono-400.woff2" \
   "$skills/hyperframes-creative/frame-presets/code-editorial/fonts/JetBrainsMono-700.woff2" "$dest/assets/fonts/"
cp "$TOOLS/node_modules/gsap/dist/gsap.min.js" "$dest/assets/"

echo "Created $dest. Next: generate assets/voz.wav, transcribe it, then edit index.html and BRIEF.md."

#!/usr/bin/env bash
# reel-studio setup: provisions the free, local video toolchain in a fresh
# (cloud) session. Idempotent; a re-run only fills what is missing.
#
#   bash .claude/skills/reel-studio/setup.sh               # HyperFrames + Parakeet + Kokoro
#   bash .claude/skills/reel-studio/setup.sh --video-use   # also video-use's Python deps
#
# Afterwards:  source "$HOME/.cache/reel-studio/env.sh"
set -euo pipefail

HF_VERSION="0.8.141"
GSAP_VERSION="3.14.2"
TOOLS="${REEL_TOOLS:-$HOME/.cache/reel-studio/tools}"
VENV="$TOOLS/venv"
export HYPERFRAMES_NO_TELEMETRY=1 DO_NOT_TRACK=1 HYPERFRAMES_SKIP_SKILLS=1

with_video_use=0
[ "${1:-}" = "--video-use" ] && with_video_use=1

say() { printf '\033[1m==>\033[0m %s\n' "$*"; }
mkdir -p "$TOOLS"

# 1. HyperFrames CLI (official npm package from heygen-com/hyperframes), pinned.
HF="$TOOLS/node_modules/.bin/hyperframes"
if [ ! -x "$HF" ] || [ "$("$HF" --version 2>/dev/null)" != "$HF_VERSION" ]; then
  say "Installing hyperframes@$HF_VERSION and gsap@$GSAP_VERSION"
  npm install --prefix "$TOOLS" --no-fund --no-audit --save-exact \
    "hyperframes@$HF_VERSION" "gsap@$GSAP_VERSION" >/dev/null
fi

# 2. Headless Chrome for rendering.
say "Ensuring the render browser"
"$HF" browser ensure >/dev/null

# 3. Parakeet v3 (multilingual ASR, Spanish included). HyperFrames downloads it
#    from huggingface.co, which some network policies block. The k2-fsa GitHub
#    release ships the identical files; they are verified against the sha256
#    values HyperFrames pins in packages/cli/src/whisper/sherpa.ts.
M="$HOME/.cache/hyperframes/parakeet/parakeet-tdt-0.6b-v3-int8"
verify_parakeet() {
  [ -d "$M" ] || return 1
  (cd "$M" && sha256sum -c --quiet - >/dev/null 2>&1) <<'EOF'
acfc2b4456377e15d04f0243af540b7fe7c992f8d898d751cf134c3a55fd2247  encoder.int8.onnx
179e50c43d1a9de79c8a24149a2f9bac6eb5981823f2a2ed88d655b24248db4e  decoder.int8.onnx
3164c13fc2821009440d20fcb5fdc78bff28b4db2f8d0f0b329101719c0948b3  joiner.int8.onnx
d58544679ea4bc6ac563d1f545eb7d474bd6cfa467f0a6e2c1dc1c7d37e3c35d  tokens.txt
EOF
}
if ! verify_parakeet && ! "$HF" models install parakeet >/dev/null 2>&1; then
  say "huggingface.co unreachable; fetching Parakeet from the k2-fsa GitHub release"
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  curl -fsSL --retry 3 -o "$tmp/parakeet.tar.bz2" \
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2"
  tar -xjf "$tmp/parakeet.tar.bz2" -C "$tmp"
  mkdir -p "$M"
  for f in encoder.int8.onnx decoder.int8.onnx joiner.int8.onnx tokens.txt; do
    cp "$tmp/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/$f" "$M/"
  done
  if ! verify_parakeet; then
    rm -rf "$M"
    echo "Parakeet files did not match the pinned sha256; removed them." >&2
    exit 1
  fi
fi
say "Installing the Parakeet runtime"
"$HF" models install parakeet >/dev/null

# 4. Local Python venv: Kokoro TTS (Spanish voices em_alex / em_santa / ef_dora).
if [ ! -x "$VENV/bin/python" ]; then
  say "Creating $VENV"
  if command -v uv >/dev/null; then uv venv -q "$VENV"; else python3 -m venv "$VENV"; fi
fi
pip_install() {
  if command -v uv >/dev/null; then VIRTUAL_ENV="$VENV" uv pip install -q "$@"
  else "$VENV/bin/pip" install -q "$@"; fi
}
"$VENV/bin/python" -c "import kokoro_onnx, soundfile" 2>/dev/null || { say "Installing Kokoro TTS"; pip_install kokoro-onnx soundfile; }
if [ "$with_video_use" = 1 ]; then
  "$VENV/bin/python" -c "import requests, librosa, matplotlib, PIL, numpy" 2>/dev/null \
    || { say "Installing video-use Python deps"; pip_install requests librosa matplotlib pillow numpy; }
fi

cat > "$HOME/.cache/reel-studio/env.sh" <<EOF
export REEL_TOOLS="$TOOLS"
export PATH="$VENV/bin:$TOOLS/node_modules/.bin:\$PATH"
export HYPERFRAMES_NO_TELEMETRY=1 DO_NOT_TRACK=1 HYPERFRAMES_SKIP_SKILLS=1
EOF
say "Ready. Run: source \"\$HOME/.cache/reel-studio/env.sh\""

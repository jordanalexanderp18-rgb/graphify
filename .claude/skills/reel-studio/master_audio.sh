#!/usr/bin/env bash
# Two-pass EBU R128 loudness normalization for Reels/TikTok/Shorts:
# -14 LUFS integrated, -1.5 dBTP true-peak ceiling, 48 kHz.
#
#   bash .claude/skills/reel-studio/master_audio.sh <in.wav|in.mp4> <out.wav>
set -euo pipefail

in="${1:?usage: master_audio.sh <in> <out.wav>}"
out="${2:?usage: master_audio.sh <in> <out.wav>}"
target="loudnorm=I=-14:TP=-1.5:LRA=7"

stats="$(ffmpeg -hide_banner -nostats -i "$in" -vn -af "$target:print_format=json" -f null - 2>&1 | sed -n '/^{/,/^}/p')"
read -r I TP LRA TH OFF < <(printf '%s' "$stats" | python3 -I -c \
  "import json,sys; d=json.load(sys.stdin); print(d['input_i'], d['input_tp'], d['input_lra'], d['input_thresh'], d['target_offset'])")

ffmpeg -v error -y -i "$in" -vn \
  -af "$target:measured_I=$I:measured_TP=$TP:measured_LRA=$LRA:measured_thresh=$TH:offset=$OFF:linear=true" \
  -ar 48000 "$out"

ffmpeg -hide_banner -nostats -i "$out" -af ebur128=peak=true -f null - 2>&1 | grep -E ' I:| Peak:' | tail -2

#!/usr/bin/env bash
# Finish a rendered reel for delivery: loudness on the final mix, then one
# lighter encode that a phone downloads quickly.
#
#   bash .claude/skills/productora/scripts/finish_reel.sh <render.mp4> <out.mp4>
#
# Loudness is set on the final file, not on the voice alone: a mono voice
# mastered to -14 LUFS measures about -11 LUFS once the renderer writes it as
# stereo, because both channels count. The video is re-encoded once at CRF 19,
# capped at 9 Mbit/s. On the first reel that kept SSIM at 0.99 against
# HyperFrames' delivery render, at 40% of the size. A silent render keeps no
# audio track.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
usage="usage: finish_reel.sh <render.mp4> <out.mp4>"
in="${1:?$usage}"
out="${2:?$usage}"
[ "$(realpath -m "$in")" != "$(realpath -m "$out")" ] || { echo "out must differ from in" >&2; exit 1; }

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
venc=(-c:v libx264 -preset slow -crf 19 -maxrate 9M -bufsize 18M -pix_fmt yuv420p -profile:v high)

if ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$in" | grep -q .; then
  bash "$here/../../reel-studio/master_audio.sh" "$in" "$tmp/mix.wav" >/dev/null
  ffmpeg -v error -y -i "$in" -i "$tmp/mix.wav" -map 0:v:0 -map 1:a:0 "${venc[@]}" \
    -c:a aac -b:a 192k -ar 48000 -shortest -movflags +faststart "$out"
else
  ffmpeg -v error -y -i "$in" -map 0:v:0 "${venc[@]}" -movflags +faststart "$out"
fi

ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height,r_frame_rate \
  -of compact=p=0 "$out"
if ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$out" | grep -q .; then
  ffmpeg -hide_banner -nostats -i "$out" -af ebur128=peak=true -f null - 2>&1 | grep -E ' I:| Peak:' | tail -2
fi

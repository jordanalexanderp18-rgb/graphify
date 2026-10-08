#!/usr/bin/env bash
# Render the slides of a static HTML design to PNG files with headless Chromium.
#
#   bash .claude/skills/productora/scripts/render_slides.sh <design.html> <out-dir> [width] [height]
#
# The page holds one or more <section class="slide"> elements of the given size
# (default 1080x1350, Instagram's 4:5) and shows only the one named by
# ?slide=N (1-based), as templates/carousel.html and templates/cover.html do.
# Fonts and images load from local files, so no network is needed. Writes
# 01.png, 02.png, ... into <out-dir>.
set -euo pipefail

usage="usage: render_slides.sh <design.html> <out-dir> [width] [height]"
html="$(realpath "${1:?$usage}")"
out="${2:?$usage}"
w="${3:-1080}"
h="${4:-1350}"

chrome="${CHROME:-/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell}"
[ -x "$chrome" ] || chrome="$(command -v chromium || command -v google-chrome || true)"
[ -n "$chrome" ] && [ -x "$chrome" ] || { echo "no headless Chromium found; set CHROME=<path>" >&2; exit 1; }

n="$(grep -o 'class="slide"' "$html" | wc -l)"
[ "$n" -gt 0 ] || { echo "no <section class=\"slide\"> in $html" >&2; exit 1; }

mkdir -p "$out"
for i in $(seq 1 "$n"); do
  f="$out/$(printf '%02d' "$i").png"
  rm -f "$f"
  # --virtual-time-budget lets web fonts and images finish loading before the capture.
  "$chrome" --headless --no-sandbox --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=1 --window-size="$w,$h" --virtual-time-budget=4000 \
    --screenshot="$f" "file://$html?slide=$i" >/dev/null 2>&1 || true
  [ -s "$f" ] || { echo "render failed for slide $i" >&2; exit 1; }
done
echo "$n slide(s) -> $out"

# A design with an @page rule also gets one PDF of every slide, handy for email.
if grep -q '@page' "$html"; then
  rm -f "$out/slides.pdf"
  "$chrome" --headless --no-sandbox --disable-gpu --no-pdf-header-footer --print-to-pdf-no-header \
    --virtual-time-budget=4000 --print-to-pdf="$out/slides.pdf" "file://$html" >/dev/null 2>&1 || true
  [ -s "$out/slides.pdf" ] || { echo "pdf render failed" >&2; exit 1; }
  echo "pdf -> $out/slides.pdf"
fi

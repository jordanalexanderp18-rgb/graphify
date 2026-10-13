#!/usr/bin/env bash
# Start a job from a template: copy it into <job-dir> and gather every font it loads
# (assets/fonts/<file>) from the skills that ship them, so nothing renders in a fallback
# font. Then it lists the photos the template expects; those you add yourself.
#
#   bash .claude/skills/productora/scripts/new_job.sh <template.html> <job-dir>
#
# Example: new_job.sh .claude/skills/productora/templates/estilos/pop.html "$SCRATCH/carrusel-pierna"
set -euo pipefail

usage="usage: new_job.sh <template.html> <job-dir>"
tpl="${1:?$usage}"
job="${2:?$usage}"
skills="$(cd "$(dirname "$0")/../.." && pwd)"

[ -f "$tpl" ] || { echo "no template at $tpl" >&2; exit 1; }
mkdir -p "$job/assets/fonts"
cp "$tpl" "$job/"

missing=0
for ref in $(grep -oE 'assets/fonts/[^"'"'"')]+' "$tpl" | sort -u); do
  name="$(basename "$ref")"
  src="$(find "$skills" -type f -name "$name" -print -quit)"
  if [ -n "$src" ]; then
    cp "$src" "$job/assets/fonts/$name"
  else
    echo "font not found under $skills: $name" >&2
    missing=1
  fi
done
echo "$(basename "$tpl") -> $job ($(ls "$job/assets/fonts" | wc -l) fonts)"

# Photos and frames the design points at. Name yours the same, or edit the src.
grep -oE '(assets|out)/[^"'"'"')]+\.(jpg|jpeg|png|webp)' "$tpl" | sort -u | sed 's/^/needs: /' || true
exit "$missing"

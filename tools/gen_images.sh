#!/bin/bash
# Generate all game images with limited parallelism.
# Usage: gen_images.sh <listfile>  — each line: outpath<TAB>flags<TAB>prompt
set -u
LIST="$1"
STYLE="Flat colors with subtle paper grain texture, hand-drawn cartoon style, bold dark outlines, vintage storybook illustration feel. Single subject centered, game asset."

gen() {
  local out flags prompt
  out="$(cut -f1 <<<"$1")"
  flags="$(cut -f2 <<<"$1")"
  prompt="$(cut -f3 <<<"$1")"
  if [ -s "src/assets/gen/$out" ]; then echo "SKIP $out"; return 0; fi
  for attempt in 1 2 3; do
    # shellcheck disable=SC2086
    if varlik image "$prompt" --out "src/assets/gen/$out" $flags >/dev/null 2>&1 && [ -s "src/assets/gen/$out" ]; then
      echo "OK   $out"
      return 0
    fi
    echo "RETRY$attempt $out"
    sleep 3
  done
  echo "FAIL $out"
  return 1
}
export -f gen
export STYLE

tr '\n' '\0' < "$LIST" | xargs -0 -n1 -P 5 -I{} bash -c 'gen "$@"' _ {}
echo "ALL DONE"

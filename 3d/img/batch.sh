#!/usr/bin/env bash
# Batch-generate all product images from manifest.tsv, resumable (skips existing PNGs).
cd "$(dirname "$0")" || exit 1
STYLE=" Premium e-commerce product photography, soft even studio lighting, clean bright airy neutral background, shallow depth of field, realistic FDM 3D-printing layer lines and silk PLA sheen, high detail, photorealistic, no text watermark, no logo."
LOG="gen.log"; : > "$LOG"
total=0; done=0; fail=0
while IFS=$'\t' read -r slug aspect prompt; do
  [ -z "$slug" ] && continue
  total=$((total+1))
  if [ -f "$slug.png" ]; then
    echo "skip $slug (exists)" | tee -a "$LOG"; done=$((done+1)); continue
  fi
  echo "gen $slug ($aspect)..." | tee -a "$LOG"
  if ./gen.sh "$prompt$STYLE" "$slug.png" "$aspect" >>"$LOG" 2>&1; then
    done=$((done+1)); echo "  ok $slug" | tee -a "$LOG"
  else
    fail=$((fail+1)); echo "  FAIL $slug" | tee -a "$LOG"
    sleep 5
    # one retry
    if ./gen.sh "$prompt$STYLE" "$slug.png" "$aspect" >>"$LOG" 2>&1; then
      done=$((done+1)); fail=$((fail-1)); echo "  ok-retry $slug" | tee -a "$LOG"
    fi
  fi
  sleep 3
done < manifest.tsv
echo "DONE: $done ok, $fail failed of $total" | tee -a "$LOG"

#!/usr/bin/env bash
# Fill in any missing manifest images via Stability SDXL (resumable; skips existing PNGs).
cd "$(dirname "$0")" || exit 1
STYLE=", visible FDM 3D-printing layer lines, premium e-commerce product photography, soft even studio lighting, clean bright airy off-white background, shallow depth of field, photorealistic, no text, no watermark"
LOG="gen-sd.log"; : > "$LOG"
done=0; fail=0
while IFS=$'\t' read -r slug aspect prompt; do
  [ -z "$slug" ] && continue
  [ -f "$slug.png" ] && { echo "skip $slug" | tee -a "$LOG"; continue; }
  echo "gen-sd $slug..." | tee -a "$LOG"
  if ./gen-sd.sh "$prompt$STYLE" "$slug.png" >>"$LOG" 2>&1; then
    done=$((done+1)); echo "  ok $slug" | tee -a "$LOG"
  else
    sleep 4
    if ./gen-sd.sh "$prompt$STYLE" "$slug.png" >>"$LOG" 2>&1; then
      done=$((done+1)); echo "  ok-retry $slug" | tee -a "$LOG"
    else fail=$((fail+1)); echo "  FAIL $slug" | tee -a "$LOG"; fi
  fi
  sleep 2
done < manifest.tsv
echo "DONE-SD: $done ok, $fail failed" | tee -a "$LOG"

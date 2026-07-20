#!/usr/bin/env bash
# gen-sd.sh "<prompt>" <outfile.png>  — Stability SDXL 1.0 text-to-image → PNG (1024x1024)
set -a; source ~/.credentials/api-keys.env 2>/dev/null || true; set +a
set -o pipefail
PROMPT="$1"; OUT="$2"
DIR="$(cd "$(dirname "$0")" && pwd)"; OUT="$DIR/$OUT"
BODY="$(mktemp)"; RESP="$(mktemp)"
python3 - "$PROMPT" > "$BODY" <<'PY'
import sys, json
print(json.dumps({
  "text_prompts": [{"text": sys.argv[1], "weight": 1}],
  "cfg_scale": 7, "height": 1024, "width": 1024, "steps": 30, "samples": 1,
  "style_preset": "photographic",
}))
PY
HTTP=$(curl -s -o "$RESP" -w '%{http_code}' \
  -X POST "https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image" \
  -H "Authorization: Bearer $STABILITY_API_KEY" \
  -H "Content-Type: application/json" -H "Accept: application/json" \
  --data-binary "@$BODY" --max-time 150)
if [ "$HTTP" = "200" ]; then
  python3 -c "import json,base64; d=json.load(open('$RESP')); open('$OUT','wb').write(base64.b64decode(d['artifacts'][0]['base64']))" \
    && echo "OK $(basename "$OUT") $(($(wc -c < "$OUT")/1024))KB"
else
  echo "FAIL $(basename "$OUT"): HTTP $HTTP $(head -c 220 "$RESP" 2>/dev/null)"; rm -f "$BODY" "$RESP"; exit 1
fi
rm -f "$BODY" "$RESP"

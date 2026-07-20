#!/usr/bin/env bash
# gen-rep.sh "<prompt>" <outfile.png> [aspect]  — Replicate Flux 1.1 Pro → image file
set -a; source ~/.credentials/api-keys.env 2>/dev/null || true; set +a
set -o pipefail
PROMPT="$1"; OUT="$2"; ASPECT="${3:-1:1}"
DIR="$(cd "$(dirname "$0")" && pwd)"; OUT="$DIR/$OUT"
TMP="$(mktemp)"
python3 - "$PROMPT" "$ASPECT" > "$TMP" <<'PY'
import sys, json
prompt, aspect = sys.argv[1], sys.argv[2]
print(json.dumps({"input": {"prompt": prompt, "aspect_ratio": aspect, "output_format": "png", "safety_tolerance": 2, "prompt_upsampling": True}}))
PY
RESP="$(curl -s -X POST \
  "https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro/predictions" \
  -H "Authorization: Bearer $REPLICATE_API_KEY" -H "Content-Type: application/json" \
  -H "Prefer: wait" --data-binary "@$TMP" --max-time 180)"
rm -f "$TMP"
URL="$(printf '%s' "$RESP" | python3 -c "
import sys,json
d=json.load(sys.stdin)
o=d.get('output')
if isinstance(o,list): o=o[0] if o else None
print(o or ('ERR:'+str(d.get('error') or d.get('detail') or d.get('status'))))
" 2>/dev/null)"
case "$URL" in
  http*) curl -s -o "$OUT" "$URL" --max-time 120 && echo "OK $(basename "$OUT") $(($(wc -c < "$OUT")/1024))KB" ;;
  *) echo "FAIL $(basename "$OUT"): $URL"; exit 1 ;;
esac

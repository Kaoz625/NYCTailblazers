#!/usr/bin/env bash
# gen.sh "<prompt>" <outfile.png> [aspect]  — Gemini 3 Pro Image → PNG, no base64 in caller context
set -a; source ~/.credentials/api-keys.env 2>/dev/null || true; set +a
set -o pipefail
PROMPT="$1"; OUT="$2"; ASPECT="${3:-1:1}"
MODEL="gemini-3-pro-image"
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$DIR/$OUT"
TMP="$(mktemp)"
python3 - "$PROMPT" "$ASPECT" > "$TMP" <<'PY'
import sys, json
prompt, aspect = sys.argv[1], sys.argv[2]
body = {
  "contents": [{"parts": [{"text": prompt}]}],
  "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": aspect}},
}
print(json.dumps(body))
PY
HTTP=$(curl -s -w '%{http_code}' -o "$TMP.resp" \
  "https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}" \
  -H 'Content-Type: application/json' --data-binary "@$TMP" --max-time 240)
if [ "$HTTP" != "200" ]; then
  echo "FAIL $OUT: HTTP $HTTP"
  python3 -c "import json,sys;d=json.load(open('$TMP.resp'));print(json.dumps(d.get('error',d))[:300])" 2>/dev/null || head -c 200 "$TMP.resp"
  rm -f "$TMP" "$TMP.resp"; exit 1
fi
python3 - "$TMP.resp" "$OUT" <<'PY'
import sys, json, base64
resp, out = sys.argv[1], sys.argv[2]
d = json.load(open(resp))
data = None
for c in d.get("candidates", []):
    for p in c.get("content", {}).get("parts", []):
        inl = p.get("inlineData") or p.get("inline_data")
        if inl and inl.get("data"):
            data = inl["data"]; break
    if data: break
if not data:
    print("NO_IMAGE_IN_RESPONSE"); sys.exit(2)
open(out, "wb").write(base64.b64decode(data))
import os
print(f"OK {os.path.basename(out)} {os.path.getsize(out)//1024}KB")
PY
rm -f "$TMP" "$TMP.resp"

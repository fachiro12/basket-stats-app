#!/usr/bin/env bash
# ==========================================================================
# genera-icone.sh — rasterizza icon.svg / icon-maskable.svg nei 4 PNG PWA.
# Nessuna dipendenza: usa Chrome headless (già installato).
#   bash scripts/genera-icone.sh
# Rigenera:  icon-180.png · icon-192.png · icon-512.png · icon-maskable.png
# ==========================================================================
set -e
cd "$(dirname "$0")/.."

CHROME="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
[ -x "$CHROME" ] || CHROME="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
[ -x "$CHROME" ] || { echo "Chrome/Edge non trovato — imposta \$CHROME"; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
STYLE='<!doctype html><meta charset=utf-8><style>html,body{margin:0;padding:0}svg{display:block;width:100vw;height:100vh}</style>'

wrap() {  # $1 = svg file, $2 = out html — toglie width/height solo dal tag <svg>
  { printf '%s' "$STYLE"; sed '1,/<svg /s/<svg \([^>]*\) width="512" height="512">/<svg \1>/' "$1"; } > "$2"
}
shot() {  # $1 out png, $2 device-scale-factor, $3 wrapper html  (window 512, scala per le taglie < 512)
  "$CHROME" --headless=new --hide-scrollbars --force-device-scale-factor="$2" \
    --virtual-time-budget=2500 --screenshot="$1" --window-size=512,512 "$3" >/dev/null 2>&1
}

wrap icon.svg "$TMP/w.html"
wrap icon-maskable.svg "$TMP/wm.html"

shot icon-180.png 0.3515625 "$TMP/w.html"   # 512 * 0.3515625 = 180
shot icon-192.png 0.375     "$TMP/w.html"   # 512 * 0.375     = 192
shot icon-512.png 1         "$TMP/w.html"
shot icon-maskable.png 1    "$TMP/wm.html"

for f in icon-180 icon-192 icon-512 icon-maskable; do
  node -e "const b=require('fs').readFileSync('$f.png');console.log('  $f.png  '+b.readUInt32BE(16)+'x'+b.readUInt32BE(20)+'  '+b.length+'B')"
done
echo "OK — ricordati: node scripts/bump.mjs"

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

# icon-maskable.svg = icon.svg col disegno rimpicciolito all'80% (safe zone Android)
sed 's/Basket Stats Pro — Virtus Luino/Basket Stats Pro — icona maskable/; s#<g stroke-linejoin="round" stroke-linecap="round">#<g stroke-linejoin="round" stroke-linecap="round" transform="translate(256 256) scale(0.8) translate(-256 -256)">#' icon.svg > icon-maskable.svg

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/prof"
STYLE='<!doctype html><meta charset=utf-8><style>html,body{margin:0}svg{display:block;width:100vw;height:100vh}</style>'
wrap() { { printf '%s' "$STYLE"; sed 's/ width="512" height="512">/>/' "$1"; } > "$2"; }
wrap icon.svg "$TMP/w.html"
wrap icon-maskable.svg "$TMP/wm.html"

# window 512; le taglie < 512 si ottengono con device-scale-factor frazionario.
# --screenshot su path ASSOLUTO (Chrome non usa la CWD della shell).
shot() {
  "$CHROME" --headless=new --no-sandbox --user-data-dir="$TMP/prof" --hide-scrollbars \
    --force-device-scale-factor="$2" --virtual-time-budget=3000 \
    --screenshot="$(cygpath -w "$TMP/$1")" --window-size=512,512 "$(cygpath -w "$3")" >/dev/null 2>&1
  cp "$TMP/$1" "./$1"
}
shot icon-180.png 0.3515625 "$TMP/w.html"
shot icon-192.png 0.375     "$TMP/w.html"
shot icon-512.png 1         "$TMP/w.html"
shot icon-maskable.png 1    "$TMP/wm.html"

for f in icon-180 icon-192 icon-512 icon-maskable; do
  node -e "const b=require('fs').readFileSync('$f.png');console.log('  $f.png  '+b.readUInt32BE(16)+'x'+b.readUInt32BE(20)+'  '+b.length+'B')"
done
echo "OK — ricordati: node scripts/bump.mjs"

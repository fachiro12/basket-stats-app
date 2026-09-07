#!/usr/bin/env node
/* ==========================================================================
   bump.mjs — versione unica di cache-busting in un colpo solo.

   La sorgente di verità è il numero N in `sw.js` → `const CACHE = "bsp-vN"`.
   Questo script lo allinea con TUTTI i `?v=N` di `index.html` e con la riga
   "Ultimo aggiornamento" di `docs/HANDOFF.md`.

     node scripts/bump.mjs            incrementa di 1  (uso normale a ogni deploy)
     node scripts/bump.mjs 25         imposta a v25
     node scripts/bump.mjs --check    verifica che sia tutto allineato (exit 1 se no)

   Nessuna dipendenza npm. Non tocca git.
   ========================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const P = {
  index: join(root, "index.html"),
  sw: join(root, "sw.js"),
  handoff: join(root, "docs", "HANDOFF.md")
};

function leggi(p) { try { return readFileSync(p, "utf8"); } catch (e) { return null; } }

const sw = leggi(P.sw);
const index = leggi(P.index);
if (sw == null || index == null) {
  console.error("Errore: index.html o sw.js non trovati (lancia lo script dalla radice del repo).");
  process.exit(1);
}

const mSw = sw.match(/bsp-v(\d+)/);
if (!mSw) { console.error("Errore: 'bsp-vN' non trovato in sw.js"); process.exit(1); }
const attuale = parseInt(mSw[1], 10);

const refIndex = [...index.matchAll(/[?&]v=(\d+)\b/g)].map(m => parseInt(m[1], 10));
const arg = process.argv[2];

if (arg === "--check") {
  const versioni = [...new Set([attuale, ...refIndex])].sort((a, b) => a - b);
  if (versioni.length === 1) {
    console.log(`OK · tutto a v${attuale} · ${refIndex.length} riferimenti in index.html + CACHE in sw.js`);
    process.exit(0);
  }
  console.error(`DISALLINEATO · versioni presenti: ${versioni.join(", ")}`);
  console.error(`  sw.js: v${attuale} · index.html: ${[...new Set(refIndex)].sort((a, b) => a - b).join(", ")}`);
  console.error(`  → esegui: node scripts/bump.mjs ${Math.max(attuale, ...refIndex)}`);
  process.exit(1);
}

const target = arg == null ? attuale + 1 : parseInt(arg, 10);
if (!Number.isInteger(target) || target < 1) {
  console.error(`Versione non valida: "${arg}"`);
  process.exit(1);
}

const nRef = (index.match(/[?&]v=\d+\b/g) || []).length;
writeFileSync(P.index, index.replace(/([?&]v=)\d+\b/g, `$1${target}`));
writeFileSync(P.sw, sw.replace(/bsp-v\d+/g, `bsp-v${target}`));

const handoff = leggi(P.handoff);
if (handoff != null && /Ultimo aggiornamento:/.test(handoff)) {
  const nuovo = handoff.replace(/(Ultimo aggiornamento:[^\n]*?)(`\?v=)\d+(`[^\n]*?`bsp-v)\d+(`)/,
    (_, a, b, c, d) => `${a}${b}${target}${c}${target}${d}`);
  if (nuovo !== handoff) writeFileSync(P.handoff, nuovo);
}

console.log(`v${attuale} → v${target}`);
console.log(`  ${nRef} riferimenti ?v= in index.html`);
console.log(`  CACHE "bsp-v${target}" in sw.js`);
console.log(`\nOra: verifica, poi commit + push (GitHub Pages ridistribuisce in 1–5 min).`);

#!/usr/bin/env node
/* ==========================================================================
   ritaglia-icona.mjs — ritaglia mockup-src.jpg e genera i PNG icona PWA.
   Nessuna dipendenza: Chrome headless fa crop + resize da CSS background.
     node scripts/ritaglia-icona.mjs
   Parametri crop in cima al file (regione quadrata sul sorgente 1024).
   ========================================================================== */
import { execFileSync } from "node:child_process";
import { writeFileSync, existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "mockup-src.jpg");
const BG = "#101B33";               // navy di riempimento (bordi/pad)

// --- regione del sorgente (1024x1024) da ritagliare (esclude la scritta "PVL") ---
const SRC_SIZE = 1024;
const STD = { x0: 175, y0: 49, s: 670 };   // pallone centrato, ~84% del frame
const MASK_SCALE = 0.80;                    // maskable: STD rimpicciolita su fondo navy

const CHROME = process.env.CHROME
  || ["C:/Program Files/Google/Chrome/Application/chrome.exe",
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
if (!CHROME) { console.error("Chrome/Edge non trovato — imposta $CHROME"); process.exit(1); }
if (!existsSync(SRC)) { console.error("Manca " + SRC); process.exit(1); }

const TMP = mkdtempSync(join(tmpdir(), "icona-"));
const srcUrl = pathToFileURL(SRC).href;

// Sempre finestra 512; le taglie < 512 con device-scale-factor frazionario
// (Chrome + finestre piccole + immagine esterna = render vuoti).
function shot(out, targetPx, innerSideCss) {
  const k = 512 / STD.s;
  const bs = Math.round(SRC_SIZE * k);
  const bx = Math.round(-STD.x0 * k);
  const by = Math.round(-STD.y0 * k);
  const html = `<!doctype html><meta charset=utf-8><style>html,body{margin:0}` +
    `#f{width:512px;height:512px;background:${BG};display:flex;align-items:center;justify-content:center}` +
    `#i{width:${innerSideCss}px;height:${innerSideCss}px;background:${BG} url('${srcUrl}') no-repeat;` +
    `background-size:${bs * innerSideCss / 512}px ${bs * innerSideCss / 512}px;` +
    `background-position:${bx * innerSideCss / 512}px ${by * innerSideCss / 512}px}</style>` +
    `<div id=f><div id=i></div></div>`;
  const hp = join(TMP, "w.html");
  writeFileSync(hp, html);
  execFileSync(CHROME, [
    "--headless=new", "--no-sandbox", "--hide-scrollbars",
    "--user-data-dir=" + join(TMP, "prof"),
    "--force-device-scale-factor=" + (targetPx / 512),
    "--virtual-time-budget=3500",
    "--screenshot=" + join(ROOT, out), "--window-size=512,512",
    pathToFileURL(hp).href
  ], { stdio: "ignore" });
  const b = readFileSync(join(ROOT, out));
  console.log("  " + out + "  " + b.readUInt32BE(16) + "x" + b.readUInt32BE(20) + "  " + (b.length / 1024 | 0) + "KB");
}

shot("icon-512.png", 512, 512);
shot("icon-192.png", 192, 512);
shot("icon-180.png", 180, 512);
shot("icon-32.png", 32, 512);     // favicon del tab (downscale del ritaglio)
shot("icon-maskable.png", 512, Math.round(512 * MASK_SCALE));

console.log("OK — controlla icon-512.png, poi node scripts/bump.mjs");

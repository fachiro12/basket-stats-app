# Istruzioni progetto — Basket Stats Pro

App PWA per la **rilevazione statistiche basket live** della **Virtus Luino (PVL)**, campionato DR1 Lombardia Girone D. Vanilla HTML/CSS/JS, **nessun build step**. Backend = Google Apps Script + Google Sheet. Deploy = GitHub Pages.

Repo: `github.com/fachiro12/basket-stats-app` · Live: `https://fachiro12.github.io/basket-stats-app/`

## Come lavorare qui

- **Niente build, niente framework, niente dipendenze npm.** Solo file statici serviti da GitHub Pages. Non introdurre bundler, TypeScript, React ecc. senza chiederlo.
- **Niente CDN esterni** nel runtime (grafici SVG fatti a mano, nessuna libreria).
- **Vanilla JS, funzioni globali.** Ogni file `js/*.js` è uno `<script>` classico (non moduli). Le funzioni sono globali e si chiamano tra file a runtime. Ordine di caricamento in `index.html` conta solo per l'esecuzione top-level, non per le chiamate (che avvengono dopo `DOMContentLoaded`).
- **Lingua del codice: italiano.** Nomi funzioni, variabili, commenti, stringhe UI in italiano. Mantieni lo stile.
- **CSS a token.** TUTTI i colori vivono in `css/tokens.css` (`--color-*`, `--space-*`, `--radius-*`). **Mai** hard-codare un colore negli altri CSS (rompe il tema Arena). Palette "PVL" (da v21): brand **blu** `#1E3C8C`, rosso/verde solo per le voci statistiche, neutri freddi — niente arancione. `--color-brand` = fill; `--color-brand-ink` = brand come testo/icona. Tema **Arena** (scuro, opt-in) = `<html data-tema="arena">`, ridefinito in `tokens.css`; default chiaro; switch in "Altro", pref per-device (`bsp_tema`).
- **Mobile-first.** Testato in frame 430px su desktop e a schermo pieno su telefono. Portrait E landscape vanno entrambi verificati (in landscape su touch la nav diventa sidebar).
- **Cache-busting:** ogni asset in `index.html` ha `?v=N`, allineato al `CACHE` di `sw.js` (`bsp-vN`). Non modificarli a mano: a ogni deploy `node scripts/bump.mjs` (incrementa e allinea tutto; `--check` per verificare). Sorgente di verità = il numero in `sw.js`.
- **Verifica sempre** la sintassi JS: `for f in js/*.js; do node -c "$f"; done`.
- **Non committare/pushare** se non richiesto esplicitamente. Se richiesto: branch da `main` solo se si sta sul default e serve, altrimenti commit diretto su `main` è la prassi di questo repo.

## Backend Google Apps Script

- Il codice completo dello script **non è nel repo**: vive nell'editor Apps Script del proprietario. La versione corrente è in `docs/HANDOFF.md` → "Backend".
- Quando serve una modifica backend: **fornire lo script completo aggiornato** (l'utente lo incolla e ridistribuisce), non solo il diff.
- `doGet` risponde in **JSONP** se c'è `?callback=` (per aggirare la CORS). `doPost` è `no-cors` fire-and-forget.
- Dopo un cambio di deployment cambia l'URL: aggiornare `CONFIG.APPS_SCRIPT_URL` in `js/state.js`.

## Attribuzione git (quando si committa)

```
Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Pkbiii8hLB2RvR4A5ARn1W
```

PR body: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`

## Priorità aperte (dal review — vedi HANDOFF.md)

1. ~~Token di scrittura sui POST~~ — **FATTO (V4.7)**. Da attivare impostando la Script Property `WRITE_TOKEN`.
2. ~~Password con salt + login via POST~~ — **FATTO (V4.8)**.
   Backend attuale = **V4.9** (aggiunge `SVUOTA_EVENTI` per "Altro → Manutenzione → Azzera dati partite").
3. ~~Riconciliazione coda eventi~~ — **FATTO (v20)**: `riconciliaCoda()` in `api.js`.
4. ~~"Riprendi come segnapunti"~~ — **FATTO (v20)**: `ricostruisciStatoDaEventi()` in `calendario.js`.
5. ~~`esc()` HTML sui nomi interpolati in `innerHTML`~~ — **FATTO (v20)**.
6. ~~`delta` reale per l'evento CAMBIO~~ — **FATTO (v20)**.
7. ~~Rimuovere `state.stints`/`stintCorrente`~~ — **FATTO (v20)**.
8. ~~Automatizzare il cache-busting~~ — **FATTO (v20)**: `scripts/bump.mjs`.
9. ~~Icone PWA PNG~~ — **FATTO (v22)**: `icon.svg`/`icon-maskable.svg` + 4 PNG, palette PVL; `bash scripts/genera-icone.sh` per rigenerare.
10. Test node del motore statistiche (`stintsDaEventi`, `calcolaBox`, `calcolaAdvanced`).

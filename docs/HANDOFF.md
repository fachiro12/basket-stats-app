# Basket Stats Pro — Documento di handoff / specifica

> Serve a **riprendere il progetto da zero in una nuova chat**. Da fornire insieme a `CLAUDE.md` e ai file sorgente (o al link del repo).
> Ultimo aggiornamento: settembre 2026 · deploy asset `?v=78` · SW `bsp-v78` · backend V4.14.

---

## 1. Cos'è

PWA per segnare le statistiche di una partita di basket **in tempo reale**, pensata per la **Virtus Luino (PVL)** — campionato **DR1 Lombardia, Girone D, stagione 2026/27**.

- Un "segnapunti" su tablet/telefono registra ogni evento (tiri, falli, rimbalzi, assist, palle perse/recuperate, cambi).
- Il punteggio, il tabellino stile Lega Basket e le advanced stats si calcolano **client-side** dagli eventi — zero latenza, funziona offline.
- Gli eventi vengono anche inviati a un **Google Sheet** (via Apps Script) → un secondo dispositivo può **"Seguire Live"** in sola lettura, e le partite storiche si rivedono dal calendario.
- Multiutente con login username/password.

**Non** è un cronometro: il tempo di gara si inserisce a mano ai "checkpoint" (cambi).

---

## 2. Stack e deploy

| | |
|---|---|
| Frontend | HTML + CSS + JS vanilla, **nessun build**, nessuna dipendenza |
| Hosting | GitHub Pages — `https://fachiro12.github.io/basket-stats-app/` |
| Repo | `github.com/fachiro12/basket-stats-app` (branch `main`) |
| Backend | Google Apps Script Web App (deploy "anyone") + Google Sheet |
| PWA | `manifest.webmanifest` + `sw.js` (service worker network-first) |

### Deploy
1. Modifica i file. Verifica sintassi: `for f in js/*.js; do node -c "$f"; done`
2. **Bump cache** — un solo comando allinea i ~19 `?v=N` di `index.html`, il `CACHE` di `sw.js` e questa riga di HANDOFF:
   ```bash
   node scripts/bump.mjs          # incrementa di 1
   node scripts/bump.mjs --check  # verifica allineamento (in CI o pre-commit)
   ```
   La sorgente di verità è il numero in `sw.js` (`const CACHE = "bsp-vN"`).
3. `git add -A && git commit && git push` → GitHub Pages ridistribuisce in 1–5 min.
4. Hard refresh sul client (`Ctrl+Shift+R` / riapri la PWA).

### Backend deploy
- Codice nell'editor Apps Script (non nel repo — copia in §9).
- Modifica → **Distribuisci → Gestisci deployment → nuova versione**.
- Se cambia l'URL `/exec`, aggiorna `CONFIG.APPS_SCRIPT_URL` in `js/state.js`.
- `setupSheet()` è **idempotente e non distruttivo** (crea fogli/intestazioni se mancano, semina l'admin solo se `Utenti` è vuoto). Sicuro da rilanciare.

### Icone PWA — FATTE (v31)
Sorgente: **`mockup-src.jpg`** (1024², tasso del miele dentro un pallone, illustrazione AI). `scripts/ritaglia-icona.mjs` (Node, Chrome headless, zero dipendenze) la **ritaglia quadrata** — esclude la scritta "PVL" — e genera i PNG:
- `icon-512.png` / `icon-192.png` / `icon-180.png` (apple-touch) — ritaglio standard (pallone ~84% del frame)
- `icon-maskable.png` — stesso ritaglio all'80% su fondo navy `#101B33` (safe zone Android)
- `icon-32.png` — favicon del tab (downscale del ritaglio; a 16-32px è un badge navy, accettabile)

`<link rel="icon">` punta ai PNG (niente più `icon.svg`). Per cambiare il ritaglio: `STD` / `MASK_SCALE` in cima allo script, poi `node scripts/ritaglia-icona.mjs` + `node scripts/bump.mjs`.

---

## 3. File sorgente

### JS (`js/`, caricati in quest'ordine in `index.html`)
| File | Responsabilità |
|---|---|
| `state.js` | `CONFIG`, `STORAGE_KEYS`, `state` globale, `statoIniziale()`, `salvaStato/caricaStato`, `nomeQuarto()`, `indiceFalli()` (OT⇒Q4), `numValido()`, `formatTempo()`, `uuid()`, `esc()` |
| `tema.js` | tema Chiaro/Arena: `temaCorrente`, `applicaTema`, `inizializzaTema` (switch in "Altro", `localStorage: bsp_tema`) |
| `api.js` | invio eventi (`inviaEvento` → coda `codaInvio` → `processaCoda` POST `no-cors`), `inviaAzione` (POST generico), `verificaLoginServer` (POST `azione:"VERIFICA_LOGIN"`, risposta JSON), `riconciliaCoda` (pull `getEventi` + re-invio mancanti), `svuotaEventiServer` / `svuotaEventiGaraServer` (POST `SVUOTA_EVENTI` / `SVUOTA_EVENTI_GARA`) |
| `timer.js` | gestione periodi (**non c'è cronometro**): `avanzaQuarto`, `passaAlPeriodo`, OT, `terminaPartita` (emette evento `FINE`), `nuovaPartita` |
| `azioni.js` | `registraEvento` (costruisce il payload evento + feed banner), tiri, recupero, palla persa, fallo fatto; macchina a stati overlay Assist/Rimbalzo; helper `etichettaSquadra/etichettaSquadraEstesa/etichettaNum/feed` |
| `fallo-subito.js` | **flusso fallo a passi** nell'overlay destro (`#action-overlay`), con "← indietro" ad ogni step: `avviaFalloSubito` (PVL subisce), `apriTlAvversari`/`finalizzaFalloFatto` (PVL commette), overlay fallo avversario, tecnici, doppio/compensati; `ultimaAzioneEraCanestro(num)` (and-1) |
| `calendario.js` | `CALENDARIO_DR1` (26 gare seed offline), cache/pending partite (`bsp_partite_cache`/`bsp_partite_pending`), `scaricaPartite` (JSONP), `salvaPartitaCloud`, `impostaStatoPartita`, `renderCalendario`, `iniziaPartita`, `apriStatistichePartita`, modale "aggiungi partita"; **`ricostruisciStatoDaEventi` / `riprendiComeSegnapunti`** (subentro segnapunti da foglio), `avversarioBreveAuto` / `nomePartitaDaCalendario`, `apriResetDati` / `apriAzzeraGara` (Altro → Manutenzione: azzera tutto / una sola gara) |
| `giocatori.js` | anagrafica giocatori (`bsp_giocatori`, sync JSONP `getGiocatori` + POST `SALVA_GIOCATORE`), CRUD UI (nickname max 6); **flusso pre-partita 2 step** (convocati tap-riga → quintetto base → avvio); **`apriConvocatiLive` / `salvaConvocatiLive` / `haGiocatoEventi`** (modifica convocati in partita) |
| `stats.js` | motore stat: `statsContesto`, `eventiPuliti` (dedup + drop ANNULLA/valido=FALSE), `calcolaBox`, `stintsDaEventi`, `calcolaAdvanced`; **periodo** (`boxPeriodo`, `periodiDisponibili_`, `punteggioPeriodo_` — Tot/Q1-Q4/1°T/2°T); render Stats (tabellino/andamento/tiri/**PBP**, `descriviEvento`, header compatto `scoreCompatto_`, barra controlli `barraControlliStats_`) e Adv (squadra/giocatori); **Segui Live** (`avviaModalitaSegui`, `pollSeguiLive` ~20s, timeout JSONP anti-freeze); `barraPunteggio`; fetch storico `scaricaEventiPartita` |
| `analisi.js` | **Analisi stagione** (Altro → sezione dedicata, `#view-analisi`): aggrega le sole gare `stato==="Terminata"` riusando `calcolaBox`/`calcolaAdvanced` in sola lettura. `apriAnalisi`, `caricaEventiStagione` (JSONP `getEventiStagione` + cache `bsp_analisi_eventi`), `garePerAnalisi` (filtri Campionato⁄Amichevoli · Casa⁄Trasferta · Vinte⁄Perse — campionato e amichevoli **mai insieme**), `aggregaStagione`, viste Squadra (record, Four Factors, ratings, grafico margini) e Giocatori (tabella ordinabile, 2P/2P%/3P/3P%/TL/FT%/**FT Rate**(FTA/FGA)/eFG%/TS%/USG%/**Forz.**/AST%/TOV%). **Forz. = Indice di Forzatura** (`USG% × (1 − TS%giocatore/TS%squadra)`, stessa formula di Player Development) — 0 = rende come la squadra a qualsiasi volume, alto e positivo = tira/attacca molto con efficienza sotto la media (forza), negativo = usa molto ED è più efficiente. ⚠️ **Fix USG% (v70)**: `teamMin` (= `agg.minutiTot`, già la durata-partita cumulata via `minutiDaEventi` — "quarti visti × 10") è di per sé già l'equivalente di "Tm MP / 5" della formula standard (Tm MP = minuti-squadra reali, 5 in campo sempre insieme = 5× la durata gara); la formula USG% divideva ANCORA per 5, schiacciando ogni valore a 1/5 di quello vero (verificato: giocatore perfettamente bilanciato dava 4% invece del 20% atteso). Stesso bug, stesso fix, in **3 punti**: qui (`vistaAnalisiGiocatori`), `analisi-avanzata.js` (`percentualiGiocatoreAvz`, usato da BPM/OBPM tramite i termini t7/t8 — quindi BPM/OBPM/VORP sono cambiati anche loro) e `player-dev.js` (`valoreBaseDaLinea_`, quindi anche l'Indice di Forzatura). Rimasto CORRETTO (nessun fix necessario): il calcolo OR%/DR%/TR%/ST% nello stesso `percentualiGiocatoreAvz` (già senza il `/5` di troppo) e l'USG% di `rotazioni.js` (Quintetti/Giocatori — lì `teamMin` è la durata dello STINT, non la durata-gara cumulata, formula diversa per costruzione, già corretta da un fix precedente in questa stessa sessione). |
| `possessi.js` | **Debrief possessi** (Altro → sezione "Debrief", `#view-debrief`, sperimentale/beta) — tracker **parallelo** possesso-per-possesso pensato per il coaching (foglio cartaceo v7), **indipendente** dal live ufficiale: nuovo foglio `Possessi`, non tocca Eventi/Partite/Giocatori né `calcolaBox`/`calcolaAdvanced` (solo lettura). Fase 1 = inserimento guidato: `apriDebrief`, `cambiaGaraDebrief`/`cambiaQuartoDebrief`, `gestisciFotoSelezionata` (compressione via `<canvas>`, max 1400px, jpeg 0.72), `caricaFotoPossessi`/`salvaPossessiQuarto`/`caricaPossessi` (POST/JSONP verso `CARICA_FOTO_POSSESSI`/`SALVA_POSSESSI_QUARTO`/`getPossessi`), `aggiungiRigaDebrief`/`modificaRigaDebrief`/`salvaQuartoDebrief`, `reportPossessi` (PPP/eFG%/split area-zona-ritmo-gioco, TL pesati 0,44 come in `calcolaAdvanced`), legenda giochi editabile in `localStorage: bsp_possessi_legenda`. **Fase 3 (V4.13, sperimentale)**: `leggiFoglioPossessi` — POST `LEGGI_FOGLIO_POSSESSI`, prova a pre-compilare le righe leggendo la foto via OCR Drive lato backend (righe proposte marcate `fonte:"ocr"`, sempre da confermare/correggere prima di salvare); se la tabella non viene riconosciuta, fallback a testo grezzo mostrato come riferimento. Fase 2 (crocette via canvas) non ancora costruita. |
| `analisi-avanzata.js` | **Analisi avanzata** (sperimentale, `#view-analisi-avanzata`, bottoni in fondo a Squadra/Giocatori di Analisi stagione — non li modifica, solo li appende): AIS (Adjusted Impact Score, formula propria per gara + media stagionale, Leverage Index sul margine finale), BPM/OBPM/DBPM/VORP (coefficienti Daniel Myers), Defensive Rating individuale (Dean Oliver, via hackastat.eu) — tutto in sola lettura su `garePerAnalisi`/`boxGaraSingola`/`aggregaStagione`/`calcolaAdvanced`/`calcolaBox`. Stoppate non tracciate (termine sempre 0); dati di lega mancanti (Lg%3P/LgOffRtg) approssimati con la media MIA+avversari della stagione — dichiarato in ogni vista. ⚠️ **Fix USG% (v70)** in `percentualiGiocatoreAvz` — vedi nota completa nella riga `analisi.js`: stesso bug (`teamMin` diviso per 5 due volte), stesso fix; BPM/OBPM/VORP cambiano di conseguenza (dipendono da USG% tramite i termini t7/t8 di `gBpmDi`), DBPM/AIS/Def. Rating no (non usano `usg`). |
| `rotazioni.js` | **Rotazioni** (sperimentale, `#view-rotazioni`, riga "Rotazioni" in Altro → sezione "Analisi", sotto "Analisi stagione") — 2 tab interne (`rotTab`, `#rot-tabs`). "Rotation chart": righe = giocatori (per nome anagrafica, non numero — stabile ai cambi di maglia), colonne = minuti di gara, colore = presenza in campo; striscia "margine/min" (saldo punti nel minuto, non un vero Net Rtg). **"Quintetti"** (`calcolaLineupBox`/`vistaLineupBox`) — Lineup Advanced Box Score: un quintetto per riga (per nome, stabile ai cambi di numero) con GP/MIN/PTS/OFF·DEF·NET RTG/POSS/PACE/tiri/TS%/TOV%; accumula il box **evento per evento per finestra temporale** (`accumulaEventoLocaleRot`, mini-motore isolato — `calcolaBox` non serve qui: il punteggio di squadra lì non è mai sommato incrementalmente, solo impostato al finale gara) sullo stint giusto (puntatore su `elapsedAt`), poi passa il box per quintetto a `calcolaAdvanced` già esistente. Tabella ordinabile (`rotLineupSort`), colonna Quintetto bloccata (`sticky`) in scroll orizzontale. Filtro testuale sui nomi con **AND multi-nome** (virgola = tutti richiesti insieme, `rotLineupFiltroTesto`, `#rot-lineup-filtro`); toggle "nascondi rumore" (`rotLineupNascondiRumore`, soglia **relativa e dinamica**: 5% della media minuti dei 3 quintetti più usati — `ROT_LINEUP_PCT_RUMORE` — così scala da sola con l'avanzare della stagione invece di restare fissa a un numero di minuti scelto oggi); toggle "statistiche difensive" (`rotLineupMostraDifesa` → colonne PTS SUB/+-/REC/OREB%/DREB%/REB TOT%, da `A.pr`/`grp.pmStint`/`adv.orbA`/`adv.drbA`/rimbalzi totali disponibili già tracciati); 5 filtri soglia in AND tra loro su Pace/2P%/3P%/FT Ratio (`≥`) e TOV% (`≤` — meno palle perse è meglio) (`rotLineupSoglie`, input `type="text" inputmode="decimal"` — **non** `type="number"`, che su desktop rompe `setSelectionRange` e fa scrivere le cifre al contrario). Colonne Quintetto (112px)+GP+MIN bloccate insieme (`sticky`, offset impilati) durante lo scroll orizzontale. Filtri Campionato/Amichevoli · Casa/Trasferta · Vinte/Perse: **copia indipendente** di quelli di Analisi stagione (`filtriRotazioni`, non condiviso con `filtriAnalisi`), usati da tutte e tre le tab. **"Giocatori"** (`vistaGiocatoriQuintetto`) — dentro un quintetto scelto (selettore, o "+" su una riga di "Quintetti"), il contributo dei 5 singoli: PTS/USG%/TS%/tiri/ORB/DRB/TOV/REC, stessi minuti del quintetto per tutti e 5 (condivisi per definizione). `accumulaEventoLocaleRot` accumula anche per giocatore (oltre che per squadra) quando l'evento è MIA con `giocatore_num` noto; **filtrato sui soli 5 membri di quello specifico stint** (`q.indexOf(num)`) — senza questo filtro un CAMBIO/FINE registrato allo stesso secondo esatto della chiusura (il caso limite già corretto sul puntatore) porterebbe con sé il numero di chi sta *entrando*, attribuendolo per errore al quintetto in uscita. USG% con la stessa formula di Analisi stagione (in un quintetto equilibrato ogni membro ~20%, per costruzione). Sola lettura su `boxGaraSingola`/stint già calcolati, `eventiPuliti`, `nomeAnalisi`, `calcolaAdvanced`, `cacheEventiStagione`. |
| `breakdown-possessi.js` | **Team Possession Breakdown** (sperimentale, `#view-breakdown`, riga "Team Possession Breakdown" in Altro → sezione "Analisi") — segmenta il play-by-play in possessioni vere (motore a stati `segmentaPossessi`: canestro segnato chiude, and-1 accorpato alla stessa possessione, rimbalzo offensivo prolunga, rimbalzo difensivo/di squadra chiude, palla persa **e recupero fusi in un'unica voce** "Dopo palla persa", fine periodo → "Altro"), poi le aggrega per innesco × lato (OFF=nostre, DEF=subite) con Poss/Freq%/Rtg/TS%/TOV%/FT Ratio. Niente ORB%/DRB% per-possesso né rank di lega (dichiarato in-app). Filtri: **copia indipendente** di quelli di Analisi stagione (`filtriBreakdown`). Sola lettura su `eventiPuliti`/`elencoPartite`/`cacheEventiStagione`/`punteggioDaEventi`. |
| `rating-net.js` | **Rating Net** (sperimentale, `#view-rating-net`, riga in Altro → sezione "Analisi", sotto "Team Possession Breakdown") — 4 gauge stagionali (OFF/DEF/NET Rating, Pace) via `calcolaAdvanced`/`aggregaStagione` già esistenti, con un segno di riferimento "avversari" su ciascuno (niente campionato DR1 completo, dichiarato in-app: OFF↔DEF si usano a specchio, NET usa lo zero, PACE usa il possession-rate dei soli avversari). Sotto, Net Rating gara per gara con media mobile 5 gare (SVG, stesso stile di `graficoMargini` in `analisi.js`). Filtri: copia indipendente (`filtriRatingNet`). |
| `player-dev.js` | **Player Development** (sperimentale, `#view-player-dev` + `#view-scheda-giocatore`, riga in Altro → sezione "Analisi", sotto "Rating Net") — scheda di sviluppo per giocatore: fino a `MAX_OBIETTIVI`=5 obiettivi, ciascuno metrica (`CATALOGO_METRICHE`, 12 base + 6 avanzate, **ciascuna con `def`** = definizione in una frase, mostrata live nel form sotto il select — `aggiornaDefMetricaForm` — e come glossario sotto la tabella obiettivi sia a schermo sia nel PDF — `glossarioMetriche_`, solo le metriche usate) + valore target + direzione `≥`/`≤` + orizzonte 1/3/6 mesi + nota libera + **punto di partenza opzionale** (`baseline_tipo`: `"amichevoli"` = tutte le gare Amichevole terminate, o `"selezione"` = checklist di gare specifiche scelta nel form — `gareBaselineObiettivo`/`valoreBaseline`, **indipendenti dal filtro Campionato/Amichevoli** dell'elenco, sempre su `gareTerminate_()`; mostrato come colonna "Partenza" in tabella e riga tratteggiata chiara nel grafico). Persistenza come `giocatori.js` (`bsp_obiettivi` + POST `SALVA_OBIETTIVO`/JSONP `getObiettivi`, backend V4.14), cancellazione = flag `eliminato` (mai un vero delete). Metriche **base** (incl. **FT Rate** = FTA/FGA): valore reale gara-per-gara (`serieBaseGaraPerGara`, stesse formule di `vistaAnalisiGiocatori`). **AIS**: copia locale della formula di `calcolaAIS()` (riusa `calcolaLVI()`), per-gara sul filtro indipendente di questa sezione. **Def Rating/BPM/OBPM/DBPM/VORP**: costrutti stagionali, non hanno un valore a singola gara — il loro "andamento" è **cumulativo** (`serieCumulativaAvanzata`: `calcolaDefRtg`/`calcolaBpmVorp` — sola lettura, non toccate — richiamate su `aggregaStagione(gare.slice(0,i+1))` per ogni taglio crescente di gare). Grafico SVG per obiettivo con linea target tratteggiata (stesso impianto di `graficoTrendNet`, `rating-net.js`). **Stampa/PDF**: nessuna libreria — `window.print()` su un contenitore dedicato (`#pd-stampa`, invisibile a schermo, mostrato solo sotto `@media print` mentre il resto dell'app sparisce). **Prompt AI** (fuori dal PDF): `generaPromptAI`/`copiaPromptAI`, testo con obiettivi+dati+partenza+nota copiato via `navigator.clipboard` (fallback `execCommand`). Filtri: copia indipendente (`filtriPlayerDev`). **Round 2 (v64)**: definizioni delle metriche riscritte più ricche (2 frasi, cosa misura + come leggerla); **valori di riferimento** Basso/Medio/Elite (+ Media squadra dove si applica) per aiutare a fissare un target sensato — `RIFERIMENTI_LIVELLO`/`riferimentiMetrica`/`mediaSquadra_`, mostrati live nel form (`ob-metrica-rif`) e in una tabella dedicata (`tabellaRiferimenti_`, schermo+PDF); fonti dichiarate: BPM/OBPM/DBPM/VORP da hackastat.eu ("Learn a Stat: Box Plus Minus and VORP" — ancore reali −2/0/+5), AIS riusa `TIER_AIS` di `analisi-avanzata.js`, le percentuali di tiro/USG%/AST% sono convenzioni generali NON specifiche del livello DR1 (dichiarato in-app), Def. Rating non ha soglie assolute oneste → i 3 livelli sono calcolati **dinamicamente** ±6 rispetto alla Def. Rating della propria squadra; nessuna scala per PPG/RPG/APG/TOV/+- (troppo legati a ruolo/minuti). Nuova sezione **"Dove siamo oggi"** (`riepilogoPartenzaAttuale_`) in cima a scheda e PDF: partenza → attuale → target per ogni obiettivo, prima di ogni altro dettaglio. **Round 3 (v67)**: descrizioni riscritte in linguaggio accessibile a un giocatore, non solo al coach (tolti riferimenti pronominali senza antecedente tipo "usati da lui"; le metriche avanzate spiegano il concetto E includono i numeri-soglia nel testo). **Trasparenza filtri**: `etichettaFiltriPlayerDev_()` mostra ora Competizione+Casa/Trasferta+Vinte/Perse (non solo Competizione) in cima a scheda e PDF, con nota esplicita che è un filtro **indipendente** da `filtriAnalisi` (Analisi avanzata, che non ha una sua barra filtri — nuova `etichettaFiltriAnalisi_()` in `analisi-avanzata.js` la rende visibile lì per la prima volta) — stesso giocatore/metrica può mostrare numeri diversi tra le due sezioni semplicemente perché i filtri divergono, non per un bug nella formula (che è condivisa, `calcolaDefRtg`/`calcolaBpmVorp`, sola lettura). **Fix**: `gareTerminate_()` (usata per il "Partenza") non filtrava per `stagione`, a differenza di `garePerPlayerDev()` (usata per l'"Attuale") — una gara di un'altra stagione poteva contribuire al Partenza ma sparire dall'Attuale, dando l'impressione di un bug nei numeri; ora entrambe rispettano la stessa `filtriPlayerDev.stagione` (restano indipendenti su Competizione/Casa-Trasferta/Vinte-Perse, per scelta). **Round 4 (v68)**: nuova metrica **"Indice di Forzatura"** (`cod: "forz"`) = `USG% × (1 − TS%giocatore/TS%squadra)` — formalizza in un numero la frase già nella def di USG% ("USG% alto con TS% basso spesso vuol dire tiri forzati"): 0 = rende come la squadra a qualsiasi volume, positivo e alto = tira/attacca molto con efficienza sotto la media (forza), negativo = usa molto ED è più efficiente della squadra. Riusa `usg`/`ts` già calcolati in `valoreBaseDaLinea_` + lo stesso rapporto TS/TS-squadra già usato in `serieAISGaraPerGara` — zero formule nuove inventate da zero. Essendo nel catalogo come le altre metriche "base", è automaticamente disponibile ovunque (form, tabella riferimenti Basso=5/Medio=0/Elite=-3 — indice interno, non da hackastat, dichiarato — glossario, grafico) senza altro lavoro: tutti quei pezzi leggono `CATALOGO_METRICHE`/`RIFERIMENTI_LIVELLO` in modo generico. **Round 5 (v69)**: Def. Rating ora mostra anche "Media squadra" (prima un trattino) — coincide col "Medio" per definizione (è una correzione rispetto alla Def. Rating di squadra, non ha un riferimento diverso), dichiarato esplicitamente invece di lasciare una cella vuota che sembrava un dato mancante. **Impaginazione PDF**: ogni blocco titolo+contenuto (`.pd-blocco-grafico` per i grafici trend, `.pd-blocco` per "Dove siamo oggi"/glossario/tabella riferimenti) ha `break-inside: avoid-page` e i titoli (`h2`/`.adv-tit`) hanno `break-after: avoid-page` — un titolo non resta più da solo a fine pagina col contenuto spinto su quella dopo; le righe delle tabelle (`tr`) non si spezzano più a metà tra due pagine. **Round 6 (v70)**: ⚠️ **Fix USG%** in `valoreBaseDaLinea_` — vedi nota completa nella riga `analisi.js`, stesso bug/fix in 3 file; cambia sia USG% sia l'Indice di Forzatura (che lo usa). **Round 7 (v71)**: ⚠️ **Fix perdita "Partenza"** — `mergeObiettiviCloud` sovrascriveva SEMPRE `baseline_tipo`/`baseline_partite` con la risposta cloud, azzerandoli quando il backend incollato è una versione senza quelle 2 colonne (`c.baseline_tipo === undefined`, non `""`): ogni apertura di Player Development (`apriPlayerDev` → `scaricaObiettivi()`) cancellava silenziosamente il punto di partenza appena impostato in locale. Ora un campo *assente* dalla risposta cloud preserva il valore locale; solo uno *presente ma esplicitamente vuoto* (backend aggiornato che sincronizza "nessuna baseline") lo svuota davvero. **Round 8 (v72)**: "Stampa scheda" e "Copia prompt AI" separate in 2 blocchi distinti (titolo + bottone + spiegazione ciascuno, non più una riga con 2 bottoni fianco a fianco) — etichetta del bottone stampa ripulita da "Stampa / Salva PDF" (un solo click, il "salva come PDF" è la destinazione scelta nella finestra di stampa del browser) a "Stampa scheda". Il bottone SALVA del form obiettivo ora dice "SALVA OBIETTIVO" con una nota sotto che chiarisce che salva solo quell'obiettivo, non stampa/esporta nulla — le due azioni (salvare un obiettivo vs stampare la scheda) sono sequenziali e indipendenti, mai la stessa cosa. |
| `avversari.js` | **Avversari** (sperimentale, `#view-avversari` + `#view-squadra-avversaria`, riga "Avversari" in Altro, sezione indipendente) — scouting squadre/giocatori avversari del girone: 2 nuovi fogli `Avversari`/`AvversariGiocatori`, stesso stile cloud-sync di `player-dev.js` (`bsp_avversari`/`bsp_avversari_giocatori` + POST `SALVA_AVVERSARIO`/`SALVA_AVVERSARIO_GIOCATORE` + JSONP `getAvversari`/`getAvversariGiocatori`, backend V4.15), cancellazione = flag `eliminato` (mai un vero delete), stessa preservazione dei campi assenti nel merge cloud→locale (`mergeAvversariCloud`/`mergeAvversariGiocatoriCloud`, stesso fix già fatto per Obiettivi in `player-dev.js`). **5 campi nota identici** a livello squadra e a livello singolo giocatore avversario (si compilano/leggono in momenti diversi): `caratteristiche_attacco`/`caratteristiche_difesa` (come giocano) + `approccio_attacco`/`approccio_difesa` (come li affrontiamo — la nostra difesa sul loro attacco, e viceversa) + `note_andata` (libera, dopo il primo incontro). **Collegamento leggero col calendario** (sola lettura, nessuna FK): `<datalist>` di nomi suggeriti da `elencoPartite()` nel form "nuova squadra" (riduce typo, resta libero per le amichevoli fuori girone); scheda squadra mostra le gare programmate contro quel nome (match esatto case-insensitive su `avversario`). `apriAvversari`/`apriSquadraAvversaria` (nav), `renderAvversariLista`/`renderSchedaSquadraAvversaria` (render), form modali squadra/giocatore (`apriFormSquadraAvversaria`/`apriFormGiocatoreAvversario` + conferma/elimina). |
| `ui.js` | `renderPartita` (HUD, roster, selezione), `mostraToast`, `aggiornaBadgeOffline`, modale CAMBI (`apriCambi`/`confermaCambi` + select tempo con vincolo), `apriRecap`, `navigaA` (router viste + hook render) |
| `pin.js` | login gate (`inizializzaPinGate`, `tentaLogin`, fallback offline, `logout`, `aggiornaProfiloAttivo`) |
| `app.js` | `DOMContentLoaded`: registra tutti i listener + avvio (`navigaA`, `renderCalendario`, `scaricaPartite`, `scaricaGiocatori`, `inizializzaPinGate`, `processaCoda`); registra il service worker |

### CSS (`css/`)
`tokens.css` (**palette PVL** + tema Arena — unica fonte colore) · `base.css` (reset, pin gate, toast) · `shell.css` (app-shell, nav) · `partita.css` (HUD, pannelli, azioni, modali, CAMBI, badge offline) · `altro.css` (hub "Altro" + switch Arena) · `calendario.css` (topbar, card gara) · `roster.css` (anagrafica, pre-partita) · `stats.css` (tabelle, grafici, barra punteggio, Segui Live, PBP `.pbp`, **Analisi stagione** `#analisi-filtri`/`.an-*`) · `possessi.css` (**Debrief possessi** — selettori gara/quarto, griglie tap giocatore/esito/gioco, foto di riferimento; riusa `.adv-card`/`.st-box`/`.btn-conferma` esistenti) · `analisi-avanzata.css` (**Analisi avanzata** — bottoni di apertura, badge livelli AIS; riusa `.adv-card`/`.st-box`/`.an-tab` esistenti) · `rotazioni.css` (**Rotazioni** — griglia presenza/margine per minuto, solo `opacity` sui token esistenti, niente colori hardcoded) · `breakdown-possessi.css` (**Team Possession Breakdown** — tabella a doppia intestazione OFF/DEF, riusa `.st-box`) · `rating-net.css` (**Rating Net** — gauge SVG ad arco, trend Net Rating; riusa `.st-chart`/`.adv-tit`) · `player-dev.css` (**Player Development** — badge raggiunto/in corso, linea target `.pd-target`, `@media print` dedicato per la scheda; riusa `.riga-altro`/`.overlay`/`.modale`/`.ap-campo`/`.st-chart`) · `avversari.css` (**Avversari** — blocchi nota sola-lettura `.avv-nota-*`, textarea form `.avv-textarea`; riusa `.riga-altro`/`.lista-altro`/`.overlay`/`.modale`/`.ap-campo`/`.btn-conferma`)

### Responsive (v41) — 3 modalità

Lo shell è 430px di default (mobile). Due media query aggiuntive, **discriminate da `pointer`**:

| Contesto | Media query | Layout |
|---|---|---|
| Telefono/tablet **verticale** | default | shell 430px, **capsula nav in basso** (`position: fixed`) |
| Telefono/tablet **orizzontale** | `(orientation: landscape) and (pointer: coarse)` | full-bleed, **nessuna nav** (`.tab-bar { display: none }`) — si ruota in verticale per navigare; toast una-tantum (`bsp_hint_landscape`, `app.js`) |
| **Desktop/laptop** | `(min-width: 900px) and (pointer: fine)` | shell full-width, **sidebar sinistra 200px** con label (`.tab-bar` restilizzata); contenuto centrato per tipo: Stats/Adv/Analisi ~1120px, Calendario ~1040px, Altro/Partita ~760px (`#view-* > * { max-width; margin-inline: auto }` in `shell.css`) |

Le **tab interne** (`.stats-tabs` ecc.) restano sempre. `.sm-hide` (colonne estese tabelle): nascoste solo su `(orientation: portrait) and (pointer: coarse)` e su desktop stretto `(pointer: fine) and (max-width: 720px)` → sul monitor tutte le colonne sono sempre visibili. Nessun wrapper HTML nuovo, nessun cambio ai render JS.

**Vista Partita su tablet (v74)** — la vista Partita ha un ulteriore livello di
adattamento, indipendente dalle 3 modalità sopra: su tablet (`pointer:coarse`
+ `min-width:768px` + `min-height:600px`, quest'ultima per escludere un
telefono grande ruotato in landscape, che supererebbe 768px di larghezza pur
restando un telefono) il roster (`.pannello-sinistro`) e i pulsanti azione
(`.pannello-destro`) vanno ai due **bordi** dello schermo invece di restare
compressi in una colonna centrata a 640px (il cap normale, `css/partita.css`,
si applicherebbe anche lì) — pensato per l'uso a due mani/pollici: sinistra
sceglie il giocatore, destra sceglie l'azione. Il contenuto di ogni pannello
si ancora in **basso** (`.pannello { justify-content: flex-end }`, il pannello
resta a tutta altezza per via di `#action-overlay`/`#end-game-panel` assoluti
al suo interno — cambia solo dove si impila il contenuto, non l'altezza del
box), target touch a 60px. **UNDO resta nell'header** (v78, vedi sotto) —
in portrait anche `#app-shell` si allarga (900px invece
di 430px, nuova regola in `shell.css`), altrimenti tutta l'app — non solo
Partita — restava una colonna stretta anche lì. Verificato con screenshot
Playwright (`playwright-core`, browser Chrome locale) prima/dopo su mobile
390×844 e desktop 1440×900: **identici byte per byte** (nessuna regressione,
le regole nuove sono scoped rigidamente su `pointer:coarse`).

**Modale CAMBI su tablet (v75)**: stesso scoping tablet di sopra — max-height
88vh (+ margine 5vh sotto, ereditato dal breakpoint 560px) non bastava a
mostrare CONFERMA/Annulla senza scroll con fino a 5 slot + checkpoint +
panchina. Alzata a 97vh, `margin-bottom:0`, `max-width:640px` **solo per
`#overlay-cambi .modale`** (le altre modali restano come sono, sono più
corte). Anche così non bastava nel landscape più basso testato (1180×820,
mancavano ~70px misurati con `scrollHeight`/`clientHeight`): ridotti un po'
gli spazi verticali tra checkpoint/slot/panchina/bottoni (mai i target touch
— select/input restano a 44px). Verificato con Playwright: bounding box di
`#cambi-conferma`/`#cambi-chiudi` dentro il viewport su tutti e 3 i tablet
testati; mobile/desktop ancora identici byte per byte.

**Punteggio nella modale CAMBI a scorrimento, non più tastiera (v76)** — i due
campi punteggio (`#cambi-punti-mia`/`#cambi-punti-opp`) erano `<input
type="tel" inputmode="numeric">`: su tablet aprivano la tastiera, scomoda e
controintuitiva per un valore che si corregge di rado. Ora sono `<select>`
(stesso stile/pattern di `#cambi-min`/`#cambi-sec`, popolati con `opzioni()`
già esistente in `ui.js`) — nuova `opzioniPunteggio(sel, valore)`: range
0..130 di default, allungato per includere sempre il valore attuale se già
fuori range (mai un punteggio "silenziosamente" non rappresentabile). Cambio
**universale** (non scoped a tablet: la tastiera è scomoda ovunque, non solo
lì) — tocca `index.html` (`<select>` al posto di `<input>`), `js/ui.js`
(popolamento; `confermaCambi()` non cambia, `.value` funziona identico su un
select), `css/partita.css` (`.cc-num` rimossa, sostituita da `.cc-num-select`
larga fissa 64px così non "salta" passando da 1 a 3 cifre). Verificato con
Playwright: 131 opzioni generate, selezione+conferma aggiorna davvero il
punteggio nell'HUD; reso su mobile/desktop/tablet, nessun errore console.

**UNDO tolto dal flottante, tornato in header su tablet (v78)** — feedback
d'uso reale: il pulsante flottante nel vuoto centrale (v74) veniva toccato
per sbaglio troppo spesso, proprio perché vicino ai pannelli TIRI/PALLA/FALLI.
Rimosse le 3 regole `#btn-undo` scoped a tablet (`position:fixed` + i due
offset per-orientamento) in `css/partita.css` — su tablet UNDO torna nella
stessa posizione di mobile/desktop (header, fuori dalla zona di tocco delle
azioni). Nessun cambio a HTML/JS. Resto del layout tablet invariato.

### Altro
`index.html` (unica pagina, tutte le viste + sprite SVG icone `#i-*` + modali) · `manifest.webmanifest` · `sw.js` · `mockup-src.jpg` + i 5 PNG icona · `scripts/bump.mjs` (cache-busting) · `scripts/ritaglia-icona.mjs` (crop mockup → PNG via Chrome headless)

---

## 4. Viste (SPA, `id="view-*"`, toggle via `navigaA`)

- **`view-partita`** — HUD (punteggio PVL/AVV, quarto, Q+1/UNDO/RECAP, banner ultimo evento) + pannello sinistro (roster + AVVERSARI) + pannello destro (griglie TIRI/PALLA/FALLI + overlay contestuali) + barra CAMBI a piena larghezza + striscia "eventi in coda".
- **`view-stats`** — topbar + tab `Tabellino` / `Andamento` / `Tiri` / `PBP` + **barra controlli** (`#stats-controlli`, fissa) con **selettore periodo** `Tot`(default)·`Q1`–`Q4`·`1°T`·`2°T`(+`OT` se presenti) e toggle `Numeri`/`%`. Il periodo vale solo su **Tabellino** e **Tiri** (Andamento = tutta la gara, PBP = cronologico); si azzera a `Tot` a ogni apertura di una gara. **Colonna compatta (v37):** topbar + punteggio fusi (`.sh-*`, gradiente navy via `:has`); totali squadra = prime 2 righe della tabella (`tr.st-tot`); solo `#stats-body` scrolla. **Spettatore** (`seguiLive`): topbar = nome partita e nel corpo la `barraPunteggio` piena + `bannerSegui()`. Minuti/± per periodo: dagli stint dell'intera gara filtrati per `quarto` (`boxPeriodo`).
- **`view-adv`** — topbar + tab `Squadra` / `Giocatori`; barra punteggio; card metriche + migliori quintetti + stint (tutti ricostruiti da `stintsDaEventi()`).
- **`view-analisi`** — Analisi stagione (da Altro → sezione "Analisi"): back + tab `Squadra`/`Giocatori` + barra filtri chip. Aggrega le sole gare `Terminata`; campionato e amichevoli separati. Fetch `getEventiStagione` in cache `bsp_analisi_eventi` (immutabile), pulsante Aggiorna.
- **`view-debrief`** — **Debrief possessi** (da Altro → sezione "Debrief", sperimentale/beta): back + selettore gara (le "In corso" sempre in cima, 🔴, poi le più recenti) + quarti `Q1`–`Q4`/`OT` + tab `Inserisci`/`Report`/`Giochi`. "Inserisci": foto allegata (`<input type="file" accept="image/*">`, camera o galleria, compressa via canvas) + "🔎 Leggi foglio" (Fase 3, V4.13: OCR Drive lato backend, righe proposte `fonte:"ocr"` da confermare/correggere — tap sul testo riga per modificarla — o fallback a testo grezzo) + tap giocatore → tap esito (`2✓/2✗/3✓/3✗/TL✓/TL✗/PERSA`) → crocette Area/2ª opp./vs zona + Forzato/Ritmo → codice gioco (chip da legenda locale, estendibile) → riga aggiunta alla lista del quarto → "Salva quarto" (sostituisce tutte le righe di quel `id_partita`+quarto sul foglio `Possessi`). "Report": PPP/eFG%/split calcolati **sui soli dati di questa vista** (indipendenti dal live ufficiale). "Giochi": legenda codici, editabile.
- **`view-analisi-avanzata`** — **AIS / BPM·VORP / Def. Rating** (sperimentale, raggiungibile da bottoni in fondo a `view-analisi` Squadra/Giocatori): back + 3 tab. Vedi `js/analisi-avanzata.js` per le formule e i limiti dichiarati (stoppate non tracciate, dati di lega approssimati).
- **`view-rotazioni`** — **Rotazioni** (sperimentale, da Altro → sezione "Analisi" → riga "Rotazioni"): back (→ Altro) + barra filtri (copia di quella di Analisi stagione) + 2 tab: "Rotation chart" (griglia presenza-per-minuto/margine-per-minuto) e "Quintetti" (Lineup Advanced Box Score, ordinabile, con filtro testuale sui nomi). Vedi `js/rotazioni.js`.
- **`view-breakdown`** — **Team Possession Breakdown** (sperimentale, da Altro → sezione "Analisi" → riga omonima): back (→ Altro) + barra filtri (copia) + tabella OFF/DEF per innesco di possesso. Vedi `js/breakdown-possessi.js`.
- **`view-rating-net`** — **Rating Net** (sperimentale, da Altro → sezione "Analisi" → riga omonima): back (→ Altro) + barra filtri (copia) + 4 gauge (Off/Def/Net Rating, Pace) + trend Net Rating gara per gara. Vedi `js/rating-net.js`.
- **`view-player-dev`** / **`view-scheda-giocatore`** — **Player Development** (sperimentale, da Altro → sezione "Analisi" → riga omonima): elenco giocatori (back → Altro) → scheda per giocatore (back → elenco) con tabella obiettivi (max 5, editabile via modale `#overlay-obiettivo`), grafico trend per obiettivo con linea target, "🖨️ Stampa/Salva PDF" e "📋 Copia prompt AI". Vedi `js/player-dev.js`.
- **`view-avversari`** / **`view-squadra-avversaria`** — **Avversari** (sperimentale, da Altro → sezione omonima): elenco squadre (back → Altro, "+" per aggiungerne una dal `<datalist>` calendario) → scheda squadra (back → elenco) con le 5 note (raggruppate Attacco/Difesa/Note dall'andata), gare in programma contro quella squadra (sola lettura), elenco giocatori avversari con le loro stesse 5 note. Vedi `js/avversari.js`.
- **`view-squadra`** (etichetta "Altro") — hub: accesso rapido, **Analisi** (Analisi stagione), Roster (anagrafica), **Aspetto** (switch Arena), Configurazione, **Manutenzione**: `#btn-aggiorna-app` (svuota tutte le `caches` + unregister del SW + reload — contro la cache PWA stantìa su mobile, per tutti); poi solo Admin (password + "SVUOTA"): `apriAzzeraGara` → `SVUOTA_EVENTI_GARA`; `apriResetDati` → `SVUOTA_EVENTI`. La riga "Profilo attivo" mostra `#app-versione` = `app vN` dai `?v=` degli asset caricati, + `cache vM ⚠` se il SW è su una versione diversa (diagnostica).
- **`view-calendario`** — topbar (hamburger placeholder / select stagione / +) + lista 26 gare con stato e bottone contestuale.

Nav: capsula fluttuante in basso (portrait), **sidebar icone a sinistra** (landscape su touch).

---

## 5. Modello dati

### `state` (in memoria + `localStorage: bsp_stato_partita`)
```
id_partita, nomePartita, avversario, avversarioBreve, luogoPartita
quartoIndice (0-based; 0..3 = Q1..Q4, poi OT), partitaFinita
tempoPartita "MM:SS" (tempo RIMANENTE del periodo, aggiornato ai checkpoint)
ultimoCheckpoint { quarto, mm, ss }
punteggio { MIA, OPP }
convocati [ { id, nome, cognome, nickname, ruolo, numero } ]   // roster della gara
roster [5 numeri]         // quintetto in campo
inCampo [5 numeri]        // = roster (ridondante, usato nei payload)
falliGiocatori { <num>: n }
falliSquadraPerQuarto { MIA: [..], OPP: [..] }   // esteso con push(0) per OT
selezione { squadra: "MIA"|"OPP", num }  | null
eventLog [ { evento, delta } ]   // delta = fn di UNDO
ultimoTestoFeed
```
> `stints`/`stintCorrente` **rimossi in v20**. Gli stint (quintetti, minuti, ±) sono
> ricostruiti al volo da `stintsDaEventi()` sugli eventi. Uno `state` vecchio in
> localStorage può ancora contenerli come campi orfani: innocui, nessuno li legge.

### Evento (payload verso il foglio — colonne `COLONNE_EVENTI`)
```
id_partita, id_evento (uuid), timestamp (ISO), quarto ("Q3"/"OT1"/"FINALE"),
tempo_partita ("MM:SS"), squadra ("MIA"|"OPP"), giocatore_num,
tipo_evento, dettaglio, punti_segnati,
punteggio_progressivo ("MIA-OPP"), quintetto_mia ("5,8,12,23,33"),
fallo_speciale, esito_tl ("SI,NO"), valido (true/false), id_evento_target
```
`tipo_evento`: `TIRO` (dett. `2P_SEGNATO`/`2P_ERRATO`/`3P_...`), `FALLO_SUBITO` (dett. `RIMESSA`/`1TL`/`2TL`/`3TL`/`1TL_AND1`/`SENZA_TL`/`TECNICO_1TL`), `FALLO_FATTO` (dett. `PERSONALE`/`1TL`/`2TL`/`3TL`/`DOPPIO_PERSONALE`/`TECNICI_COMPENSATI`/`ANTISPORTIVI_COMPENSATI`/`TECNICO_PANCHINA`), `RECUPERO`, `PALLA_PERSA`, `ASSIST` (dett. `AST_A_<num>`), `RIMBALZO` (dett. `OFFENSIVO`/`DIFENSIVO`/`SQUADRA`, `squadra` = di chi è il rimbalzo di squadra), `CAMBIO` (dett. `STINT`), `RETTIFICA` (dett. `PUNTEGGIO <old> → <new>`, correzione punteggio dai cambi), `ANNULLA`, `FINE`.

⚠️ `esito_tl` di un `FALLO_FATTO` = i TL **degli avversari**; `punti_segnati` di `FALLO_FATTO` = punti concessi agli avversari.

### localStorage — tutte le chiavi
`bsp_stato_partita` · `bsp_coda_invio` · `bsp_pin_ok` · `bsp_current_user` ({id,username,ruolo}) · `bsp_segnapunti_di` (id_partita che questo device sta segnando) · `bsp_partite_cache` · `bsp_partite_pending` · `bsp_giocatori` · `bsp_obiettivi` (Player Development)

### Google Sheet — fogli
- **Eventi** — `COLONNE_EVENTI` (sopra)
- **Partite** — `id_partita, data_ora, avversario, luogo, tipo, stagione, categoria, stato, note`
- **Giocatori** — `id_giocatore, nome, cognome, ruolo, numero_maglia, team, nickname`
- **Utenti** — `id_utente, username, ruolo, password_hash, attivo, salt` (admin di default `admin`/`1234`; `password_hash = SHA256(salt|password)`)
- **Possessi** (V4.12, Debrief possessi) — `COLONNE_POSSESSI` (sopra, §9); una riga = un possesso o un singolo tiro libero; `salvaPossessiQuarto_` sostituisce sempre tutte le righe di `(id_partita, quarto)`, stesso stile idempotente di `svuotaEventiGara_`
- **Obiettivi** (V4.14, Player Development) — `id, id_giocatore, metrica, target, direzione, orizzonte, creato_il, nota, baseline_tipo, baseline_partite, eliminato`; una riga = un obiettivo, upsert per `id` (`salvaObiettivo_`, stesso stile di `salvaGiocatore_`); cancellazione = `eliminato:true` (mai un vero delete riga, a differenza di Giocatori — qui serve poter "disfare" senza perdere lo storico); `baseline_tipo` = punto di partenza dell'obiettivo, `""`/`"amichevoli"`/`"selezione"` (con `baseline_partite` = id gara separati da virgola)

---

## 6. Flussi principali

### Login
`pin.js` → `verificaLoginServer` (POST JSON `{azione:"VERIFICA_LOGIN", username, password}`, risposta letta come JSON) → il backend confronta `SHA256(salt|password)` con `password_hash` (righe legacy senza salt: fallback a `SHA256(password)` + upgrade automatico) → salva `bsp_current_user` (`{id, username, ruolo, token}`), mostra app. Offline: rientro consentito solo se l'username coincide col profilo già salvato sul device.

### Avvio partita (dal calendario, gara "Da giocare")
`iniziaPartita(p)` → `apriPrePartita(p)`:
1. **Convocati** (`#overlay-prepartita`) — carica i giocatori del team, preseleziona i primi 12, permette +/- (min 5, max 12; **nessun max se `tipo == "Amichevole"`**), numero maglia editabile per-gara, nome breve avversario.
2. **Quintetto base** (`#overlay-quintetto`) — scegli esattamente 5.
3. `confermaQuintetto` → `state = statoIniziale()` + popola convocati/roster/nomePartita/ecc., `localStorage.bsp_segnapunti_di = id`, `impostaStatoPartita(id, "In corso")`, vai a `view-partita`.

### Registrazione evento
Seleziona giocatore PVL o AVVERSARI → tap azione → `registra*()` in `azioni.js`/`fallo-subito.js` → `registraEvento(campi, delta, testoFeed)` → push in `state.eventLog`, aggiorna `#ultimo-evento-banner`, **azzera `state.selezione`** (v26: ogni azione richiede un nuovo tap → niente doppio-evento / mis-attribuzione), `salvaStato()`, `inviaEvento()`, `renderPartita()`.
- Tiro sbagliato / TL finale sbagliato → overlay **Rimbalzo** (con "Di squadra → di chi?"). Canestro PVL → overlay **Assist** (timeout 4s).
- **Fallo** (subito/fatto): flusso a passi nell'`#action-overlay` (v29-30) — non un modale a schermo intero → il **CAMBI resta raggiungibile** (cambio prima dei liberi). La schermata esiti mostra **tutti gli N tiri insieme**, SÌ/NO ri-toccabili fino a "✓ Conferma" (`schermataEsitiTL`). And-1: si salta al singolo TL.
- **Correggi ultimo fallo** (v30): se l'ultimo evento è un `FALLO_SUBITO`/`FALLO_FATTO` con TL, la barra "ultimo evento" diventa cliccabile (`.correggibile`, prefisso ✎) → `modificaUltimoFallo` riapre **solo** la schermata esiti precompilata; alla conferma `annullaUltimoEvento()` del vecchio + registra il nuovo (delta score, non "undo grosso + rifai tutto"). `ffModifica` è il flag.
- **± dei tiri liberi dopo un cambio**: l'evento `FALLO_SUBITO` si registra a fine flusso → porta il quintetto *di quel momento*. Se il cambio è stato fatto prima dei liberi, i punti TL vanno al **quintetto entrante** (convenzione play-by-play standard: chi è in campo quando i punti entrano).
- **And-1** (v26): se il selezionato ha appena segnato da 2/3 (`ultimaAzioneEraCanestro`, guarda indietro saltando ASSIST/ANNULLA) → `apriModaleFalloSubito` preseleziona **1 TL** con badge AND-1.
- **Recupero ⇒ palla persa avversaria**: derivata in `calcolaBox` (`team[altra].pp++`), non registrata come evento. Non registrare anche la PALLA_PERSA speculare.
- **Falli speculari** (v38): in `calcolaBox` un `FALLO_SUBITO` fa `team.MIA.fs++` **e** `team.OPP.ff++` (l'avversario ha commesso il fallo); un `FALLO_FATTO` fa `team.MIA.ff++` **e** `team.OPP.fs++`. Prima `team.OPP.ff` restava 0 anche con decine di TL nostri.
- **Numero 0** lecito (`numValido()` sostituisce `if (num)`).
- A **partita finita** ogni inserimento è bloccato (roster/AVVERSARI/CAMBI/falli disabilitati); resta solo UNDO.

### Cambi / checkpoint (`apriCambi`/`confermaCambi` in `ui.js`)
Modale-checkpoint, tutto correggibile (v28):
- **Periodo** — `<select>` Q1..(corrente+1). Cambiarlo aggiorna `state.quartoIndice`.
- **Tempo rimanente** — `<select>` MM + `<select>` SS a **passi di 5s** (wheel corto su iPhone). Vincolo "non aumenta" solo se il periodo non cambia.
- **Punteggio** — 2 `<input>` MIA/OPP **editabili**: se diversi dal corrente → aggiorna `state.punteggio` + registra un evento **`RETTIFICA`** (`dettaglio: "PUNTEGGIO 22-20 → 24-20"`, UNDO separato). Attribuito allo stint corrente; revisione a fine partita.
- **Quintetto** — per ognuno dei 5 un `<select>` verso un panchinaro.

Alla conferma: eventuale `RETTIFICA` (contesto vecchio), poi cambio periodo, poi `CAMBIO` + aggiorna `roster`/`inCampo`/`tempoPartita`/`ultimoCheckpoint`. Lo `snap` dell'UNDO ora include anche `quartoIndice` e `punteggio`.
**Al cambio quarto `passaAlPeriodo` apre `apriCambi` in automatico.**

### Modifica convocati in partita (v27, `giocatori.js`)
Bottone **"✎ Modifica convocati"** nella modale CAMBI → `#overlay-convocati-live` (`apriConvocatiLive`). Modifica **solo** `state.convocati`: correggi maglia/nick, aggiungi un dimenticato (da anagrafica o manuale), rimuovi. **Nessun evento riscritto.** Un convocato è **bloccato** (numero non editabile, non rimovibile) se `haGiocatoEventi(num)` → compare come `giocatore_num` o in un `quintetto_mia` di un evento. I rari cambi-numero validi si propagano a `roster`/`inCampo`/`falliGiocatori`.

### Fine partita
`avanzaQuarto` Q1→Q3 chiede conferma; su Q4 → `confirm()` OK=OT / Annulla=`terminaPartita()`. `terminaPartita` emette evento `FINE`, `partitaFinita=true`, `impostaStatoPartita("Terminata")`, mostra `#end-game-panel`.
**Falli di squadra in OT**: contano come 4° quarto (FIBA Art. 41) — `indiceFalli()` = `min(quartoIndice, QUARTI_REGOLAMENTARI−1)`; `falliSquadraPerQuarto` resta lungo 4.

### Secondo device — "Segui Live"
Se apri dal calendario una gara "In corso" che **non** stai segnando tu → `avviaModalitaSegui(p)`: va su Stats sola-lettura, `pollSeguiLive` scarica `getEventi` ogni ~20s e ricalcola tutto. Quando trova un evento `FINE` → banner "PARTITA TERMINATA", stop polling, ricarica il calendario. La vista Partita è bloccata (`navigaA` reindirizza).

**`statsTargetId`** (v39, `stats.js`) = l'`id_partita` che Stats/Adv **deve** mostrare (`null` = la mia partita live). Lo impostano `apriStatistichePartita` (gara storica) e `avviaModalitaSegui`; `fermaSeguiLive()` lo azzera (+ `statsEventiRemoti`). Regole: `scaricaEventiPartita` **scarta** ogni risposta il cui `idPartita ≠ statsTargetId`; `aggiornaStatsDaFoglio` aggiorna `statsTargetId` (non `state.id_partita`); `statsContesto` resta sulla remota finché `statsTargetId != null`; `apriStatistichePartita` chiama `fermaSeguiLive()` all'ingresso. → apri una gara conclusa e **non** ti ritrovi più sulla tua ultima partita, nemmeno premendo "Aggiorna" o con un Segui Live lasciato aperto.

Robustezza (v36): `scaricaEventiPartita` ha un **timeout 12s** — se il JSONP resta appeso chiama comunque `cb(false)`, così la catena del polling non muore (prima poteva "congelarsi" su un dato iniziale); su fallimento `pollSeguiLive` ritenta a 7s invece di 20.

### Secondo device — subentro come segnapunti
Card calendario di una gara "In corso" non tua → bottone **"Riprendi come segnapunti"** (anche come **"Prendi controllo"** nella banner Segui Live) → `riprendiComeSegnapunti(p)`: `scaricaEventiPartita` → `ricostruisciStatoDaEventi(p, eventi)` rifà `state` dal foglio → `bsp_segnapunti_di = id`, `fermaSeguiLive()`, va su `view-partita`. Vedi limiti in §8.4.

### Stat (client-side)
`statsContesto()` sceglie sorgente: **live** (`state.eventLog`) o **remota** (`statsEventiRemoti.eventi` dal foglio), passando sempre da `eventiPuliti()` (dedup per `id_evento`, via ANNULLA + bersagli, via `valido=FALSE`). `calcolaBox(ctx)` produce per-giocatore + squadra. `stintsDaEventi(eventi, tempoOra, quartoOra)` ricostruisce gli stint (minuti, ±) dal flusso: cambio quando `quintetto_mia` cambia o cambia `quarto`. `calcolaAdvanced` applica le formule FIBA/Hack-a-Stat (§7). Tab **PBP** (`vistaPbp`/`descriviEvento`): play-by-play leggibile in ordine inverso, riga = periodo+tempo · descrizione · punteggio progressivo.

---

## 7. Formule advanced (in `stats.js:calcolaAdvanced`)

```
FGA = 2PA + 3PA        FGM = 2PM + 3PM
Poss = FGA + 0.44·FTA − ORB + TO
ORtg = PTS / Poss · 100
DRtg = PTS_opp / Poss_opp · 100
Net  = ORtg − DRtg
Pace = (Poss_medi) · 40 / minuti_giocati
eFG% = (FGM + 0.5·3PM) / FGA
TS%  = PTS / (2·(FGA + 0.44·FTA))
TOV% = TO / Poss · 100
ORB% = ORB / (ORB + DRB_opp)     DRB% = DRB / (DRB + ORB_opp)
```
Per-giocatore: `Net/40 = ±_giocatore / minuti_giocatore · 40` (margine squadra col giocatore in campo).
Valutazione (tabellino) = (PT + RIMB + AS + REC + FS) − (tiri sbagliati + TL sbagliati + PP + FF).
**Quintetto teorico**: 5 migliori ± individuali con vincolo **max 2 Primary Handler, max 2 Centro** (greedy per valore decrescente).

---

## 8. Limiti noti / debolezze (dal review)

1. ~~**Scritture non autenticate**~~ — **RISOLTO in V4.7**: `doPost` valida `data.token === WRITE_TOKEN` (Script Property). Il token è restituito da `verificaLogin`, salvato in `bsp_current_user.token`, allegato a ogni POST da `api.js` (`tokenScrittura()`). Attivazione: impostare la proprietà `WRITE_TOKEN` in Apps Script, poi tutti fanno re-login. *Resta* security-through-obscurity (il token è nella risposta JSONP + localStorage); una auth firmata server-side sarebbe il passo successivo.
2. ~~**Perdita silenziosa eventi**~~ — **MITIGATO in v20**: `riconciliaCoda()` (`api.js`, ogni 45s + su `online`) confronta gli `id_evento` di `state.eventLog` col foglio (`getEventi`) e rimette in coda i mancanti più vecchi di 30s. Gira solo sul device segnapunti. Non copre gli `ANNULLA` (non sono in `eventLog`); eventuali duplicati da re-invio sono innocui perché `eventiPuliti()` deduplica lato stat. Resta il limite di fondo: `no-cors` non conferma nulla.
3. ~~**Password**~~ — **RISOLTO in V4.8**: hash SHA-256 **con salt per-utente** (colonna `salt`, `SHA256(salt|password)`); righe legacy senza salt vengono aggiornate al primo login riuscito. Login ora via **POST** (`azione: "VERIFICA_LOGIN"`) → la password non passa più in query string GET (niente log di esecuzione / cronologia / proxy). Il GET `?action=verificaLogin` resta per compatibilità coi client non aggiornati.
4. ~~**Partita viva solo in `localStorage`**~~ — **MITIGATO in v20**: `ricostruisciStatoDaEventi()` (`calendario.js`) ricostruisce `state` dagli eventi del foglio (punteggio, periodo, tempo, quintetto in campo, falli personali e di squadra, `eventLog` con `delta` best-effort). Entry point: bottone **"Riprendi come segnapunti"** sulla card calendario di una partita "In corso" non segnata da questo device, e **"Prendi controllo"** nella banner Segui Live. Limiti: si perde ciò che l'altro device non ha ancora sincronizzato; l'UNDO di eventi pre-subentro non ripristina i contatori falli; i panchinari mai entrati non rientrano nei convocati (aggiungibili dai cambi).
5. ~~**UNDO di un CAMBIO**~~ — **RISOLTO in v20**: `confermaCambi` passa una `delta` reale (`ripristinaCambio`) che rimette `roster`/`inCampo`/`tempoPartita`/`ultimoCheckpoint` e rimuove le chiavi `falliGiocatori` appena aggiunte.
6. ~~**XSS latente**~~ — **RISOLTO in v20**: helper globale `esc()` (`state.js`) applicato a tutte le interpolazioni di nomi/note in `innerHTML` — `renderCalendario`, `renderRoster`, `renderSlotCambi`, `renderPartita` (roster), `apriRecap`, `renderPrePartita`, `renderQuintetto`, `barraPunteggio`, `rigaSquadra`, `vistaTabellino`, `vistaAdvGiocatori`, `vistaTiri`, `vistaStint`, `miglioriQuintetti`, `vistaPbp`. I nomi squadra costanti (`CONFIG.NOME_SQUADRA_MIA`) non sono editabili → lasciati grezzi.
7. ~~**`state.stints`/`stintCorrente` = codice morto**~~ — **RIMOSSO in v20**: eliminati da `statoIniziale()`, `confermaCambi`, `passaAlPeriodo`/`terminaPartita` (`timer.js`), `confermaQuintetto`, `ricostruisciStatoDaEventi`; con loro `apriStint`/`chiudiStint`/`chiudiStintPeriodo`. Le stat usano solo `stintsDaEventi()`.
8. ~~`apriRecap` senza guardia~~ — **RISOLTO in v20**: guardia `typeof statsContesto/calcolaBox === "function"` + `try/catch` che mostrano un messaggio nella tabella invece di lanciare.
9. ~~**Cache-busting manuale**~~ — **RISOLTO in v20**: `scripts/bump.mjs` (Node, zero dipendenze) allinea in un colpo i ~19 `?v=N`, il `CACHE` di `sw.js` e la riga "Ultimo aggiornamento" di HANDOFF; `--check` per la verifica. Sorgente di verità = `sw.js`.
10. `impostaStatoPartita` re-invia la partita con campi locali possibilmente stale → può clobberare modifiche fatte sul foglio.
11. Minuti/± dipendono ancora dalla disciplina del segnapunti (aprire i CAMBI ai cambi reali) — **migliorato in v26**: `stintsDaEventi` non miscredita più la giocata di transizione (usa `prevSc`), e `passaAlPeriodo` apre i CAMBI in automatico a ogni quarto.
12. **Zero test.** Priorità: test node di `stintsDaEventi`/`calcolaBox` (motore ± e box score).
13. ~~Icone PWA PNG mancanti~~ — **FATTE (v31)**: ritagliate da `mockup-src.jpg` con `scripts/ritaglia-icona.mjs`.

### Backlog consigliato (ordine)
test node del motore stat (`stintsDaEventi`, `calcolaBox`, `calcolaAdvanced`).

---

## Palette e temi (da v21)

Palette **"PVL"** costruita dal logo: blu profondo `#1E3C8C` (identità + primario), rosso `#CE2B2B` (energia *e* voci negative + LIVE), verde `#0E7B4E` (solo positivo), neutri **freddi**. Niente arancione. Tutto in `css/tokens.css`; nessun colore hard-coded negli altri CSS (unica eccezione: il pallino bianco dello switch).

- `--color-brand` = riempimento pieno (pairs con `--color-text-on-brand`); `--color-brand-ink` = brand come **testo/icona** su superfici (nel tema Arena diventa più chiaro); `--color-brand-soft` / `--color-brand-strong` per fill tenui / selezione.
- **Arena mode** (tema scuro, opt-in): `<html data-tema="arena">`. Default **chiaro**. Switch in *Altro → Aspetto*; preferenza per-**device** in `localStorage: bsp_tema`. Applicazione pre-paint via `<script>` inline in `index.html`; toggle e persistenza in `js/tema.js` (`inizializzaTema` chiamato da `app.js`). `tokens.css` ridefinisce ogni token colore sotto `:root[data-tema="arena"]`.
- `<meta name="theme-color">` e `manifest.theme_color` = `#1E3C8C` (chiaro) / `#0A0F1C` (arena, aggiornato a runtime da `applicaTema`).

---

## 9. Backend — codice completo attuale (V4.15)

> Da incollare nell'editor Apps Script. Poi lanciare `setupSheet()` una volta (aggiunge la colonna `salt` a `Utenti` e ricalcola l'hash dell'admin se il foglio è nuovo) e **ripubblicare il deployment**. `setupSheet()` è idempotente.
> Deploy Web App: eseguito come "me", accesso "chiunque".
>
> **Password (V4.8):** hash con salt per-utente, login via POST `azione: "VERIFICA_LOGIN"`. Le righe utente esistenti senza `salt` continuano a funzionare e vengono aggiornate al primo login corretto — nessuna azione manuale. Se `setupSheet()` non aggiunge la colonna `salt` a una `Utenti` già popolata, aggiungerla a mano come ultima intestazione.
>
> **Token di scrittura (V4.7):** i POST richiedono `data.token === WRITE_TOKEN` (Script Property). Per attivarlo:
> Apps Script → **Impostazioni progetto → Proprietà script** → aggiungi `WRITE_TOKEN` = una stringa casuale lunga.
> Finché la proprietà **non è impostata**, tutte le scritture passano (comportamento pre-V4.7).
> Il token viene restituito da `verificaLogin` e salvato in `bsp_current_user.token` sul client.
> **Dopo aver impostato la proprietà: tutti gli utenti devono fare logout e login una volta** per ricevere il token.
> Nota: il token non è un segreto forte (transita nella risposta JSONP del login ed è in localStorage). Serve a bloccare le scritture anonime verso l'URL `/exec` e a poter ruotare la chiave se abusata. La difesa vera resterebbe una auth server-side firmata.
>
> **Lettura automatica foglio possessi (V4.13):** usa l'OCR di Google Drive, che richiede il servizio avanzato **Drive API** abilitato nel progetto — Apps Script → editor → **Servizi** (icona ➕ nel pannello sinistro) → cerca "Drive API" → **Aggiungi**. Una tantum, come il `WRITE_TOKEN`. Senza questo passaggio l'azione `LEGGI_FOGLIO_POSSESSI` carica comunque la foto ma risponde `tabella_rilevata:false` invece di leggerla davvero (fallisce in modo silenzioso e innocuo, non blocca nulla).
>
> **Player Development (V4.14):** nuovo foglio `Obiettivi`, azioni `SALVA_OBIETTIVO` (POST)/`getObiettivi` (JSONP) — stesso stile upsert-per-id di `salvaGiocatore_`, ma la cancellazione è un flag `eliminato:true` scritto sulla riga (mai un vero `deleteRow`, per poter "disfare" un'eliminazione senza perdere lo storico). Nessuna migrazione da fare su fogli esistenti: `setupSheet()` crea `Obiettivi` da zero al primo lancio dopo l'aggiornamento.
>
> **Avversari (V4.15):** nuova sezione indipendente "Altro → Avversari" (scouting squadre/giocatori avversari del girone). Due nuovi fogli, `Avversari` e `AvversariGiocatori`, stesso stile upsert-per-id + `eliminato:true` di `Obiettivi`. Azioni `SALVA_AVVERSARIO`/`SALVA_AVVERSARIO_GIOCATORE` (POST), `getAvversari`/`getAvversariGiocatori` (JSONP). Nessuna migrazione: `setupSheet()` crea entrambi i fogli da zero al primo lancio dopo l'aggiornamento.

```javascript
/**
 * BASKET STATS PRO — Backend Google Apps Script (V4.15)
 * Eventi · Partite · Giocatori · Utenti · Possessi · Obiettivi · Avversari/AvversariGiocatori
 * — cloud-sync, JSONP, multiutente, token scrittura (V4.7) + password con salt e login via
 * POST (V4.8) + SVUOTA_EVENTI (V4.9) + SVUOTA_EVENTI_GARA (V4.10) + getEventiStagione (V4.11)
 * + Debrief possessi (V4.12) + lettura automatica foglio possessi via OCR Drive (V4.13)
 * + Player Development: Obiettivi (V4.14) + Avversari: scouting squadre/giocatori (V4.15)
 */
const SHEET_EVENTI = "Eventi";
const SHEET_PARTITE = "Partite";
const SHEET_GIOCATORI = "Giocatori";
const SHEET_UTENTI = "Utenti";
const SHEET_POSSESSI = "Possessi";
const SHEET_OBIETTIVI = "Obiettivi";
const SHEET_AVVERSARI = "Avversari";
const SHEET_AVVERSARI_GIOCATORI = "AvversariGiocatori";

const COLONNE_EVENTI = [
  "id_partita","id_evento","timestamp","quarto","tempo_partita",
  "squadra","giocatore_num","tipo_evento","dettaglio",
  "punti_segnati","punteggio_progressivo","quintetto_mia",
  "fallo_speciale","esito_tl","valido","id_evento_target"
];
const COLONNE_PARTITE = ["id_partita","data_ora","avversario","luogo","tipo","stagione","categoria","stato","note"];
const COLONNE_GIOCATORI = ["id_giocatore","nome","cognome","ruolo","numero_maglia","team","nickname"];
const COLONNE_UTENTI = ["id_utente","username","ruolo","password_hash","attivo","salt"];
/* Debrief possessi (V4.12) — tracker parallelo per il coaching, sperimentale.
   Non tocca Eventi/Partite/Giocatori. Una riga = un possesso (o un singolo tiro
   libero — vedi js/possessi.js). esito ∈ 2v,2x,3v,3x,tlv,tlx,pp. */
const COLONNE_POSSESSI = [
  "id_partita","id_possesso","quarto","riga_n","gioco","giocatore_num","esito",
  "area","opp2","zona","tiro_qualita","stato_riga","fonte","timestamp","foto_url"
];
/* Player Development (V4.14) — una riga = un obiettivo di un giocatore.
   Cancellazione = eliminato:true (mai un vero deleteRow, vedi js/player-dev.js).
   baseline_tipo ∈ "" | "amichevoli" | "selezione"; baseline_partite = id_partita
   separati da virgola (usato solo se baseline_tipo === "selezione"). */
const COLONNE_OBIETTIVI = [
  "id","id_giocatore","metrica","target","direzione","orizzonte","creato_il","nota",
  "baseline_tipo","baseline_partite","eliminato"
];
/* Avversari (V4.15) — scouting squadre/giocatori avversari del girone.
   Cancellazione = eliminato:true (mai un vero deleteRow, come Obiettivi).
   Le 5 colonne nota sono identiche a livello squadra e a livello giocatore
   (si compilano/leggono in momenti diversi, vedi js/avversari.js). */
const COLONNE_AVVERSARI = [
  "id","nome_squadra",
  "caratteristiche_attacco","caratteristiche_difesa",
  "approccio_attacco","approccio_difesa",
  "note_andata","aggiornato_il","eliminato"
];
const COLONNE_AVVERSARI_GIOCATORI = [
  "id","id_squadra","nome","cognome","numero_maglia","ruolo",
  "caratteristiche_attacco","caratteristiche_difesa",
  "approccio_attacco","approccio_difesa",
  "note_andata","aggiornato_il","eliminato"
];

function getWriteToken_() {
  return PropertiesService.getScriptProperties().getProperty("WRITE_TOKEN") || "";
}

/* --- Password con salt (V4.8) --- */
function nuovoSalt_() {
  return Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
}
function hashPassword_(salt, password) {
  return computeSha256_(String(salt || "") + "|" + String(password || ""));
}

/* Verifica credenziali. Compatibile con le righe vecchie senza salt:
   se il match riesce col vecchio hash SHA-256(password), la riga viene
   aggiornata al volo con salt + hash salato. */
function verificaLogin_(username, password) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_UTENTI);
  if (!sheet || sheet.getLastRow() <= 1) return { ok: false, error: "Utente non trovato" };
  const rows = sheet.getDataRange().getValues(), h = rows[0];
  const iHash = h.indexOf("password_hash"), iSalt = h.indexOf("salt");
  for (let r = 1; r < rows.length; r++) {
    const u = {}; h.forEach((k, i) => u[k] = rows[r][i]);
    if (u.username !== username || String(u.attivo).toUpperCase() !== "SI") continue;
    const pwd = password || "";
    let ok = false;
    if (u.salt) {
      ok = (u.password_hash === hashPassword_(u.salt, pwd));
    } else if (u.password_hash === computeSha256_(pwd)) {
      ok = true;
      const salt = nuovoSalt_();                       // upgrade riga legacy
      sheet.getRange(r + 1, iSalt + 1).setValue(salt);
      sheet.getRange(r + 1, iHash + 1).setValue(hashPassword_(salt, pwd));
    }
    return ok
      ? { ok: true, utente: { id: u.id_utente, username: u.username, ruolo: u.ruolo, token: getWriteToken_() } }
      : { ok: false, error: "Password errata" };
  }
  return { ok: false, error: "Utente non trovato" };
}

function setupSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  inizializzaFoglio_(ss, SHEET_EVENTI, COLONNE_EVENTI);
  inizializzaFoglio_(ss, SHEET_PARTITE, COLONNE_PARTITE);
  inizializzaFoglio_(ss, SHEET_GIOCATORI, COLONNE_GIOCATORI);
  const u = inizializzaFoglio_(ss, SHEET_UTENTI, COLONNE_UTENTI);
  assicuraColonna_(u, "salt");                 // migrazione V4.8 su Utenti già popolato
  inizializzaFoglio_(ss, SHEET_POSSESSI, COLONNE_POSSESSI);   // V4.12
  inizializzaFoglio_(ss, SHEET_OBIETTIVI, COLONNE_OBIETTIVI); // V4.14
  inizializzaFoglio_(ss, SHEET_AVVERSARI, COLONNE_AVVERSARI);                     // V4.15
  inizializzaFoglio_(ss, SHEET_AVVERSARI_GIOCATORI, COLONNE_AVVERSARI_GIOCATORI); // V4.15
  if (u.getLastRow() <= 1) {
    const s = nuovoSalt_();
    u.appendRow(["usr_admin","admin","Admin",hashPassword_(s,"1234"),"SI",s]);
  }
  Logger.log("WRITE_TOKEN attuale: " + (getWriteToken_() || "(non impostato — scritture aperte)"));
}
function inizializzaFoglio_(ss, nome, colonne) {
  let s = ss.getSheetByName(nome);
  if (!s) s = ss.insertSheet(nome);
  if (s.getLastRow() === 0) { s.appendRow(colonne); s.setFrozenRows(1); }
  return s;
}
function assicuraColonna_(sheet, nome) {
  const h = sheet.getRange(1, 1, 1, sheet.getLastColumn() || 1).getValues()[0];
  if (h.indexOf(nome) === -1) sheet.getRange(1, (sheet.getLastColumn() || 1) + 1).setValue(nome);
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.azione === "VERIFICA_LOGIN")
      return jsonResponse_(verificaLogin_(data.username, data.password));
    const atteso = getWriteToken_();
    if (atteso && String(data.token || "") !== atteso) {
      return jsonResponse_({ ok: false, error: "token non valido" });
    }
    if (data.azione === "SALVA_PARTITA")          return salvaPartita_(data);
    if (data.azione === "AGGIORNA_STATO_PARTITA") return aggiornaStatoPartita_(data);
    if (data.azione === "SALVA_GIOCATORE")        return salvaGiocatore_(data);
    if (data.azione === "SVUOTA_EVENTI")          return svuotaEventi_(data);
    if (data.azione === "SVUOTA_EVENTI_GARA")     return svuotaEventiGara_(data);
    if (data.azione === "SALVA_POSSESSI_QUARTO")  return salvaPossessiQuarto_(data);
    if (data.azione === "CARICA_FOTO_POSSESSI")   return caricaFotoPossessi_(data);
    if (data.azione === "LEGGI_FOGLIO_POSSESSI")  return leggiFoglioPossessi_(data);
    if (data.azione === "SALVA_OBIETTIVO")        return salvaObiettivo_(data);
    if (data.azione === "SALVA_AVVERSARIO")           return salvaAvversario_(data);
    if (data.azione === "SALVA_AVVERSARIO_GIOCATORE") return salvaAvversarioGiocatore_(data);
    if (data.tipo_evento === "ANNULLA")           return handleAnnulla_(data);
    appendEvento_(data, true);
    return jsonResponse_({ ok: true, azione: "evento_salvato" });
  } catch (err) { return jsonResponse_({ ok: false, error: String(err) }); }
}

function doGet(e) {
  const params = (e && e.parameter) || {};
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (params.action === "getPartite")   return rispostaDati_(params, "partite",   leggiFoglio_(ss, SHEET_PARTITE, true));
  if (params.action === "getGiocatori") return rispostaDati_(params, "giocatori", leggiFoglio_(ss, SHEET_GIOCATORI, false));
  if (params.action === "getEventi") {
    const idp = String(params.id_partita || "");
    let ev = leggiFoglio_(ss, SHEET_EVENTI, false);
    if (idp) ev = ev.filter(x => String(x.id_partita) === idp);
    return rispostaDati_(params, "eventi", ev);
  }
  if (params.action === "getEventiStagione") {   // V4.11: eventi delle sole gare concluse (per "Analisi stagione")
    const partite = leggiFoglio_(ss, SHEET_PARTITE, false);
    const finite = {};
    partite.forEach(p => { if (String(p.stato) === "Terminata") finite[String(p.id_partita)] = 1; });
    const ev = leggiFoglio_(ss, SHEET_EVENTI, false).filter(x => finite[String(x.id_partita)]);
    return rispostaDati_(params, "eventi", ev);
  }
  if (params.action === "getPossessi") {   // V4.12: Debrief possessi, filtrati per gara
    const idp = String(params.id_partita || "");
    let ps = leggiFoglio_(ss, SHEET_POSSESSI, false);
    if (idp) ps = ps.filter(x => String(x.id_partita) === idp);
    return rispostaDati_(params, "possessi", ps);
  }
  if (params.action === "getObiettivi") {   // V4.14: Player Development
    return rispostaDati_(params, "obiettivi", leggiFoglio_(ss, SHEET_OBIETTIVI, false));
  }
  if (params.action === "getAvversari") {   // V4.15: scouting squadre avversarie
    return rispostaDati_(params, "avversari", leggiFoglio_(ss, SHEET_AVVERSARI, false));
  }
  if (params.action === "getAvversariGiocatori") {   // V4.15: scouting giocatori avversari
    return rispostaDati_(params, "avversari_giocatori", leggiFoglio_(ss, SHEET_AVVERSARI_GIOCATORI, false));
  }
  if (params.action === "verificaLogin") {   // compat: vecchi client via JSONP GET
    return rispostaJsonp_(params, verificaLogin_(params.username, params.password));
  }
  return jsonResponse_({ ok: true, servizio: "Basket Stats Pro backend V4.15", stato: "attivo" });
}

function leggiFoglio_(ss, nome, formatDate) {
  const sheet = ss.getSheetByName(nome);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const tz = ss.getSpreadsheetTimeZone(), rows = sheet.getDataRange().getValues(), h = rows[0];
  return rows.slice(1).map(r => {
    const o = {};
    h.forEach((k, i) => o[k] = (formatDate && r[i] instanceof Date)
      ? Utilities.formatDate(r[i], tz, "yyyy-MM-dd HH:mm") : r[i]);
    return o;
  });
}
function rispostaDati_(params, chiave, dati) { const o = { ok: true }; o[chiave] = dati; return rispostaJsonp_(params, o); }
function rispostaJsonp_(params, obj) {
  const p = JSON.stringify(obj);
  return params.callback
    ? ContentService.createTextOutput(params.callback + "(" + p + ");").setMimeType(ContentService.MimeType.JAVASCRIPT)
    : ContentService.createTextOutput(p).setMimeType(ContentService.MimeType.JSON);
}
function computeSha256_(str) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8)
    .map(b => { const v = (b < 0 ? b + 256 : b).toString(16); return v.length === 1 ? "0" + v : v; }).join("");
}

function appendEvento_(data, validoDefault) {
  const sheet = inizializzaFoglio_(SpreadsheetApp.getActiveSpreadsheet(), SHEET_EVENTI, COLONNE_EVENTI);
  if (data.valido === undefined) data.valido = validoDefault;
  sheet.appendRow(COLONNE_EVENTI.map(c => {
    const v = data[c];
    return Array.isArray(v) ? v.join(",") : (v !== undefined && v !== null ? v : "");
  }));
}
function handleAnnulla_(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_EVENTI);
  if (sheet && data.id_evento_target) {
    const v = sheet.getDataRange().getValues();
    const idI = COLONNE_EVENTI.indexOf("id_evento"), okI = COLONNE_EVENTI.indexOf("valido");
    for (let r = 1; r < v.length; r++) if (String(v[r][idI]) === String(data.id_evento_target)) {
      sheet.getRange(r + 1, okI + 1).setValue(false); break;
    }
  }
  appendEvento_(data, true);
  return jsonResponse_({ ok: true, azione: "evento_annullato" });
}
/* Manutenzione: svuota Eventi, rimette le gare a "Da giocare". Tiene Giocatori
   e la lista Partite. Doppia protezione: token scrittura (già verificato in
   doPost) + campo conferma === "SVUOTA". */
function svuotaEventi_(data) {
  if (String(data.conferma) !== "SVUOTA")
    return jsonResponse_({ ok: false, error: "conferma mancante" });
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ev = ss.getSheetByName(SHEET_EVENTI);
  if (ev && ev.getLastRow() > 1) ev.deleteRows(2, ev.getLastRow() - 1);
  if (data.reset_stati) {
    const p = ss.getSheetByName(SHEET_PARTITE);
    if (p && p.getLastRow() > 1) {
      const stI = COLONNE_PARTITE.indexOf("stato") + 1;
      p.getRange(2, stI, p.getLastRow() - 1, 1)
        .setValues(Array.from({ length: p.getLastRow() - 1 }, () => ["Da giocare"]));
    }
  }
  return jsonResponse_({ ok: true, azione: "eventi_svuotati" });
}
/* Azzera gli eventi di UNA sola partita + la rimette a "Da giocare".
   Riscrive il foglio Eventi senza le righe di quell'id (una operazione, veloce). */
function svuotaEventiGara_(data) {
  if (String(data.conferma) !== "SVUOTA")
    return jsonResponse_({ ok: false, error: "conferma mancante" });
  const idp = String(data.id_partita || "");
  if (!idp) return jsonResponse_({ ok: false, error: "id_partita mancante" });
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ev = ss.getSheetByName(SHEET_EVENTI);
  let rimossi = 0;
  if (ev && ev.getLastRow() > 1) {
    const v = ev.getDataRange().getValues();
    const idI = COLONNE_EVENTI.indexOf("id_partita");
    const keep = v.slice(1).filter(row => String(row[idI]) !== idp);
    rimossi = (v.length - 1) - keep.length;
    if (rimossi > 0) {
      ev.getRange(2, 1, v.length - 1, v[0].length).clearContent();
      if (keep.length) ev.getRange(2, 1, keep.length, v[0].length).setValues(keep);
    }
  }
  if (data.reset_stato) {
    const p = ss.getSheetByName(SHEET_PARTITE);
    if (p && p.getLastRow() > 1) {
      const pv = p.getDataRange().getValues();
      const pidI = COLONNE_PARTITE.indexOf("id_partita");
      const stI = COLONNE_PARTITE.indexOf("stato") + 1;
      for (let r = 1; r < pv.length; r++) {
        if (String(pv[r][pidI]) === idp) { p.getRange(r + 1, stI).setValue("Da giocare"); break; }
      }
    }
  }
  return jsonResponse_({ ok: true, azione: "gara_svuotata", rimossi: rimossi });
}

/* ==========================================================================
   Debrief possessi (V4.12) — tracker parallelo, sperimentale. Non tocca
   Eventi/Partite/Giocatori. "Salva quarto" sostituisce SEMPRE tutte le righe
   di quel (id_partita, quarto) con quelle inviate — idempotente, stesso stile
   di svuotaEventiGara_: riscrive il foglio invece di cercare riga per riga.
   ========================================================================== */
function salvaPossessiQuarto_(data) {
  const idp = String(data.id_partita || ""), quarto = String(data.quarto || "");
  if (!idp || !quarto) return jsonResponse_({ ok: false, error: "id_partita/quarto mancante" });
  const righe = Array.isArray(data.righe) ? data.righe : [];
  const sheet = inizializzaFoglio_(SpreadsheetApp.getActiveSpreadsheet(), SHEET_POSSESSI, COLONNE_POSSESSI);
  const v = sheet.getLastRow() > 1 ? sheet.getDataRange().getValues() : [COLONNE_POSSESSI];
  const idI = COLONNE_POSSESSI.indexOf("id_partita"), qI = COLONNE_POSSESSI.indexOf("quarto");
  const resto = v.slice(1).filter(row => !(String(row[idI]) === idp && String(row[qI]) === quarto));
  const nuove = righe.map(r => COLONNE_POSSESSI.map(c => {
    if (c === "id_partita") return idp;
    if (c === "quarto") return quarto;
    const val = r[c];
    return (val !== undefined && val !== null) ? val : "";
  }));
  const tutte = resto.concat(nuove);
  if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, COLONNE_POSSESSI.length).clearContent();
  if (tutte.length) sheet.getRange(2, 1, tutte.length, COLONNE_POSSESSI.length).setValues(tutte);
  return jsonResponse_({ ok: true, azione: "possessi_salvati", righe: nuove.length });
}

/* Salva la foto del foglio su Drive (cartella dedicata, creata se manca).
   base64 = "data:image/jpeg;base64,...." dal client (già ridimensionata/compressa).
   Condivisa da caricaFotoPossessi_ e leggiFoglioPossessi_ (V4.13) — un solo posto
   che tocca DriveApp per l'upload della foto. */
function salvaFotoDrivePossessi_(base64, idPartita, quarto) {
  const m = String(base64 || "").match(/^data:(image\/\w+);base64,(.+)$/);
  if (!m) return null;
  const bytes = Utilities.base64Decode(m[2]);
  const blob = Utilities.newBlob(bytes, m[1], "possesso.jpg");
  const NOME_CARTELLA = "Basket Stats Pro — Foto possessi";
  const it = DriveApp.getFoldersByName(NOME_CARTELLA);
  const cartella = it.hasNext() ? it.next() : DriveApp.createFolder(NOME_CARTELLA);
  const nome = "gara" + String(idPartita || "?") + "_" + String(quarto || "?") + "_" + Date.now() + ".jpg";
  const file = cartella.createFile(blob).setName(nome);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { url: file.getUrl(), fileId: file.getId(), blob: blob };
}

function caricaFotoPossessi_(data) {
  const salvata = salvaFotoDrivePossessi_(data.foto_base64, data.id_partita, data.quarto);
  if (!salvata) return jsonResponse_({ ok: false, error: "immagine mancante" });
  return jsonResponse_({ ok: true, azione: "foto_caricata", url: salvata.url });
}

/* Lettura automatica del foglio possessi (V4.13, sperimentale) — carica la foto
   (come sopra) POI prova a leggerla con l'OCR di Google Drive (richiede il servizio
   avanzato "Drive API" abilitato, vedi nota nel §9). Layout fisso del foglio v7,
   13 colonne: N° | GIOCO | 2v 2x 3v 3x TLv TLx PERSA | AREA 2aOPP ZONA | TIRO F/R —
   le 7 colonne esito sono nello stesso ordine di ESITI_POSSESSO in js/possessi.js.
   Tutto in try/catch: un OCR fallito/non abilitato non deve mai bloccare l'upload
   della foto, degrada solo a tabella_rilevata:false. Nessuna riga viene mai salvata
   da qui — sono solo suggerimenti che il client mostra da confermare/correggere. */
function leggiFoglioPossessi_(data) {
  const salvata = salvaFotoDrivePossessi_(data.foto_base64, data.id_partita, data.quarto);
  if (!salvata) return jsonResponse_({ ok: false, error: "immagine mancante" });

  const risposta = { ok: true, azione: "foglio_letto", url: salvata.url, tabella_rilevata: false, righe_suggerite: [], testo_grezzo: "" };
  let ocrFileId = null;
  try {
    const ocrFile = Drive.Files.insert(
      { title: "OCR possessi tmp " + Date.now(), mimeType: "application/vnd.google-apps.document" },
      salvata.blob, { ocr: true, ocrLanguage: "it" }
    );
    ocrFileId = ocrFile.id;
    const body = DocumentApp.openById(ocrFileId).getBody();

    const ESITI_ORDINE = ["2v", "2x", "3v", "3x", "tlv", "tlx", "pp"];
    let tabella = null, righeMax = 0;
    for (let i = 0; i < body.getNumChildren(); i++) {
      const el = body.getChild(i);
      if (el.getType() === DocumentApp.ElementType.TABLE) {
        const t = el.asTable();
        if (t.getNumRows() > righeMax) { tabella = t; righeMax = t.getNumRows(); }
      }
    }
    if (tabella) {
      const suggerite = [];
      for (let r = 0; r < tabella.getNumRows(); r++) {
        const row = tabella.getRow(r);
        if (row.getNumCells() < 13) continue;   // riga non conforme al template, la saltiamo
        const cella = c => row.getCell(c).getText().trim();
        let esito = "", numero = "";
        for (let c = 0; c < 7; c++) {
          const txt = cella(2 + c).replace(/\D/g, "");
          if (txt) { esito = ESITI_ORDINE[c]; numero = txt; break; }
        }
        if (!esito) continue;   // riga vuota (es. header o riga non compilata)
        const tiro = cella(12).toUpperCase();
        suggerite.push({
          gioco: cella(1).toUpperCase(),
          giocatore_num: numero,
          esito: esito,
          area: !!cella(9),
          opp2: !!cella(10),
          zona: !!cella(11),
          tiro: (tiro === "F" || tiro === "R") ? tiro : "",
          fonte: "ocr"
        });
      }
      risposta.tabella_rilevata = suggerite.length > 0;
      risposta.righe_suggerite = suggerite;
    }
    if (!risposta.tabella_rilevata) risposta.testo_grezzo = body.getText();
  } catch (err) {
    risposta.errore_ocr = String(err);
  } finally {
    if (ocrFileId) try { DriveApp.getFileById(ocrFileId).setTrashed(true); } catch (e2) {}
  }
  return jsonResponse_(risposta);
}

function salvaPartita_(data) {
  const sheet = inizializzaFoglio_(SpreadsheetApp.getActiveSpreadsheet(), SHEET_PARTITE, COLONNE_PARTITE);
  const v = sheet.getDataRange().getValues(), idI = COLONNE_PARTITE.indexOf("id_partita");
  let riga = -1;
  for (let r = 1; r < v.length; r++) if (String(v[r][idI]) === String(data.id_partita)) { riga = r + 1; break; }
  const val = COLONNE_PARTITE.map(c => (data[c] !== undefined && data[c] !== null) ? data[c] : "");
  if (riga > 0) sheet.getRange(riga, 1, 1, COLONNE_PARTITE.length).setValues([val]);
  else { sheet.appendRow(val); sheet.getRange(sheet.getLastRow(), 2).setNumberFormat("@"); }
  return jsonResponse_({ ok: true, azione: riga > 0 ? "partita_aggiornata" : "partita_creata" });
}
function aggiornaStatoPartita_(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PARTITE);
  if (!sheet) return jsonResponse_({ ok: false, error: "Foglio Partite non trovato" });
  const v = sheet.getDataRange().getValues();
  const idI = COLONNE_PARTITE.indexOf("id_partita"), stI = COLONNE_PARTITE.indexOf("stato");
  for (let r = 1; r < v.length; r++) if (String(v[r][idI]) === String(data.id_partita)) {
    sheet.getRange(r + 1, stI + 1).setValue(data.stato);
    return jsonResponse_({ ok: true, azione: "stato_aggiornato" });
  }
  return jsonResponse_({ ok: false, error: "Partita non trovata" });
}
function salvaGiocatore_(data) {
  const sheet = inizializzaFoglio_(SpreadsheetApp.getActiveSpreadsheet(), SHEET_GIOCATORI, COLONNE_GIOCATORI);
  const v = sheet.getDataRange().getValues(), idI = COLONNE_GIOCATORI.indexOf("id_giocatore");
  let riga = -1;
  for (let r = 1; r < v.length; r++) if (String(v[r][idI]) === String(data.id_giocatore)) { riga = r + 1; break; }
  if (data.elimina) { if (riga > 0) sheet.deleteRow(riga); return jsonResponse_({ ok: true, azione: "giocatore_eliminato" }); }
  const val = COLONNE_GIOCATORI.map(c => (data[c] !== undefined && data[c] !== null) ? data[c] : "");
  if (riga > 0) sheet.getRange(riga, 1, 1, COLONNE_GIOCATORI.length).setValues([val]);
  else sheet.appendRow(val);
  return jsonResponse_({ ok: true, azione: riga > 0 ? "giocatore_aggiornato" : "giocatore_creato" });
}
/* Player Development (V4.14) — upsert per "id", stesso stile di salvaGiocatore_
   ma senza mai un vero deleteRow: l'eliminazione è solo il flag "eliminato". */
function salvaObiettivo_(data) {
  const sheet = inizializzaFoglio_(SpreadsheetApp.getActiveSpreadsheet(), SHEET_OBIETTIVI, COLONNE_OBIETTIVI);
  const v = sheet.getDataRange().getValues(), idI = COLONNE_OBIETTIVI.indexOf("id");
  let riga = -1;
  for (let r = 1; r < v.length; r++) if (String(v[r][idI]) === String(data.id)) { riga = r + 1; break; }
  const rec = Object.assign({}, data, { eliminato: !!(data.elimina || data.eliminato) });
  const val = COLONNE_OBIETTIVI.map(c => (rec[c] !== undefined && rec[c] !== null) ? rec[c] : "");
  if (riga > 0) sheet.getRange(riga, 1, 1, COLONNE_OBIETTIVI.length).setValues([val]);
  else sheet.appendRow(val);
  return jsonResponse_({ ok: true, azione: riga > 0 ? "obiettivo_aggiornato" : "obiettivo_creato" });
}
/* Avversari (V4.15) — upsert per "id", identico stile di salvaObiettivo_
   (mai un vero deleteRow: l'eliminazione è solo il flag "eliminato"). */
function salvaAvversario_(data) {
  const sheet = inizializzaFoglio_(SpreadsheetApp.getActiveSpreadsheet(), SHEET_AVVERSARI, COLONNE_AVVERSARI);
  const v = sheet.getDataRange().getValues(), idI = COLONNE_AVVERSARI.indexOf("id");
  let riga = -1;
  for (let r = 1; r < v.length; r++) if (String(v[r][idI]) === String(data.id)) { riga = r + 1; break; }
  const rec = Object.assign({}, data, { eliminato: !!(data.elimina || data.eliminato) });
  const val = COLONNE_AVVERSARI.map(c => (rec[c] !== undefined && rec[c] !== null) ? rec[c] : "");
  if (riga > 0) sheet.getRange(riga, 1, 1, COLONNE_AVVERSARI.length).setValues([val]);
  else sheet.appendRow(val);
  return jsonResponse_({ ok: true, azione: riga > 0 ? "avversario_aggiornato" : "avversario_creato" });
}
function salvaAvversarioGiocatore_(data) {
  const sheet = inizializzaFoglio_(SpreadsheetApp.getActiveSpreadsheet(), SHEET_AVVERSARI_GIOCATORI, COLONNE_AVVERSARI_GIOCATORI);
  const v = sheet.getDataRange().getValues(), idI = COLONNE_AVVERSARI_GIOCATORI.indexOf("id");
  let riga = -1;
  for (let r = 1; r < v.length; r++) if (String(v[r][idI]) === String(data.id)) { riga = r + 1; break; }
  const rec = Object.assign({}, data, { eliminato: !!(data.elimina || data.eliminato) });
  const val = COLONNE_AVVERSARI_GIOCATORI.map(c => (rec[c] !== undefined && rec[c] !== null) ? rec[c] : "");
  if (riga > 0) sheet.getRange(riga, 1, 1, COLONNE_AVVERSARI_GIOCATORI.length).setValues([val]);
  else sheet.appendRow(val);
  return jsonResponse_({ ok: true, azione: riga > 0 ? "avversario_giocatore_aggiornato" : "avversario_giocatore_creato" });
}
function jsonResponse_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
```

---

## 10. Come riprendere in una nuova chat

**Contesto da dare a Claude:**
> Progetto `basket-stats-app`: PWA vanilla (no build) per statistiche basket live della Virtus Luino, backend Google Apps Script + Sheet, deploy GitHub Pages. Leggi `CLAUDE.md` e `docs/HANDOFF.md`. Convenzioni: JS globale non-modulare, italiano, CSS a token, cache-busting via `node scripts/bump.mjs` (mai a mano). Non committare senza che te lo chieda.

**File da fornire** (o link al repo):
- Sempre: `CLAUDE.md`, `docs/HANDOFF.md`, `index.html`, tutti i `js/*.js`, tutti i `css/*.css`.
- Se si tocca il backend: incollare la versione corrente dello script (§9) — l'utente la ridistribuisce.
- Utili: `manifest.webmanifest`, `sw.js`.

**Prima di modificare:** `for f in js/*.js; do node -c "$f"; done`. Dopo: idem + bump `?v=`.

**Cronologia lavori** (commit recenti): calendario cloud-sync → pre-partita convocati/quintetto → anagrafica giocatori + nickname → login multiutente → stats (tabellino Lega Basket, andamento, tiri) → advanced (formule FIBA, quintetti, ±) → Segui Live 2° device → PWA + service worker → nav sidebar landscape → barra punteggio in stats/adv → evento `FINE` per sincronizzare la chiusura.

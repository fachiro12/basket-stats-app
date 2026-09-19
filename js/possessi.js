/* ==========================================================================
   possessi.js — Debrief possessi (Altro, sperimentale)
   Tracker PARALLELO al live ufficiale, possesso-per-possesso, pensato per il
   coaching (paint touch, qualità tiro, gioco chiamato, vs zona). Foglio
   cartaceo di riferimento a schermo durante l'inserimento. Fase 3 (V4.13):
   "Leggi foglio" prova a pre-compilare le righe via OCR lato backend — sono
   sempre proposte (fonte:"ocr") da confermare/correggere, mai salvate alla
   cieca; se l'OCR non riconosce la tabella, fallback a testo grezzo. Dato
   indipendente: nuovo foglio "Possessi" sul backend, NON tocca
   Eventi/Partite/Giocatori né le funzioni del motore stat esistente
   (calcolaBox/calcolaAdvanced) — solo lettura di dati propri.
   ========================================================================== */

const KEY_POSS_LEGENDA = "bsp_possessi_legenda";

/* esito possesso: punti e "peso possesso" (TL = 0,44, stessa formula di calcolaAdvanced) */
const ESITI_POSSESSO = [
  { k: "2v",  lbl: "2 ✓",   pt: 2, peso: 1,    tiro: true  },
  { k: "2x",  lbl: "2 ✗",   pt: 0, peso: 1,    tiro: true  },
  { k: "3v",  lbl: "3 ✓",   pt: 3, peso: 1,    tiro: true  },
  { k: "3x",  lbl: "3 ✗",   pt: 0, peso: 1,    tiro: true  },
  { k: "tlv", lbl: "TL ✓",  pt: 1, peso: 0.44, tiro: false },
  { k: "tlx", lbl: "TL ✗",  pt: 0, peso: 0.44, tiro: false },
  { k: "pp",  lbl: "PERSA", pt: 0, peso: 1,    tiro: false }
];
const LEGENDA_POSS_DEFAULT = [
  ["CP", "Contropiede"], ["TR", "Transizione"], ["DR", "Drag"], ["DO", "Doppio"],
  ["55", "55"], ["MA", "Maglia"], ["SOB", "Rimessa laterale"], ["BOB", "Rimessa da fondo"],
  ["RT", "Gioco rotto"]
];
const QUARTI_POSS = ["Q1", "Q2", "Q3", "Q4", "OT1"];

let possGaraSel = null;        // id_partita in lavorazione
let possQuartoSel = "Q1";
let possTab = "inserisci";     // inserisci | report | giochi
let possRighe = [];            // righe salvate sul foglio, per la gara selezionata (tutti i quarti)
let possRigheQuarto = [];      // copia di lavoro del quarto corrente (salvate + aggiunte in sessione)
let possCaricamento = false;
let possFotoQuarto = {};       // { "Q1": dataURL locale non ancora caricata, ... }
let possFotoUrlOcr = {};       // { "Q1": url già caricata su Drive via "Leggi foglio", per non ricaricarla a "Salva quarto" }
let possTestoOcr = {};         // { "Q1": testo grezzo OCR se la tabella non è stata riconosciuta }
let possLetturaInCorso = false;
let possLegenda = caricaLegendaPoss();

function rigaVuota() {
  return { giocatore_num: "", esito: "", area: false, opp2: false, zona: false, tiro: "", gioco: "" };
}
let possRigaTmp = rigaVuota();

/* ---------- legenda giochi: locale al device, cresce nel tempo ---------- */
function caricaLegendaPoss() {
  try {
    const l = JSON.parse(localStorage.getItem(KEY_POSS_LEGENDA));
    if (Array.isArray(l) && l.length) return l;
  } catch (e) {}
  return LEGENDA_POSS_DEFAULT.map(x => ({ codice: x[0], nome: x[1] }));
}
function salvaLegendaPoss() {
  try { localStorage.setItem(KEY_POSS_LEGENDA, JSON.stringify(possLegenda)); } catch (e) {}
}
function aggiungiCodiceLegenda() {
  const raw = prompt('Nuovo codice gioco — "codice;nome" (es. FL;Flex)');
  if (!raw) return;
  const p = raw.split(/[;,]/);
  const codice = (p[0] || "").trim().toUpperCase().slice(0, 4);
  if (!codice) { mostraToast("Codice non valido"); return; }
  if (possLegenda.some(x => x.codice === codice)) { mostraToast("Codice già presente"); return; }
  possLegenda.push({ codice: codice, nome: (p[1] || "").trim() });
  salvaLegendaPoss();
  renderDebrief();
}
function rimuoviCodiceLegenda(codice) {
  possLegenda = possLegenda.filter(x => x.codice !== codice);
  salvaLegendaPoss();
  renderDebrief();
}

/* ---------- roster per i tap "chi chiude" ---------- */
function rosterPerPossessi() {
  if (state && state.convocati && state.convocati.length && String(state.id_partita) === String(possGaraSel)) {
    return state.convocati.map(c => ({ numero: c.numero, nickname: c.nickname || c.cognome || "" }))
      .sort((a, b) => Number(a.numero) - Number(b.numero));
  }
  const team = (typeof TEAM_DEFAULT !== "undefined") ? TEAM_DEFAULT : "DR1";
  const lista = (typeof giocatoriDelTeam === "function") ? giocatoriDelTeam(team)
    : (typeof caricaGiocatori === "function" ? caricaGiocatori() : []);
  return lista
    .filter(g => g.numero_maglia !== "" && g.numero_maglia != null)
    .map(g => ({ numero: g.numero_maglia, nickname: g.nickname || g.cognome || "" }))
    .sort((a, b) => Number(a.numero) - Number(b.numero));
}

/* ==========================================================================
   Apertura vista + selezione gara/quarto
   ========================================================================== */
/* Gare per il menu a tendina: la/le "In corso" (live, su questo o un altro
   device) prima di tutto, poi le altre dalla più recente alla meno recente. */
function gareOrdinatePerDebrief() {
  const gare = elencoPartite().slice().reverse();   // elencoPartite() = crescente per data
  const live = gare.filter(p => p.stato === "In corso");
  const altre = gare.filter(p => p.stato !== "In corso");
  return live.concat(altre);
}
/* Gara preselezionata: la live (di questo device, o "In corso" sul foglio se
   un altro device la sta segnando), altrimenti la più recente. */
function garaPredefinitaDebrief() {
  const gare = gareOrdinatePerDebrief();
  if (gare.length && gare[0].stato === "In corso") return String(gare[0].id_partita);
  if (state && state.id_partita) return String(state.id_partita);
  return gare.length ? String(gare[0].id_partita) : "";
}
function apriDebrief() {
  if (!possGaraSel) possGaraSel = garaPredefinitaDebrief();
  possTab = "inserisci";
  navigaA("debrief");
  cambiaGaraDebrief(possGaraSel);
}
function cambiaGaraDebrief(id) {
  possGaraSel = String(id || "");
  possRighe = [];
  possRigheQuarto = [];
  possRigaTmp = rigaVuota();
  if (!possGaraSel) { renderDebrief(); return; }
  possCaricamento = true;
  renderDebrief();
  caricaPossessi(possGaraSel, () => {
    possCaricamento = false;
    possRigheQuarto = possRighe.filter(r => r.quarto === possQuartoSel);
    renderDebrief();
  });
}
function cambiaQuartoDebrief(q) {
  possQuartoSel = q;
  possRigheQuarto = possRighe.filter(r => r.quarto === possQuartoSel);
  possRigaTmp = rigaVuota();
  renderDebrief();
}
function rigaFotoUrlPerQuarto(q) {
  const r = possRighe.find(x => x.quarto === q && x.foto_url);
  return r ? r.foto_url : "";
}

/* ==========================================================================
   Foto: lettura file + ridimensionamento/compressione via canvas (no librerie)
   ========================================================================== */
function gestisciFotoSelezionata(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (ev) {
    const img = new Image();
    img.onload = function () {
      const MAXD = 1400;
      let w = img.width, h = img.height;
      if (w >= h && w > MAXD) { h = Math.round(h * MAXD / w); w = MAXD; }
      else if (h > w && h > MAXD) { w = Math.round(w * MAXD / h); h = MAXD; }
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      cv.getContext("2d").drawImage(img, 0, 0, w, h);
      possFotoQuarto[possQuartoSel] = cv.toDataURL("image/jpeg", 0.72);
      // Foto nuova ⇒ l'eventuale lettura/URL della foto precedente non vale più
      delete possFotoUrlOcr[possQuartoSel];
      delete possTestoOcr[possQuartoSel];
      renderDebrief();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

/* ==========================================================================
   Backend — risposta leggibile (come verificaLoginServer), non no-cors
   ========================================================================== */
function caricaFotoPossessi(base64, cb) {
  const base = (typeof CONFIG !== "undefined" && CONFIG.APPS_SCRIPT_URL) || "";
  if (!base || base.indexOf("INCOLLA_QUI") === 0) { cb(null); return; }
  fetch(base, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      azione: "CARICA_FOTO_POSSESSI", id_partita: String(possGaraSel), quarto: possQuartoSel,
      foto_base64: base64, token: (typeof tokenScrittura === "function" ? tokenScrittura() : "")
    })
  }).then(r => r.json()).then(r => cb(r && r.ok ? r.url : null)).catch(() => cb(null));
}
function salvaPossessiQuarto(righe, fotoUrl, cb) {
  const base = (typeof CONFIG !== "undefined" && CONFIG.APPS_SCRIPT_URL) || "";
  if (!base || base.indexOf("INCOLLA_QUI") === 0) { cb(false); return; }
  fetch(base, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      azione: "SALVA_POSSESSI_QUARTO", id_partita: String(possGaraSel), quarto: possQuartoSel,
      righe: righe, foto_url: fotoUrl || "",
      token: (typeof tokenScrittura === "function" ? tokenScrittura() : "")
    })
  }).then(r => r.json()).then(r => cb(!!(r && r.ok))).catch(() => cb(false));
}
/* Fase 3 (V4.13): carica la foto + prova a leggerla via OCR lato backend.
   Risposta sempre "leggibile" (non no-cors), stesso pattern delle altre azioni.
   Non salva mai nulla da sola: al massimo aggiunge righe PROPOSTE (fonte:"ocr")
   a possRigheQuarto, da confermare/correggere come una riga scritta a mano. */
function leggiFoglioPossessi() {
  const fotoLocale = possFotoQuarto[possQuartoSel];
  if (!fotoLocale) { mostraToast("Allega prima una foto del foglio"); return; }
  const base = (typeof CONFIG !== "undefined" && CONFIG.APPS_SCRIPT_URL) || "";
  if (!base || base.indexOf("INCOLLA_QUI") === 0) { mostraToast("Backend non configurato"); return; }
  possLetturaInCorso = true;
  renderDebrief();
  fetch(base, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      azione: "LEGGI_FOGLIO_POSSESSI", id_partita: String(possGaraSel), quarto: possQuartoSel,
      foto_base64: fotoLocale, token: (typeof tokenScrittura === "function" ? tokenScrittura() : "")
    })
  }).then(r => r.json()).then(r => {
    possLetturaInCorso = false;
    if (!r || !r.ok) { mostraToast("Lettura non riuscita"); renderDebrief(); return; }
    if (r.url) possFotoUrlOcr[possQuartoSel] = r.url;   // evita un secondo upload a "Salva quarto"
    if (r.tabella_rilevata && Array.isArray(r.righe_suggerite) && r.righe_suggerite.length) {
      delete possTestoOcr[possQuartoSel];
      r.righe_suggerite.forEach(s => possRigheQuarto.push({
        giocatore_num: s.giocatore_num || "", esito: s.esito || "",
        area: !!s.area, opp2: !!s.opp2, zona: !!s.zona, tiro: s.tiro || "",
        gioco: s.gioco || "", fonte: "ocr"
      }));
      mostraToast(r.righe_suggerite.length + " righe proposte — controllale");
    } else {
      possTestoOcr[possQuartoSel] = r.testo_grezzo || "";
      mostraToast("Tabella non riconosciuta — testo grezzo come riferimento");
    }
    renderDebrief();
  }).catch(() => { possLetturaInCorso = false; mostraToast("Lettura non riuscita"); renderDebrief(); });
}

function caricaPossessi(idPartita, cb) {
  const base = (typeof CONFIG !== "undefined" && CONFIG.APPS_SCRIPT_URL) || "";
  if (!base || base.indexOf("INCOLLA_QUI") === 0) { cb(false); return; }
  const nomeCb = "bspPossCb_" + Date.now();
  const s = document.createElement("script");
  let done = false;
  const pulisci = () => { delete window[nomeCb]; if (s.parentNode) s.parentNode.removeChild(s); };
  window[nomeCb] = function (r) {
    done = true;
    if (r && r.ok && Array.isArray(r.possessi)) { possRighe = r.possessi; cb(true); }
    else cb(false);
    pulisci();
  };
  s.src = base + (base.indexOf("?") > -1 ? "&" : "?") +
    "action=getPossessi&id_partita=" + encodeURIComponent(idPartita) + "&callback=" + nomeCb;
  s.onerror = () => { if (!done) cb(false); pulisci(); };
  document.body.appendChild(s);
}

/* ==========================================================================
   Inserimento riga
   ========================================================================== */
function aggiungiRigaDebrief() {
  if (!possRigaTmp.giocatore_num || !possRigaTmp.esito) { mostraToast("Scegli giocatore ed esito"); return; }
  possRigheQuarto.push(Object.assign({}, possRigaTmp));
  possRigaTmp = rigaVuota();
  renderDebrief();
}
function rimuoviRigaDebrief(i) {
  possRigheQuarto.splice(i, 1);
  renderDebrief();
}
/* Rimette una riga già inserita (tipicamente una proposta OCR) nell'editor in
   cima, per correggerla invece di doverla ricreare da zero. */
function modificaRigaDebrief(i) {
  const r = possRigheQuarto[i];
  if (!r) return;
  possRigheQuarto.splice(i, 1);
  possRigaTmp = Object.assign(rigaVuota(), r);
  renderDebrief();
}
function salvaQuartoDebrief() {
  if (!possRigheQuarto.length) { mostraToast("Nessuna riga da salvare"); return; }
  mostraToast("Salvo…");
  const righe = possRigheQuarto.map((r, i) => Object.assign({}, r, {
    riga_n: i + 1,
    id_possesso: r.id_possesso || (typeof uuid === "function" ? uuid() : (Date.now() + "_" + i)),
    stato_riga: "confermata",
    fonte: r.fonte || "manuale",
    timestamp: r.timestamp || new Date().toISOString()
  }));
  const fotoLocale = possFotoQuarto[possQuartoSel];
  const urlGiaCaricata = possFotoUrlOcr[possQuartoSel];   // già su Drive via "Leggi foglio"
  const dopoUpload = (url) => {
    salvaPossessiQuarto(righe, url, ok => {
      if (!ok) { mostraToast("Salvataggio non riuscito"); return; }
      delete possFotoQuarto[possQuartoSel];
      delete possFotoUrlOcr[possQuartoSel];
      delete possTestoOcr[possQuartoSel];
      mostraToast("Quarto salvato");
      possCaricamento = true; renderDebrief();
      caricaPossessi(possGaraSel, () => {
        possCaricamento = false;
        possRigheQuarto = possRighe.filter(r => r.quarto === possQuartoSel);
        renderDebrief();
      });
    });
  };
  if (urlGiaCaricata) dopoUpload(urlGiaCaricata);
  else if (fotoLocale) caricaFotoPossessi(fotoLocale, url => dopoUpload(url || rigaFotoUrlPerQuarto(possQuartoSel)));
  else dopoUpload(rigaFotoUrlPerQuarto(possQuartoSel));
}

/* ==========================================================================
   Report — calcoli auto-contenuti (non serve lo stream ufficiale)
   ========================================================================== */
function nuovoAccPoss() { return { pt: 0, poss: 0, fgm: 0, fga: 0 }; }
function bumpAccPoss(o, pt, peso, isTiro, segnato) {
  o.pt += pt; o.poss += peso;
  if (isTiro) { o.fga++; if (segnato) o.fgm++; }
}
function pppDi(o) { return o.poss ? (o.pt / o.poss) : 0; }

function reportPossessi(righe) {
  const tot = nuovoAccPoss();
  let m3 = 0;
  const area = { si: nuovoAccPoss(), no: nuovoAccPoss() };
  const zona = { si: nuovoAccPoss(), no: nuovoAccPoss() };
  const tiroQ = { F: nuovoAccPoss(), R: nuovoAccPoss() };
  const perGioco = {};

  righe.forEach(r => {
    const def = ESITI_POSSESSO.find(e => e.k === r.esito);
    if (!def) return;
    const segnato = def.pt > 0;
    bumpAccPoss(tot, def.pt, def.peso, def.tiro, segnato);
    if (def.k === "3v") m3++;

    const haAttrib = def.tiro || def.k === "pp";   // AREA/ZONA hanno senso su tiro o palla persa
    if (haAttrib) {
      bumpAccPoss(r.area ? area.si : area.no, def.pt, def.peso, def.tiro, segnato);
      bumpAccPoss(r.zona ? zona.si : zona.no, def.pt, def.peso, def.tiro, segnato);
    }
    if (def.tiro && (r.tiro === "F" || r.tiro === "R")) {
      bumpAccPoss(tiroQ[r.tiro], def.pt, def.peso, def.tiro, segnato);
    }
    if (r.gioco) {
      perGioco[r.gioco] = perGioco[r.gioco] || nuovoAccPoss();
      bumpAccPoss(perGioco[r.gioco], def.pt, def.peso, def.tiro, segnato);
    }
  });

  const efg = tot.fga ? ((tot.fgm + 0.5 * m3) / tot.fga * 100) : null;
  return { tot: tot, efg: efg, area: area, zona: zona, tiroQ: tiroQ, perGioco: perGioco };
}

/* ==========================================================================
   RENDER
   ========================================================================== */
function popolaSelettoreGaraDebrief() {
  const sel = document.getElementById("debrief-gara-sel");
  if (!sel) return;
  const gare = typeof elencoPartite === "function" ? gareOrdinatePerDebrief() : [];
  sel.innerHTML = '<option value="">— scegli una gara —</option>' + gare.map(p =>
    '<option value="' + esc(p.id_partita) + '"' + (String(p.id_partita) === String(possGaraSel) ? " selected" : "") + '>' +
    (p.stato === "In corso" ? "🔴 " : "") +
    esc((typeof nomePartitaDaCalendario === "function" ? nomePartitaDaCalendario(p) : (p.avversario || "")) +
      " · " + (p.stato || "")) + '</option>').join('');
}

function renderDebrief() {
  popolaSelettoreGaraDebrief();
  document.querySelectorAll("#debrief-quarti button").forEach(b =>
    b.classList.toggle("attivo", b.dataset.quarto === possQuartoSel));
  document.querySelectorAll("#debrief-tabs button").forEach(b =>
    b.classList.toggle("attivo", b.dataset.dtab === possTab));

  const body = document.getElementById("debrief-body");
  if (!body) return;
  if (!possGaraSel) { body.innerHTML = '<div class="st-hint">Scegli una gara dal menu in alto.</div>'; return; }
  if (possCaricamento) { body.innerHTML = '<div class="st-hint">Carico…</div>'; return; }
  try {
    if (possTab === "report") body.innerHTML = vistaReportDebrief();
    else if (possTab === "giochi") body.innerHTML = vistaGiochiDebrief();
    else body.innerHTML = vistaInserimentoDebrief();
  } catch (e) {
    body.innerHTML = '<div class="st-hint">Errore: ' + esc(e && e.message || e) + '</div>';
  }
}

function toggleAttribHtml(key, label, on) {
  return '<button class="ps-tog' + (on ? " on" : "") + '" data-attrib="' + key + '">' + label + '</button>';
}
function tiroFrHtml(val) {
  return '<span class="ps-fr">' +
    '<button class="ps-tog' + (val === "F" ? " on" : "") + '" data-tiro="F">Forz.</button>' +
    '<button class="ps-tog' + (val === "R" ? " on" : "") + '" data-tiro="R">Ritmo</button>' +
  '</span>';
}
function rigaListaHtml(r, i) {
  const def = ESITI_POSSESSO.find(e => e.k === r.esito);
  const bits = [];
  if (r.gioco) bits.push(esc(r.gioco));
  bits.push("#" + esc(r.giocatore_num) + " " + (def ? def.lbl : esc(r.esito)));
  if (r.area) bits.push("area");
  if (r.opp2) bits.push("2ªopp");
  if (r.zona) bits.push("zona");
  if (r.tiro) bits.push(r.tiro);
  const ocr = r.fonte === "ocr";
  return '<div class="ps-riga-lista' + (ocr ? " ps-riga-ocr" : "") + '"><span class="ps-riga-n">' + (i + 1) + '.</span>' +
    '<button class="ps-riga-testo" data-edit="' + i + '">' +
      (ocr ? '<span class="ps-badge-ocr">OCR</span>' : '') + bits.join(" · ") +
    '</button>' +
    '<button class="ps-del" data-i="' + i + '">&times;</button></div>';
}

function vistaInserimentoDebrief() {
  const roster = rosterPerPossessi();
  const fotoLocale = possFotoQuarto[possQuartoSel];
  const fotoSrc = fotoLocale || rigaFotoUrlPerQuarto(possQuartoSel);
  const letturaBtn = fotoLocale
    ? (possLetturaInCorso
      ? '<button class="btn-annulla-modale" disabled>Leggo il foglio…</button>'
      : '<button class="btn-annulla-modale" id="ps-leggi-foglio">🔎 ' +
        (possFotoUrlOcr[possQuartoSel] !== undefined || possTestoOcr[possQuartoSel] !== undefined ? "Rileggi foglio" : "Leggi foglio (beta)") +
        '</button>')
    : '';
  const fotoBlock = fotoLocale
    ? '<div class="ps-foto"><img src="' + fotoLocale + '" alt="Foglio possessi">' +
      '<div class="ps-foto-azioni"><button class="btn-annulla-modale" id="ps-foto-cambia">Cambia foto</button>' + letturaBtn + '</div></div>'
    : (fotoSrc
      ? '<div class="ps-foto"><a href="' + esc(fotoSrc) + '" target="_blank" rel="noopener">Foto già caricata per ' + esc(possQuartoSel) + ' — apri</a>' +
        '<button class="btn-annulla-modale" id="ps-foto-cambia">Sostituisci foto</button></div>'
      : '<button class="btn-conferma" id="ps-foto-scatta">📷 Allega foto del foglio</button>');
  const testoOcr = possTestoOcr[possQuartoSel];
  const testoOcrBlock = testoOcr
    ? '<details class="ps-ocr-testo"><summary>Tabella non riconosciuta — testo letto dalla foto (riferimento)</summary><pre>' + esc(testoOcr) + '</pre></details>'
    : '';

  const giocBtns = roster.length ? roster.map(g =>
    '<button class="ps-num' + (String(possRigaTmp.giocatore_num) === String(g.numero) ? " on" : "") + '" data-num="' + esc(g.numero) + '">#' + esc(g.numero) +
    (g.nickname ? '<small>' + esc(g.nickname) + '</small>' : '') + '</button>').join('')
    : '<div class="st-hint">Nessun convocato/roster trovato per questa gara.</div>';

  const esitoBtns = ESITI_POSSESSO.map(e =>
    '<button class="ps-esito' + (possRigaTmp.esito === e.k ? " on" : "") + '" data-esito="' + e.k + '">' + e.lbl + '</button>').join('');

  const def = ESITI_POSSESSO.find(e => e.k === possRigaTmp.esito);
  const mostraAttrib = !def || def.tiro || def.k === "pp";

  const giocoChips = possLegenda.map(g =>
    '<button class="ps-chip' + (possRigaTmp.gioco === g.codice ? " on" : "") + '" data-gioco="' + esc(g.codice) + '">' + esc(g.codice) + '</button>').join('') +
    '<button class="ps-chip ps-chip-add" id="ps-gioco-add">+ nuovo</button>';

  const righeLista = possRigheQuarto.length
    ? possRigheQuarto.map(rigaListaHtml).join('')
    : '<div class="st-hint">Nessuna riga ancora per ' + esc(possQuartoSel) + '.</div>';

  return fotoBlock + testoOcrBlock +
    '<div class="ps-sez"><div class="ps-tit">Chi chiude</div><div class="ps-griglia-num">' + giocBtns + '</div></div>' +
    '<div class="ps-sez"><div class="ps-tit">Esito</div><div class="ps-griglia-esito">' + esitoBtns + '</div></div>' +
    (mostraAttrib ?
      '<div class="ps-sez"><div class="ps-tit">Attributi</div><div class="ps-attrib">' +
        toggleAttribHtml("area", "Area", possRigaTmp.area) +
        toggleAttribHtml("opp2", "2ª opp.", possRigaTmp.opp2) +
        toggleAttribHtml("zona", "vs zona", possRigaTmp.zona) +
        tiroFrHtml(possRigaTmp.tiro) +
      '</div></div>' : '') +
    '<div class="ps-sez"><div class="ps-tit">Gioco</div><div class="ps-griglia-esito">' + giocoChips + '</div></div>' +
    '<button class="btn-conferma" id="ps-aggiungi">Aggiungi riga</button>' +
    '<div class="ps-tit" style="margin-top:14px">Righe ' + esc(possQuartoSel) + ' (' + possRigheQuarto.length + ')</div>' +
    '<div id="ps-lista">' + righeLista + '</div>' +
    '<button class="btn-conferma" id="ps-salva-quarto">Salva quarto</button>';
}

function vistaReportDebrief() {
  const righe = possRighe.filter(r => String(r.id_partita) === String(possGaraSel))
    .concat(possRigheQuarto.filter(r => !r.id_possesso));   // include bozza non ancora salvata
  if (!righe.length) return '<div class="st-hint">Nessun possesso salvato per questa gara.</div>';
  const bozza = righe.some(r => r.stato_riga !== "confermata");
  const rep = reportPossessi(righe);

  const card = (tit, val, nota) =>
    '<div class="adv-card"><div class="adv-tit">' + tit + '</div>' +
    '<div class="adv-vals"><span class="noi">' + val + '</span></div>' +
    (nota ? '<div class="adv-nota">' + nota + '</div>' : '') + '</div>';
  const p = o => dec(pppDi(o), 2);

  let html = (bozza ? '<div class="st-hint">Bozza — alcune righe non ancora salvate/confermate.</div>' : '') +
    '<div class="adv-legenda"><span class="noi">Righe registrate: ' + righe.length + '</span></div>' +
    '<div class="adv-griglia">' +
      card('PPP', p(rep.tot), 'punti per possesso · libero pesato 0,44') +
      card('eFG%', rep.efg != null ? dec(rep.efg, 1) + '%' : '–', '(FGM + 0,5·3PM) / FGA') +
      card('PPP con area', p(rep.area.si), rep.area.si.poss ? '' : 'nessun dato') +
      card('PPP senza area', p(rep.area.no), rep.area.no.poss ? '' : 'nessun dato') +
      card('PPP vs zona', p(rep.zona.si), rep.zona.si.poss ? '' : 'nessun dato') +
      card('PPP vs uomo', p(rep.zona.no), rep.zona.no.poss ? '' : 'nessun dato') +
      card('PPP tiro forzato', p(rep.tiroQ.F), rep.tiroQ.F.poss ? '' : 'nessun dato') +
      card('PPP tiro in ritmo', p(rep.tiroQ.R), rep.tiroQ.R.poss ? '' : 'nessun dato') +
    '</div>';

  const giochi = Object.keys(rep.perGioco);
  if (giochi.length) {
    html += '<div class="adv-tit" style="margin-top:14px">Per gioco</div>' +
      '<div class="st-scroll"><table class="st-box"><thead><tr><th>Gioco</th><th>Poss.</th><th>PPP</th></tr></thead><tbody>' +
      giochi.map(g => {
        const o = rep.perGioco[g];
        return '<tr><td class="st-g">' + esc(g) + '</td><td>' + dec(o.poss, 1) + '</td><td>' + dec(pppDi(o), 2) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  html += '<div class="st-hint">Le percentuali/PPP sono calcolate sui totali, non come media di parziali.</div>';
  return html;
}

function vistaGiochiDebrief() {
  const righe = possLegenda.map(g =>
    '<tr><td class="st-n">' + esc(g.codice) + '</td><td class="st-g">' + esc(g.nome || "") + '</td>' +
    '<td><button class="ps-del" data-rm="' + esc(g.codice) + '">&times;</button></td></tr>').join('');
  return '<div class="st-hint">Legenda locale su questo dispositivo — cresce quando aggiungi codici nuovi durante la stagione.</div>' +
    '<table class="st-box"><thead><tr><th>Codice</th><th>Nome</th><th></th></tr></thead><tbody>' + righe + '</tbody></table>' +
    '<button class="btn-conferma" id="ps-gioco-add2" style="margin-top:10px">+ Nuovo codice</button>';
}

/* ==========================================================================
   rotazioni.js — Rotation chart (Altro → Analisi stagione → 🔄 Rotazioni)
   Chi è in campo minuto per minuto sulla stagione filtrata + margine di
   squadra per minuto. Sola lettura su boxGaraSingola/calcolaBox (stint già
   pronti), eventiPuliti, nomeAnalisi, elencoPartite, cacheEventiStagione —
   tutti già globali da analisi.js/stats.js. Filtri: copia INDIPENDENTE di
   quelli di Analisi stagione (stessa forma, stato proprio, non condiviso).
   ========================================================================== */

let filtriRotazioni = { competizione: "Campionato", campo: "tutte", esito: "tutte", stagione: "2026/27" };

/* ---------- selezione gare (copia di garePerAnalisi, legge filtriRotazioni) ---------- */
function garePerRotazioni() {
  const byMatch = (cacheEventiStagione && cacheEventiStagione.byMatch) || {};
  const f = filtriRotazioni;
  return elencoPartite()
    .filter(p => String(p.stato) === "Terminata")
    .filter(p => (p.tipo || "Campionato") === f.competizione)
    .filter(p => f.stagione === "tutte" || (p.stagione || "2026/27") === f.stagione)
    .filter(p => f.campo === "tutte" || (p.luogo || "Casa") === f.campo)
    .map(p => {
      const raw = byMatch[String(p.id_partita)] || null;
      const finale = raw ? punteggioDaEventi(eventiPuliti(raw)) : null;
      return { partita: p, eventi: raw, finale: finale, vinta: finale ? finale.MIA > finale.OPP : null, mancante: !raw };
    })
    .filter(g => {
      if (f.esito === "tutte") return true;
      if (!g.finale) return false;
      return f.esito === "vinte" ? g.vinta : !g.vinta;
    })
    .sort((a, b) => String(a.partita.data_ora || "").localeCompare(String(b.partita.data_ora || "")));
}

/* ---------- tempo-rimanente-nel-periodo → tempo-trascorso-dall'inizio-gara ---------- */
function inizioSecPeriodo(quarto) {
  const ord = (typeof ordQuarto_ === "function") ? ordQuarto_(quarto) : 1;
  let sec = 0;
  for (let i = 1; i < ord; i++) sec += (i <= CONFIG.QUARTI_REGOLAMENTARI) ? CONFIG.DURATA_QUARTO_SEC : CONFIG.DURATA_OT_SEC;
  return sec;
}
function elapsedAt(quarto, tempoRimastoSec) {
  return inizioSecPeriodo(quarto) + (periodoSecQ(quarto) - tempoRimastoSec);
}

/* ==========================================================================
   Calcolo: presenza % per giocatore×minuto + margine di squadra per minuto
   ========================================================================== */
function calcolaRotazioni() {
  const gare = garePerRotazioni().filter(g => g.eventi && g.eventi.length);
  const presenza = {};      // nome → { num, nome, minutiSec:[], totSec }
  const denomMin = [];      // bucket → quante gare hanno raggiunto quel minuto
  const margineMin = [];    // bucket → somma margine (MIA-OPP) segnato in quel minuto
  let maxBucket = 0;

  gare.forEach(g => {
    const r = boxGaraSingola(g);
    const stints = (r.box && r.box.stints) || [];

    let fineGara = 0;
    stints.forEach(s => { fineGara = Math.max(fineGara, elapsedAt(s.quarto, s.tFine)); });
    const bucketsGara = Math.max(1, Math.ceil(fineGara / 60));
    maxBucket = Math.max(maxBucket, bucketsGara);
    for (let m = 0; m < bucketsGara; m++) denomMin[m] = (denomMin[m] || 0) + 1;

    stints.forEach(s => {
      const start = elapsedAt(s.quarto, s.tIn), end = elapsedAt(s.quarto, s.tFine);
      if (end <= start) return;
      (s.quintetto || []).forEach(num => {
        const nome = (typeof nomeAnalisi === "function" ? nomeAnalisi(num) : "") || ("#" + num);
        presenza[nome] = presenza[nome] || { num: num, nome: nome, minutiSec: [], totSec: 0 };
        presenza[nome].totSec += (end - start);
        const mS = Math.floor(start / 60), mE = Math.floor((end - 0.001) / 60);
        for (let m = mS; m <= mE; m++) {
          const overlap = Math.max(0, Math.min(end, (m + 1) * 60) - Math.max(start, m * 60));
          if (overlap > 0) presenza[nome].minutiSec[m] = (presenza[nome].minutiSec[m] || 0) + overlap;
        }
      });
    });

    // margine per minuto: dai delta di punteggio_progressivo, come stintsDaEventi/punteggioDaEventi
    let prevSc = { MIA: 0, OPP: 0 };
    (eventiPuliti(g.eventi) || []).forEach(e => {
      const m = /^(\d+)-(\d+)$/.exec(String(e.punteggio_progressivo || ""));
      if (!m) return;
      const sc = { MIA: +m[1], OPP: +m[2] };
      const delta = (sc.MIA - prevSc.MIA) - (sc.OPP - prevSc.OPP);
      if (delta) {
        const bucket = Math.floor(elapsedAt(e.quarto, tempoInSec(e.tempo_partita)) / 60);
        margineMin[bucket] = (margineMin[bucket] || 0) + delta;
      }
      prevSc = sc;
    });
  });

  const righe = Object.keys(presenza).map(k => presenza[k])
    .map(p => ({
      num: p.num, nome: p.nome, totMin: p.totSec / 60,
      pct: Array.from({ length: maxBucket }, (_, m) => {
        const d = denomMin[m] || 0;
        return d ? Math.min(100, (p.minutiSec[m] || 0) / 60 / d * 100) : 0;
      })
    }))
    .filter(p => p.totMin > 0)
    .sort((a, b) => b.totMin - a.totMin);

  const margine = Array.from({ length: maxBucket }, (_, m) => margineMin[m] || 0);
  return { righe: righe, margine: margine, maxBucket: maxBucket, nGare: gare.length };
}

/* ==========================================================================
   Apertura + filtri (copia indipendente della barra di Analisi stagione)
   ========================================================================== */
function apriRotazioni() {
  if (!cacheEventiStagione && typeof caricaCacheAnalisi === "function") caricaCacheAnalisi();
  navigaA("rotazioni");
  renderRotazioni();
  const scaduta = !cacheEventiStagione || (Date.now() - (cacheEventiStagione.updatedAt || 0) > (typeof ANALISI_TTL_MS !== "undefined" ? ANALISI_TTL_MS : 3600000));
  if (scaduta && typeof caricaEventiStagione === "function") caricaEventiStagione(() => renderRotazioni());
}
function chipGruppoRot(fil, valori) {
  return '<div class="an-chip-grp" data-fil="' + fil + '">' +
    valori.map(v =>
      '<button class="an-chip' + (filtriRotazioni[fil] === v[0] ? ' attivo' : '') +
      '" data-val="' + v[0] + '">' + esc(v[1]) + '</button>').join('') +
    '</div>';
}
function barraFiltriRotazioni() {
  return chipGruppoRot("competizione", [["Campionato", "Campionato"], ["Amichevole", "Amichevoli"]]) +
    chipGruppoRot("campo", [["tutte", "Tutte"], ["Casa", "Casa"], ["Trasferta", "Trasferta"]]) +
    chipGruppoRot("esito", [["tutte", "Tutte"], ["vinte", "Vinte"], ["perse", "Perse"]]);
}
function impostaFiltroRotazioni(fil, val) {
  if (!(fil in filtriRotazioni) || filtriRotazioni[fil] === val) return;
  filtriRotazioni[fil] = val;
  renderRotazioni();
}

/* ==========================================================================
   RENDER
   ========================================================================== */
function renderRotazioni() {
  const filtriEl = document.getElementById("rot-filtri");
  const body = document.getElementById("rot-body");
  if (!body || !filtriEl) return;
  filtriEl.innerHTML = barraFiltriRotazioni();

  if (!cacheEventiStagione) { body.innerHTML = '<div class="st-hint">Nessun dato in cache — apri prima Analisi stagione.</div>'; return; }
  try {
    body.innerHTML = vistaRotazioniChart(calcolaRotazioni());
  } catch (e) {
    body.innerHTML = '<div class="st-hint">Errore: ' + esc(e && e.message || e) + '</div>';
  }
}

function vistaRotazioniChart(r) {
  if (!r.righe.length) return '<div class="st-hint">Nessuna gara conclusa con questi filtri.</div>';
  const cols = r.maxBucket;

  const tickRow = '<div class="rot-riga-corpo rot-tick-row">' +
    Array.from({ length: cols }, (_, m) =>
      '<div class="rot-cella rot-tick' + (m % 5 === 0 ? ' rot-sep' : '') + '">' + (m % 5 === 0 ? m : '') + '</div>'
    ).join('') + '</div>';

  const righeCorpo = r.righe.map(p =>
    '<div class="rot-riga-corpo">' +
      p.pct.map((v, m) =>
        '<div class="rot-cella rot-presenza' + (m % 5 === 0 ? ' rot-sep' : '') +
        '" style="opacity:' + Math.max(0, v / 100).toFixed(2) + '"></div>'
      ).join('') +
    '</div>'
  ).join('');

  const maxMargine = Math.max(1, ...r.margine.map(v => Math.abs(v)));
  const scalaMargine = Math.min(maxMargine, 6) || 1;   // satura oltre ±6 punti/minuto
  const margineCorpo = '<div class="rot-riga-corpo">' +
    r.margine.map((v, m) => {
      const cls = v > 0 ? "rot-margine-pos" : (v < 0 ? "rot-margine-neg" : "rot-margine-zero");
      const op = v === 0 ? 0.15 : Math.min(1, Math.abs(v) / scalaMargine);
      return '<div class="rot-cella ' + cls + (m % 5 === 0 ? ' rot-sep' : '') + '" style="opacity:' + op.toFixed(2) + '"></div>';
    }).join('') +
  '</div>';

  const labelsPlayer = r.righe.map(p =>
    '<div class="rot-label" title="' + esc(p.nome) + '">' + esc(p.nome) + '</div>').join('');

  return '<div class="st-hint">' + r.nGare + ' gare con questi filtri · minuti di gara sull\'asse orizzontale, colore = presenza in campo.</div>' +
    '<div class="rot-wrap">' +
      '<div class="rot-labels">' +
        '<div class="rot-label rot-label-head">&nbsp;</div>' +
        labelsPlayer +
        '<div class="rot-label rot-label-margine">Margine/min</div>' +
      '</div>' +
      '<div class="rot-scroll st-scroll"><div class="rot-grid">' +
        tickRow + righeCorpo + margineCorpo +
      '</div></div>' +
    '</div>' +
    '<div class="rot-legenda">' +
      '<div class="rot-legenda-voce"><span class="rot-lg-swatch rot-lg-presenza"></span> Presenza in campo (0→100%)</div>' +
      '<div class="rot-legenda-voce"><span class="rot-lg-swatch rot-lg-neg"></span>Margine −  <span class="rot-lg-swatch rot-lg-zero"></span>0  <span class="rot-lg-swatch rot-lg-pos"></span>Margine +</div>' +
    '</div>' +
    '<div class="st-hint">"Margine/min" è il saldo punti segnato/subito in quel minuto sulle gare filtrate — non un vero Net Rating ' +
    '(richiederebbe stimare i possessi su intervalli di 60s, troppo rumoroso). Righe raggruppate per nome anagrafica corrente, non per ' +
    'numero di maglia (stabile anche se il numero è cambiato tra due gare della stagione).</div>';
}

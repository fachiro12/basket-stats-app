/* ==========================================================================
   rotazioni.js — Rotation chart (Altro → Analisi stagione → 🔄 Rotazioni)
   Chi è in campo minuto per minuto sulla stagione filtrata + margine di
   squadra per minuto. Sola lettura su boxGaraSingola/calcolaBox (stint già
   pronti), eventiPuliti, nomeAnalisi, elencoPartite, cacheEventiStagione —
   tutti già globali da analisi.js/stats.js. Filtri: copia INDIPENDENTE di
   quelli di Analisi stagione (stessa forma, stato proprio, non condiviso).
   ========================================================================== */

let filtriRotazioni = { competizione: "Campionato", campo: "tutte", esito: "tutte", stagione: "2026/27" };
let rotTab = "chart";                              // "chart" | "lineup"
let rotLineupSort = { col: "min", dir: -1 };
let rotLineupFiltroTesto = "";                      // uno o più nomi separati da virgola (AND)
let rotLineupNascondiRumore = true;                 // nasconde i quintetti con minuti trascurabili
const ROT_LINEUP_PCT_RUMORE = 0.05;                 // soglia = 5% della media dei 3 quintetti più usati (scala da sola in stagione)
let rotLineupMostraDifesa = false;                  // colonne PTS SUB/REC/OREB%/DREB%/REB SQ
let rotLineupSoglie = { pace: null, pct2: null, pct3: null, ftr: null, tovpct: null };   // filtri "≥" in AND tra loro

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
function cambiaTabRot(tab) {
  if (tab !== "chart" && tab !== "lineup") return;
  rotTab = tab;
  renderRotazioni();
}
function impostaOrdineLineup(col) {
  if (!col) return;
  if (rotLineupSort.col === col) rotLineupSort.dir *= -1;
  else rotLineupSort = { col: col, dir: (col === "quintetto") ? 1 : -1 };
  renderRotazioni();
}
/* renderRotazioni rifà l'innerHTML del body (distrugge/ricrea gli input): senza
   questo si perderebbe il focus/cursore a ogni carattere digitato in un campo
   testo/numero che triggera un re-render a ogni tasto. */
function rotRestoraFocus(id) {
  const inp = document.getElementById(id);
  if (inp) { inp.focus(); const v = inp.value; try { inp.setSelectionRange(v.length, v.length); } catch (e) {} }
}
function impostaFiltroTestoLineup(testo) {
  rotLineupFiltroTesto = String(testo || "");
  renderRotazioni();
  rotRestoraFocus("rot-lineup-filtro");
}
function impostaNascondiRumoreLineup(on) {
  rotLineupNascondiRumore = !!on;
  renderRotazioni();
}
function impostaMostraDifesaLineup(on) {
  rotLineupMostraDifesa = !!on;
  renderRotazioni();
}
function impostaSogliaLineup(campo, valStr) {
  if (!(campo in rotLineupSoglie)) return;
  const v = String(valStr || "").trim();
  rotLineupSoglie[campo] = v === "" ? null : Number(v.replace(",", "."));
  renderRotazioni();
  rotRestoraFocus("rot-lineup-min-" + campo);
}

/* ==========================================================================
   RENDER
   ========================================================================== */
function renderRotazioni() {
  const filtriEl = document.getElementById("rot-filtri");
  const body = document.getElementById("rot-body");
  if (!body || !filtriEl) return;
  filtriEl.innerHTML = barraFiltriRotazioni();
  document.querySelectorAll("#rot-tabs button").forEach(b =>
    b.classList.toggle("attivo", b.dataset.rtab === rotTab));

  if (!cacheEventiStagione) { body.innerHTML = '<div class="st-hint">Nessun dato in cache — apri prima Analisi stagione.</div>'; return; }
  try {
    body.innerHTML = (rotTab === "lineup") ? vistaLineupBox(calcolaLineupBox()) : vistaRotazioniChart(calcolaRotazioni());
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

/* ==========================================================================
   QUINTETTI — Lineup Advanced Box Score
   calcolaBox esistente non fa al caso nostro qui: il punteggio di squadra non è
   mai sommato evento-per-evento (a fine gara si imposta al punteggio finale),
   perché per un box-score dell'intera gara basta così. Qui invece serve il box
   maturato mentre UN quintetto specifico era in campo, quindi si accumula
   incrementalmente evento per evento — stesso principio già usato da
   stintsDaEventi per il plusMinus di ogni stint. Una volta ottenuto il box per
   stint, lo si somma per quintetto e si passa a calcolaAdvanced() già
   esistente (stessa metodologia OFF/DEF/NET/PACE/TS% di tutta l'app).
   ========================================================================== */
function statVuoteLocaleRot() { return { pt: 0, m2: 0, a2: 0, m3: 0, a3: 0, ftm: 0, fta: 0, ro: 0, rd: 0, rq: 0, pp: 0, pr: 0 }; }
function accumulaEventoLocaleRot(team, ev) {
  const sq = ev.squadra === "OPP" ? "OPP" : "MIA";
  const t = ev.tipo_evento, d = String(ev.dettaglio || "");
  const T = team[sq];
  if (t === "TIRO") {
    const pt = Number(ev.punti_segnati) || 0;
    const seg = d.indexOf("SEGNATO") > -1 || pt >= 2;
    const tre = /3/.test(d.split("_")[0]) || pt === 3;
    if (tre) { T.a3++; if (seg) T.m3++; } else { T.a2++; if (seg) T.m2++; }
    T.pt += pt;
  } else if (t === "FALLO_SUBITO") {
    const es = String(ev.esito_tl || "").split(",").map(x => x.trim()).filter(Boolean);
    const made = es.filter(v => v.toUpperCase() === "SI").length;
    T.ftm += made; T.fta += es.length; T.pt += made;
  } else if (t === "FALLO_FATTO") {
    const es = String(ev.esito_tl || "").split(",").map(x => x.trim()).filter(Boolean);
    const made = es.filter(v => v.toUpperCase() === "SI").length;
    const O = team[sq === "MIA" ? "OPP" : "MIA"];
    O.ftm += made; O.fta += es.length; O.pt += made;
  } else if (t === "RECUPERO") {
    T.pr++;
    team[sq === "MIA" ? "OPP" : "MIA"].pp++;   // specularità, come in calcolaBox
  } else if (t === "PALLA_PERSA") {
    T.pp++;
  } else if (t === "RIMBALZO") {
    if (d === "OFFENSIVO") T.ro++;
    else if (d === "DIFENSIVO") T.rd++;
    else T.rq++;   // "SQUADRA"
  }
}

function calcolaLineupBox() {
  const gare = garePerRotazioni().filter(g => g.eventi && g.eventi.length);
  const gruppi = {};   // chiave "nome · nome · ..." → { nomi, minSec, pmStint, team:{MIA,OPP}, gareSet }

  gare.forEach(g => {
    const r = boxGaraSingola(g);
    const stints = (r.box && r.box.stints) || [];
    if (!stints.length) return;

    const range = stints.map(s => ({ start: elapsedAt(s.quarto, s.tIn), end: elapsedAt(s.quarto, s.tFine), s: s }));
    const localBox = range.map(() => ({ MIA: statVuoteLocaleRot(), OPP: statVuoteLocaleRot() }));

    let idx = 0;
    (eventiPuliti(g.eventi) || []).forEach(e => {
      const t = elapsedAt(e.quarto, tempoInSec(e.tempo_partita));
      // ">" e non ">=": un evento registrato allo stesso secondo esatto del
      // cambio (tempo_partita ha risoluzione al secondo, capita) resta nello
      // stint che si sta chiudendo, non in quello nuovo — altrimenti un
      // canestro segnato "insieme" alla sostituzione finirebbe accreditato
      // al quintetto sbagliato.
      while (idx < range.length - 1 && t > range[idx].end) idx++;
      accumulaEventoLocaleRot(localBox[idx], e);
    });

    const vistiGara = {};
    range.forEach((rg, i) => {
      const q = (rg.s.quintetto || []).slice();
      if (q.length !== 5) return;   // dato anomalo (rarissimo): salto questo stint
      const nomi = q.map(n => ((typeof nomeAnalisi === "function" ? nomeAnalisi(n) : "") || ("#" + n))).sort();
      const chiave = nomi.join(" · ");
      if (!gruppi[chiave]) gruppi[chiave] = { nomi: nomi, minSec: 0, pmStint: 0, team: { MIA: statVuoteLocaleRot(), OPP: statVuoteLocaleRot() }, gareSet: {} };
      const grp = gruppi[chiave];
      grp.minSec += rg.s.durSec;
      grp.pmStint += rg.s.plusMinus || 0;
      const lb = localBox[i];
      ["MIA", "OPP"].forEach(sq => { Object.keys(grp.team[sq]).forEach(k => { grp.team[sq][k] += lb[sq][k]; }); });
      vistiGara[chiave] = 1;
    });
    Object.keys(vistiGara).forEach(k => { gruppi[k].gareSet[g.partita.id_partita] = 1; });
  });

  const righe = Object.keys(gruppi).map(k => {
    const grp = gruppi[k];
    const minuti = grp.minSec / 60;
    const adv = calcolaAdvanced({ team: grp.team }, minuti || 0.1);
    const A = grp.team.MIA;
    const fga = A.a2 + A.a3, fgm = A.m2 + A.m3;
    return {
      nomi: grp.nomi, chiave: k,
      gp: Object.keys(grp.gareSet).length,
      min: minuti, pt: A.pt,
      ortg: adv.ortg, drtg: adv.drtg, net: adv.net, poss: adv.possA, pace: adv.pace,
      fgm: fgm, fga: fga, fgpct: fga ? fgm / fga * 100 : null,
      m2: A.m2, a2: A.a2, pct2: A.a2 ? A.m2 / A.a2 * 100 : null,
      m3: A.m3, a3: A.a3, pct3: A.a3 ? A.m3 / A.a3 * 100 : null,
      efg: adv.efgA,
      ftm: A.ftm, fta: A.fta, ftpct: A.fta ? A.ftm / A.fta * 100 : null,
      ftr: fga ? A.fta / fga : 0,
      ts: adv.tsA,
      tov: A.pp, tovpct: adv.possA ? A.pp / adv.possA * 100 : 0,
      ptOpp: grp.team.OPP.pt, rec: A.pr, orb: adv.orbA, drb: adv.drbA, rq: A.rq,
      pmStint: grp.pmStint   // per verifica incrociata (non mostrato in tabella)
    };
  });
  return { righe: righe, nGare: gare.length };
}

const COLS_LINEUP_BASE = [
  ["quintetto", "Quintetto"], ["gp", "GP"], ["min", "MIN"], ["pt", "PTS"],
  ["ortg", "OFF RTG"], ["drtg", "DEF RTG"], ["net", "NET RTG"],
  ["poss", "POSS"], ["pace", "PACE"],
  [null, "FGM/FGA"], ["fgpct", "FG%"],
  [null, "2PM/2PA"], ["pct2", "2P%"],
  [null, "3PM/3PA"], ["pct3", "3P%"],
  ["efg", "EFG%"],
  [null, "FTM/FTA"], ["ftpct", "FT%"], ["ftr", "FT Ratio"],
  ["ts", "TS%"], ["tov", "TOV"], ["tovpct", "TOV%"]
];
const COLS_LINEUP_DIFESA = [
  ["ptOpp", "PTS SUB"], ["rec", "REC"], ["orb", "OREB%"], ["drb", "DREB%"], ["rq", "REB SQ"]
];
/* soglie "≥" impostabili — chiave campo dati, etichetta, decimali */
const SOGLIE_LINEUP = [
  ["pace", "Pace ≥", 1], ["pct2", "2P% ≥", 1], ["pct3", "3P% ≥", 1], ["ftr", "FT Ratio ≥", 2], ["tovpct", "TOV% ≥", 1]
];

function vistaLineupBox(r) {
  if (!r.righe.length) return '<div class="st-hint">Nessuna gara conclusa con questi filtri.</div>';
  const cols = COLS_LINEUP_BASE.concat(rotLineupMostraDifesa ? COLS_LINEUP_DIFESA : []);

  // soglia "rumore" relativa: % della media minuti dei 3 quintetti più usati,
  // calcolata sull'insieme COMPLETO (prima di ricerca/soglie numeriche, che non
  // devono far "scivolare" la soglia) — così scala da sola con l'avanzare della
  // stagione invece di restare fissa a un numero di minuti scelto oggi.
  const top3 = r.righe.slice().sort((a, b) => b.min - a.min).slice(0, 3);
  const mediaTop3 = top3.length ? top3.reduce((s, x) => s + x.min, 0) / top3.length : 0;
  const sogliaRumore = mediaTop3 * ROT_LINEUP_PCT_RUMORE;

  let righe = r.righe.slice();
  if (rotLineupNascondiRumore) righe = righe.filter(x => x.min > sogliaRumore);

  const termini = rotLineupFiltroTesto.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  if (termini.length) righe = righe.filter(x => {
    const chiaveL = x.chiave.toLowerCase();
    return termini.every(t => chiaveL.indexOf(t) > -1);
  });

  SOGLIE_LINEUP.forEach(s => {
    const campo = s[0], soglia = rotLineupSoglie[campo];
    if (soglia != null && !Number.isNaN(soglia)) righe = righe.filter(x => (x[campo] != null ? x[campo] : -Infinity) >= soglia);
  });

  const dir = rotLineupSort.dir, col = rotLineupSort.col;
  righe.sort((a, b) => {
    const va = col === "quintetto" ? a.chiave : (a[col] == null ? -Infinity : a[col]);
    const vb = col === "quintetto" ? b.chiave : (b[col] == null ? -Infinity : b[col]);
    if (col === "quintetto") return va.localeCompare(vb) * dir;
    if (va === vb) return 0;
    return (va < vb ? -1 : 1) * dir;
  });

  const thead = '<tr>' + cols.map(c =>
    (c[0]
      ? '<th data-sort="' + c[0] + '"' + (rotLineupSort.col === c[0] ? ' class="an-sorted"' : '') + '>' +
        c[1] + (rotLineupSort.col === c[0] ? (dir < 0 ? ' ▾' : ' ▴') : '') + '</th>'
      : '<th>' + c[1] + '</th>')).join('') + '</tr>';

  const perc = v => v == null ? '–' : dec(v, 1) + '%';
  const celleDifesa = x => !rotLineupMostraDifesa ? '' :
    '<td>' + x.ptOpp + '</td><td>' + x.rec + '</td><td>' + perc(x.orb) + '</td><td>' + perc(x.drb) + '</td><td>' + x.rq + '</td>';
  const corpo = righe.length ? righe.map(x =>
    '<tr>' +
      '<td class="st-g rot-quintetto-cella" title="' + esc(x.chiave) + '">' + esc(x.nomi.join(', ')) + '</td>' +
      '<td>' + x.gp + '</td>' +
      '<td>' + mmss(x.min) + '</td>' +
      '<td class="st-pt">' + x.pt + '</td>' +
      '<td>' + dec(x.ortg, 1) + '</td>' +
      '<td>' + dec(x.drtg, 1) + '</td>' +
      '<td class="' + (x.net >= 0 ? "pos" : "neg") + '">' + (x.net >= 0 ? "+" : "") + dec(x.net, 1) + '</td>' +
      '<td>' + dec(x.poss, 1) + '</td>' +
      '<td>' + dec(x.pace, 1) + '</td>' +
      '<td>' + x.fgm + '/' + x.fga + '</td><td>' + perc(x.fgpct) + '</td>' +
      '<td>' + x.m2 + '/' + x.a2 + '</td><td>' + perc(x.pct2) + '</td>' +
      '<td>' + x.m3 + '/' + x.a3 + '</td><td>' + perc(x.pct3) + '</td>' +
      '<td>' + perc(x.efg) + '</td>' +
      '<td>' + x.ftm + '/' + x.fta + '</td><td>' + perc(x.ftpct) + '</td><td>' + dec(x.ftr, 2) + '</td>' +
      '<td>' + perc(x.ts) + '</td>' +
      '<td>' + x.tov + '</td><td>' + dec(x.tovpct, 1) + '%</td>' +
      celleDifesa(x) +
    '</tr>'
  ).join('') : '<tr><td colspan="' + cols.length + '" class="st-hint">Nessun quintetto trovato con questi filtri.</td></tr>';

  const sogliePanel = SOGLIE_LINEUP.map(s => {
    const v = rotLineupSoglie[s[0]];
    return '<label class="rot-soglia">' + s[1] +
      '<input type="number" step="any" id="rot-lineup-min-' + s[0] + '" data-soglia="' + s[0] + '" value="' + (v == null ? '' : v) + '"></label>';
  }).join('');

  return '<div class="st-hint">' + r.nGare + ' gare con questi filtri · ' + righe.length + '/' + r.righe.length +
    ' quintetti mostrati · POSS/RTG/PACE/TS% calcolati con la stessa formula del resto dell\'app.</div>' +
    '<div class="rot-lineup-filtri">' +
      '<input type="text" id="rot-lineup-filtro" class="rot-lineup-input" placeholder="Cerca uno o più giocatori, es. Rossi, Bianchi…" value="' + esc(rotLineupFiltroTesto) + '">' +
      '<label class="rot-toggle"><input type="checkbox" id="rot-lineup-rumore"' + (rotLineupNascondiRumore ? ' checked' : '') + '> Nascondi quintetti con utilizzo marginale (< ' + dec(sogliaRumore, 1) + ' min · ' + (ROT_LINEUP_PCT_RUMORE * 100) + '% della media dei 3 più usati)</label>' +
      '<label class="rot-toggle"><input type="checkbox" id="rot-lineup-difesa"' + (rotLineupMostraDifesa ? ' checked' : '') + '> Mostra statistiche difensive</label>' +
      '<div class="rot-soglie">' + sogliePanel + '</div>' +
    '</div>' +
    '<div class="st-scroll"><table class="st-box an-tab rot-lineup-tab"><thead>' + thead + '</thead><tbody>' + corpo + '</tbody></table></div>' +
    '<div class="st-hint">Tocca un\'intestazione per ordinare · quintetti raggruppati per nome (non per numero di maglia, stabile ai ' +
    'cambi di numero durante la stagione) · GP = gare in cui quel quintetto è comparso almeno una volta · nomi separati da virgola nel ' +
    'campo di ricerca = tutti richiesti insieme nello stesso quintetto · i filtri "≥" si combinano tra loro (AND).</div>';
}

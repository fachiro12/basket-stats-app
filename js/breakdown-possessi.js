/* ==========================================================================
   breakdown-possessi.js — Team Possession Breakdown (Altro → Analisi, sperimentale)
   Segmenta il play-by-play in possessioni vere e proprie e le raggruppa per
   "innesco" (cosa ha aperto quella possessione): dopo canestro, dopo rimbalzo
   difensivo, dopo palla persa (voce unica, live+dead fuse), altro (fine
   periodo). OFF = nostre possessioni, DEF = possessioni subite in difesa.
   Sola lettura su eventiPuliti/elencoPartite/cacheEventiStagione — tutti già
   globali da stats.js/analisi.js. Filtri: copia INDIPENDENTE di quelli di
   Analisi stagione (stesso pattern di js/rotazioni.js).

   Semplificazioni dichiarate (mostrate anche in-app):
   - Niente ORB%/DRB% per-possesso: la definizione standard (rimbalzi ottenuti
     / disponibili) non si presta a un conteggio per-possessione coi nostri
     dati senza inventare un secondo significato diverso da quello già in
     Analisi stagione — chi li cerca li trova lì.
   - Niente colonne di rank (X/16): non abbiamo il campionato DR1 completo.
   - Rimbalzo "di squadra" trattato come un rimbalzo difensivo ai fini della
     chiusura del possesso (casistica rara, la palla cambia comunque mano).
   ========================================================================== */

let filtriBreakdown = { competizione: "Campionato", campo: "tutte", esito: "tutte", stagione: "2026/27" };

/* ---------- selezione gare (copia di garePerAnalisi/garePerRotazioni) ---------- */
function garePerBreakdown() {
  const byMatch = (cacheEventiStagione && cacheEventiStagione.byMatch) || {};
  const f = filtriBreakdown;
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

/* ==========================================================================
   Motore di segmentazione — dal play-by-play pulito alle possessioni
   ========================================================================== */
function segmentaPossessi(eventi) {
  const possessi = [];
  let possAperta = null;         // { squadra, trigger, pt, fga, fgm, fta, ftm, turnover, pendenteCanestro }
  let triggerProssimo = "Altro";
  let quartoCorrente = null;

  function nuovaPoss(squadra, trigger) {
    return { squadra: squadra, trigger: trigger, pt: 0, fga: 0, fgm: 0, fta: 0, ftm: 0, turnover: false, pendenteCanestro: false };
  }
  function chiudi(prossimoTrigger) {
    if (possAperta) possessi.push(possAperta);
    possAperta = null;
    if (prossimoTrigger !== undefined) triggerProssimo = prossimoTrigger;
  }
  function assicura(squadra) {
    if (!possAperta) { possAperta = nuovaPoss(squadra, triggerProssimo); return; }
    if (possAperta.squadra !== squadra) {
      // dati anomali (mai dovrebbe capitare col flusso normale): chiudo quella
      // vecchia col trigger con cui era stata aperta, ne apro una nuova.
      possessi.push(possAperta);
      possAperta = nuovaPoss(squadra, triggerProssimo);
    }
  }

  (eventi || []).forEach(e => {
    if (quartoCorrente !== null && e.quarto && e.quarto !== quartoCorrente) {
      chiudi(possAperta && possAperta.pendenteCanestro ? "Dopo canestro" : "Altro");
    }
    if (e.quarto) quartoCorrente = e.quarto;

    const sq = e.squadra === "OPP" ? "OPP" : "MIA";
    const t = e.tipo_evento;

    // possesso "in attesa" dopo un canestro: si chiude non appena arriva
    // qualcosa che non è l'eventuale and-1 della stessa squadra
    if (possAperta && possAperta.pendenteCanestro) {
      const and1 = t === "FALLO_SUBITO" && sq === possAperta.squadra;
      if (!and1) chiudi("Dopo canestro");
    }

    if (t === "TIRO") {
      assicura(sq);
      possAperta.fga++;
      if (/SEGNATO/.test(String(e.dettaglio || ""))) {
        possAperta.fgm++;
        possAperta.pt += Number(e.punti_segnati) || 0;
        possAperta.pendenteCanestro = true;   // decide il prossimo evento (and-1 o chiusura)
      }
      // tiro sbagliato: resta aperta, decide il prossimo RIMBALZO
    } else if (t === "RIMBALZO") {
      const d = String(e.dettaglio || "");
      if (d === "OFFENSIVO") {
        if (!possAperta || possAperta.squadra !== sq) assicura(sq);   // continua lo stesso possesso
      } else {
        chiudi("Dopo rimbalzo difensivo");   // DIFENSIVO o SQUADRA: la palla cambia squadra
      }
    } else if (t === "PALLA_PERSA" || t === "RECUPERO") {
      // squadra che perde palla: sé stessa se PALLA_PERSA, l'avversaria se RECUPERO.
      // assicura() apre un possesso "vuoto" (0 tiri) se non ce n'era già uno —
      // un turnover immediato dopo la rimessa (palla rubata subito, violazione
      // di campo/24") non ha nessun altro evento prima: senza questo la
      // possessione svaniva del tutto, sottostimando i turnover reali.
      const squadraPersa = (t === "PALLA_PERSA") ? sq : (sq === "MIA" ? "OPP" : "MIA");
      assicura(squadraPersa);
      possAperta.turnover = true;
      chiudi("Dopo palla persa");
    } else if (t === "FALLO_SUBITO" || t === "FALLO_FATTO") {
      const squadraTiratrice = (t === "FALLO_SUBITO") ? sq : (sq === "MIA" ? "OPP" : "MIA");
      assicura(squadraTiratrice);
      possAperta.pendenteCanestro = false;   // consumato l'eventuale and-1
      const esiti = String(e.esito_tl || "").split(",").map(x => x.trim()).filter(Boolean);
      esiti.forEach(v => {
        possAperta.fta++;
        if (v.toUpperCase() === "SI") { possAperta.ftm++; possAperta.pt++; }
      });
      if (esiti.length && esiti[esiti.length - 1].toUpperCase() === "SI") chiudi("Dopo canestro");
      // ultimo libero sbagliato: resta aperta, decide il prossimo RIMBALZO
    } else if (t === "FINE") {
      chiudi(possAperta && possAperta.pendenteCanestro ? "Dopo canestro" : "Altro");
    }
    // ASSIST/CAMBIO/RETTIFICA: nessun effetto sulla segmentazione
  });
  if (possAperta) possessi.push(possAperta);
  return possessi;
}

/* ==========================================================================
   Aggregazione per trigger × lato (OFF = MIA, DEF = OPP)
   ========================================================================== */
const TRIGGER_BREAKDOWN = ["Dopo canestro", "Dopo rimbalzo difensivo", "Dopo palla persa", "Altro"];

function calcolaBreakdown() {
  const gare = garePerBreakdown().filter(g => g.eventi && g.eventi.length);
  const vuoto = () => ({ poss: 0, pt: 0, fga: 0, fgm: 0, fta: 0, tov: 0 });
  const acc = { MIA: {}, OPP: {} };
  TRIGGER_BREAKDOWN.forEach(tr => { acc.MIA[tr] = vuoto(); acc.OPP[tr] = vuoto(); });

  gare.forEach(g => {
    segmentaPossessi(eventiPuliti(g.eventi)).forEach(p => {
      const tr = TRIGGER_BREAKDOWN.indexOf(p.trigger) === -1 ? "Altro" : p.trigger;
      const o = acc[p.squadra][tr];
      o.poss++; o.pt += p.pt; o.fga += p.fga; o.fgm += p.fgm; o.fta += p.fta;
      if (p.turnover) o.tov++;
    });
  });

  const totMia = TRIGGER_BREAKDOWN.reduce((s, tr) => s + acc.MIA[tr].poss, 0);
  const totOpp = TRIGGER_BREAKDOWN.reduce((s, tr) => s + acc.OPP[tr].poss, 0);
  const metriche = (o, tot) => ({
    poss: o.poss,
    freq: tot ? o.poss / tot * 100 : 0,
    rtg: o.poss ? o.pt / o.poss * 100 : 0,
    ts: (o.fga || o.fta) ? o.pt / (2 * (o.fga + 0.44 * o.fta)) * 100 : null,
    tov: o.poss ? o.tov / o.poss * 100 : 0,
    ftr: o.fga ? o.fta / o.fga : 0
  });
  const righe = TRIGGER_BREAKDOWN.map(tr => ({
    trigger: tr,
    off: metriche(acc.MIA[tr], totMia),
    def: metriche(acc.OPP[tr], totOpp)
  }));

  return { righe: righe, nGare: gare.length, totMia: totMia, totOpp: totOpp };
}

/* ==========================================================================
   Apertura + filtri (copia indipendente della barra di Analisi stagione)
   ========================================================================== */
function apriBreakdown() {
  if (!cacheEventiStagione && typeof caricaCacheAnalisi === "function") caricaCacheAnalisi();
  navigaA("breakdown");
  renderBreakdown();
  const scaduta = !cacheEventiStagione || (Date.now() - (cacheEventiStagione.updatedAt || 0) > (typeof ANALISI_TTL_MS !== "undefined" ? ANALISI_TTL_MS : 3600000));
  if (scaduta && typeof caricaEventiStagione === "function") caricaEventiStagione(() => renderBreakdown());
}
function chipGruppoBreak(fil, valori) {
  return '<div class="an-chip-grp" data-fil="' + fil + '">' +
    valori.map(v =>
      '<button class="an-chip' + (filtriBreakdown[fil] === v[0] ? ' attivo' : '') +
      '" data-val="' + v[0] + '">' + esc(v[1]) + '</button>').join('') +
    '</div>';
}
function barraFiltriBreakdown() {
  return chipGruppoBreak("competizione", [["Campionato", "Campionato"], ["Amichevole", "Amichevoli"]]) +
    chipGruppoBreak("campo", [["tutte", "Tutte"], ["Casa", "Casa"], ["Trasferta", "Trasferta"]]) +
    chipGruppoBreak("esito", [["tutte", "Tutte"], ["vinte", "Vinte"], ["perse", "Perse"]]);
}
function impostaFiltroBreakdown(fil, val) {
  if (!(fil in filtriBreakdown) || filtriBreakdown[fil] === val) return;
  filtriBreakdown[fil] = val;
  renderBreakdown();
}

/* ==========================================================================
   RENDER
   ========================================================================== */
function renderBreakdown() {
  const filtriEl = document.getElementById("brk-filtri");
  const body = document.getElementById("brk-body");
  if (!body || !filtriEl) return;
  filtriEl.innerHTML = barraFiltriBreakdown();
  if (!cacheEventiStagione) { body.innerHTML = '<div class="st-hint">Nessun dato in cache — apri prima Analisi stagione.</div>'; return; }
  try {
    body.innerHTML = vistaBreakdown(calcolaBreakdown());
  } catch (e) {
    body.innerHTML = '<div class="st-hint">Errore: ' + esc(e && e.message || e) + '</div>';
  }
}

function vistaBreakdown(r) {
  if (!r.nGare) return '<div class="st-hint">Nessuna gara conclusa con questi filtri.</div>';
  const pct = v => v == null ? '–' : dec(v, 1) + '%';
  const righe = r.righe.map(row => {
    const off = row.off, def = row.def;
    return '<tr>' +
      '<td class="st-g brk-trigger">' + esc(row.trigger) + '</td>' +
      '<td>' + off.poss + '</td><td>' + dec(off.freq, 1) + '%</td><td>' + dec(off.rtg, 1) + '</td>' +
      '<td>' + pct(off.ts) + '</td><td>' + dec(off.tov, 1) + '%</td><td>' + dec(off.ftr, 2) + '</td>' +
      '<td class="brk-sep"></td>' +
      '<td>' + def.poss + '</td><td>' + dec(def.freq, 1) + '%</td><td>' + dec(def.rtg, 1) + '</td>' +
      '<td>' + pct(def.ts) + '</td><td>' + dec(def.tov, 1) + '%</td><td>' + dec(def.ftr, 2) + '</td>' +
      '</tr>';
  }).join('');

  return '<div class="st-hint">' + r.nGare + ' gare con questi filtri · ' + r.totMia + ' possessi offensivi · ' + r.totOpp + ' possessi difensivi ricostruiti dal play-by-play.</div>' +
    '<div class="st-scroll"><table class="st-box brk-tab">' +
      '<thead><tr>' +
        '<th rowspan="2">Innesco</th>' +
        '<th colspan="6" class="brk-grp-off">OFF (nostro attacco)</th>' +
        '<th class="brk-sep"></th>' +
        '<th colspan="6" class="brk-grp-def">DEF (loro attacco vs di noi)</th>' +
      '</tr><tr>' +
        '<th>Poss</th><th>Freq%</th><th>Rtg</th><th>TS%</th><th>TOV%</th><th>FT Rt</th>' +
        '<th class="brk-sep"></th>' +
        '<th>Poss</th><th>Freq%</th><th>Rtg</th><th>TS%</th><th>TOV%</th><th>FT Rt</th>' +
      '</tr></thead>' +
      '<tbody>' + righe + '</tbody>' +
    '</table></div>' +
    '<div class="st-hint">"Dopo palla persa" include sia i recuperi avversari sia le palle perse non forzate (voce unica). ' +
    '"Rtg" = punti ogni 100 possessi di quel tipo. Niente ORB%/DRB% qui (la definizione standard non si presta a un conteggio ' +
    'per-possessione con questi dati — li trovi nei Four Factors di Analisi stagione) e niente confronto di lega (non abbiamo il ' +
    'campionato DR1 completo).</div>' +
    '<details class="brk-prompt"><summary>📋 Prompt per farla leggere a un\'AI</summary><pre>' +
      esc(PROMPT_AI_BREAKDOWN) +
    '</pre></details>';
}

/* Da copiare insieme a uno screenshot della tabella. */
const PROMPT_AI_BREAKDOWN =
  'Agisci da data analyst sportivo esperto di basket. Ti allego lo screenshot di una ' +
  'tabella "Team Possession Breakdown" di una squadra amatoriale (DR1 Lombardia): per ogni ' +
  'tipo di innesco del possesso (dopo canestro, dopo rimbalzo difensivo, dopo palla persa, ' +
  'altro) mostra Poss, Freq%, Rtg (punti ogni 100 possessi), TS%, TOV%, FT Ratio, sia in ' +
  'attacco (OFF) sia in difesa (DEF, cosa concede la squadra). Analizza i dati in profondità: ' +
  'individua gli squilibri più significativi tra OFF e DEF, i punti di forza/debolezza per ' +
  'tipo di possesso, e proponi 2-3 indicazioni concrete di lavoro per gli allenamenti, ' +
  'motivando ognuna con i numeri che vedi.';

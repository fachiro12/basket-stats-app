/* ==========================================================================
   rating-net.js — Rating Net (Altro → Analisi, sperimentale)
   Gauge Off/Def/Net Rating + Pace stagionali, e Net Rating gara per gara con
   media mobile. Sola lettura su aggregaStagione/boxGaraSingola/calcolaAdvanced
   (già globali da analisi.js/stats.js). Filtri: copia INDIPENDENTE di quelli
   di Analisi stagione, stesso pattern di rotazioni.js/breakdown-possessi.js.

   "Avversari come parametro" (non abbiamo un campionato DR1 completo, quindi
   niente vera media di lega — dichiarato anche in-app):
   - OFF RTG: il segno di riferimento è la vostra DEF RTG in queste gare (=
     esattamente "quanto segnano i vostri avversari", cioè un OFF RTG "avversario"
     ma solo nelle gare contro di voi, non sull'intera loro stagione).
   - DEF RTG: simmetrico, riferimento = la vostra OFF RTG.
   - NET RTG: riferimento fisso a 0 — un Net di 0 significa per definizione
     "esattamente alla pari col rendimento medio degli avversari incontrati".
   - PACE: riferimento = il pace calcolato sui soli possessi avversari nelle
     stesse gare (invece del pace medio-gara, che è già un blend dei due).
   ========================================================================== */

let filtriRatingNet = { competizione: "Campionato", campo: "tutte", esito: "tutte", stagione: "2026/27" };

/* ---------- selezione gare (copia di garePerAnalisi/garePerRotazioni/garePerBreakdown) ---------- */
function garePerRatingNet() {
  const byMatch = (cacheEventiStagione && cacheEventiStagione.byMatch) || {};
  const f = filtriRatingNet;
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
   Apertura + filtri
   ========================================================================== */
function apriRatingNet() {
  if (!cacheEventiStagione && typeof caricaCacheAnalisi === "function") caricaCacheAnalisi();
  navigaA("rating-net");
  renderRatingNet();
  const scaduta = !cacheEventiStagione || (Date.now() - (cacheEventiStagione.updatedAt || 0) > (typeof ANALISI_TTL_MS !== "undefined" ? ANALISI_TTL_MS : 3600000));
  if (scaduta && typeof caricaEventiStagione === "function") caricaEventiStagione(() => renderRatingNet());
}
function chipGruppoRN(fil, valori) {
  return '<div class="an-chip-grp" data-fil="' + fil + '">' +
    valori.map(v =>
      '<button class="an-chip' + (filtriRatingNet[fil] === v[0] ? ' attivo' : '') +
      '" data-val="' + v[0] + '">' + esc(v[1]) + '</button>').join('') +
    '</div>';
}
function barraFiltriRatingNet() {
  return chipGruppoRN("competizione", [["Campionato", "Campionato"], ["Amichevole", "Amichevoli"]]) +
    chipGruppoRN("campo", [["tutte", "Tutte"], ["Casa", "Casa"], ["Trasferta", "Trasferta"]]) +
    chipGruppoRN("esito", [["tutte", "Tutte"], ["vinte", "Vinte"], ["perse", "Perse"]]);
}
function impostaFiltroRatingNet(fil, val) {
  if (!(fil in filtriRatingNet) || filtriRatingNet[fil] === val) return;
  filtriRatingNet[fil] = val;
  renderRatingNet();
}

/* ==========================================================================
   RENDER
   ========================================================================== */
function renderRatingNet() {
  const filtriEl = document.getElementById("rn-filtri");
  const body = document.getElementById("rn-body");
  if (!body || !filtriEl) return;
  filtriEl.innerHTML = barraFiltriRatingNet();
  if (!cacheEventiStagione) { body.innerHTML = '<div class="st-hint">Nessun dato in cache — apri prima Analisi stagione.</div>'; return; }
  try {
    body.innerHTML = vistaRatingNet();
  } catch (e) {
    body.innerHTML = '<div class="st-hint">Errore: ' + esc(e && e.message || e) + '</div>';
  }
}

/* ---------- gauge SVG (arco 270°, con segno di riferimento) ---------- */
function polarToCartesianRN(cx, cy, r, angoloGradi) {
  const rad = (angoloGradi - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
function arcoSvgRN(cx, cy, r, a1, a2) {
  const p1 = polarToCartesianRN(cx, cy, r, a2), p2 = polarToCartesianRN(cx, cy, r, a1);
  const largeArc = (a2 - a1) <= 180 ? "0" : "1";
  return "M " + p1.x.toFixed(1) + " " + p1.y.toFixed(1) + " A " + r + " " + r + " 0 " + largeArc + " 0 " + p2.x.toFixed(1) + " " + p2.y.toFixed(1);
}
function gaugeRN(titolo, valore, min, max, tickValore, tickLabel, decimali) {
  const W = 148, H = 138, cx = 74, cy = 78, r = 54;
  const A1 = -135, A2 = 135;
  const clamp = v => Math.max(min, Math.min(max, v));
  const ang = v => A1 + (clamp(v) - min) / (max - min) * (A2 - A1);
  const trackPath = arcoSvgRN(cx, cy, r, A1, A2);
  const fillPath = valore >= min ? arcoSvgRN(cx, cy, r, A1, ang(valore)) : "";
  let tick = "";
  if (tickValore != null && isFinite(tickValore)) {
    const at = ang(tickValore);
    const p1 = polarToCartesianRN(cx, cy, r - 10, at), p2 = polarToCartesianRN(cx, cy, r + 10, at);
    tick = '<line x1="' + p1.x.toFixed(1) + '" y1="' + p1.y.toFixed(1) + '" x2="' + p2.x.toFixed(1) + '" y2="' + p2.y.toFixed(1) + '" class="rn-tick"/>';
  }
  return '<div class="rn-gauge">' +
    '<svg viewBox="0 0 ' + W + ' ' + H + '" class="rn-gauge-svg">' +
      '<path d="' + trackPath + '" class="rn-track"/>' +
      (fillPath ? '<path d="' + fillPath + '" class="rn-fill"/>' : '') +
      tick +
      '<text x="' + cx + '" y="' + (cy + 7) + '" text-anchor="middle" class="rn-val">' + (dec(valore, decimali)) + '</text>' +
    '</svg>' +
    '<div class="rn-lbl">' + esc(titolo) + '</div>' +
    (tickLabel ? '<div class="rn-ticklbl">' + esc(tickLabel) + ' ' + (tickValore >= 0 && titolo.indexOf("NET") > -1 ? "+" : "") + dec(tickValore, decimali) + '</div>' : '') +
  '</div>';
}

/* ---------- Net Rating gara per gara + media mobile 5 gare ---------- */
function graficoTrendNet(perGara) {
  if (!perGara.length) return '';
  const W = 680, H = 200, padT = 14, padB = 28, padL = 30, padR = 8;
  const vals = perGara.map(x => x.net);
  const grezzo = Math.max(6, ...vals.map(v => Math.abs(v)));
  const step = grezzo <= 10 ? 5 : grezzo <= 30 ? 10 : 20;
  const maxD = Math.ceil(grezzo / step) * step;
  const bw = (W - padL - padR) / perGara.length;
  const y0 = padT + maxD * (H - padT - padB) / (2 * maxD);
  const ys = d => padT + (maxD - d) * (H - padT - padB) / (2 * maxD);

  let griglia = '';
  for (let v = -maxD; v <= maxD; v += step) {
    const y = ys(v).toFixed(1);
    griglia += '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" class="' + (v === 0 ? "st-zero" : "st-grid") + '"/>' +
      '<text x="' + (padL - 4) + '" y="' + (ys(v) + 3).toFixed(1) + '" class="st-axis" text-anchor="end">' + (v > 0 ? "+" + v : v) + '</text>';
  }
  const barre = perGara.map((x, i) => {
    const bx = padL + i * bw + bw * 0.15, w = bw * 0.7;
    const top = x.net >= 0 ? ys(x.net) : y0;
    const h = Math.max(1, Math.abs(ys(x.net) - y0));
    return '<rect x="' + bx.toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) +
      '" class="' + (x.net >= 0 ? "an-barw" : "an-barl") + '"/>' +
      '<text x="' + (bx + w / 2).toFixed(1) + '" y="' + (H - 14) + '" class="st-qt" text-anchor="middle">' + esc(x.etichetta) + '</text>';
  }).join('');

  const roll = vals.map((_, i) => {
    const sub = vals.slice(Math.max(0, i - 4), i + 1);
    return sub.reduce((a, b) => a + b, 0) / sub.length;
  });
  const puntiRoll = roll.map((v, i) => (padL + i * bw + bw / 2).toFixed(1) + "," + ys(v).toFixed(1)).join(" ");
  const media = vals.reduce((a, b) => a + b, 0) / vals.length;
  const yMedia = ys(media).toFixed(1);

  return '<div class="adv-tit" style="margin-top:14px">Net Rating gara per gara</div>' +
    '<div class="st-scroll"><svg class="st-chart rn-trend" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' +
      griglia + barre +
      '<polyline points="' + puntiRoll + '" class="rn-roll"/>' +
      '<line x1="' + padL + '" y1="' + yMedia + '" x2="' + (W - padR) + '" y2="' + yMedia + '" class="rn-media"/>' +
    '</svg></div>' +
    '<div class="st-hint">Barre = Net Rating della gara · linea continua = media mobile sulle ultime 5 gare · linea tratteggiata = media di tutte le gare filtrate (' +
    (media >= 0 ? "+" : "") + dec(media, 1) + ').</div>';
}

function vistaRatingNet() {
  const gare = garePerRatingNet();
  const gareConDati = gare.filter(g => g.eventi && g.eventi.length);
  if (!gareConDati.length) return '<div class="st-hint">Nessuna gara conclusa con questi filtri.</div>';
  let agg;
  try { agg = aggregaStagione(gare); } catch (e) { return '<div class="st-hint">Errore: ' + esc(e && e.message || e) + '</div>'; }

  const s = (x, y) => (y ? x / y : 0);
  const ourPace = s(agg.adv.possA, agg.minutiTot) * 40;
  const oppPace = s(agg.adv.possB, agg.minutiTot) * 40;

  const gauges =
    gaugeRN("OFF RTG", agg.adv.ortg, 80, 140, agg.adv.drtg, "Rif. avversari:", 1) +
    gaugeRN("DEF RTG", agg.adv.drtg, 80, 140, agg.adv.ortg, "Rif. avversari:", 1) +
    gaugeRN("NET RTG", agg.adv.net, -30, 30, 0, "Pareggio avversari:", 1) +
    gaugeRN("PACE", ourPace, 55, 95, oppPace, "Pace avversari:", 1);

  const perGara = gareConDati.map(g => {
    const r = boxGaraSingola(g);
    const adv = calcolaAdvanced(r.box, r.minuti || 0.1);
    const nome = (typeof avversarioBreveAuto === "function" ? avversarioBreveAuto(g.partita.avversario) : (g.partita.avversario || ""));
    return { net: adv.net, etichetta: (g.partita.luogo === "Casa" ? "" : "@") + (nome || "").slice(0, 3) };
  });

  return '<div class="st-hint">' + agg.nGare + ' gare con questi filtri.</div>' +
    '<div class="adv-tit">Ratings &amp; Pace di stagione</div>' +
    '<div class="rn-griglia">' + gauges + '</div>' +
    graficoTrendNet(perGara) +
    '<div class="st-hint">Non abbiamo un campionato DR1 completo, quindi niente vera media di lega: su OFF/DEF RTG il segno di riferimento ' +
    'è il valore speculare (la vostra difesa per l\'arco OFF, il vostro attacco per l\'arco DEF) nelle gare giocate; su NET RTG lo zero è ' +
    '"pari agli avversari" per definizione; su PACE il riferimento è il possession-rate dei soli avversari nelle stesse gare.</div>';
}

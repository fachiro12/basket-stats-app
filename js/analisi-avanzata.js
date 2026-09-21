/* ==========================================================================
   analisi-avanzata.js — AIS / BPM·VORP / Defensive Rating individuale
   Tre "letture" sperimentali in più, raggiungibili da bottoni in fondo alle
   viste esistenti di Analisi stagione (Squadra/Giocatori) — NON le tocca,
   riusa in sola lettura garePerAnalisi()/boxGaraSingola()/aggregaStagione()/
   calcolaAdvanced()/calcolaBox() da analisi.js/stats.js. Vedi CLAUDE.md
   (no-regressioni-riuso-funzioni): nuova feature = nuovo file.

   Limiti dei nostri dati, dichiarati anche in-app:
   - Le stoppate non sono un evento tracciato → ogni termine con BLK/BLK% = 0.
   - Non abbiamo il campionato DR1 intero: dove le formule originali vogliono
     una media di Lega (Lg%3P, LgOffRtg) usiamo la media MIA+avversari sulla
     nostra stagione (il campione di avversari incontrati è un pezzo vero di
     quel campionato).
   - Il Leverage Index (AIS) è una curva mia costruita sull'unico esempio dato
     dall'utente (margine ±30 → 0.85): peso pieno fino a ±10 di margine,
     poi -0.75%/punto oltre i 10, pavimento a 0.5.
   ========================================================================== */

let avzTab = "ais";

/* ---------- apertura / navigazione ---------- */
function apriAnalisiAvanzata(tab) {
  avzTab = tab || "ais";
  navigaA("analisi-avanzata");
  renderAnalisiAvanzata();
}
function cambiaTabAvz(tab) {
  avzTab = tab;
  renderAnalisiAvanzata();
}
function bottoniAnalisiAvanzata() {
  return '<div class="avz-apri-bottoni">' +
    '<button class="btn-annulla-modale" data-avzopen="ais">📊 AIS</button>' +
    '<button class="btn-annulla-modale" data-avzopen="bpm">📈 BPM · VORP</button>' +
    '<button class="btn-annulla-modale" data-avzopen="defrtg">🛡️ Def. Rating</button>' +
    '</div>';
}

/* ---------- Leverage Index (AIS) ---------- */
function calcolaLVI(margine) {
  const m = Math.abs(margine || 0);
  if (m <= 10) return 1;
  return Math.max(0.5, 1 - 0.0075 * (m - 10));
}

/* ==========================================================================
   AIS — per gara, poi media sulle gare filtrate (come il resto di Analisi)
   ========================================================================== */
function calcolaAIS() {
  const gare = garePerAnalisi().filter(g => g.eventi && g.eventi.length);
  const acc = {};   // numero → { somma, n }
  gare.forEach(g => {
    const r = boxGaraSingola(g);
    const box = r.box;
    const advG = calcolaAdvanced(box, r.minuti || 0.1);
    const tsSquadra = advG.tsA || 0;
    const fin = g.finale || { MIA: 0, OPP: 0 };
    const lvi = calcolaLVI(fin.MIA - fin.OPP);

    // Come in aggregaStagione: chi ha giocato senza nessuna voce a referto in
    // questa gara (raro, ma possibile) va comunque preso dagli stint.
    if (typeof minutiDaStints === "function") {
      const mp = minutiDaStints(box.stints);
      Object.keys(mp).forEach(n => {
        if (Object.prototype.hasOwnProperty.call(box.pg, n)) return;
        box.pg[n] = Object.assign((typeof statVuote === "function" ? statVuote() : {}), { min: mp[n].min || 0, pm: mp[n].pm || 0 });
      });
    }

    Object.keys(box.pg).forEach(n => {
      const gp = box.pg[n];
      if (!(gp.min > 0)) return;   // non in campo in questa gara
      const fga = gp.a2 + gp.a3, fgm = gp.m2 + gp.m3;
      const gmsc = gp.pt + 0.4 * fgm - 0.7 * fga - 0.4 * (gp.fta - gp.ftm) +
        0.7 * gp.ro + 0.3 * gp.rd + 0.7 * gp.as + (gp.pr || 0) - 0.4 * gp.ff - gp.pp;
      const tsGiocatore = (fga || gp.fta) ? gp.pt / (2 * (fga + 0.44 * gp.fta)) * 100 : 0;
      const rapEff = tsSquadra ? tsGiocatore / tsSquadra : 1;
      const impattoDiff = gp.pm || 0;
      const aisGara = (gmsc * rapEff + impattoDiff) * lvi;
      acc[n] = acc[n] || { somma: 0, n: 0 };
      acc[n].somma += aisGara;
      acc[n].n++;
    });
  });
  const righe = Object.keys(acc).map(Number).map(n => ({
    num: n, nome: nomeAnalisi(n), g: acc[n].n, ais: acc[n].n ? acc[n].somma / acc[n].n : 0
  })).sort((a, b) => b.ais - a.ais);
  return { righe: righe, nGare: gare.length };
}

const TIER_AIS = [
  { min: 30, lbl: "Dominante / MVP", cls: "avz-t-alto" },
  { min: 20, lbl: "Ottimo", cls: "avz-t-alto" },
  { min: 12, lbl: "Buono / Solido", cls: "avz-t-buono" },
  { min: 6, lbl: "Sufficiente", cls: "avz-t-basso" },
  { min: 0, lbl: "Sotto tono", cls: "avz-t-basso" },
  { min: -Infinity, lbl: "Negativo / Dannoso", cls: "avz-t-neg" }
];
function tierAIS(v) { return TIER_AIS.find(t => v >= t.min) || TIER_AIS[TIER_AIS.length - 1]; }

function vistaAIS() {
  const r = calcolaAIS();
  if (!r.righe.length) return '<div class="st-hint">Nessun dato sufficiente per l\'AIS con questi filtri.</div>';
  const righe = r.righe.map(x => {
    const t = tierAIS(x.ais);
    return '<tr><td class="st-n">#' + esc(x.num) + '</td><td class="st-g">' + esc(x.nome || "") + '</td>' +
      '<td>' + x.g + '</td>' +
      '<td class="' + t.cls + '">' + (x.ais >= 0 ? "+" : "") + dec(x.ais, 1) + '</td>' +
      '<td class="' + t.cls + '">' + esc(t.lbl) + '</td></tr>';
  }).join('');
  const legenda = [
    ["avz-t-alto", "> 30,0", "Dominante / MVP"],
    ["avz-t-alto", "20,0 – 29,9", "Ottimo"],
    ["avz-t-buono", "12,0 – 19,9", "Buono / Solido"],
    ["avz-t-basso", "6,0 – 11,9", "Sufficiente"],
    ["avz-t-basso", "0,0 – 5,9", "Sotto tono"],
    ["avz-t-neg", "< 0,0", "Negativo / Dannoso"]
  ].map(r => '<tr><td class="' + r[0] + '">' + r[1] + '</td><td>' + r[2] + '</td></tr>').join('');
  return '<div class="st-hint">' + r.nGare + ' gare in cache con questi filtri · media dell\'AIS di gara sulle gare giocate da ciascuno.</div>' +
    '<div class="st-scroll"><table class="st-box"><thead><tr><th>#</th><th>Giocatore</th><th>PG</th><th>AIS</th><th>Livello</th></tr></thead>' +
    '<tbody>' + righe + '</tbody></table></div>' +
    '<div class="adv-tit" style="margin-top:14px">Come si legge</div>' +
    '<div class="st-scroll"><table class="st-box">' + legenda + '</table></div>' +
    '<div class="st-hint">GmSc non include le stoppate (non tracciate in questo app, termine sempre 0). ' +
    'Leverage Index: peso pieno entro ±10 di margine finale, oltre −0,75%/punto fino a un minimo di 0,5 ' +
    '(curva costruita sull\'unico esempio dato: margine 30 → 0,85).</div>';
}

/* ==========================================================================
   BPM / OBPM / DBPM / VORP — season, coefficienti Myers (hackastat.eu)
   ========================================================================== */
function percentualiGiocatoreAvz(g, A, B, teamMin, teamPlays, adv) {
  const fga = g.a2 + g.a3, fgm = g.m2 + g.m3;
  const MP = g.min || 0;
  const s = (x, y) => (y ? x / y : 0);
  return {
    MP: MP, fga: fga, fgm: fgm,
    orPct: MP ? s(g.ro * teamMin, MP * (A.ro + B.rd)) * 100 : 0,
    drPct: MP ? s(g.rd * teamMin, MP * (A.rd + B.ro)) * 100 : 0,
    trPct: MP ? s((g.ro + g.rd) * teamMin, MP * (A.ro + A.rd + B.ro + B.rd)) * 100 : 0,
    stPct: MP ? s(g.pr * teamMin, MP * adv.possB) * 100 : 0,
    blkPct: 0,
    usg: (MP && teamPlays) ? 100 * (fga + 0.44 * g.fta + g.pp) * (teamMin / 5) / (MP * teamPlays) : 0,
    astR: (fga + 0.44 * g.fta + g.as + g.pp) ? s(g.as * 100, fga + 0.44 * g.fta + g.as + g.pp) : 0,
    tovR: (fga + 0.44 * g.fta + g.as + g.pp) ? s(g.pp * 100, fga + 0.44 * g.fta + g.as + g.pp) : 0,
    ts: (fga || g.fta) ? s(g.pt, 2 * (fga + 0.44 * g.fta)) * 100 : 0,
    pct3: fga ? s(g.a3, fga) * 100 : 0
  };
}
/* Un set di coefficienti (BPM o OBPM) applicato a un giocatore già "percentualizzato". */
function gBpmDi(p, c, tsTeam, lg3p) {
  const t7 = c.k7 * (p.usg) * (p.tovR / 100);
  const t8 = c.k8 * p.usg * (1 - p.tovR / 100) *
    (2 * (p.ts / 100 - tsTeam / 100) + c.k8ast * p.astR + c.k8p3 * (p.pct3 / 100 - lg3p / 100) + c.k8konst);
  return c.k1 * p.MP / (p.GP + 2) + c.k2 * p.orPct + c.k3 * p.drPct + c.k4 * p.stPct +
    c.k5 * p.blkPct + c.k6 * p.astR - t7 + t8 + c.k9 * Math.sqrt(Math.max(0, p.astR * p.trPct));
}
const COEF_BPM = { k1: 0.123391, k2: 0.119597, k3: -0.151287, k4: 1.255644, k5: 0.531838, k6: -0.305868, k7: 0.921292, k8: 0.711217, k8ast: 0.017022, k8p3: 0.297639, k8konst: -0.213485, k9: 0.725930 };
const COEF_OBPM = { k1: 0.064448, k2: 0.211125, k3: -0.107545, k4: 0.346513, k5: -0.052476, k6: -0.041787, k7: 0.932965, k8: 0.687359, k8ast: 0.007952, k8p3: 0.374706, k8konst: -0.181891, k9: 0.239862 };

function gareCampionatoStagione() {
  const comp = (filtriAnalisi && filtriAnalisi.competizione) || "Campionato";
  return (typeof elencoPartite === "function" ? elencoPartite() : [])
    .filter(p => (p.tipo || "Campionato") === comp).length;
}

function calcolaBpmVorp(agg) {
  const A = agg.team.MIA, B = agg.team.OPP, adv = agg.adv;
  const teamMin = agg.minutiTot || 1;
  const teamPlays = (A.a2 + A.a3) + 0.44 * A.fta + A.pp;
  const teMP = 5 * teamMin;
  const lg3p = (A.a2 + A.a3 + B.a2 + B.a3) ? (A.a3 + B.a3) * 100 / (A.a2 + A.a3 + B.a2 + B.a3) : 0;
  const lgOffRtg = ((adv.ortg || 0) + (adv.drtg || 0)) / 2;
  const tmNetRtg = adv.net || 0;
  const tmOffRtg = adv.ortg || 0;

  const numeri = Object.keys(agg.pg).map(Number);
  const percs = {};
  numeri.forEach(n => {
    const p = percentualiGiocatoreAvz(agg.pg[n], A, B, teamMin, teamPlays, adv);
    p.GP = agg.presenze[n] || 0;
    percs[n] = p;
  });
  const tsTeamSeason = adv.tsA || 0;

  const gbpm = {}, gobpm = {};
  numeri.forEach(n => {
    gbpm[n] = gBpmDi(percs[n], COEF_BPM, tsTeamSeason, lg3p);
    gobpm[n] = gBpmDi(percs[n], COEF_OBPM, tsTeamSeason, lg3p);
  });
  const sommaPesata = tabella => numeri.reduce((acc, n) => acc + (5 * percs[n].MP / teMP) * tabella[n], 0);
  const teAdC = (tmNetRtg * 1.20 - sommaPesata(gbpm)) / 5;
  const teAdCOff = ((tmOffRtg - lgOffRtg) * 1.20 - sommaPesata(gobpm)) / 5;

  const teGareSquadra = agg.nGare || 0;
  const lgGare = gareCampionatoStagione() || teGareSquadra || 1;

  const righe = numeri.map(n => {
    const bpm = gbpm[n] + teAdC;
    const obpm = gobpm[n] + teAdCOff;
    const dbpm = bpm - obpm;
    const vorp = (bpm + 2) * (5 * percs[n].MP / teMP) * (teGareSquadra / lgGare);
    return { num: n, nome: nomeAnalisi(n), g: percs[n].GP, bpm: bpm, obpm: obpm, dbpm: dbpm, vorp: vorp };
  }).sort((a, b) => b.bpm - a.bpm);

  return { righe: righe, lg3p: lg3p, lgOffRtg: lgOffRtg };
}

function vistaBpmVorp() {
  if (!cacheEventiStagione) return '<div class="st-hint">Nessun dato in cache — apri prima Analisi stagione.</div>';
  const gare = garePerAnalisi();
  if (!gare.length) return '<div class="st-hint">Nessuna gara conclusa con questi filtri.</div>';
  let agg;
  try { agg = aggregaStagione(gare); } catch (e) { return '<div class="st-hint">Errore: ' + esc(e && e.message || e) + '</div>'; }
  const r = calcolaBpmVorp(agg);
  const righe = r.righe.map(x =>
    '<tr><td class="st-n">#' + esc(x.num) + '</td><td class="st-g">' + esc(x.nome || "") + '</td><td>' + x.g + '</td>' +
    '<td class="' + (x.bpm >= 0 ? "pos" : "neg") + '">' + (x.bpm >= 0 ? "+" : "") + dec(x.bpm, 1) + '</td>' +
    '<td class="' + (x.obpm >= 0 ? "pos" : "neg") + '">' + (x.obpm >= 0 ? "+" : "") + dec(x.obpm, 1) + '</td>' +
    '<td class="' + (x.dbpm >= 0 ? "pos" : "neg") + '">' + (x.dbpm >= 0 ? "+" : "") + dec(x.dbpm, 1) + '</td>' +
    '<td class="' + (x.vorp >= 0 ? "pos" : "neg") + '">' + (x.vorp >= 0 ? "+" : "") + dec(x.vorp, 2) + '</td></tr>'
  ).join('');
  return '<div class="st-hint">' + agg.nGare + ' gare · coefficienti Box Plus Minus di Daniel Myers (hackastat.eu/Basketball-Reference).</div>' +
    '<div class="st-scroll"><table class="st-box"><thead><tr><th>#</th><th>Giocatore</th><th>PG</th><th>BPM</th><th>OBPM</th><th>DBPM</th><th>VORP</th></tr></thead>' +
    '<tbody>' + righe + '</tbody></table></div>' +
    '<div class="st-hint">Stoppate non tracciate (termine sempre 0). Lg%3P e LgOffRtg non esistono per noi (niente dati dell\'intero ' +
    'campionato DR1): approssimati con la media MIA+avversari della vostra stagione (Lg%3P≈' + dec(r.lg3p, 1) + '%, LgOffRtg≈' + dec(r.lgOffRtg, 1) + '). ' +
    'Il Replacement Player (BPM −2) e il "+2 gare" nel primo termine sono le convenzioni usate per i campionati brevi (Serie A/Eurolega), non NBA.</div>';
}

/* ==========================================================================
   Defensive Rating individuale — season, formule di Dean Oliver (hackastat.eu)
   ========================================================================== */
function calcolaDefRtg(agg) {
  const A = agg.team.MIA, B = agg.team.OPP, adv = agg.adv;
  const s = (x, y) => (y ? x / y : 0);
  const teMP = 5 * (agg.minutiTot || 1);
  const oppOR = B.ro, teDR = A.rd;
  const oppORpct = s(oppOR, oppOR + teDR);
  const oppFGA = B.a2 + B.a3, oppFGM = B.m2 + B.m3, oppFGpct = s(oppFGM, oppFGA);
  const fmwt = (oppFGpct * (1 - oppORpct) + oppORpct * (1 - oppFGpct))
    ? s(oppFGpct * (1 - oppORpct), oppFGpct * (1 - oppORpct) + oppORpct * (1 - oppFGpct)) : 0;
  const teBL = 0;
  const teST = A.pr, tePF = A.ff;
  const oppTO = B.pp;
  const oppFTA = B.fta, oppFTM = B.ftm, oppFTpct = s(oppFTM, oppFTA);
  const oppPts = B.pt, oppPoss = adv.possB || 0.1;
  const teDefRtg = adv.drtg || 0;
  const oppScPoss = oppFGM + (1 - Math.pow(1 - oppFTpct, 2)) * 0.4 * oppFTA;
  const teamMin = agg.minutiTot || 1;
  const teamPlays = (A.a2 + A.a3) + 0.44 * A.fta + A.pp;

  const numeri = Object.keys(agg.pg).map(Number);
  const righe = numeri.map(n => {
    const g = agg.pg[n];
    const MP = g.min || 0;
    const stop1 = (g.pr || 0) + teBL * fmwt * (1 - 1.07 * oppORpct) + g.rd * (1 - fmwt);
    const stop2fg = MP ? s((oppFGA - oppFGM - teBL) * fmwt * (1 - 1.07 * oppORpct), teMP) * MP : 0;
    const stop2to = MP ? s(oppTO - teST, teMP) * MP : 0;
    const stop2ft = tePF ? s(g.ff, tePF) * 0.4 * oppFTA * Math.pow(1 - oppFTpct, 2) : 0;
    const stop = stop1 + stop2fg + stop2to + stop2ft;
    const stopPct = MP ? s(stop, oppPoss * (MP / teMP)) : 0;
    const defRtg = teDefRtg + 0.2 * (100 * s(oppPts, oppScPoss) * (1 - stopPct) - teDefRtg);
    // Rimbalzi %/recuperi: stesse formule già usate per BPM/VORP (percentualiGiocatoreAvz,
    // sola lettura, non duplicate) — qui al posto dello Stop% (poco leggibile) per
    // mostrare la parte "concreta" (a referto) del contributo difensivo.
    const p = percentualiGiocatoreAvz(g, A, B, teamMin, teamPlays, adv);
    return {
      num: n, nome: nomeAnalisi(n), g: agg.presenze[n] || 0, min: MP, defRtg: defRtg,
      orb: p.orPct, drb: p.drPct, trb: p.trPct, rec: g.pr || 0
    };
  }).filter(x => x.min > 0).sort((a, b) => a.defRtg - b.defRtg);   // più basso = migliore

  return { righe: righe, teDefRtg: teDefRtg };
}

function vistaDefRtg() {
  if (!cacheEventiStagione) return '<div class="st-hint">Nessun dato in cache — apri prima Analisi stagione.</div>';
  const gare = garePerAnalisi();
  if (!gare.length) return '<div class="st-hint">Nessuna gara conclusa con questi filtri.</div>';
  let agg;
  try { agg = aggregaStagione(gare); } catch (e) { return '<div class="st-hint">Errore: ' + esc(e && e.message || e) + '</div>'; }
  const r = calcolaDefRtg(agg);
  if (!r.righe.length) return '<div class="st-hint">Nessun giocatore con minuti in questi filtri.</div>';
  const righe = r.righe.map(x =>
    '<tr><td class="st-n">#' + esc(x.num) + '</td><td class="st-g">' + esc(x.nome || "") + '</td><td>' + x.g + '</td>' +
    '<td>' + mmss(x.min) + '</td>' +
    '<td>' + dec(x.defRtg, 1) + '</td>' +
    '<td>' + dec(x.orb, 1) + '%</td>' +
    '<td>' + dec(x.drb, 1) + '%</td>' +
    '<td>' + dec(x.trb, 1) + '%</td>' +
    '<td>' + x.rec + '</td></tr>'
  ).join('');
  return '<div class="st-hint">Def. Rating di squadra: ' + dec(r.teDefRtg, 1) + ' · punti concessi ogni 100 possessi col giocatore in campo (meno = meglio) · ordinato dal migliore.</div>' +
    '<div class="st-scroll"><table class="st-box"><thead><tr><th>#</th><th>Giocatore</th><th>PG</th><th>Min</th><th>DefRtg</th><th>OREB%</th><th>DREB%</th><th>TREB%</th><th>REC</th></tr></thead>' +
    '<tbody>' + righe + '</tbody></table></div>' +
    '<div class="st-hint">OREB%/DREB%/TREB% = quota dei rimbalzi disponibili (offensivi/difensivi/totali) presi mentre era in campo · REC = recuperi totali in stagione. ' +
    'Stoppate non tracciate (termine sempre 0, quindi i tiri "contestati e sbagliati per merito di una stoppata" ' +
    'restano attribuiti solo ai rimbalzi difensivi). Formula di Dean Oliver ("Basket on Paper") via hackastat.eu — stima, non un dato certo: ' +
    'assume 5 difensori della stessa bravura e ripartisce i contributi non nel tabellino in base ai minuti giocati.</div>';
}

/* ==========================================================================
   RENDER
   ========================================================================== */
/* Analisi avanzata NON ha una sua barra filtri: riusa `filtriAnalisi` in sola
   lettura, condiviso con Analisi stagione (garePerAnalisi()) — per questo il
   filtro qui è "quello che era impostato l'ultima volta in Analisi stagione",
   invisibile altrimenti. Una riga di riepilogo evita di confrontare numeri di
   qui con quelli di un'altra vista (es. Player Development, che ha invece un
   filtro INDIPENDENTE, `filtriPlayerDev`) senza sapere se stanno guardando le
   stesse gare. */
function etichettaFiltriAnalisi_() {
  const f = (typeof filtriAnalisi !== "undefined" && filtriAnalisi) || {};
  const comp = f.competizione === "Amichevole" ? "Amichevoli" : (f.competizione || "Campionato");
  const campo = f.campo && f.campo !== "tutte" ? f.campo : "Tutte";
  const esito = f.esito && f.esito !== "tutte" ? (f.esito === "vinte" ? "Vinte" : "Perse") : "Tutte";
  return '<div class="st-hint avz-filtro-attivo">Filtro attivo (da Analisi stagione): <strong>' + esc(comp) + '</strong> · ' + esc(campo) + ' · ' + esc(esito) + '</div>';
}
function renderAnalisiAvanzata() {
  document.querySelectorAll("#avz-tabs button").forEach(b =>
    b.classList.toggle("attivo", b.dataset.avztab === avzTab));
  const body = document.getElementById("avz-body");
  if (!body) return;
  if (!cacheEventiStagione) { body.innerHTML = '<div class="st-hint">Apri prima Analisi stagione per scaricare le gare.</div>'; return; }
  try {
    const vista = avzTab === "bpm" ? vistaBpmVorp() : avzTab === "defrtg" ? vistaDefRtg() : vistaAIS();
    body.innerHTML = etichettaFiltriAnalisi_() + vista;
  } catch (e) {
    body.innerHTML = '<div class="st-hint">Errore: ' + esc(e && e.message || e) + '</div>';
  }
}

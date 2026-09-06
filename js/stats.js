/* ==========================================================================
   stats.js — Box score live (Lega Basket), andamento, tiri, advanced stats.
   Calcolo client-side da eventLog. Fetch dal foglio solo per partite storiche.
   ========================================================================== */

let statsTab = "tabellino";
let advTab = "squadra";
let statsFmt = "num";   // "num" | "pct"
let statsEventiRemoti = null;   // { id_partita, eventi, nome } se guardiamo una partita non live
let seguiLive = null;          // { id, nome, timer } modalità sola-lettura con polling

/* ==========================================================================
   SEGUI LIVE — un altro device sta segnando: sola lettura, refresh ~20s
   ========================================================================== */
function avviaModalitaSegui(p) {
  fermaSeguiLive();
  const id = String(p.id_partita);
  const nome = CONFIG.NOME_SQUADRA_MIA + (p.luogo === "Casa" ? " vs " : " @ ") + (p.avversario || "");
  seguiLive = { id: id, nome: nome, timer: null };
  statsEventiRemoti = { id_partita: id, eventi: [], nome: nome };
  statsTab = "tabellino";
  navigaA("stats");
  mostraToast("Segui live — sola lettura");
  pollSeguiLive();
}

function fermaSeguiLive() {
  if (seguiLive && seguiLive.timer) clearTimeout(seguiLive.timer);
  seguiLive = null;
}

function pollSeguiLive() {
  if (!seguiLive) return;
  scaricaEventiPartita(seguiLive.id, () => {
    if (!seguiLive) return;
    if (document.getElementById("view-stats").classList.contains("attiva")) renderStats();
    else if (document.getElementById("view-adv").classList.contains("attiva")) renderAdv();
    seguiLive.timer = setTimeout(pollSeguiLive, 20000);
  });
}

function bannerSegui() {
  if (!seguiLive) return "";
  return '<div class="segui-bar"><span>● SEGUI LIVE · aggiornamento auto 20s · sola lettura</span>' +
    '<button id="segui-stop">Esci</button></div>';
}

function tempoInSec(mmss) {
  const p = String(mmss || "0:0").split(":");
  return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0);
}
function frac(m, a) { return m + "/" + a; }
function pct(m, a) { return a ? Math.round(m / a * 100) + "%" : "–"; }
function dec(x, n) { return (isFinite(x) ? x : 0).toFixed(n == null ? 1 : n); }
function mmss(minFloat) {
  const s = Math.round((minFloat || 0) * 60);
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}
function periodoSecQ(q) { return /^OT/i.test(String(q || "")) ? CONFIG.DURATA_OT_SEC : CONFIG.DURATA_QUARTO_SEC; }

/* Nome breve giocatore: convocati della partita → anagrafica → vuoto */
function nomeGiocatore(n) {
  const c = (state.convocati || []).find(x => String(x.numero) === String(n));
  if (c && c.nickname) return c.nickname;
  if (c && c.cognome) return c.cognome.slice(0, 8);
  const g = (typeof caricaGiocatori === "function" ? caricaGiocatori() : [])
    .find(x => String(x.numero_maglia) === String(n));
  if (g && g.nickname) return g.nickname;
  if (g && g.cognome) return g.cognome.slice(0, 8);
  return "";
}

function esitiArray(v) {
  if (Array.isArray(v)) return v;
  return String(v || "").split(",").map(s => s.trim()).filter(Boolean);
}

/* ---------- Sorgente eventi: live (state) o remota (fetch foglio) ---------- */
function statsContesto() {
  const live = !statsEventiRemoti || statsEventiRemoti.id_partita === state.id_partita;
  if (live) {
    return {
      live: true,
      eventi: (state.eventLog || []).map(x => x.evento || x),
      punteggio: { MIA: state.punteggio.MIA, OPP: state.punteggio.OPP },
      convocati: state.convocati || [],
      nome: state.nomePartita || (CONFIG.NOME_SQUADRA_MIA + " vs " + (state.avversarioBreve || "AVV")),
      minuti: minutiGiocatiLive(),
      tempoOra: state.tempoPartita,
      quartoOra: nomeQuarto()
    };
  }
  const ev = statsEventiRemoti.eventi.filter(e => String(e.valido).toUpperCase() !== "FALSE");
  const ultimo = ev[ev.length - 1] || {};
  return {
    live: false,
    eventi: ev,
    punteggio: punteggioDaEventi(ev),
    convocati: [],
    nome: statsEventiRemoti.nome || ("Gara " + statsEventiRemoti.id_partita),
    minuti: minutiDaEventi(ev),
    tempoOra: ultimo.tempo_partita || "00:00",
    quartoOra: ultimo.quarto || "Q1"
  };
}

function punteggioDaEventi(eventi) {
  for (let i = eventi.length - 1; i >= 0; i--) {
    const pp = String(eventi[i].punteggio_progressivo || "");
    const m = pp.match(/^(\d+)-(\d+)$/);
    if (m) return { MIA: +m[1], OPP: +m[2] };
  }
  return { MIA: 0, OPP: 0 };
}
function minutiGiocatiLive() {
  const reg = CONFIG.QUARTI_REGOLAMENTARI;
  const qi = state.quartoIndice;
  let sec = 0;
  for (let i = 0; i < qi; i++) sec += (i < reg ? CONFIG.DURATA_QUARTO_SEC : CONFIG.DURATA_OT_SEC);
  const curLen = qi < reg ? CONFIG.DURATA_QUARTO_SEC : CONFIG.DURATA_OT_SEC;
  sec += curLen - tempoInSec(state.tempoPartita);
  return Math.max(sec / 60, 0.1);
}
function minutiDaEventi(eventi) {
  // stima: quarti distinti visti * 10 (+ OT * 5)
  const q = {};
  eventi.forEach(e => { if (e.quarto) q[e.quarto] = 1; });
  let min = 0;
  Object.keys(q).forEach(k => { min += /^OT/.test(k) ? 5 : 10; });
  return Math.max(min, 0.1);
}

/* ---------- Calcolo box score ---------- */
function statVuote() {
  return { pt: 0, m2: 0, a2: 0, m3: 0, a3: 0, ftm: 0, fta: 0, ro: 0, rd: 0, as: 0, pp: 0, pr: 0, ff: 0, fs: 0, min: 0, pm: 0, val: 0 };
}
function valutazione(s) {
  const pos = s.pt + s.ro + s.rd + s.as + s.pr + s.fs;
  const neg = (s.a2 - s.m2) + (s.a3 - s.m3) + (s.fta - s.ftm) + s.pp + s.ff;
  return pos - neg;
}

function calcolaBox(ctx) {
  const pg = {};
  const team = { MIA: statVuote(), OPP: statVuote() };
  const teamReb = { MIA: 0, OPP: 0 };   // rimbalzi di squadra
  ctx.convocati.forEach(c => { pg[c.numero] = statVuote(); });
  const P = n => (pg[n] = pg[n] || statVuote());

  ctx.eventi.forEach(ev => {
    const sq = ev.squadra === "OPP" ? "OPP" : "MIA";
    const n = ev.giocatore_num;
    const t = ev.tipo_evento;
    const d = String(ev.dettaglio || "");
    const T = team[sq];

    if (t === "TIRO") {
      const tre = d.indexOf("3P") === 0;
      const seg = d.indexOf("SEGNATO") > -1;
      if (tre) { T.a3++; if (seg) T.m3++; } else { T.a2++; if (seg) T.m2++; }
      if (sq === "MIA" && n) {
        const g = P(n);
        if (tre) { g.a3++; if (seg) g.m3++; } else { g.a2++; if (seg) g.m2++; }
        g.pt += ev.punti_segnati || 0;
      }
    } else if (t === "FALLO_SUBITO") {
      const es = esitiArray(ev.esito_tl);
      const made = es.filter(v => v === "SI").length;
      team.MIA.ftm += made; team.MIA.fta += es.length; team.MIA.fs++;
      if (n) { const g = P(n); g.ftm += made; g.fta += es.length; g.pt += ev.punti_segnati || 0; g.fs++; }
    } else if (t === "FALLO_FATTO") {
      const es = esitiArray(ev.esito_tl);
      const made = es.filter(v => v === "SI").length;
      team.OPP.ftm += made; team.OPP.fta += es.length;
      team.MIA.ff++;
      if (n) P(n).ff++;
    } else if (t === "RECUPERO") {
      T.pr++; if (sq === "MIA" && n) P(n).pr++;
    } else if (t === "PALLA_PERSA") {
      T.pp++; if (sq === "MIA" && n) P(n).pp++;
    } else if (t === "ASSIST") {
      team.MIA.as++; if (n) P(n).as++;
    } else if (t === "RIMBALZO") {
      if (d === "OFFENSIVO") { T.ro++; if (sq === "MIA" && n) P(n).ro++; }
      else if (d === "DIFENSIVO") { T.rd++; if (sq === "MIA" && n) P(n).rd++; }
      else { teamReb[sq]++; }
    }
  });

  team.MIA.pt = ctx.punteggio.MIA;
  team.OPP.pt = ctx.punteggio.OPP;

  // minuti + plus/minus: ricostruiti dagli eventi (coerenti su ogni device)
  const stints = stintsDaEventi(ctx.eventi, ctx.tempoOra, ctx.quartoOra);
  const mp = minutiDaStints(stints);
  Object.keys(pg).forEach(n => {
    pg[n].min = mp[n] ? mp[n].min : 0;
    pg[n].pm = mp[n] ? mp[n].pm : 0;
  });

  Object.keys(pg).forEach(n => { pg[n].val = valutazione(pg[n]); });
  team.MIA.val = valutazione(team.MIA);
  team.OPP.val = valutazione(team.OPP);
  team.MIA.rSquadra = teamReb.MIA;
  team.OPP.rSquadra = teamReb.OPP;
  return { pg, team, stints: stints };
}

/* Ricostruisce gli stint (quintetto + durata + ±) dal flusso eventi.
   quintetto_mia è su ogni evento; tempo_partita cambia solo ai checkpoint. */
function stintsDaEventi(eventi, tempoOra, quartoOra) {
  const lineupOf = v => String(v || "").split(",").map(x => x.trim()).filter(Boolean);
  const scoreOf = ev => {
    const m = String(ev.punteggio_progressivo || "").match(/^(\d+)-(\d+)$/);
    return m ? { MIA: +m[1], OPP: +m[2] } : null;
  };
  const out = [];
  let cur = null, lastSc = { MIA: 0, OPP: 0 };

  const chiudi = (fineSc, fineT) => {
    if (!cur) return;
    out.push({
      quarto: cur.quarto,
      quintetto: cur.quintetto.slice(),
      tIn: cur.tIn,
      tFine: fineT,
      durSec: Math.min(Math.max(cur.tIn - fineT, 0), periodoSecQ(cur.quarto)),
      plusMinus: (fineSc.MIA - cur.scIn.MIA) - (fineSc.OPP - cur.scIn.OPP)
    });
  };

  (eventi || []).forEach(ev => {
    const lu = lineupOf(ev.quintetto_mia);
    const t = tempoInSec(ev.tempo_partita);
    const sc = scoreOf(ev) || lastSc;
    lastSc = sc;
    if (!lu.length) return;
    if (!cur) { cur = { quarto: ev.quarto, quintetto: lu, tIn: t, scIn: sc }; return; }
    if (ev.quarto && ev.quarto !== cur.quarto) {          // fine periodo
      chiudi(sc, 0);
      cur = { quarto: ev.quarto, quintetto: lu, tIn: periodoSecQ(ev.quarto), scIn: sc };
    } else if (lu.join(",") !== cur.quintetto.join(",")) { // cambio quintetto
      chiudi(sc, t);
      cur = { quarto: ev.quarto, quintetto: lu, tIn: t, scIn: sc };
    }
  });
  if (cur) {
    const tOra = (quartoOra && quartoOra !== cur.quarto) ? 0 : tempoInSec(tempoOra);
    chiudi(lastSc, tOra);
  }
  return out;
}

function minutiDaStints(stints) {
  const out = {};
  (stints || []).forEach(s => (s.quintetto || []).forEach(n => {
    out[n] = out[n] || { min: 0, pm: 0 };
    out[n].min += s.durSec / 60;
    out[n].pm += s.plusMinus || 0;
  }));
  return out;
}

/* ---------- Advanced ---------- */
function calcolaAdvanced(box, minuti) {
  const A = box.team.MIA, B = box.team.OPP;
  const fga = x => x.a2 + x.a3;
  const fgm = x => x.m2 + x.m3;
  const poss = x => fga(x) + 0.44 * x.fta - x.ro + x.pp;
  const s = (x, y) => (y ? x / y : 0);
  const pA = poss(A), pB = poss(B);
  return {
    possA: pA, possB: pB,
    ortg: s(A.pt, pA) * 100,
    drtg: s(B.pt, pB) * 100,
    net: (s(A.pt, pA) - s(B.pt, pB)) * 100,
    pace: s((pA + pB) / 2 * 40, minuti),
    efgA: s(fgm(A) + 0.5 * A.m3, fga(A)) * 100,
    efgB: s(fgm(B) + 0.5 * B.m3, fga(B)) * 100,
    tsA: s(A.pt, 2 * (fga(A) + 0.44 * A.fta)) * 100,
    tsB: s(B.pt, 2 * (fga(B) + 0.44 * B.fta)) * 100,
    tovA: s(A.pp, pA) * 100,
    tovB: s(B.pp, pB) * 100,
    orbA: s(A.ro, A.ro + B.rd) * 100,
    orbB: s(B.ro, B.ro + A.rd) * 100,
    drbA: s(A.rd, A.rd + B.ro) * 100,
    drbB: s(B.rd, B.rd + A.ro) * 100
  };
}

/* ==========================================================================
   RENDER — STATS
   ========================================================================== */
function renderStats(tab) {
  if (tab) statsTab = tab;
  const ctx = statsContesto();
  const box = calcolaBox(ctx);
  const opp = state.avversarioBreve || "AVV";

  document.getElementById("stats-titolo").textContent = ctx.nome + (ctx.live ? " · LIVE" : "");
  document.querySelectorAll(".stats-tabs button").forEach(b =>
    b.classList.toggle("attivo", b.dataset.stab === statsTab));

  const body = document.getElementById("stats-body");
  let html;
  if (statsTab === "andamento") html = vistaAndamento(ctx);
  else if (statsTab === "tiri") html = vistaTiri(box, opp);
  else html = vistaTabellino(ctx, box, opp);
  body.innerHTML = bannerSegui() + html;
}

function rigaSquadra(nome, t, opp, cls) {
  const p = statsFmt === "pct";
  const orb = p ? '<span>RO% ' + pct(t.ro, t.ro + opp.rd) + '</span>' : '';
  const drb = p ? '<span>RD% ' + pct(t.rd, t.rd + opp.ro) + '</span>' : '';
  return '<div class="st-team ' + (cls || "") + '">' +
    '<span class="st-team-nome">' + nome + '</span>' +
    '<span class="st-team-pt">' + t.pt + '</span>' +
    '<span>FG ' + (p ? pct(t.m2 + t.m3, t.a2 + t.a3) : frac(t.m2 + t.m3, t.a2 + t.a3)) + '</span>' +
    '<span>2P ' + (p ? pct(t.m2, t.a2) : frac(t.m2, t.a2)) + '</span>' +
    '<span>3P ' + (p ? pct(t.m3, t.a3) : frac(t.m3, t.a3)) + '</span>' +
    '<span>TL ' + (p ? pct(t.ftm, t.fta) : frac(t.ftm, t.fta)) + '</span>' +
    '<span>RIM ' + (t.ro + t.rd) + '</span>' + orb + drb +
    '<span>AS ' + t.as + '</span>' +
    '<span>PP ' + t.pp + '</span>' +
  '</div>';
}

function toggleFmt() {
  return '<div class="st-fmt">' +
    '<button data-fmt="num" class="' + (statsFmt === "num" ? "attivo" : "") + '">Numeri</button>' +
    '<button data-fmt="pct" class="' + (statsFmt === "pct" ? "attivo" : "") + '">%</button>' +
  '</div>';
}

function vistaTabellino(ctx, box, opp) {
  const conv = ctx.convocati.slice();
  const numeri = conv.length
    ? conv.map(c => c.numero)
    : Object.keys(box.pg).map(Number).sort((a, b) => a - b);
  const p = statsFmt === "pct";
  const s = (x, y) => (y ? x / y : 0);

  let righe = "";
  numeri.forEach(n => {
    const g = box.pg[n] || statVuote();
    const fga = g.a2 + g.a3, fgm = g.m2 + g.m3;
    const cel = p
      ? '<td>' + pct(g.m2, g.a2) + '</td><td>' + pct(g.m3, g.a3) + '</td><td>' + pct(g.ftm, g.fta) + '</td>' +
        '<td>' + (fga ? dec(s(fgm + 0.5 * g.m3, fga) * 100, 0) + '%' : '–') + '</td>' +
        '<td>' + (fga || g.fta ? dec(s(g.pt, 2 * (fga + 0.44 * g.fta)) * 100, 0) + '%' : '–') + '</td>'
      : '<td>' + frac(g.m2, g.a2) + '</td><td>' + frac(g.m3, g.a3) + '</td><td>' + frac(g.ftm, g.fta) + '</td>' +
        '<td class="sm-hide">' + g.ro + '</td><td class="sm-hide">' + g.rd + '</td>';
    righe +=
      '<tr>' +
      '<td class="st-n">#' + n + '</td>' +
      '<td class="st-g">' + nomeGiocatore(n) + '</td>' +
      '<td class="sm-hide">' + mmss(g.min) + '</td>' +
      '<td class="st-pt">' + g.pt + '</td>' +
      cel +
      '<td>' + (g.ro + g.rd) + '</td>' +
      '<td>' + g.as + '</td>' +
      '<td class="sm-hide">' + g.pr + '</td>' +
      '<td class="sm-hide">' + g.pp + '</td>' +
      '<td>' + g.ff + '</td>' +
      '<td class="sm-hide">' + g.fs + '</td>' +
      '<td class="sm-hide st-val">' + g.val + '</td>' +
      '<td class="sm-hide">' + (g.pm > 0 ? "+" : "") + dec(g.pm, 0) + '</td>' +
      '</tr>';
  });

  const th = p
    ? ['#', 'G', 'MIN', 'PT', '2P%', '3P%', 'TL%', 'eFG%', 'TS%', 'RT', 'AS', 'PR', 'PP', 'FF', 'FS', 'VAL', '+/-']
    : ['#', 'G', 'MIN', 'PT', '2P', '3P', 'TL', 'RO', 'RD', 'RT', 'AS', 'PR', 'PP', 'FF', 'FS', 'VAL', '+/-'];
  const hide = { MIN: 1, RO: 1, RD: 1, PR: 1, PP: 1, FS: 1, VAL: 1, '+/-': 1 };
  const thead = '<tr>' + th.map(h => '<th' + (hide[h] ? ' class="sm-hide"' : '') + '>' + h + '</th>').join('') + '</tr>';

  return toggleFmt() +
    rigaSquadra(CONFIG.NOME_SQUADRA_MIA, box.team.MIA, box.team.OPP, 'noi') +
    rigaSquadra(opp, box.team.OPP, box.team.MIA, 'avv') +
    '<div class="st-hint">Ruota il telefono per tutte le colonne · header fisso</div>' +
    '<div class="st-scroll"><table class="st-box"><thead>' + thead + '</thead><tbody>' + righe + '</tbody></table></div>';
}

function vistaTiri(box, opp) {
  const A = box.team.MIA, B = box.team.OPP;
  const adv = calcolaAdvanced(box, statsContesto().minuti);
  const barra = (label, mA, aA, mB, aB, pA, pB) =>
    '<div class="st-tiro">' +
      '<div class="st-tiro-top"><span>' + label + '</span>' +
        '<span>' + CONFIG.NOME_SQUADRA_MIA + ' ' + (aA != null ? frac(mA, aA) + ' · ' : '') + dec(pA, 0) + '%' +
        ' · ' + opp + ' ' + (aB != null ? frac(mB, aB) + ' · ' : '') + dec(pB, 0) + '%</span></div>' +
      '<div class="st-bar"><span class="noi" style="width:' + Math.min(pA, 100) + '%"></span></div>' +
      '<div class="st-bar"><span class="avv" style="width:' + Math.min(pB, 100) + '%"></span></div>' +
    '</div>';
  return '' +
    barra('Tiro dal campo (FG)', A.m2 + A.m3, A.a2 + A.a3, B.m2 + B.m3, B.a2 + B.a3,
      (A.a2 + A.a3) ? (A.m2 + A.m3) / (A.a2 + A.a3) * 100 : 0,
      (B.a2 + B.a3) ? (B.m2 + B.m3) / (B.a2 + B.a3) * 100 : 0) +
    barra('Da 2', A.m2, A.a2, B.m2, B.a2, A.a2 ? A.m2 / A.a2 * 100 : 0, B.a2 ? B.m2 / B.a2 * 100 : 0) +
    barra('Da 3', A.m3, A.a3, B.m3, B.a3, A.a3 ? A.m3 / A.a3 * 100 : 0, B.a3 ? B.m3 / B.a3 * 100 : 0) +
    barra('Tiri liberi', A.ftm, A.fta, B.ftm, B.fta, A.fta ? A.ftm / A.fta * 100 : 0, B.fta ? B.ftm / B.fta * 100 : 0) +
    barra('eFG%', null, null, null, null, adv.efgA, adv.efgB) +
    barra('TS%', null, null, null, null, adv.tsA, adv.tsB);
}

function vistaAndamento(ctx) {
  const pts = [{ d: 0 }];
  const quarti = [];
  let curQ = "";
  ctx.eventi.forEach(ev => {
    if (ev.quarto && ev.quarto !== curQ) { curQ = ev.quarto; quarti.push({ i: pts.length, q: ev.quarto }); }
    const m = String(ev.punteggio_progressivo || "").match(/^(\d+)-(\d+)$/);
    if (m) pts.push({ d: (+m[1]) - (+m[2]) });
  });

  const W = 680, H = 240, padL = 34, padR = 12, padT = 12, padB = 18;
  const grezzo = Math.max(4, ...pts.map(p => Math.abs(p.d)));
  const step = grezzo <= 8 ? 2 : grezzo <= 20 ? 5 : 10;
  const maxD = Math.ceil(grezzo / step) * step;
  const xs = i => padL + i * (W - padL - padR) / Math.max(pts.length - 1, 1);
  const ys = d => padT + (maxD - d) * (H - padT - padB) / (2 * maxD);
  const line = pts.map((p, i) => (i ? "L" : "M") + xs(i).toFixed(1) + " " + ys(p.d).toFixed(1)).join(" ");
  const area = line + " L" + xs(pts.length - 1).toFixed(1) + " " + ys(0).toFixed(1) + " L" + padL + " " + ys(0).toFixed(1) + " Z";

  let griglia = "";
  for (let v = -maxD; v <= maxD; v += step) {
    const y = ys(v).toFixed(1);
    griglia +=
      '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" class="' + (v === 0 ? 'st-zero' : 'st-grid') + '"/>' +
      '<text x="' + (padL - 5) + '" y="' + (ys(v) + 3).toFixed(1) + '" class="st-axis" text-anchor="end">' + (v > 0 ? '+' + v : v) + '</text>';
  }
  const divisori = quarti.map(q =>
    '<line x1="' + xs(q.i).toFixed(1) + '" y1="' + padT + '" x2="' + xs(q.i).toFixed(1) + '" y2="' + (H - padB) + '" class="st-q"/>' +
    '<text x="' + (xs(q.i) + 3).toFixed(1) + '" y="' + (H - 5) + '" class="st-qt">' + q.q + '</text>').join('');
  const finale = pts[pts.length - 1].d;

  return '<div class="st-and-tit">Margine ' + CONFIG.NOME_SQUADRA_MIA + ' · attuale ' +
    (finale > 0 ? '+' : '') + finale + ' · max +' + Math.max(0, ...pts.map(p => p.d)) +
    ' / min ' + Math.min(0, ...pts.map(p => p.d)) + '</div>' +
    '<div class="st-scroll"><svg class="st-chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' +
    griglia + divisori +
    '<path d="' + area + '" class="st-area"/>' +
    '<path d="' + line + '" class="st-linea"/>' +
    '</svg></div>' +
    '<div class="st-hint">Sopra lo 0 = ' + CONFIG.NOME_SQUADRA_MIA + ' avanti · ruota per vederlo più grande</div>';
}

/* ==========================================================================
   RENDER — ADVANCED
   ========================================================================== */
function renderAdv(tab) {
  if (tab) advTab = tab;
  const ctx = statsContesto();
  const box = calcolaBox(ctx);
  const opp = state.avversarioBreve || "AVV";
  document.getElementById("adv-titolo").textContent = ctx.nome + (ctx.live ? " · LIVE" : "");
  document.querySelectorAll("#adv-tabs button").forEach(b =>
    b.classList.toggle("attivo", b.dataset.atab === advTab));

  if (advTab === "giocatori") {
    document.getElementById("adv-body").innerHTML = bannerSegui() + vistaAdvGiocatori(ctx, box, opp);
    return;
  }

  const a = calcolaAdvanced(box, ctx.minuti);
  const card = (tit, valA, valB, nota) =>
    '<div class="adv-card">' +
      '<div class="adv-tit">' + tit + '</div>' +
      '<div class="adv-vals"><span class="noi">' + valA + '</span>' +
        (valB != null ? '<span class="avv">' + valB + '</span>' : '') + '</div>' +
      (nota ? '<div class="adv-nota">' + nota + '</div>' : '') +
    '</div>';

  document.getElementById("adv-body").innerHTML = bannerSegui() +
    '<div class="adv-legenda"><span class="noi">' + CONFIG.NOME_SQUADRA_MIA + '</span><span class="avv">' + opp + '</span> · ' +
      dec(ctx.minuti, 0) + "' giocati</div>" +
    '<div class="adv-griglia">' +
      card('Possessi', dec(a.possA), dec(a.possB), 'FGA + 0.44·FTA − ORB + TO') +
      card('Off. Rating', dec(a.ortg), null, 'PTS / Poss × 100') +
      card('Def. Rating', dec(a.drtg), null, 'PTS avv / Poss avv × 100') +
      card('Net Rating', (a.net > 0 ? '+' : '') + dec(a.net), null, 'ORtg − DRtg') +
      card('Pace', dec(a.pace), null, 'Poss × 40 / minuti') +
      card('eFG%', dec(a.efgA) + '%', dec(a.efgB) + '%', '(FGM + 0.5·3PM) / FGA') +
      card('TS%', dec(a.tsA) + '%', dec(a.tsB) + '%', 'PTS / (2·(FGA + 0.44·FTA))') +
      card('TOV%', dec(a.tovA) + '%', dec(a.tovB) + '%', 'TO / Poss × 100') +
      card('Rimb. Off %', dec(a.orbA) + '%', dec(a.orbB) + '%', 'ORB / (ORB + DRB avv)') +
      card('Rimb. Dif %', dec(a.drbA) + '%', dec(a.drbB) + '%', 'DRB / (DRB + ORB avv)') +
    '</div>' +
    vistaStint(box);
}

function vistaAdvGiocatori(ctx, box, opp) {
  const conv = ctx.convocati.slice();
  const numeri = conv.length ? conv.map(c => c.numero)
    : Object.keys(box.pg).map(Number).sort((a, b) => a - b);
  const s = (x, y) => (y ? x / y : 0);

  let righe = "";
  numeri.forEach(n => {
    const g = box.pg[n] || statVuote();
    const fga = g.a2 + g.a3, fgm = g.m2 + g.m3;
    const ts = s(g.pt, 2 * (fga + 0.44 * g.fta)) * 100;
    const efg = s(fgm + 0.5 * g.m3, fga) * 100;
    const astto = g.pp ? dec(g.as / g.pp, 1) : (g.as ? "∞" : "0.0");
    const net40 = g.min ? Math.round(g.pm / g.min * 40) : 0;   // margine squadra /40' con lui in campo
    righe +=
      '<tr>' +
      '<td class="st-n">#' + n + '</td>' +
      '<td class="st-g">' + nomeGiocatore(n) + '</td>' +
      '<td>' + mmss(g.min) + '</td>' +
      '<td class="st-pt">' + g.pt + '</td>' +
      '<td>' + (fga || g.fta ? dec(ts, 0) + '%' : '–') + '</td>' +
      '<td>' + (fga ? dec(efg, 0) + '%' : '–') + '</td>' +
      '<td>' + (g.ro + g.rd) + '</td>' +
      '<td>' + g.as + '</td>' +
      '<td class="sm-hide">' + g.pr + '</td>' +
      '<td class="sm-hide">' + g.pp + '</td>' +
      '<td class="sm-hide">' + astto + '</td>' +
      '<td class="' + (g.pm >= 0 ? 'pos' : 'neg') + '">' + (g.pm > 0 ? '+' : '') + dec(g.pm, 0) + '</td>' +
      '<td class="' + (net40 >= 0 ? 'pos' : 'neg') + '">' + (net40 > 0 ? '+' : '') + net40 + '</td>' +
      '</tr>';
  });

  const th = ['#', 'G', 'MIN', 'PT', 'TS%', 'eFG%', 'RIM', 'AS', 'PR', 'PP', 'AS/PP', '±', 'Net/40'];
  const hide = { PR: 1, PP: 1, 'AS/PP': 1 };

  return '<div class="adv-legenda"><span class="noi">' + CONFIG.NOME_SQUADRA_MIA + '</span> · per-giocatore · ' +
    dec(ctx.minuti, 0) + "' gara</div>" +
    '<div class="st-scroll"><table class="st-box"><thead><tr>' +
    th.map(h => '<th' + (hide[h] ? ' class="sm-hide"' : '') + '>' + h + '</th>').join('') +
    '</tr></thead><tbody>' + righe + '</tbody></table></div>' +
    '<div class="st-hint">Net/40 = margine di squadra ogni 40′ con il giocatore in campo · MIN e ± dagli stint dei cambi</div>';
}

function vistaStint(box) {
  const st = (box && box.stints) || [];
  if (!st.length) return '';
  const lbl = n => "#" + n + (nomeGiocatore(n) ? " " + nomeGiocatore(n) : "");
  const righe = st.map((s, i) =>
    '<tr><td>' + (i + 1) + '</td><td>' + s.quarto + '</td>' +
    '<td>' + mmss(s.tIn / 60) + '→' + mmss(s.tFine / 60) + '</td>' +
    '<td>' + Math.round(s.durSec / 60 * 10) / 10 + "'" + '</td>' +
    '<td>' + (s.quintetto || []).map(lbl).join(", ") + '</td>' +
    '<td class="' + (s.plusMinus >= 0 ? 'pos' : 'neg') + '">' + (s.plusMinus > 0 ? '+' : '') + s.plusMinus + '</td></tr>').join('');
  return '<div class="adv-tit" style="margin-top:14px">Stint / lineup ±</div>' +
    '<div class="st-scroll"><table class="st-box"><thead><tr><th>#</th><th>Q</th><th>Tempo</th><th>Durata</th><th>Quintetto</th><th>±</th></tr></thead><tbody>' +
    righe + '</tbody></table></div>';
}

/* ---------- Fetch partite storiche ---------- */
function scaricaEventiPartita(idPartita, cb) {
  const base = (typeof CONFIG !== "undefined" && CONFIG.APPS_SCRIPT_URL) || "";
  if (!base || base.indexOf("INCOLLA_QUI") === 0) { if (cb) cb(false); return; }
  const nomeCb = "bspEventiCb_" + Date.now();
  const script = document.createElement("script");
  let done = false;
  const pulisci = () => { delete window[nomeCb]; if (script.parentNode) script.parentNode.removeChild(script); };
  window[nomeCb] = function (r) {
    done = true;
    if (r && r.ok && Array.isArray(r.eventi)) {
      statsEventiRemoti = { id_partita: String(idPartita), eventi: r.eventi };
      if (cb) cb(true);
    } else if (cb) cb(false);
    pulisci();
  };
  script.src = base + (base.indexOf("?") > -1 ? "&" : "?") +
    "action=getEventi&id_partita=" + encodeURIComponent(idPartita) + "&callback=" + nomeCb;
  script.onerror = () => { if (!done && cb) cb(false); pulisci(); };
  document.body.appendChild(script);
}

function aggiornaStatsDaFoglio() {
  const id = state.id_partita;
  mostraToast("Aggiorno dal foglio…");
  scaricaEventiPartita(id, ok => {
    if (!ok) { mostraToast("Fetch non riuscito"); return; }
    if (typeof renderStats === "function" && document.getElementById("view-stats").classList.contains("attiva")) renderStats();
    if (typeof renderAdv === "function" && document.getElementById("view-adv").classList.contains("attiva")) renderAdv();
    mostraToast("Dati aggiornati");
  });
}

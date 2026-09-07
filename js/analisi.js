/* ==========================================================================
   analisi.js — Analisi stagione (sezione "Altro")
   Aggrega le sole gare stato === "Terminata". Riusa il motore di stats.js
   (calcolaBox / calcolaAdvanced / eventiPuliti / ...) SOLO in lettura.
   Campionato e amichevoli non si sommano mai.
   ========================================================================== */

let analisiTab = "squadra";                 // "squadra" | "giocatori"
let analisiFmt = "medie";                   // "totali" | "medie"
let analisiSort = { col: "min", dir: -1 };
let filtriAnalisi = { competizione: "Campionato", campo: "tutte", esito: "tutte", stagione: "2026/27" };
let cacheEventiStagione = null;             // { updatedAt, byMatch: { id: [eventiGrezzi] } }
let analisiCaricamento = false;

const KEY_ANALISI_FILTRI = "bsp_analisi_filtri";
const KEY_ANALISI_EVENTI = "bsp_analisi_eventi";
const ANALISI_TTL_MS = 60 * 60 * 1000;      // 1h: oltre → refetch automatico all'apertura

/* ---------- persistenza ---------- */
function caricaFiltriAnalisi() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY_ANALISI_FILTRI));
    if (s && typeof s === "object") filtriAnalisi = Object.assign(filtriAnalisi, s);
  } catch (e) {}
}
function salvaFiltriAnalisi() {
  try { localStorage.setItem(KEY_ANALISI_FILTRI, JSON.stringify(filtriAnalisi)); } catch (e) {}
}
function caricaCacheAnalisi() {
  try { cacheEventiStagione = JSON.parse(localStorage.getItem(KEY_ANALISI_EVENTI)) || null; }
  catch (e) { cacheEventiStagione = null; }
}
function salvaCacheAnalisi() {
  try { localStorage.setItem(KEY_ANALISI_EVENTI, JSON.stringify(cacheEventiStagione)); } catch (e) {}
}

/* ---------- fetch eventi di tutte le gare concluse ---------- */
function caricaEventiStagione(cb) {
  const base = (typeof CONFIG !== "undefined" && CONFIG.APPS_SCRIPT_URL) || "";
  if (!base || base.indexOf("INCOLLA_QUI") === 0) { if (cb) cb(false); return; }
  if (analisiCaricamento) return;
  analisiCaricamento = true;
  renderAnalisi();

  const nomeCb = "bspAnalisiCb_" + Date.now();
  const s = document.createElement("script");
  let done = false;
  const pulisci = () => { delete window[nomeCb]; if (s.parentNode) s.parentNode.removeChild(s); };

  window[nomeCb] = function (r) {
    done = true;
    analisiCaricamento = false;
    if (r && r.ok && Array.isArray(r.eventi)) {
      const byMatch = {};
      r.eventi.forEach(e => {
        const id = String(e.id_partita || "");
        if (!id) return;
        (byMatch[id] = byMatch[id] || []).push(e);
      });
      cacheEventiStagione = { updatedAt: Date.now(), byMatch: byMatch };
      salvaCacheAnalisi();
    } else if (typeof mostraToast === "function") {
      mostraToast("Recupero stagione non riuscito");
    }
    pulisci();
    renderAnalisi();
    if (cb) cb(true);
  };
  s.src = base + (base.indexOf("?") > -1 ? "&" : "?") + "action=getEventiStagione&callback=" + nomeCb;
  s.onerror = () => {
    if (!done) { analisiCaricamento = false; if (typeof mostraToast === "function") mostraToast("Rete assente"); }
    pulisci();
    renderAnalisi();
    if (cb) cb(false);
  };
  document.body.appendChild(s);
}

/* ---------- apertura vista ---------- */
function apriAnalisi() {
  caricaFiltriAnalisi();
  if (!cacheEventiStagione) caricaCacheAnalisi();
  navigaA("analisi");

  const scaduta = !cacheEventiStagione || (Date.now() - (cacheEventiStagione.updatedAt || 0) > ANALISI_TTL_MS);
  const gareTerminate = elencoPartite().filter(p => String(p.stato) === "Terminata");
  const mancano = cacheEventiStagione && gareTerminate.some(p => !cacheEventiStagione.byMatch[String(p.id_partita)]);

  renderAnalisi();
  if (scaduta || mancano) caricaEventiStagione();
}

/* ---------- selezione gare secondo i filtri ---------- */
function garePerAnalisi() {
  const byMatch = (cacheEventiStagione && cacheEventiStagione.byMatch) || {};
  const f = filtriAnalisi;
  return elencoPartite()
    .filter(p => String(p.stato) === "Terminata")
    .filter(p => (p.tipo || "Campionato") === f.competizione)            // campionato/amichevoli mai insieme
    .filter(p => f.stagione === "tutte" || (p.stagione || "2026/27") === f.stagione)
    .filter(p => f.campo === "tutte" || (p.luogo || "Casa") === f.campo)
    .map(p => {
      const raw = byMatch[String(p.id_partita)] || null;
      const finale = raw ? punteggioDaEventi(eventiPuliti(raw)) : null;
      return {
        partita: p,
        eventi: raw,
        finale: finale,
        vinta: finale ? finale.MIA > finale.OPP : null,
        mancante: !raw
      };
    })
    .filter(g => {
      if (filtriAnalisi.esito === "tutte") return true;
      if (!g.finale) return false;
      return filtriAnalisi.esito === "vinte" ? g.vinta : !g.vinta;
    })
    .sort((a, b) => String(a.partita.data_ora || "").localeCompare(String(b.partita.data_ora || "")));
}

/* ---------- box di una singola gara conclusa (come il ramo remoto di statsContesto) ---------- */
function boxGaraSingola(g) {
  const ev = eventiPuliti(g.eventi || []);
  const ultimo = ev[ev.length - 1] || {};
  const ctx = {
    eventi: ev,
    punteggio: g.finale || punteggioDaEventi(ev),
    convocati: [],
    tempoOra: ultimo.tempo_partita || "00:00",
    quartoOra: ultimo.quarto || "Q1"
  };
  const minuti = minutiDaEventi(ev);
  const box = calcolaBox(ctx);
  return { box: box, minuti: minuti };
}

/* ---------- somma di due statLine ---------- */
const CAMPI_STAT = ["pt", "m2", "a2", "m3", "a3", "ftm", "fta", "ro", "rd", "as", "pp", "pr", "ff", "fs", "min", "pm"];
function sommaStat(acc, s) {
  CAMPI_STAT.forEach(k => { acc[k] = (acc[k] || 0) + (Number(s[k]) || 0); });
  return acc;
}
function statZero() { const o = {}; CAMPI_STAT.forEach(k => o[k] = 0); return o; }

/* ---------- aggregazione stagione ---------- */
function aggregaStagione(gare) {
  const valide = gare.filter(g => g.eventi && g.eventi.length);
  const T = { MIA: statZero(), OPP: statZero() };
  let rSquadraMia = 0, rSquadraOpp = 0, minutiTot = 0;
  const pg = {};                          // numero → statLine sommata
  const presenze = {};                    // numero → n. gare
  const perGara = [];                     // { nome, margine, vinta, data }

  valide.forEach(g => {
    const r = boxGaraSingola(g);
    const b = r.box;
    minutiTot += r.minuti;
    sommaStat(T.MIA, b.team.MIA);
    sommaStat(T.OPP, b.team.OPP);
    rSquadraMia += b.team.MIA.rSquadra || 0;
    rSquadraOpp += b.team.OPP.rSquadra || 0;

    const vistiGara = {};
    Object.keys(b.pg).forEach(n => {
      pg[n] = pg[n] || statZero();
      sommaStat(pg[n], b.pg[n]);
      if ((b.pg[n].min || 0) > 0 || haEventoGara(b.pg[n])) vistiGara[n] = 1;
    });
    // minuti + ± anche per chi è stato in campo senza voci a referto (dagli stint)
    const mp = (typeof minutiDaStints === "function") ? minutiDaStints(b.stints) : {};
    Object.keys(mp).forEach(n => {
      if (Object.prototype.hasOwnProperty.call(b.pg, n)) return;   // già sommato sopra
      pg[n] = pg[n] || statZero();
      pg[n].min += mp[n].min || 0;
      pg[n].pm += mp[n].pm || 0;
      vistiGara[n] = 1;
    });
    // presenza anche da quintetto_mia
    (g.eventi || []).forEach(e => {
      String(e.quintetto_mia || "").split(",").map(x => x.trim()).filter(Boolean).forEach(n => { vistiGara[n] = 1; });
    });
    Object.keys(vistiGara).forEach(n => { presenze[n] = (presenze[n] || 0) + 1; });

    const fin = g.finale || { MIA: 0, OPP: 0 };
    perGara.push({
      nome: (typeof avversarioBreveAuto === "function") ? avversarioBreveAuto(g.partita.avversario) : g.partita.avversario,
      casa: g.partita.luogo === "Casa",
      margine: fin.MIA - fin.OPP,
      vinta: fin.MIA > fin.OPP,
      pf: fin.MIA, ps: fin.OPP,
      data: g.partita.data_ora || ""
    });
  });

  T.MIA.rSquadra = rSquadraMia;
  T.OPP.rSquadra = rSquadraOpp;
  T.MIA.val = valutazione(T.MIA);
  T.OPP.val = valutazione(T.OPP);

  const n = valide.length || 1;
  const adv = calcolaAdvanced({ team: T }, minutiTot || 1);
  adv.ftrA = (T.MIA.a2 + T.MIA.a3) ? T.MIA.ftm / (T.MIA.a2 + T.MIA.a3) * 100 : 0;
  adv.ftrB = (T.OPP.a2 + T.OPP.a3) ? T.OPP.ftm / (T.OPP.a2 + T.OPP.a3) * 100 : 0;

  return {
    nGare: valide.length,
    nMancanti: gare.filter(g => g.mancante).length,
    team: T, adv: adv, minutiTot: minutiTot,
    pg: pg, presenze: presenze, perGara: perGara,
    record: {
      v: perGara.filter(x => x.vinta).length,
      p: perGara.filter(x => !x.vinta).length,
      pf: T.MIA.pt, ps: T.OPP.pt
    }
  };
}
function haEventoGara(s) {
  return (s.pt || s.a2 || s.a3 || s.fta || s.ro || s.rd || s.as || s.pp || s.pr || s.ff || s.fs) > 0;
}

/* ---------- nome giocatore SOLO da anagrafica (numero attuale) ---------- */
function nomeAnalisi(num) {
  const g = (typeof caricaGiocatori === "function" ? caricaGiocatori() : [])
    .find(x => String(x.numero_maglia) === String(num));
  if (g && g.nickname) return g.nickname;
  if (g && g.cognome) return g.cognome.slice(0, 10);
  return "";
}

/* ==========================================================================
   RENDER
   ========================================================================== */
function renderAnalisi(tab) {
  if (tab) analisiTab = tab;
  const body = document.getElementById("analisi-body");
  const filtriEl = document.getElementById("analisi-filtri");
  if (!body || !filtriEl) return;

  document.querySelectorAll("#analisi-tabs button").forEach(b =>
    b.classList.toggle("attivo", b.dataset.antab === analisiTab));

  filtriEl.innerHTML = barraFiltriAnalisi();

  if (analisiCaricamento && !cacheEventiStagione) {
    body.innerHTML = '<div class="st-hint">Recupero eventi della stagione…</div>';
    return;
  }
  if (!cacheEventiStagione) {
    body.innerHTML = '<div class="st-hint">Nessun dato in cache. Tocca “Aggiorna” per scaricare le gare concluse.</div>';
    return;
  }

  const gare = garePerAnalisi();
  if (!gare.length) {
    body.innerHTML = '<div class="an-record">0 gare</div>' +
      '<div class="st-hint">Nessuna gara conclusa con questi filtri.</div>';
    return;
  }

  let agg;
  try { agg = aggregaStagione(gare); }
  catch (e) { body.innerHTML = '<div class="st-hint">Errore analisi: ' + esc(e && e.message || e) + '</div>'; return; }

  const avviso = agg.nMancanti
    ? '<div class="st-hint">' + agg.nMancanti + ' gara/e conclusa/e non ancora in cache — tocca “Aggiorna”.</div>'
    : (analisiCaricamento ? '<div class="st-hint">Aggiornamento in corso…</div>' : '');

  body.innerHTML = avviso +
    (analisiTab === "giocatori" ? vistaAnalisiGiocatori(agg) : vistaAnalisiSquadra(agg));
}

/* ---------- barra filtri ---------- */
function chipGruppo(fil, valori) {
  return '<div class="an-chip-grp" data-fil="' + fil + '">' +
    valori.map(v =>
      '<button class="an-chip' + (filtriAnalisi[fil] === v[0] ? ' attivo' : '') +
      '" data-val="' + v[0] + '">' + esc(v[1]) + '</button>').join('') +
    '</div>';
}
function barraFiltriAnalisi() {
  return chipGruppo("competizione", [["Campionato", "Campionato"], ["Amichevole", "Amichevoli"]]) +
    chipGruppo("campo", [["tutte", "Tutte"], ["Casa", "Casa"], ["Trasferta", "Trasferta"]]) +
    chipGruppo("esito", [["tutte", "Tutte"], ["vinte", "Vinte"], ["perse", "Perse"]]);
}
function impostaFiltroAnalisi(fil, val) {
  if (!(fil in filtriAnalisi) || filtriAnalisi[fil] === val) return;
  filtriAnalisi[fil] = val;
  salvaFiltriAnalisi();
  renderAnalisi();
}

/* ---------- vista SQUADRA ---------- */
function vistaAnalisiSquadra(agg) {
  const A = agg.team.MIA, B = agg.team.OPP, adv = agg.adv;
  const n = agg.nGare || 1;
  const med = x => dec(x / n, 1);
  const s = (x, y) => (y ? x / y : 0);

  const strisc = agg.perGara.slice(-5).map(x =>
    '<span class="an-pill ' + (x.vinta ? 'w' : 'l') + '">' + (x.vinta ? 'V' : 'P') + '</span>').join('');

  const card = (tit, valA, valB, nota) =>
    '<div class="adv-card"><div class="adv-tit">' + tit + '</div>' +
    '<div class="adv-vals"><span class="noi">' + valA + '</span>' +
    (valB != null ? '<span class="avv">' + valB + '</span>' : '') + '</div>' +
    (nota ? '<div class="adv-nota">' + nota + '</div>' : '') + '</div>';

  const record =
    '<div class="an-record">' + agg.record.v + '–' + agg.record.p +
    ' · ' + dec(s(agg.record.v, n) * 100, 0) + '% vittorie · ' + n + ' gare' +
    '<span class="an-strisc">' + strisc + '</span></div>';

  const sintesi =
    '<div class="adv-griglia">' +
      card('Punti fatti', med(A.pt), null, 'media a gara · tot ' + A.pt) +
      card('Punti subiti', med(B.pt), null, 'media a gara · tot ' + B.pt) +
      card('Margine', (A.pt - B.pt >= 0 ? '+' : '') + med(A.pt - B.pt), null, 'media a gara') +
      card('Possessi', dec(adv.possA / n, 1), dec(adv.possB / n, 1), 'a gara') +
      card('Pace', dec(adv.pace, 1), null, 'possessi × 40 / minuti') +
      card('Off. Rating', dec(adv.ortg, 1), null, '100 · PTS / possessi') +
      card('Def. Rating', dec(adv.drtg, 1), null, '100 · PTS avv / poss. avv') +
      card('Net Rating', (adv.net >= 0 ? '+' : '') + dec(adv.net, 1), null, 'ORtg − DRtg') +
      card('TS%', dec(adv.tsA, 1) + '%', dec(adv.tsB, 1) + '%', 'PTS / (2·(FGA + 0.44·FTA))') +
    '</div>';

  const ff =
    '<div class="adv-tit" style="margin-top:14px">Four Factors</div>' +
    '<div class="adv-griglia">' +
      card('eFG%', dec(adv.efgA, 1) + '%', dec(adv.efgB, 1) + '%', '(FGM + 0.5·3PM) / FGA') +
      card('Palle perse %', dec(adv.tovA, 1) + '%', dec(adv.tovB, 1) + '%', 'TO / possessi') +
      card('Rimb. off. %', dec(adv.orbA, 1) + '%', dec(adv.orbB, 1) + '%', 'ORB / (ORB + DRB avv)') +
      card('Tiri liberi', dec(adv.ftrA, 1) + '%', dec(adv.ftrB, 1) + '%', 'FT segnati / FGA') +
    '</div>';

  const box =
    '<div class="adv-tit" style="margin-top:14px">Box di squadra · media a gara</div>' +
    '<div class="st-scroll"><table class="st-box"><thead><tr>' +
    ['', 'PT', '2P', '3P', 'TL', 'RO', 'RD', 'RT', 'AS', 'PP', 'REC', 'FF'].map(h => '<th>' + h + '</th>').join('') +
    '</tr></thead><tbody>' +
    rigaBoxSquadra(CONFIG.NOME_SQUADRA_MIA, A, n, 'noi') +
    rigaBoxSquadra('Avversari', B, n, 'avv') +
    '</tbody></table></div>';

  return record + sintesi + ff + graficoMargini(agg) + box +
    '<div class="st-hint">Le percentuali sono calcolate sui totali di stagione, non come media di percentuali.</div>';
}
function rigaBoxSquadra(nome, t, n, cls) {
  const md = x => dec(x / n, 1);
  return '<tr class="' + cls + '"><td class="st-g">' + esc(nome) + '</td>' +
    '<td class="st-pt">' + md(t.pt) + '</td>' +
    '<td>' + md(t.m2) + '/' + md(t.a2) + '</td>' +
    '<td>' + md(t.m3) + '/' + md(t.a3) + '</td>' +
    '<td>' + md(t.ftm) + '/' + md(t.fta) + '</td>' +
    '<td>' + md(t.ro) + '</td><td>' + md(t.rd) + '</td><td>' + md(t.ro + t.rd) + '</td>' +
    '<td>' + md(t.as) + '</td><td>' + md(t.pp) + '</td><td>' + md(t.pr) + '</td><td>' + md(t.ff) + '</td></tr>';
}

/* grafico margine gara per gara (barre) */
function graficoMargini(agg) {
  const g = agg.perGara;
  if (!g.length) return '';
  const W = 680, H = 170, padT = 12, padB = 26, padL = 26, padR = 8;
  const grezzo = Math.max(6, ...g.map(x => Math.abs(x.margine)));
  const step = grezzo <= 10 ? 5 : grezzo <= 30 ? 10 : 20;
  const maxD = Math.ceil(grezzo / step) * step;
  const bw = (W - padL - padR) / g.length;
  const y0 = padT + maxD * (H - padT - padB) / (2 * maxD);
  const ys = d => padT + (maxD - d) * (H - padT - padB) / (2 * maxD);

  let griglia = '';
  for (let v = -maxD; v <= maxD; v += step) {
    const y = ys(v).toFixed(1);
    griglia += '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" class="' + (v === 0 ? 'st-zero' : 'st-grid') + '"/>' +
      '<text x="' + (padL - 4) + '" y="' + (ys(v) + 3).toFixed(1) + '" class="st-axis" text-anchor="end">' + (v > 0 ? '+' + v : v) + '</text>';
  }
  const barre = g.map((x, i) => {
    const bx = padL + i * bw + bw * 0.15;
    const w = bw * 0.7;
    const top = x.margine >= 0 ? ys(x.margine) : y0;
    const h = Math.max(1, Math.abs(ys(x.margine) - y0));
    return '<rect x="' + bx.toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + w.toFixed(1) +
      '" height="' + h.toFixed(1) + '" class="' + (x.vinta ? 'an-barw' : 'an-barl') + '"/>' +
      '<text x="' + (bx + w / 2).toFixed(1) + '" y="' + (H - 14) + '" class="st-qt" text-anchor="middle">' + esc((x.casa ? '' : '@') + (x.nome || '').slice(0, 3)) + '</text>';
  }).join('');

  return '<div class="adv-tit" style="margin-top:14px">Margine gara per gara</div>' +
    '<div class="st-scroll"><svg class="st-chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' +
    griglia + barre + '</svg></div>';
}

/* ---------- vista GIOCATORI ---------- */
function vistaAnalisiGiocatori(agg) {
  const s = (x, y) => (y ? x / y : 0);
  const teamPlays = (agg.team.MIA.a2 + agg.team.MIA.a3) + 0.44 * agg.team.MIA.fta + agg.team.MIA.pp;
  const teamMin = agg.minutiTot || 1;
  const medie = analisiFmt === "medie";

  const righe = Object.keys(agg.pg).map(Number).map(nn => {
    const gPl = agg.pg[nn];
    const G = agg.presenze[nn] || 0;
    const fga = gPl.a2 + gPl.a3, fgm = gPl.m2 + gPl.m3;
    const div = medie ? (G || 1) : 1;
    const q = x => dec(x / div, 1);
    const efg = fga ? s(fgm + 0.5 * gPl.m3, fga) * 100 : null;
    const ts = (fga || gPl.fta) ? s(gPl.pt, 2 * (fga + 0.44 * gPl.fta)) * 100 : null;
    const plays = fga + 0.44 * gPl.fta + gPl.pp;
    const usg = (gPl.min && teamPlays) ? 100 * plays * (teamMin / 5) / (gPl.min * teamPlays) : 0;
    const astR = (fga + 0.44 * gPl.fta + gPl.as + gPl.pp) ? gPl.as * 100 / (fga + 0.44 * gPl.fta + gPl.as + gPl.pp) : 0;
    const tovR = (fga + 0.44 * gPl.fta + gPl.as + gPl.pp) ? gPl.pp * 100 / (fga + 0.44 * gPl.fta + gPl.as + gPl.pp) : 0;
    const net40 = gPl.min ? Math.round(gPl.pm / gPl.min * 40) : 0;
    const val = {
      num: nn, nome: nomeAnalisi(nn), g: G,
      min: gPl.min, pt: gPl.pt, rt: gPl.ro + gPl.rd, as: gPl.as, pp: gPl.pp, pr: gPl.pr,
      ff: gPl.ff, fs: gPl.fs, pm: gPl.pm,
      efg: efg, ts: ts, usg: usg, astr: astR, tovr: tovR, net40: net40,
      _q: q, _fgm2: [gPl.m2, gPl.a2], _fgm3: [gPl.m3, gPl.a3], _ft: [gPl.ftm, gPl.fta]
    };
    return val;
  });

  const dir = analisiSort.dir;
  righe.sort((a, b) => {
    const c = analisiSort.col;
    const va = (c in a) ? a[c] : 0, vb = (c in b) ? b[c] : 0;
    if (va === vb) return a.num - b.num;
    return (va < vb ? -1 : 1) * dir;
  });

  // [chiave-ordinamento | null, etichetta]
  const cols = [
    ["num", "#"], ["nome", "Giocatore"], ["g", "PG"], ["min", "MIN"], ["pt", "PT"],
    [null, "2P"], [null, "3P"], [null, "TL"],
    ["efg", "eFG%"], ["ts", "TS%"], ["rt", "RT"], ["as", "AS"], ["pp", "PP"], ["pr", "REC"],
    ["ff", "FF"], ["fs", "FS"], ["usg", "USG%"], ["astr", "AST%"], ["tovr", "TOV%"],
    ["pm", "+/-"], ["net40", "Net/40"]
  ];
  const thead = '<tr>' + cols.map(c =>
    (c[0]
      ? '<th data-sort="' + c[0] + '"' + (analisiSort.col === c[0] ? ' class="an-sorted"' : '') + '>' +
        c[1] + (analisiSort.col === c[0] ? (dir < 0 ? ' ▾' : ' ▴') : '') + '</th>'
      : '<th>' + c[1] + '</th>')).join('') + '</tr>';

  const body = righe.map(r => {
    const q = r._q;
    const perc = (v) => v == null ? '–' : dec(v, 0) + '%';
    const md = medie;
    return '<tr>' +
      '<td class="st-n">#' + r.num + '</td>' +
      '<td class="st-g">' + esc(r.nome || ('#' + r.num)) + '</td>' +
      '<td>' + r.g + '</td>' +
      '<td>' + (md ? mmss(r.min / (r.g || 1)) : mmss(r.min)) + '</td>' +
      '<td class="st-pt">' + q(r.pt) + '</td>' +
      '<td>' + q(r._fgm2[0]) + '/' + q(r._fgm2[1]) + '</td>' +
      '<td>' + q(r._fgm3[0]) + '/' + q(r._fgm3[1]) + '</td>' +
      '<td>' + q(r._ft[0]) + '/' + q(r._ft[1]) + '</td>' +
      '<td>' + perc(r.efg) + '</td>' +
      '<td>' + perc(r.ts) + '</td>' +
      '<td>' + q(r.rt) + '</td>' +
      '<td>' + q(r.as) + '</td>' +
      '<td>' + q(r.pp) + '</td>' +
      '<td>' + q(r.pr) + '</td>' +
      '<td>' + q(r.ff) + '</td>' +
      '<td>' + q(r.fs) + '</td>' +
      '<td>' + dec(r.usg, 1) + '%</td>' +
      '<td>' + dec(r.astr, 1) + '%</td>' +
      '<td>' + dec(r.tovr, 1) + '%</td>' +
      '<td class="' + (r.pm >= 0 ? 'pos' : 'neg') + '">' + (r.pm > 0 ? '+' : '') + dec(r.pm, 0) + '</td>' +
      '<td class="' + (r.net40 >= 0 ? 'pos' : 'neg') + '">' + (r.net40 > 0 ? '+' : '') + r.net40 + '</td>' +
      '</tr>';
  }).join('');

  return '<div class="st-fmt">' +
      '<button data-anfmt="totali" class="' + (analisiFmt === 'totali' ? 'attivo' : '') + '">Totali</button>' +
      '<button data-anfmt="medie" class="' + (analisiFmt === 'medie' ? 'attivo' : '') + '">Medie</button>' +
    '</div>' +
    '<div class="st-scroll"><table class="st-box an-tab"><thead>' + thead + '</thead><tbody>' + body + '</tbody></table></div>' +
    '<div class="st-hint">Tocca un\'intestazione per ordinare · PG = presenze · USG/AST%/TOV% approssimati a livello gara · nomi e numeri dall\'anagrafica attuale.</div>';
}

function impostaOrdineAnalisi(col) {
  if (!col) return;
  if (analisiSort.col === col) analisiSort.dir *= -1;
  else analisiSort = { col: col, dir: (col === "num" || col === "nome") ? 1 : -1 };
  renderAnalisi();
}
function impostaFmtAnalisi(f) {
  if (f !== "totali" && f !== "medie") return;
  analisiFmt = f;
  renderAnalisi();
}

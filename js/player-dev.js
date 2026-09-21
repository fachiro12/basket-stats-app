/* ==========================================================================
   player-dev.js — Player Development (Altro → Analisi, sperimentale)
   Scheda di sviluppo individuale per giocatore: fino a 5 obiettivi (metrica +
   valore target + nota libera), con orizzonte 1/3/6 mesi scelto per singolo
   obiettivo. Tracking stagionale (medie + gara per gara) sulle stesse metriche
   già calcolate in Analisi stagione/avanzata — sola lettura di boxGaraSingola/
   aggregaStagione/calcolaAdvanced/calcolaLVI/calcolaDefRtg/calcolaBpmVorp
   (già globali da analisi.js/stats.js/analisi-avanzata.js). Vedi CLAUDE.md
   (no-regressioni-riuso-funzioni): nuova feature = nuovo file.

   Persistenza: come l'anagrafica giocatori (giocatori.js) — cache locale
   (bsp_obiettivi) + sync cloud fire-and-forget (SALVA_OBIETTIVO) + lettura
   JSONP (getObiettivi) all'apertura sezione. Richiede backend V4.14.

   Per le 4 metriche "stagionali" (Def Rating, BPM, OBPM, DBPM, VORP) non ha
   senso un valore per singola gara (sono costrutti a livello di aggiustamento
   di squadra) — il loro "andamento" è invece CUMULATIVO: il valore che si
   otterrebbe calcolando la metrica sulle sole gare fino a quel momento,
   ricalcolato via via che le gare si aggiungono — riuso letterale di
   calcolaDefRtg()/calcolaBpmVorp() su tagli crescenti di gare, zero riscrittura
   di formule. AIS invece è nativamente per-gara (poi mediata) nella sua stessa
   definizione: qui ne viene ricalcolata una copia locale (stessa formula di
   calcolaAIS() in analisi-avanzata.js, non toccata) perché quella esistente
   scorre TUTTI i giocatori sul filtro globale di Analisi stagione, non sul
   singolo giocatore + filtro indipendente di questa sezione.
   ========================================================================== */

const KEY_OBIETTIVI = "bsp_obiettivi";
const MAX_OBIETTIVI = 5;
const ORIZZONTI = [["1m", "1 mese"], ["3m", "3 mesi"], ["6m", "6 mesi"]];

const CATALOGO_METRICHE = [
  { cod: "ppg", et: "Punti/gara (PPG)", dec: 1, unita: "", tipo: "base" },
  { cod: "rpg", et: "Rimbalzi/gara (RPG)", dec: 1, unita: "", tipo: "base" },
  { cod: "apg", et: "Assist/gara (APG)", dec: 1, unita: "", tipo: "base" },
  { cod: "tpg", et: "Palle perse/gara", dec: 1, unita: "", tipo: "base" },
  { cod: "fgpct", et: "FG%", dec: 1, unita: "%", tipo: "base" },
  { cod: "p3pct", et: "3P%", dec: 1, unita: "%", tipo: "base" },
  { cod: "ftpct", et: "FT%", dec: 1, unita: "%", tipo: "base" },
  { cod: "tspct", et: "TS%", dec: 1, unita: "%", tipo: "base" },
  { cod: "usg", et: "USG%", dec: 1, unita: "%", tipo: "base" },
  { cod: "astpct", et: "AST%", dec: 1, unita: "%", tipo: "base" },
  { cod: "pmpg", et: "+/- per gara", dec: 1, unita: "", tipo: "base" },
  { cod: "ais", et: "AIS", dec: 1, unita: "", tipo: "avanzata" },
  { cod: "defrtg", et: "Def. Rating", dec: 1, unita: "", tipo: "avanzata" },
  { cod: "bpm", et: "BPM", dec: 1, unita: "", tipo: "avanzata" },
  { cod: "obpm", et: "OBPM", dec: 1, unita: "", tipo: "avanzata" },
  { cod: "dbpm", et: "DBPM", dec: 1, unita: "", tipo: "avanzata" },
  { cod: "vorp", et: "VORP", dec: 2, unita: "", tipo: "avanzata" }
];
function infoMetrica(cod) { return CATALOGO_METRICHE.find(m => m.cod === cod) || { cod: cod, et: cod, dec: 1, unita: "", tipo: "base" }; }
function etichettaOrizzonte(cod) { const o = ORIZZONTI.find(x => x[0] === cod); return o ? o[1] : cod; }

/* ==========================================================================
   Persistenza obiettivi — stesso pattern di giocatori.js
   ========================================================================== */
function caricaObiettivi() {
  try { return JSON.parse(localStorage.getItem(KEY_OBIETTIVI)) || []; }
  catch (e) { return []; }
}
function salvaObiettiviLocali(lista) { localStorage.setItem(KEY_OBIETTIVI, JSON.stringify(lista)); }
function obiettiviDiGiocatore(idGiocatore) {
  return caricaObiettivi().filter(o => o.id_giocatore === idGiocatore && !o.eliminato);
}

function upsertObiettivo(rec) {
  const lista = caricaObiettivi();
  if (rec.id) {
    const i = lista.findIndex(o => o.id === rec.id);
    if (i > -1) lista[i] = Object.assign({}, lista[i], rec);
    else lista.push(rec);
  } else {
    rec.id = uuid();
    rec.creato_il = rec.creato_il || new Date().toISOString().slice(0, 10);
    lista.push(rec);
  }
  salvaObiettiviLocali(lista);
  sincronizzaObiettivo(rec, false);
  return rec;
}
function rimuoviObiettivo(id) {
  const lista = caricaObiettivi();
  const i = lista.findIndex(o => o.id === id);
  if (i === -1) return;
  lista[i] = Object.assign({}, lista[i], { eliminato: true });
  salvaObiettiviLocali(lista);
  sincronizzaObiettivo(lista[i], true);
}

function sincronizzaObiettivo(rec, elimina) {
  if (typeof inviaAzione !== "function") return;
  inviaAzione({
    azione: "SALVA_OBIETTIVO",
    elimina: !!elimina,
    id: rec.id,
    id_giocatore: rec.id_giocatore || "",
    metrica: rec.metrica || "",
    target: rec.target != null ? rec.target : "",
    direzione: rec.direzione || "gte",
    orizzonte: rec.orizzonte || "1m",
    creato_il: rec.creato_il || "",
    nota: rec.nota || ""
  });
}

/* ---------- Sync cloud -> client (JSONP, no CORS) ---------- */
function scaricaObiettivi(cb) {
  const base = (typeof CONFIG !== "undefined" && CONFIG.APPS_SCRIPT_URL) || "";
  if (!base || base.indexOf("INCOLLA_QUI") === 0) { if (cb) cb(false); return; }
  const nomeCb = "bspObiettiviCb_" + Date.now();
  const script = document.createElement("script");
  let concluso = false;
  const pulisci = () => { delete window[nomeCb]; if (script.parentNode) script.parentNode.removeChild(script); };
  window[nomeCb] = function (risposta) {
    concluso = true;
    if (risposta && risposta.ok && Array.isArray(risposta.obiettivi)) { mergeObiettiviCloud(risposta.obiettivi); if (cb) cb(true); }
    else if (cb) { cb(false); }
    pulisci();
  };
  script.src = base + (base.indexOf("?") > -1 ? "&" : "?") + "action=getObiettivi&callback=" + nomeCb;
  script.onerror = () => { if (!concluso && cb) cb(false); pulisci(); };
  document.body.appendChild(script);
}
function mergeObiettiviCloud(cloud) {
  const perId = {};
  caricaObiettivi().forEach(o => { if (o.id) perId[o.id] = o; });
  cloud.forEach(c => {
    const id = String(c.id || "").trim();
    if (!id) return;
    perId[id] = {
      id: id,
      id_giocatore: String(c.id_giocatore || ""),
      metrica: String(c.metrica || ""),
      target: c.target === "" || c.target == null ? null : Number(c.target),
      direzione: c.direzione === "lte" ? "lte" : "gte",
      orizzonte: ["1m", "3m", "6m"].indexOf(c.orizzonte) > -1 ? c.orizzonte : "1m",
      creato_il: c.creato_il || "",
      nota: String(c.nota || ""),
      eliminato: !!c.eliminato
    };
  });
  salvaObiettiviLocali(Object.keys(perId).map(k => perId[k]));
}

/* ==========================================================================
   Filtri gare — copia indipendente, stesso pattern di garePerAnalisi/
   garePerRotazioni/garePerRatingNet/garePerBreakdown
   ========================================================================== */
let filtriPlayerDev = { competizione: "Campionato", campo: "tutte", esito: "tutte", stagione: "2026/27" };
function garePerPlayerDev() {
  const byMatch = (cacheEventiStagione && cacheEventiStagione.byMatch) || {};
  const f = filtriPlayerDev;
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
   Estrazione valori metrica — base (per-linea) + avanzate (season/cumulativo)
   ========================================================================== */
function statLinePlays_(s) { return (s.a2 + s.a3) + 0.44 * s.fta + s.pp; }
function teamPlaysDa_(team) { return (team.a2 + team.a3) + 0.44 * team.fta + team.pp; }

/* ctx = { G, teamMin, teamPlays } — G=1 e teamMin/teamPlays della singola gara
   per una serie gara-per-gara, oppure i totali stagionali per il valore di
   stagione. Stesse formule già usate in vistaAnalisiGiocatori (analisi.js). */
function valoreBaseDaLinea_(metrica, s, ctx) {
  const G = ctx.G || 1;
  const fga = s.a2 + s.a3, fgm = s.m2 + s.m3;
  switch (metrica) {
    case "ppg": return s.pt / G;
    case "rpg": return (s.ro + s.rd) / G;
    case "apg": return s.as / G;
    case "tpg": return s.pp / G;
    case "fgpct": return fga ? fgm / fga * 100 : null;
    case "p3pct": return s.a3 ? s.m3 / s.a3 * 100 : null;
    case "ftpct": return s.fta ? s.ftm / s.fta * 100 : null;
    case "tspct": return (fga || s.fta) ? s.pt / (2 * (fga + 0.44 * s.fta)) * 100 : null;
    case "pmpg": return s.pm / G;
    case "usg": return (s.min && ctx.teamPlays) ? 100 * statLinePlays_(s) * (ctx.teamMin / 5) / (s.min * ctx.teamPlays) : null;
    case "astpct": { const den = fga + 0.44 * s.fta + s.as + s.pp; return den ? s.as * 100 / den : null; }
    default: return null;
  }
}

function etichettaGara_(g) {
  const nome = (typeof avversarioBreveAuto === "function") ? avversarioBreveAuto(g.partita.avversario) : (g.partita.avversario || "");
  return (g.partita.luogo === "Casa" ? "" : "@") + (nome || "").slice(0, 3);
}

/* Serie gara-per-gara per le metriche "base" (valore reale di quella gara). */
function serieBaseGaraPerGara(metrica, num, gare) {
  return gare.filter(g => g.eventi && g.eventi.length).map(g => {
    let r; try { r = boxGaraSingola(g); } catch (e) { return null; }
    const s = r.box.pg[num];
    if (!s || !(s.min > 0)) return null;
    const teamPlays = teamPlaysDa_(r.box.team.MIA);
    const v = valoreBaseDaLinea_(metrica, s, { G: 1, teamMin: r.minuti, teamPlays: teamPlays });
    if (v == null) return null;
    return { etichetta: etichettaGara_(g), valore: v };
  }).filter(Boolean);
}

/* AIS per-gara: stessa formula di calcolaAIS() (analisi-avanzata.js), ricalcolata
   qui per un solo giocatore sul filtro indipendente di questa sezione — riusa
   calcolaLVI() (già esportata), non tocca calcolaAIS(). */
function serieAISGaraPerGara(num, gare) {
  return gare.filter(g => g.eventi && g.eventi.length).map(g => {
    let r; try { r = boxGaraSingola(g); } catch (e) { return null; }
    const s = r.box.pg[num];
    if (!s || !(s.min > 0)) return null;
    const adv = calcolaAdvanced(r.box, r.minuti || 0.1);
    const tsSquadra = adv.tsA || 0;
    const fin = g.finale || { MIA: 0, OPP: 0 };
    const lvi = (typeof calcolaLVI === "function") ? calcolaLVI(fin.MIA - fin.OPP) : 1;
    const fga = s.a2 + s.a3, fgm = s.m2 + s.m3;
    const gmsc = s.pt + 0.4 * fgm - 0.7 * fga - 0.4 * (s.fta - s.ftm) +
      0.7 * s.ro + 0.3 * s.rd + 0.7 * s.as + (s.pr || 0) - 0.4 * s.ff - s.pp;
    const tsG = (fga || s.fta) ? s.pt / (2 * (fga + 0.44 * s.fta)) * 100 : 0;
    const rapEff = tsSquadra ? tsG / tsSquadra : 1;
    const impattoDiff = s.pm || 0;
    const v = (gmsc * rapEff + impattoDiff) * lvi;
    return { etichetta: etichettaGara_(g), valore: v };
  }).filter(Boolean);
}

/* Andamento CUMULATIVO per Def Rating/BPM/OBPM/DBPM/VORP: valore della metrica
   ricalcolato con le sole gare fino a quel momento — riuso diretto e sola
   lettura di calcolaDefRtg()/calcolaBpmVorp() (analisi-avanzata.js) su
   aggregaStagione(gare.slice(0,i+1)), zero riscrittura di formule. */
function serieCumulativaAvanzata(metrica, num, gare) {
  const valide = gare.filter(g => g.eventi && g.eventi.length);
  const out = [];
  for (let i = 0; i < valide.length; i++) {
    const sub = valide.slice(0, i + 1);
    let agg; try { agg = aggregaStagione(sub); } catch (e) { continue; }
    if (!(agg.pg[num] && agg.pg[num].min > 0)) continue;
    let val = null;
    if (metrica === "defrtg") {
      const r = calcolaDefRtg(agg), row = r.righe.find(x => x.num === num);
      val = row ? row.defRtg : null;
    } else {
      const r = calcolaBpmVorp(agg), row = r.righe.find(x => x.num === num);
      val = row ? row[metrica] : null;
    }
    if (val == null || !isFinite(val)) continue;
    out.push({ etichetta: etichettaGara_(valide[i]), valore: val });
  }
  return out;
}

function serieObiettivo(o, num, gare) {
  const info = infoMetrica(o.metrica);
  if (info.tipo === "base") return serieBaseGaraPerGara(o.metrica, num, gare);
  if (o.metrica === "ais") return serieAISGaraPerGara(num, gare);
  return serieCumulativaAvanzata(o.metrica, num, gare);
}

/* Valore "di stagione" (per la tabella obiettivi e il check raggiunto/no). */
function valoreMetricaStagione(metrica, num, gare) {
  const info = infoMetrica(metrica);
  if (info.tipo === "base") {
    let agg; try { agg = aggregaStagione(gare); } catch (e) { return null; }
    const s = agg.pg[num];
    const G = agg.presenze[num] || 0;
    if (!s || !G) return null;
    const teamPlays = teamPlaysDa_(agg.team.MIA);
    return valoreBaseDaLinea_(metrica, s, { G: G, teamMin: agg.minutiTot, teamPlays: teamPlays });
  }
  if (metrica === "ais") {
    const serie = serieAISGaraPerGara(num, gare);
    if (!serie.length) return null;
    return serie.reduce((a, b) => a + b.valore, 0) / serie.length;
  }
  let agg; try { agg = aggregaStagione(gare); } catch (e) { return null; }
  if (metrica === "defrtg") { const r = calcolaDefRtg(agg), row = r.righe.find(x => x.num === num); return row ? row.defRtg : null; }
  const r = calcolaBpmVorp(agg), row = r.righe.find(x => x.num === num);
  return row ? row[metrica] : null;
}

/* ==========================================================================
   Apertura + filtri
   ========================================================================== */
let pdGiocatoreSel = null;

function apriPlayerDev() {
  if (!cacheEventiStagione && typeof caricaCacheAnalisi === "function") caricaCacheAnalisi();
  navigaA("player-dev");
  renderPlayerDevLista();
  scaricaGiocatori(() => renderPlayerDevLista());
  scaricaObiettivi(() => renderPlayerDevLista());
  const scaduta = !cacheEventiStagione || (Date.now() - (cacheEventiStagione.updatedAt || 0) > (typeof ANALISI_TTL_MS !== "undefined" ? ANALISI_TTL_MS : 3600000));
  if (scaduta && typeof caricaEventiStagione === "function") caricaEventiStagione(() => renderPlayerDevLista());
}
function apriSchedaGiocatore(id) {
  pdGiocatoreSel = id;
  navigaA("scheda-giocatore");
  renderSchedaGiocatore();
}
function chipGruppoPD(fil, valori) {
  return '<div class="an-chip-grp" data-fil="' + fil + '">' +
    valori.map(v =>
      '<button class="an-chip' + (filtriPlayerDev[fil] === v[0] ? ' attivo' : '') +
      '" data-val="' + v[0] + '">' + esc(v[1]) + '</button>').join('') +
    '</div>';
}
function barraFiltriPlayerDev() {
  return chipGruppoPD("competizione", [["Campionato", "Campionato"], ["Amichevole", "Amichevoli"]]) +
    chipGruppoPD("campo", [["tutte", "Tutte"], ["Casa", "Casa"], ["Trasferta", "Trasferta"]]) +
    chipGruppoPD("esito", [["tutte", "Tutte"], ["vinte", "Vinte"], ["perse", "Perse"]]);
}
function impostaFiltroPlayerDev(fil, val) {
  if (!(fil in filtriPlayerDev) || filtriPlayerDev[fil] === val) return;
  filtriPlayerDev[fil] = val;
  renderPlayerDevLista();
  if (pdGiocatoreSel) renderSchedaGiocatore();
}

/* ==========================================================================
   RENDER — elenco giocatori
   ========================================================================== */
function renderPlayerDevLista() {
  const filtriEl = document.getElementById("pd-filtri");
  const body = document.getElementById("pd-body");
  if (!body || !filtriEl) return;
  filtriEl.innerHTML = barraFiltriPlayerDev();
  const lista = (typeof giocatoriDelTeam === "function" ? giocatoriDelTeam() : caricaGiocatori())
    .slice().sort((a, b) => (a.cognome || "").localeCompare(b.cognome || "", "it"));
  if (!lista.length) {
    body.innerHTML = '<div class="st-hint">Nessun giocatore in anagrafica — aggiungilo da Altro → Roster.</div>';
    return;
  }
  const righe = lista.map(g => {
    const n = obiettiviDiGiocatore(g.id).length;
    return '<div class="riga-altro pd-riga-giocatore" data-apri-scheda="' + esc(g.id) + '">' +
      '<span class="col-testo"><span class="titolo-altro">' + esc((g.cognome || "") + " " + (g.nome || "")) + '</span>' +
      '<span class="sotto-altro">' + esc(g.ruolo || "—") +
      (g.numero_maglia != null && g.numero_maglia !== "" ? ' · #' + esc(g.numero_maglia) : '') +
      ' · ' + n + (n === 1 ? ' obiettivo' : ' obiettivi') + '</span></span>' +
      '<svg class="ico freccia-riga" aria-hidden="true"><use href="#i-chevron"></use></svg></div>';
  }).join('');
  body.innerHTML = '<div class="lista-altro">' + righe + '</div>' +
    '<div class="st-hint">Tocca un giocatore per aprire la sua scheda di sviluppo — fino a ' + MAX_OBIETTIVI + ' obiettivi ciascuno.</div>';
}

/* ==========================================================================
   RENDER — scheda giocatore
   ========================================================================== */
function renderSchedaGiocatore() {
  const body = document.getElementById("scheda-body");
  const titolo = document.getElementById("scheda-titolo");
  if (!body) return;
  const g = caricaGiocatori().find(x => x.id === pdGiocatoreSel);
  if (!g) { body.innerHTML = '<div class="st-hint">Giocatore non trovato.</div>'; return; }
  if (titolo) titolo.textContent = ((g.cognome || "") + " " + (g.nome || "")).trim() || "Scheda giocatore";
  if (!cacheEventiStagione) { body.innerHTML = '<div class="st-hint">Nessun dato in cache — apri prima Analisi stagione.</div>'; return; }
  try { body.innerHTML = vistaSchedaGiocatore(g); }
  catch (e) { body.innerHTML = '<div class="st-hint">Errore: ' + esc(e && e.message || e) + '</div>'; }
}

function rigaObiettivoTabella_(o, num, gare, perStampa) {
  const info = infoMetrica(o.metrica);
  const attuale = (num || num === 0) ? valoreMetricaStagione(o.metrica, num, gare) : null;
  const raggiunto = attuale == null ? null : (o.direzione === "lte" ? attuale <= o.target : attuale >= o.target);
  const statoTxt = attuale == null ? "Dati insuff." : (raggiunto ? "✓ Raggiunto" : "In corso");
  const statoCls = attuale == null ? "" : (raggiunto ? "pd-badge-ok" : "pd-badge-corso");
  return '<tr>' +
    '<td>' + esc(etichettaOrizzonte(o.orizzonte)) + '</td>' +
    '<td>' + esc(info.et) + '</td>' +
    '<td>' + (attuale == null ? '–' : dec(attuale, info.dec) + info.unita) + '</td>' +
    '<td>' + (o.direzione === "lte" ? "≤" : "≥") + ' ' + dec(o.target, info.dec) + info.unita + '</td>' +
    '<td class="' + statoCls + '">' + statoTxt + '</td>' +
    '<td class="pd-nota">' + esc(o.nota || "") + '</td>' +
    (perStampa ? '' : '<td><button class="pd-modifica" data-obiettivo="' + esc(o.id) + '" aria-label="Modifica obiettivo"><svg class="ico" aria-hidden="true"><use href="#i-edit"></use></svg></button></td>') +
    '</tr>';
}

function vistaSchedaGiocatore(g) {
  const gare = garePerPlayerDev();
  const num = Number(g.numero_maglia);
  const obiettivi = obiettiviDiGiocatore(g.id);
  const righeObTab = obiettivi.map(o => rigaObiettivoTabella_(o, num, gare, false)).join('');
  const tracking = obiettivi.map(o => graficoTrendMetrica(o, num, gare)).join('');

  return '<div class="pd-header">' +
      '<div class="st-hint">' + esc(g.ruolo || "—") +
      (g.numero_maglia != null && g.numero_maglia !== "" ? ' · #' + esc(g.numero_maglia) : '') +
      ' · ' + esc(g.team || TEAM_DEFAULT) + ' · stagione ' + esc(filtriPlayerDev.stagione) +
      ' · ' + esc((filtriPlayerDev.competizione === "Amichevole" ? "Amichevoli" : filtriPlayerDev.competizione)) +
      ' (filtro impostato nell\'elenco giocatori)</div>' +
    '</div>' +
    '<div class="adv-tit" style="margin-top:14px">Obiettivi (' + obiettivi.length + '/' + MAX_OBIETTIVI + ')</div>' +
    (obiettivi.length
      ? '<div class="st-scroll"><table class="st-box pd-tab-obiettivi"><thead><tr><th>Orizzonte</th><th>Metrica</th><th>Attuale</th><th>Target</th><th>Stato</th><th>Nota</th><th></th></tr></thead><tbody>' + righeObTab + '</tbody></table></div>'
      : '<div class="st-hint">Nessun obiettivo ancora — aggiungine uno.</div>') +
    '<button class="btn-annulla-modale pd-aggiungi" id="pd-aggiungi-obiettivo"' + (obiettivi.length >= MAX_OBIETTIVI ? ' disabled' : '') + '>+ Aggiungi obiettivo</button>' +
    tracking +
    '<div class="pd-azioni">' +
      '<button class="btn-conferma" id="pd-stampa-btn">🖨️ Stampa / Salva PDF</button>' +
      '<button class="btn-annulla-modale" id="pd-copia-prompt">📋 Copia prompt AI</button>' +
    '</div>' +
    '<div class="st-hint">Metriche base = valore reale gara per gara · AIS = media di gara (Leverage Index incluso) · ' +
    'Def. Rating/BPM/OBPM/DBPM/VORP = andamento CUMULATIVO sulle gare via via giocate (sono costrutti stagionali, non ha senso un valore a singola gara).</div>';
}

function niceStep_(range) {
  if (!isFinite(range) || range <= 0) return 1;
  const raw = range / 5;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  return step * mag;
}

/* Grafico SVG gara-per-gara (o cumulativo) con linea target tratteggiata —
   stesso impianto a mano libera di graficoTrendNet() (rating-net.js), riuso
   delle classi CSS già globali .st-chart/.st-grid/.st-axis/.an-barw/.an-barl
   (css/stats.css), + nuova classe .pd-target (token-based). */
function graficoTrendMetrica(o, num, gare) {
  const info = infoMetrica(o.metrica);
  const serie = (num || num === 0) ? serieObiettivo(o, num, gare) : [];
  const sottotitolo = info.tipo === "base" ? "gara per gara" : (o.metrica === "ais" ? "gara per gara" : "andamento cumulativo");
  const titolo = info.et + ' — ' + sottotitolo;
  if (!serie.length) {
    return '<div class="adv-tit" style="margin-top:14px">' + esc(titolo) + '</div><div class="st-hint">Dati insufficienti con questi filtri.</div>';
  }
  const target = Number(o.target);
  const vals = serie.map(x => x.valore);
  const media = vals.reduce((a, b) => a + b, 0) / vals.length;
  let lo = Math.min.apply(null, vals.concat([target])), hi = Math.max.apply(null, vals.concat([target]));
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.12 || 1;
  lo -= pad; hi += pad;

  const W = 680, H = 180, padT = 14, padB = 28, padL = 34, padR = 8;
  const bw = (W - padL - padR) / serie.length;
  const ys = v => padT + (hi - v) * (H - padT - padB) / (hi - lo);
  const step = niceStep_(hi - lo);

  let griglia = '';
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
    const y = ys(v).toFixed(1);
    griglia += '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" class="st-grid"/>' +
      '<text x="' + (padL - 4) + '" y="' + (ys(v) + 3).toFixed(1) + '" class="st-axis" text-anchor="end">' + dec(v, info.dec) + '</text>';
  }
  const base0 = Math.max(lo, Math.min(hi, 0));
  const barre = serie.map((x, i) => {
    const bx = padL + i * bw + bw * 0.15, w = bw * 0.7;
    const ok = o.direzione === "lte" ? x.valore <= target : x.valore >= target;
    const top = x.valore >= base0 ? ys(x.valore) : ys(base0);
    const h = Math.max(1, Math.abs(ys(x.valore) - ys(base0)));
    return '<rect x="' + bx.toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) +
      '" class="' + (ok ? "an-barw" : "an-barl") + '"/>' +
      '<text x="' + (bx + w / 2).toFixed(1) + '" y="' + (H - 14) + '" class="st-qt" text-anchor="middle">' + esc(x.etichetta) + '</text>';
  }).join('');
  const yTarget = ys(target).toFixed(1);

  return '<div class="adv-tit" style="margin-top:14px">' + esc(titolo) + '</div>' +
    '<div class="st-scroll"><svg class="st-chart pd-trend" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' +
      griglia + barre +
      '<line x1="' + padL + '" y1="' + yTarget + '" x2="' + (W - padR) + '" y2="' + yTarget + '" class="pd-target"/>' +
    '</svg></div>' +
    '<div class="st-hint">Media: ' + dec(media, info.dec) + info.unita + ' · target: ' + (o.direzione === "lte" ? "≤" : "≥") + ' ' +
    dec(target, info.dec) + info.unita + ' · linea tratteggiata = target · verde/rosso = sopra/sotto soglia in quella gara.</div>';
}

/* ==========================================================================
   Form obiettivo (modale)
   ========================================================================== */
function apriFormObiettivo(id) {
  const o = id ? caricaObiettivi().find(x => x.id === id) : null;
  document.getElementById("ob-titolo").textContent = o ? "Modifica obiettivo" : "Nuovo obiettivo";
  document.getElementById("ob-id").value = o ? o.id : "";
  document.getElementById("ob-giocatore-id").value = pdGiocatoreSel || "";
  const sel = document.getElementById("ob-metrica");
  if (sel && !sel.dataset.popolato) {
    sel.innerHTML =
      '<optgroup label="Base (gara per gara)">' +
        CATALOGO_METRICHE.filter(m => m.tipo === "base").map(m => '<option value="' + m.cod + '">' + esc(m.et) + '</option>').join('') +
      '</optgroup><optgroup label="Avanzate (stagionali)">' +
        CATALOGO_METRICHE.filter(m => m.tipo === "avanzata").map(m => '<option value="' + m.cod + '">' + esc(m.et) + '</option>').join('') +
      '</optgroup>';
    sel.dataset.popolato = "1";
  }
  sel.value = o ? o.metrica : ((sel.options[0] && sel.options[0].value) || "");
  document.getElementById("ob-target").value = o && o.target != null ? o.target : "";
  document.getElementById("ob-direzione").value = o ? (o.direzione || "gte") : "gte";
  document.getElementById("ob-orizzonte").value = o ? (o.orizzonte || "1m") : "1m";
  document.getElementById("ob-nota").value = o ? (o.nota || "") : "";
  document.getElementById("ob-elimina").hidden = !o;
  document.getElementById("overlay-obiettivo").classList.add("visibile");
}
function chiudiFormObiettivo() {
  document.getElementById("overlay-obiettivo").classList.remove("visibile");
}
function confermaFormObiettivo() {
  const idGiocatore = document.getElementById("ob-giocatore-id").value;
  if (!idGiocatore) return;
  const idAttuale = document.getElementById("ob-id").value;
  const attivi = obiettiviDiGiocatore(idGiocatore).filter(o => o.id !== idAttuale);
  if (!idAttuale && attivi.length >= MAX_OBIETTIVI) { mostraToast("Massimo " + MAX_OBIETTIVI + " obiettivi per giocatore"); return; }
  const targetRaw = document.getElementById("ob-target").value.replace(",", ".").trim();
  const target = parseFloat(targetRaw);
  if (!targetRaw || !isFinite(target)) { mostraToast("Inserisci un valore target valido"); return; }
  upsertObiettivo({
    id: idAttuale || "",
    id_giocatore: idGiocatore,
    metrica: document.getElementById("ob-metrica").value,
    target: target,
    direzione: document.getElementById("ob-direzione").value === "lte" ? "lte" : "gte",
    orizzonte: document.getElementById("ob-orizzonte").value,
    nota: document.getElementById("ob-nota").value.trim()
  });
  chiudiFormObiettivo();
  renderSchedaGiocatore();
  mostraToast("Obiettivo salvato");
}
function eliminaObiettivoCorrente() {
  const id = document.getElementById("ob-id").value;
  if (!id) return;
  if (!confirm("Eliminare questo obiettivo?")) return;
  rimuoviObiettivo(id);
  chiudiFormObiettivo();
  renderSchedaGiocatore();
  mostraToast("Obiettivo eliminato");
}

/* ==========================================================================
   Stampa / PDF — window.print() su un contenuto dedicato, nessuna libreria
   ========================================================================== */
function contenutoStampaScheda_(g) {
  const gare = garePerPlayerDev();
  const num = Number(g.numero_maglia);
  const obiettivi = obiettiviDiGiocatore(g.id);
  const righe = obiettivi.map(o => rigaObiettivoTabella_(o, num, gare, true)).join('');
  const grafici = obiettivi.map(o => graficoTrendMetrica(o, num, gare)).join('');
  return '<div class="pd-stampa-intestazione">' +
      '<h1>Scheda di sviluppo — ' + esc(((g.cognome || "") + " " + (g.nome || "")).trim()) + '</h1>' +
      '<p>' + esc(g.ruolo || "—") + (g.numero_maglia != null && g.numero_maglia !== "" ? ' · #' + esc(g.numero_maglia) : '') +
      ' · ' + esc(g.team || TEAM_DEFAULT) + ' · stagione ' + esc(filtriPlayerDev.stagione) + '</p>' +
      '<p class="pd-stampa-data">Generato il ' + esc(new Date().toLocaleDateString("it-IT")) + '</p>' +
    '</div>' +
    '<h2>Obiettivi</h2>' +
    (obiettivi.length
      ? '<table class="pd-stampa-tab"><thead><tr><th>Orizzonte</th><th>Metrica</th><th>Attuale</th><th>Target</th><th>Stato</th><th>Nota</th></tr></thead><tbody>' + righe + '</tbody></table>'
      : '<p>Nessun obiettivo impostato.</p>') +
    '<h2>Andamento stagionale</h2>' +
    (grafici || '<p>Nessun dato.</p>') +
    '<p class="pd-stampa-firma">Coach: ____________________ &nbsp;&nbsp;&nbsp; Giocatore: ____________________</p>';
}
function stampaScheda() {
  const g = caricaGiocatori().find(x => x.id === pdGiocatoreSel);
  const cont = document.getElementById("pd-stampa");
  if (!g || !cont) { mostraToast("Apri prima una scheda"); return; }
  cont.innerHTML = contenutoStampaScheda_(g);
  window.print();
}

/* ==========================================================================
   Prompt AI (fuori dal PDF) — copia negli appunti
   ========================================================================== */
function generaPromptAI(g) {
  const gare = garePerPlayerDev();
  const num = Number(g.numero_maglia);
  const obiettivi = obiettiviDiGiocatore(g.id);
  if (!obiettivi.length) return null;
  const righe = obiettivi.map(o => {
    const info = infoMetrica(o.metrica);
    const attuale = (num || num === 0) ? valoreMetricaStagione(o.metrica, num, gare) : null;
    const serie = (num || num === 0) ? serieObiettivo(o, num, gare) : [];
    const ultime = serie.slice(-3).map(x => dec(x.valore, info.dec)).join(", ");
    return '- Obiettivo a ' + etichettaOrizzonte(o.orizzonte) + ': ' + info.et + ' ' +
      (o.direzione === "lte" ? "≤" : "≥") + ' ' + dec(o.target, info.dec) + info.unita +
      '. Valore attuale (media stagione): ' + (attuale == null ? 'dati insufficienti' : dec(attuale, info.dec) + info.unita) +
      (ultime ? '. Ultime gare: ' + ultime + '.' : '.') +
      (o.nota ? ' Nota del coach: "' + o.nota + '".' : '');
  }).join('\n');
  return 'Sei un assistente per lo sviluppo di un giocatore di basket dilettantistico (DR1 Lombardia).\n' +
    'Giocatore: ' + ((g.cognome || "") + " " + (g.nome || "")).trim() + ' (' + (g.ruolo || "ruolo non specificato") + ').\n' +
    'Questi sono i suoi obiettivi stagionali con i dati di tracking più recenti:\n\n' + righe + '\n\n' +
    'In base a questi dati, scrivi:\n' +
    '1) un messaggio motivazionale rivolto al giocatore sugli obiettivi (tono diretto, concreto, non generico);\n' +
    '2) per ogni obiettivo non ancora raggiunto, 2-3 consigli pratici di allenamento/lavoro tecnico per avvicinarlo;\n' +
    '3) se un obiettivo è già raggiunto, un obiettivo successivo coerente per continuare a crescere su quella metrica.';
}
function copiaPromptFallback_(testo, fatto) {
  try {
    const ta = document.createElement("textarea");
    ta.value = testo; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.focus(); ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    fatto();
  } catch (e) { mostraToast("Copia non riuscita — seleziona manualmente"); }
}
function copiaPromptAI() {
  const g = caricaGiocatori().find(x => x.id === pdGiocatoreSel);
  if (!g) return;
  const testo = generaPromptAI(g);
  if (!testo) { mostraToast("Aggiungi almeno un obiettivo prima"); return; }
  const fatto = () => mostraToast("Prompt copiato — incollalo nel tuo AI preferito");
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(testo).then(fatto).catch(() => copiaPromptFallback_(testo, fatto));
  } else {
    copiaPromptFallback_(testo, fatto);
  }
}

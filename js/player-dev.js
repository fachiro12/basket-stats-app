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
  { cod: "ppg", et: "Punti/gara (PPG)", dec: 1, unita: "", tipo: "base",
    def: "Punti segnati in media a partita. È il modo più diretto per vedere quanto si sta segnando, ma da solo non dice se serve tirare tanto (e magari male) per arrivarci — per quello vanno guardati anche FG% e TS%." },
  { cod: "rpg", et: "Rimbalzi/gara (RPG)", dec: 1, unita: "", tipo: "base",
    def: "Rimbalzi offensivi + difensivi presi in media a partita. Misura quanto si controlla il pallone vicino a canestro, sia quando si attacca sia quando si difende." },
  { cod: "apg", et: "Assist/gara (APG)", dec: 1, unita: "", tipo: "base",
    def: "Assist forniti in media a partita. Conta i passaggi che portano DIRETTAMENTE a un canestro di un compagno — misura quanto si fa segnare la squadra, non solo sé stessi." },
  { cod: "tpg", et: "Palle perse/gara", dec: 1, unita: "", tipo: "base",
    def: "Palle perse in media a partita (palla persa, intercettata, passo travolgente...). Meno ce ne sono, meglio è — vale ancora di più se si gioca tanto con la palla in mano (USG% alto)." },
  { cod: "fgpct", et: "FG%", dec: 1, unita: "%", tipo: "base",
    def: "Su 100 tiri dal campo (2 e 3 punti insieme), quanti ne entrano. Dice quanto si è precisi in generale, senza distinguere da dove si tira." },
  { cod: "p3pct", et: "3P%", dec: 1, unita: "%", tipo: "base",
    def: "Su 100 tiri da 3 punti, quanti ne entrano. È il modo più diretto per capire quanto sia reale la minaccia da fuori." },
  { cod: "ftpct", et: "FT%", dec: 1, unita: "%", tipo: "base",
    def: "Su 100 tiri liberi, quanti ne entrano. È un tiro sempre uguale, senza avversari addosso: la misura più pulita di quanto sia solida la meccanica di tiro." },
  { cod: "ftr", et: "FT Rate", dec: 2, unita: "", tipo: "base",
    def: "Quanti tiri liberi si tentano ogni tiro dal campo tentato. Un numero alto vuol dire che si porta spesso la palla vicino a canestro o si subiscono falli, invece di tirare solo da fuori senza contatto." },
  { cod: "tspct", et: "TS%", dec: 1, unita: "%", tipo: "base",
    def: "Efficienza di tiro complessiva: mette insieme in un solo numero 2 punti, 3 punti e tiri liberi, dando il giusto peso ai 3 punti (che valgono di più). È la misura più onesta di quanto rende ogni volta che si tira, più affidabile del solo FG%." },
  { cod: "usg", et: "USG%", dec: 1, unita: "%", tipo: "base",
    def: "Quota dei tiri/liberi/palle perse della squadra che passano da un giocatore mentre è in campo — cioè quanto la squadra si affida a un giocatore per chiudere le azioni. In un quintetto equilibrato si divide a metà tra 5, quindi il valore medio è circa il 20%: sopra il 28% è già un riferimento offensivo primario, sotto il 14% un ruolo di supporto. USG% alto insieme a TS% basso spesso vuol dire tiri forzati (vedi \"Indice di Forzatura\" per un numero che lo misura direttamente)." },
  { cod: "forz", et: "Indice di Forzatura", dec: 1, unita: "", tipo: "base",
    def: "Il numero dietro la frase \"usa tanti possessi ma non li converte\": prende quanto un giocatore USA la squadra (USG%) e lo moltiplica per quanto la sua efficienza di tiro (TS%) è SOTTO quella della squadra. Un valore vicino a 0 vuol dire che rende come il resto della squadra, a qualunque volume di gioco — non c'è forzatura. Un valore alto e positivo vuol dire che tira/attacca molto ma con un rendimento basso: sta forzando. Un valore negativo è il caso migliore: usa molti possessi ED è più efficiente della media squadra." },
  { cod: "astpct", et: "AST%", dec: 1, unita: "%", tipo: "base",
    def: "Quota delle proprie azioni chiuse con un assist invece che con un tiro o una palla persa. Misura quanto si gioca per far segnare un compagno, rispetto a quanto si conclude l'azione in prima persona." },
  { cod: "pmpg", et: "+/- per gara", dec: 1, unita: "", tipo: "base",
    def: "Differenza punti squadra-avversari nei minuti passati in campo, in media a partita. È un termometro semplice ma rumoroso: dipende molto anche da CHI altro è in campo nello stesso momento." },
  { cod: "ais", et: "AIS", dec: 1, unita: "", tipo: "avanzata",
    def: "Un unico numero che riassume quanto si è pesato in una gara: mette insieme produzione (punti, tiri, rimbalzi, assist, palle perse), quanto sono stati efficaci i tiri e il +/- di squadra, e conta di più le gare punto a punto rispetto a quelle già decise. Come riferimento: sotto 0 = gara sottotono, verso 6-12 = gara solida, sopra 20 = gara di alto livello." },
  { cod: "defrtg", et: "Def. Rating", dec: 1, unita: "", tipo: "avanzata",
    def: "Punti concessi dalla squadra ogni 100 possessi difensivi con un giocatore in campo — più basso è, meglio si è difeso. È una STIMA (ripartisce in base ai minuti giocati i contributi difensivi che non finiscono nel tabellino, tipo aiuti e marcature), non un dato certo: va letto soprattutto a confronto con la Def. Rating della propria squadra — sotto è un buon segnale, sopra va migliorato." },
  { cod: "bpm", et: "BPM", dec: 1, unita: "", tipo: "avanzata",
    def: "Un unico numero che stima quanto un giocatore fa guadagnare o perdere punti alla squadra ogni 100 possessi, sommando attacco e difesa, rispetto a un giocatore nella media (valore 0). Come riferimento: intorno a 0 = nella media, sopra +5 = impatto già molto forte, sotto -2 = sotto il livello minimo da roster." },
  { cod: "obpm", et: "OBPM", dec: 1, unita: "", tipo: "avanzata",
    def: "La STESSA idea del BPM, ma guardando solo la parte offensiva: quanto si segna, si fa segnare e si tiene la palla senza perderla. Stessa scala del BPM (0 = nella media, +5 = già forte)." },
  { cod: "dbpm", et: "DBPM", dec: 1, unita: "", tipo: "avanzata",
    def: "La STESSA idea del BPM, ma guardando solo la parte difensiva: rimbalzi difensivi, recuperi e presenza in difesa. Stessa scala del BPM (0 = nella media, +5 = già forte)." },
  { cod: "vorp", et: "VORP", dec: 2, unita: "", tipo: "avanzata",
    def: "Quanto un giocatore ha pesato nell'arco di TUTTA la stagione (non solo per minuto in campo), rispetto a un giocatore di livello \"minimo da roster\". Sopra 0 è un contributo utile: più il numero sale, più grande è stato il peso avuto in stagione (conta anche quanti minuti e quante gare si sono giocate)." }
];

/* ==========================================================================
   Valori di riferimento "di alto livello" — Basso/Medio/Elite, per aiutare a
   fissare un target sensato e per "posizionare" il giocatore nella scheda.
   Fonti dichiarate: BPM/VORP da hackastat.eu (Learn a Stat: Box Plus Minus
   and VORP — ancore reali: -2 = Replacement Player, ~0 = giocatore medio,
   +5 = "molto buono"); AIS riusa la scala già in uso in Analisi avanzata
   (TIER_AIS, analisi-avanzata.js); le percentuali di tiro/USG%/AST% sono
   convenzioni generali di analisi cestistica (non da hackastat, che le
   definisce senza dare soglie numeriche) — NON specifiche del livello DR1,
   dichiarato esplicitamente in ogni vista che le mostra. Def. Rating non ha
   una scala assoluta onesta (troppo legata a ritmo/livello lega): i suoi
   3 livelli sono calcolati DINAMICAMENTE rispetto alla Def. Rating della
   VOSTRA squadra in questi filtri (vedi riferimentiMetrica). Niente
   elite/medio/basso per PPG/RPG/APG/TOV/+-: dipendono troppo da ruolo e
   minuti giocati per avere una scala universale onesta.
   ========================================================================== */
const RIFERIMENTI_LIVELLO = {
  fgpct: { basso: 40, medio: 45, elite: 52, fonte: "convenzione generale, non specifica del livello DR1" },
  p3pct: { basso: 28, medio: 33, elite: 38, fonte: "convenzione generale, non specifica del livello DR1" },
  ftpct: { basso: 60, medio: 72, elite: 85, fonte: "convenzione generale, non specifica del livello DR1" },
  ftr: { basso: 0.15, medio: 0.30, elite: 0.45, fonte: "convenzione generale, non specifica del livello DR1" },
  tspct: { basso: 48, medio: 54, elite: 60, fonte: "convenzione generale, non specifica del livello DR1" },
  usg: { basso: 14, medio: 20, elite: 28, fonte: "convenzione generale, non specifica del livello DR1" },
  forz: { basso: 5, medio: 0, elite: -3, fonte: "indice costruito in questa app (USG% × scarto di TS% dalla squadra), non da hackastat — qui \"Basso\" = tanta forzatura (numero alto), \"Elite\" = usa molto ED è efficiente (numero negativo)" },
  astpct: { basso: 8, medio: 15, elite: 25, fonte: "convenzione generale, non specifica del livello DR1" },
  ais: { basso: 0, medio: 6, elite: 20, fonte: "scala AIS già in uso in Analisi avanzata" },
  bpm: { basso: -2, medio: 0, elite: 5, fonte: "hackastat.eu" },
  obpm: { basso: -2, medio: 0, elite: 5, fonte: "hackastat.eu (stessa scala del BPM)" },
  dbpm: { basso: -2, medio: 0, elite: 5, fonte: "hackastat.eu (stessa scala del BPM)" },
  vorp: { basso: 0, medio: 1.5, elite: 4, fonte: "stima derivata dalla scala BPM di hackastat.eu" }
};
/* Media squadra — solo dove il concetto si applica bene a livello di gruppo
   (percentuali di tiro): USG%/AST%/AIS/BPM-family/VORP non hanno un "media
   squadra" intuitivo (per costruzione o per definizione), quindi restano
   senza quel 4° riferimento. */
function mediaSquadra_(metrica, gare) {
  let agg; try { agg = aggregaStagione(gare); } catch (e) { return null; }
  const A = agg.team.MIA;
  const fga = A.a2 + A.a3, fgm = A.m2 + A.m3;
  switch (metrica) {
    case "fgpct": return fga ? fgm / fga * 100 : null;
    case "p3pct": return A.a3 ? A.m3 / A.a3 * 100 : null;
    case "ftpct": return A.fta ? A.ftm / A.fta * 100 : null;
    case "ftr": return fga ? A.fta / fga : null;
    case "tspct": return agg.adv && isFinite(agg.adv.tsA) ? agg.adv.tsA : null;
    default: return null;
  }
}
/* Def. Rating: nessuna soglia assoluta onesta — i 3 livelli sono relativi
   alla Def. Rating della VOSTRA squadra in questi filtri (±6, ordine di
   grandezza tipico tra un difensore di alto impatto e uno in difficoltà). */
function riferimentiMetrica(metrica, gare) {
  if (metrica === "defrtg") {
    let agg; try { agg = aggregaStagione(gare); } catch (e) { return null; }
    const t = agg.adv && agg.adv.drtg;
    if (t == null || !isFinite(t)) return null;
    // Qui non c'è un "media squadra" DIVERSO dal "Medio": la Def. Rating
    // individuale è definita apposta come una correzione rispetto a quella di
    // squadra (Dean Oliver, hackastat.eu — vedi calcolaDefRtg), quindi la
    // squadra stessa È il riferimento medio. Mostrarlo esplicitamente (invece
    // di un trattino) evita che sembri un dato mancante.
    return { basso: t + 6, medio: t, elite: t - 6, mediaSquadra: t, fonte: "relativo alla Def. Rating della vostra squadra in questi filtri — qui \"Medio\" e \"Media squadra\" coincidono, è l'unico riferimento onesto per questa metrica" };
  }
  const base = RIFERIMENTI_LIVELLO[metrica];
  if (!base) return null;
  return Object.assign({}, base, { mediaSquadra: mediaSquadra_(metrica, gare) });
}
function infoMetrica(cod) { return CATALOGO_METRICHE.find(m => m.cod === cod) || { cod: cod, et: cod, dec: 1, unita: "", tipo: "base", def: "" }; }
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
    nota: rec.nota || "",
    baseline_tipo: rec.baseline_tipo || "",
    baseline_partite: Array.isArray(rec.baseline_partite) ? rec.baseline_partite.join(",") : (rec.baseline_partite || "")
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
/* FIX: se il backend incollato è una V4.14 precedente all'aggiunta di
   baseline_tipo/baseline_partite (o comunque un foglio Obiettivi senza quelle
   2 colonne), la risposta cloud non le porta affatto — `c.baseline_tipo`
   arriva `undefined`, non "". Prima qui veniva trattato come "svuota il
   campo", e ogni apertura di Player Development (= ogni scaricaObiettivi())
   CANCELLAVA il punto di partenza appena impostato in locale. Ora: un campo
   *assente* dalla risposta cloud (`undefined`) preserva il valore locale
   esistente; solo un campo *presente ma esplicitamente vuoto/non valido*
   (backend aggiornato che sincronizza "nessun punto di partenza") lo svuota
   davvero. */
function mergeObiettiviCloud(cloud) {
  const perId = {};
  caricaObiettivi().forEach(o => { if (o.id) perId[o.id] = o; });
  cloud.forEach(c => {
    const id = String(c.id || "").trim();
    if (!id) return;
    const esistente = perId[id] || {};
    perId[id] = {
      id: id,
      id_giocatore: String(c.id_giocatore || ""),
      metrica: String(c.metrica || ""),
      target: c.target === "" || c.target == null ? null : Number(c.target),
      direzione: c.direzione === "lte" ? "lte" : "gte",
      orizzonte: ["1m", "3m", "6m"].indexOf(c.orizzonte) > -1 ? c.orizzonte : "1m",
      creato_il: c.creato_il || "",
      nota: String(c.nota || ""),
      baseline_tipo: c.baseline_tipo !== undefined
        ? (["amichevoli", "selezione"].indexOf(c.baseline_tipo) > -1 ? c.baseline_tipo : "")
        : (esistente.baseline_tipo || ""),
      baseline_partite: c.baseline_partite !== undefined
        ? String(c.baseline_partite || "").split(",").map(x => x.trim()).filter(Boolean)
        : (esistente.baseline_partite || []),
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
   Punto di partenza (baseline) di un obiettivo — indipendente dai filtri di
   Campionato/Amichevoli · Casa/Trasferta · Vinte/Perse scelti nell'elenco: o
   dalle sole amichevoli (tipico "prima della stagione") o da una selezione
   esplicita di gare (checklist nel form). Resta però sulla STESSA stagione
   di `filtriPlayerDev` (mai mescolare stagioni diverse "di nascosto" — prima
   di questo fix `gareTerminate_()` non filtrava affatto per stagione, mentre
   `garePerPlayerDev()` sì: la stessa gara amichevole poteva contare per il
   "Partenza" ma sparire dall'"Attuale" se taggata con una stagione diversa
   da quella corrente, dando l'impressione di un bug nei numeri).
   ========================================================================== */
function gareTerminate_() {
  const byMatch = (cacheEventiStagione && cacheEventiStagione.byMatch) || {};
  const stagione = filtriPlayerDev.stagione;
  return elencoPartite()
    .filter(p => String(p.stato) === "Terminata")
    .filter(p => stagione === "tutte" || (p.stagione || "2026/27") === stagione)
    .map(p => {
      const raw = byMatch[String(p.id_partita)] || null;
      const finale = raw ? punteggioDaEventi(eventiPuliti(raw)) : null;
      return { partita: p, eventi: raw, finale: finale, vinta: finale ? finale.MIA > finale.OPP : null, mancante: !raw };
    })
    .sort((a, b) => String(a.partita.data_ora || "").localeCompare(String(b.partita.data_ora || "")));
}
function gareBaselineObiettivo(o) {
  if (o.baseline_tipo === "amichevoli") {
    return gareTerminate_().filter(g => (g.partita.tipo || "Campionato") === "Amichevole");
  }
  if (o.baseline_tipo === "selezione" && Array.isArray(o.baseline_partite) && o.baseline_partite.length) {
    const set = {}; o.baseline_partite.forEach(id => { set[String(id)] = 1; });
    return gareTerminate_().filter(g => set[String(g.partita.id_partita)]);
  }
  return [];
}
function valoreBaseline(o, num) {
  const gare = gareBaselineObiettivo(o);
  if (!gare.length || !(num || num === 0)) return null;
  return valoreMetricaStagione(o.metrica, num, gare);
}

/* ==========================================================================
   Estrazione valori metrica — base (per-linea) + avanzate (season/cumulativo)
   ========================================================================== */
function statLinePlays_(s) { return (s.a2 + s.a3) + 0.44 * s.fta + s.pp; }
function teamPlaysDa_(team) { return (team.a2 + team.a3) + 0.44 * team.fta + team.pp; }

/* ctx = { G, teamMin, teamPlays, tsTeam } — G=1 e teamMin/teamPlays/tsTeam
   della singola gara per una serie gara-per-gara, oppure i totali stagionali
   per il valore di stagione. Stesse formule già usate in vistaAnalisiGiocatori
   (analisi.js), tsTeam = adv.tsA già calcolato da calcolaAdvanced. */
function valoreBaseDaLinea_(metrica, s, ctx) {
  const G = ctx.G || 1;
  const fga = s.a2 + s.a3, fgm = s.m2 + s.m3;
  // FIX: ctx.teamMin (r.minuti o agg.minutiTot) è già la durata-partita cumulata,
  // cioè già "Tm MP / 5" della formula standard — dividere ANCORA per 5 schiacciava
  // USG% (e quindi anche l'Indice di Forzatura, che lo usa) a 1/5 del valore vero.
  const usg = (s.min && ctx.teamPlays) ? 100 * statLinePlays_(s) * ctx.teamMin / (s.min * ctx.teamPlays) : null;
  const ts = (fga || s.fta) ? s.pt / (2 * (fga + 0.44 * s.fta)) * 100 : null;
  switch (metrica) {
    case "ppg": return s.pt / G;
    case "rpg": return (s.ro + s.rd) / G;
    case "apg": return s.as / G;
    case "tpg": return s.pp / G;
    case "fgpct": return fga ? fgm / fga * 100 : null;
    case "p3pct": return s.a3 ? s.m3 / s.a3 * 100 : null;
    case "ftpct": return s.fta ? s.ftm / s.fta * 100 : null;
    case "ftr": return fga ? s.fta / fga : null;
    case "tspct": return ts;
    case "pmpg": return s.pm / G;
    case "usg": return usg;
    case "astpct": { const den = fga + 0.44 * s.fta + s.as + s.pp; return den ? s.as * 100 / den : null; }
    /* Indice di Forzatura = USG% × (1 − TS%/TS%squadra): riusa esattamente
       usg/ts appena calcolati sopra + lo stesso "rapporto di efficienza"
       (TS%giocatore/TS%squadra) già usato in serieAISGaraPerGara — quando il
       rapporto è 1 (rende come la squadra) l'indice è 0 a QUALSIASI volume;
       sotto 1 (meno efficiente) l'indice cresce con l'USG%: alto uso +
       efficienza sotto la media = segnale di tiri forzati. Sopra 1 diventa
       negativo: alto uso ED efficienza sopra la media, il contrario di
       forzare. */
    case "forz": {
      if (usg == null || ts == null || !ctx.tsTeam) return null;
      const rapEff = ts / ctx.tsTeam;
      return usg * (1 - rapEff);
    }
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
    let tsTeam = null;
    if (metrica === "forz") { const adv = calcolaAdvanced(r.box, r.minuti || 0.1); tsTeam = adv.tsA; }
    const v = valoreBaseDaLinea_(metrica, s, { G: 1, teamMin: r.minuti, teamPlays: teamPlays, tsTeam: tsTeam });
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
    return valoreBaseDaLinea_(metrica, s, { G: G, teamMin: agg.minutiTot, teamPlays: teamPlays, tsTeam: agg.adv && agg.adv.tsA });
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
/* Riepilogo del filtro attivo, ben visibile nella scheda (schermo+PDF): "Attuale"
   e i valori di riferimento cambiano se qui è diverso da come lo si ricorda —
   e sono un filtro INDIPENDENTE da quello di Analisi avanzata (filtriAnalisi),
   quindi due numeri diversi per lo stesso giocatore/metrica non sono un errore,
   sono semplicemente due gare-set diversi: per confrontarli vanno allineati
   qui e lì allo stesso filtro. */
function etichettaFiltriPlayerDev_() {
  const f = filtriPlayerDev;
  const comp = f.competizione === "Amichevole" ? "Amichevoli" : f.competizione;
  const campo = f.campo !== "tutte" ? f.campo : "Tutte";
  const esito = f.esito !== "tutte" ? (f.esito === "vinte" ? "Vinte" : "Perse") : "Tutte";
  return '<div class="st-hint pd-filtro-attivo">Filtro attivo (indipendente da Analisi avanzata): <strong>' + esc(comp) + '</strong> · ' + esc(campo) + ' · ' + esc(esito) + '</div>';
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
  const partenza = (num || num === 0) ? valoreBaseline(o, num) : null;
  const raggiunto = attuale == null ? null : (o.direzione === "lte" ? attuale <= o.target : attuale >= o.target);
  const statoTxt = attuale == null ? "Dati insuff." : (raggiunto ? "✓ Raggiunto" : "In corso");
  const statoCls = attuale == null ? "" : (raggiunto ? "pd-badge-ok" : "pd-badge-corso");
  const titoloInsuff = "Nessuna gara con minuti giocati nel filtro attivo (Campionato/Amichevoli · Casa/Trasferta · Vinte/Perse) — prova ad allargarlo qui sopra.";
  return '<tr>' +
    '<td>' + esc(etichettaOrizzonte(o.orizzonte)) + '</td>' +
    '<td>' + esc(info.et) + '</td>' +
    '<td' + (partenza == null ? ' title="' + esc(titoloInsuff) + '"' : '') + '>' + (partenza == null ? '–' : dec(partenza, info.dec) + info.unita) + '</td>' +
    '<td' + (attuale == null ? ' title="' + esc(titoloInsuff) + '"' : '') + '>' + (attuale == null ? '–' : dec(attuale, info.dec) + info.unita) + '</td>' +
    '<td>' + (o.direzione === "lte" ? "≤" : "≥") + ' ' + dec(o.target, info.dec) + info.unita + '</td>' +
    '<td class="' + statoCls + '">' + statoTxt + '</td>' +
    '<td class="pd-nota">' + esc(o.nota || "") + '</td>' +
    (perStampa ? '' : '<td><button class="pd-modifica" data-obiettivo="' + esc(o.id) + '" aria-label="Modifica obiettivo"><svg class="ico" aria-hidden="true"><use href="#i-edit"></use></svg></button></td>') +
    '</tr>';
}

/* Glossario compatto: solo le metriche usate dagli obiettivi di QUESTO giocatore
   (schermo e stampa) — spiegazione in poche parole, sia per chi compila la scheda
   sia per chi la riceve. */
function glossarioMetriche_(obiettivi) {
  if (!obiettivi.length) return '';
  const viste = {}; const voci = [];
  obiettivi.forEach(o => {
    if (viste[o.metrica]) return;
    viste[o.metrica] = 1;
    const info = infoMetrica(o.metrica);
    if (info.def) voci.push('<div class="pd-glossario-voce"><strong>' + esc(info.et) + '</strong> — ' + esc(info.def) + '</div>');
  });
  if (!voci.length) return '';
  return '<div class="pd-blocco"><div class="adv-tit" style="margin-top:14px">Cosa significano</div><div class="pd-glossario">' + voci.join('') + '</div></div>';
}

/* "Dove siamo oggi" — apre la scheda (e il PDF): partenza → attuale → target
   per ciascun obiettivo, la lettura più diretta di "da dove siamo partiti e
   dove siamo adesso" prima di ogni altro dettaglio. */
function riepilogoPartenzaAttuale_(obiettivi, num, gare) {
  if (!obiettivi.length) return '';
  const righe = obiettivi.map(o => {
    const info = infoMetrica(o.metrica);
    const partenza = (num || num === 0) ? valoreBaseline(o, num) : null;
    const attuale = (num || num === 0) ? valoreMetricaStagione(o.metrica, num, gare) : null;
    const fmt = v => v == null ? '?' : dec(v, info.dec) + info.unita;
    const fonteBase = !o.baseline_tipo ? '' : (o.baseline_tipo === "amichevoli" ? " (amichevoli)" : " (gare selezionate)");
    return '<div class="pd-riepilogo-voce">' +
      '<strong>' + esc(info.et) + '</strong>: partiti da <span class="pd-riepilogo-num">' + fmt(partenza) + '</span>' + esc(fonteBase) +
      ' → oggi <span class="pd-riepilogo-num pd-riepilogo-oggi">' + fmt(attuale) + '</span>' +
      ' → target ' + (o.direzione === "lte" ? "≤" : "≥") + ' ' + dec(o.target, info.dec) + info.unita +
      '</div>';
  }).join('');
  return '<div class="pd-blocco"><div class="adv-tit" style="margin-top:14px">Dove siamo oggi</div><div class="pd-riepilogo">' + righe + '</div>' +
    '<div class="st-hint">"Partenza" = solo se impostata su ogni obiettivo (punto di partenza opzionale nel form) — senza, resta "?".</div></div>';
}

/* Valori di riferimento di alto livello (Basso/Medio/Elite + media squadra
   dove si applica) per le sole metriche usate dagli obiettivi di QUESTO
   giocatore — per "posizionarsi" rispetto a una realtà cestistica più ampia. */
function tabellaRiferimenti_(obiettivi, gare) {
  if (!obiettivi.length) return '';
  const viste = {}; const righe = []; const fonti = {};
  obiettivi.forEach(o => {
    if (viste[o.metrica]) return;
    viste[o.metrica] = 1;
    const rif = riferimentiMetrica(o.metrica, gare);
    if (!rif) return;
    const info = infoMetrica(o.metrica);
    const fmt = v => v == null ? '–' : dec(v, info.dec) + info.unita;
    fonti[rif.fonte] = 1;
    righe.push('<tr><td class="st-g">' + esc(info.et) + '</td><td>' + fmt(rif.basso) + '</td><td>' + fmt(rif.medio) + '</td><td>' + fmt(rif.elite) + '</td><td>' + fmt(rif.mediaSquadra) + '</td></tr>');
  });
  if (!righe.length) return '';
  return '<div class="pd-blocco"><div class="adv-tit" style="margin-top:14px">Valori di riferimento (alto livello)</div>' +
    '<div class="st-scroll"><table class="st-box pd-tab-riferimenti"><thead><tr><th>Metrica</th><th>Basso</th><th>Medio</th><th>Elite</th><th>Media squadra</th></tr></thead><tbody>' + righe.join('') + '</tbody></table></div>' +
    '<div class="st-hint">Riferimenti indicativi (' + Object.keys(fonti).map(esc).join(' · ') + '), NON specifici del campionato DR1 — servono a capire "dove si posiziona" un valore rispetto alla realtà cestistica più ampia, non un confronto diretto. "Media squadra" assente dove il concetto non si applica bene a livello di gruppo (USG%/AST%/AIS/BPM-family/VORP) — Def. Rating fa eccezione: lì "Medio" e "Media squadra" coincidono per definizione (vedi sopra).</div></div>';
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
      ' · ' + esc(g.team || TEAM_DEFAULT) + ' · stagione ' + esc(filtriPlayerDev.stagione) + '</div>' +
      etichettaFiltriPlayerDev_() +
    '</div>' +
    riepilogoPartenzaAttuale_(obiettivi, num, gare) +
    '<div class="adv-tit" style="margin-top:14px">Obiettivi (' + obiettivi.length + '/' + MAX_OBIETTIVI + ')</div>' +
    (obiettivi.length
      ? '<div class="st-scroll"><table class="st-box pd-tab-obiettivi"><thead><tr><th>Orizzonte</th><th>Metrica</th><th>Partenza</th><th>Attuale</th><th>Target</th><th>Stato</th><th>Nota</th><th></th></tr></thead><tbody>' + righeObTab + '</tbody></table></div>'
      : '<div class="st-hint">Nessun obiettivo ancora — aggiungine uno.</div>') +
    '<button class="btn-annulla-modale pd-aggiungi" id="pd-aggiungi-obiettivo"' + (obiettivi.length >= MAX_OBIETTIVI ? ' disabled' : '') + '>+ Aggiungi obiettivo</button>' +
    glossarioMetriche_(obiettivi) +
    tabellaRiferimenti_(obiettivi, gare) +
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
    return '<div class="pd-blocco-grafico"><div class="adv-tit" style="margin-top:14px">' + esc(titolo) + '</div><div class="st-hint">Dati insufficienti con questi filtri.</div></div>';
  }
  const target = Number(o.target);
  const partenza = (num || num === 0) ? valoreBaseline(o, num) : null;
  const vals = serie.map(x => x.valore);
  const media = vals.reduce((a, b) => a + b, 0) / vals.length;
  const riferimenti = [target].concat(partenza != null ? [partenza] : []);
  let lo = Math.min.apply(null, vals.concat(riferimenti)), hi = Math.max.apply(null, vals.concat(riferimenti));
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
  const yPartenza = partenza != null ? ys(partenza).toFixed(1) : null;

  return '<div class="pd-blocco-grafico">' +
    '<div class="adv-tit" style="margin-top:14px">' + esc(titolo) + '</div>' +
    '<div class="st-scroll"><svg class="st-chart pd-trend" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' +
      griglia + barre +
      (yPartenza != null ? '<line x1="' + padL + '" y1="' + yPartenza + '" x2="' + (W - padR) + '" y2="' + yPartenza + '" class="pd-baseline"/>' : '') +
      '<line x1="' + padL + '" y1="' + yTarget + '" x2="' + (W - padR) + '" y2="' + yTarget + '" class="pd-target"/>' +
    '</svg></div>' +
    '<div class="st-hint">' + (partenza != null ? 'Partenza: ' + dec(partenza, info.dec) + info.unita + ' · ' : '') +
    'Media: ' + dec(media, info.dec) + info.unita + ' · target: ' + (o.direzione === "lte" ? "≤" : "≥") + ' ' +
    dec(target, info.dec) + info.unita + ' · linea tratteggiata scura = target' + (yPartenza != null ? ', punteggiata chiara = partenza' : '') +
    ' · verde/rosso = sopra/sotto soglia in quella gara.</div>' +
  '</div>';
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
  aggiornaDefMetricaForm();
  document.getElementById("ob-target").value = o && o.target != null ? o.target : "";
  document.getElementById("ob-direzione").value = o ? (o.direzione || "gte") : "gte";
  document.getElementById("ob-orizzonte").value = o ? (o.orizzonte || "1m") : "1m";
  document.getElementById("ob-nota").value = o ? (o.nota || "") : "";
  document.getElementById("ob-baseline-tipo").value = o ? (o.baseline_tipo || "") : "";
  renderBaselineSelezioneForm(o ? o.baseline_partite : []);
  aggiornaVisibilitaBaselineForm();
  document.getElementById("ob-elimina").hidden = !o;
  document.getElementById("overlay-obiettivo").classList.add("visibile");
}
function chiudiFormObiettivo() {
  document.getElementById("overlay-obiettivo").classList.remove("visibile");
}
/* Definizione in poche parole della metrica scelta — visibile sia a chi
   compila la scheda sia (nel PDF) a chi la riceve (vedi glossarioMetriche_). */
function aggiornaDefMetricaForm() {
  const sel = document.getElementById("ob-metrica");
  const def = document.getElementById("ob-metrica-def");
  const rifEl = document.getElementById("ob-metrica-rif");
  if (!sel || !def) return;
  const info = infoMetrica(sel.value);
  def.textContent = info.def || "";
  if (!rifEl) return;
  const rif = riferimentiMetrica(sel.value, (typeof garePerPlayerDev === "function") ? garePerPlayerDev() : []);
  if (!rif) { rifEl.innerHTML = ''; return; }
  const fmt = v => v == null ? null : dec(v, info.dec) + info.unita;
  const pezzi = [
    ['Basso', fmt(rif.basso)], ['Medio', fmt(rif.medio)], ['Elite', fmt(rif.elite)],
    ['Media squadra', fmt(rif.mediaSquadra)]
  ].filter(p => p[1] != null);
  rifEl.innerHTML = pezzi.length
    ? '<strong>Riferimento:</strong> ' + pezzi.map(p => esc(p[0]) + ' ' + esc(p[1])).join(' · ')
    : '';
}
function renderBaselineSelezioneForm(selezionati) {
  const cont = document.getElementById("ob-baseline-selezione");
  if (!cont) return;
  const set = {}; (selezionati || []).forEach(id => { set[String(id)] = 1; });
  const gare = gareTerminate_();
  cont.innerHTML = gare.length
    ? gare.map(g => {
        const id = String(g.partita.id_partita);
        const nome = (typeof nomePartitaDaCalendario === "function" ? nomePartitaDaCalendario(g.partita) : null) ||
          ((g.partita.luogo === "Casa" ? "" : "@") + (g.partita.avversario || ""));
        return '<label class="pd-baseline-riga"><input type="checkbox" class="ob-baseline-check" value="' + esc(id) + '"' +
          (set[id] ? ' checked' : '') + '> ' + esc(nome) +
          (g.partita.data_ora ? ' · ' + esc(String(g.partita.data_ora).slice(0, 10)) : '') +
          ((g.partita.tipo || "Campionato") === "Amichevole" ? ' (amich.)' : '') + '</label>';
      }).join('')
    : '<div class="st-hint">Nessuna gara terminata disponibile.</div>';
}
function aggiornaVisibilitaBaselineForm() {
  const tipo = document.getElementById("ob-baseline-tipo").value;
  document.getElementById("ob-baseline-selezione").hidden = tipo !== "selezione";
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
  const baselineTipo = document.getElementById("ob-baseline-tipo").value;
  const baselinePartite = baselineTipo === "selezione"
    ? Array.from(document.querySelectorAll("#ob-baseline-selezione .ob-baseline-check:checked")).map(el => el.value)
    : [];
  upsertObiettivo({
    id: idAttuale || "",
    id_giocatore: idGiocatore,
    metrica: document.getElementById("ob-metrica").value,
    target: target,
    direzione: document.getElementById("ob-direzione").value === "lte" ? "lte" : "gte",
    orizzonte: document.getElementById("ob-orizzonte").value,
    nota: document.getElementById("ob-nota").value.trim(),
    baseline_tipo: baselineTipo,
    baseline_partite: baselinePartite
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
      '<p class="pd-stampa-data">Generato il ' + esc(new Date().toLocaleDateString("it-IT")) + ' · Filtro gare: ' +
        esc(filtriPlayerDev.competizione === "Amichevole" ? "Amichevoli" : filtriPlayerDev.competizione) + ' · ' +
        esc(filtriPlayerDev.campo !== "tutte" ? filtriPlayerDev.campo : "Tutte") + ' · ' +
        esc(filtriPlayerDev.esito !== "tutte" ? (filtriPlayerDev.esito === "vinte" ? "Vinte" : "Perse") : "Tutte") + '</p>' +
    '</div>' +
    '<h2>Dove siamo oggi</h2>' +
    (riepilogoPartenzaAttuale_(obiettivi, num, gare) || '<p>Nessun obiettivo impostato.</p>') +
    '<h2>Obiettivi</h2>' +
    (obiettivi.length
      ? '<table class="pd-stampa-tab"><thead><tr><th>Orizzonte</th><th>Metrica</th><th>Partenza</th><th>Attuale</th><th>Target</th><th>Stato</th><th>Nota</th></tr></thead><tbody>' + righe + '</tbody></table>'
      : '<p>Nessun obiettivo impostato.</p>') +
    glossarioMetriche_(obiettivi) +
    tabellaRiferimenti_(obiettivi, gare) +
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
    const partenza = (num || num === 0) ? valoreBaseline(o, num) : null;
    const serie = (num || num === 0) ? serieObiettivo(o, num, gare) : [];
    const ultime = serie.slice(-3).map(x => dec(x.valore, info.dec)).join(", ");
    return '- Obiettivo a ' + etichettaOrizzonte(o.orizzonte) + ': ' + info.et + ' (' + info.def + ') ' +
      (o.direzione === "lte" ? "≤" : "≥") + ' ' + dec(o.target, info.dec) + info.unita +
      (partenza != null ? '. Punto di partenza: ' + dec(partenza, info.dec) + info.unita : '') +
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

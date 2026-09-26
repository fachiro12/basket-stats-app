/* ==========================================================================
   report-gara.js — "Report gara (AI)" (Altro → Debrief, sperimentale).
   Un'unica gara conclusa → un blocco di testo unico (prompt AI in cima + tutti
   i dati della gara sotto), pronto da copiare e incollare in un assistente AI
   per un'analisi approfondita. Stesso identico pattern di
   generaPromptAI/copiaPromptAI in player-dev.js, ma per un'intera gara
   invece che per un singolo giocatore.

   Tutto sola lettura, nessun file esistente toccato (CLAUDE.md,
   no-regressioni-riuso-funzioni: nuova feature = nuovo file):
   - box/adv squadra di UNA gara → boxGaraSingola()/calcolaAdvanced() (analisi.js/stats.js)
   - box/adv giocatori → stesse formule di vistaAnalisiGiocatori (analisi.js,
     righe ~399-437, fix USG% v70 incluso), REPLICATE qui sotto (quella
     funzione produce HTML accoppiato a stato UI — analisiSort/analisiFmt —
     non riusabile a valle come dato puro; stesso schema già seguito da
     player-dev.js per AIS: "copia locale della formula")
   - play-by-play → descriviEvento() (stats.js), stessa funzione di vistaPbp
   - eventi di gare concluse → cacheEventiStagione (analisi.js), la stessa
     cache già condivisa in sola lettura da Rotazioni/Breakdown/Rating Net/
     Player Development — MAI scaricaEventiPartita (quella muta
     statsEventiRemoti/statsTargetId, stato della vista Stats live)
   - copia negli appunti con fallback → copiaPromptFallback_ (player-dev.js)

   Su richiesta esplicita dell'utente: NESSUNA integrazione con avversari.js
   (niente note di scouting) — l'avversario nel testo è solo il nome squadra
   + le sue statistiche di gara, già presenti nel box squadra.
   ========================================================================== */

let reportGaraSel = null;

function apriReportGara() {
  if (!cacheEventiStagione && typeof caricaCacheAnalisi === "function") caricaCacheAnalisi();
  navigaA("report-gara");
  renderReportGara();
  const scaduta = !cacheEventiStagione || (Date.now() - (cacheEventiStagione.updatedAt || 0) > 60 * 60 * 1000);
  if (scaduta && typeof caricaEventiStagione === "function") caricaEventiStagione(() => renderReportGara());
}

function gareReportOrdinate_() {
  return (typeof elencoPartite === "function" ? elencoPartite() : [])
    .filter(p => String(p.stato) === "Terminata")
    .sort((a, b) => String(b.data_ora || "").localeCompare(String(a.data_ora || "")));   // più recenti in cima
}

function popolaSelettoreReportGara_() {
  const sel = document.getElementById("report-gara-sel");
  if (!sel) return;
  const gare = gareReportOrdinate_();
  sel.innerHTML = '<option value="">— scegli una gara —</option>' + gare.map(p =>
    '<option value="' + esc(p.id_partita) + '"' + (String(p.id_partita) === String(reportGaraSel) ? " selected" : "") + '>' +
    esc((typeof nomePartitaDaCalendario === "function" ? nomePartitaDaCalendario(p) : (p.avversario || "")) +
      " · " + String(p.data_ora || "").slice(0, 10)) + '</option>').join('');
}

function cambiaGaraReport(id) {
  reportGaraSel = id || null;
  renderReportGara();
}

function renderReportGara() {
  popolaSelettoreReportGara_();
  const body = document.getElementById("report-gara-body");
  if (!body) return;

  if (!reportGaraSel) {
    body.innerHTML = '<div class="st-hint">Scegli una gara conclusa per generare il report.</div>';
    return;
  }
  if (!cacheEventiStagione || !cacheEventiStagione.byMatch[String(reportGaraSel)]) {
    body.innerHTML = '<div class="st-hint">Recupero dati della gara in corso…</div>';
    return;
  }

  const testo = costruisciReportTesto_(reportGaraSel);
  if (!testo) {
    body.innerHTML = '<div class="st-hint">Nessun evento registrato per questa gara.</div>';
    return;
  }

  body.innerHTML =
    '<div class="rg-info">' + testo.length + ' caratteri — copialo e incollalo nel tuo assistente AI preferito</div>' +
    '<button class="btn-annulla-modale" id="report-gara-copia">📋 Copia per AI</button>' +
    '<textarea id="report-gara-testo" class="rg-testo" readonly></textarea>';
  document.getElementById("report-gara-testo").value = testo;
}

/* ==========================================================================
   Costruzione del testo — box giocatori: stesse formule di vistaAnalisiGiocatori
   (analisi.js), applicate al box di QUESTA SOLA gara invece che alla stagione.
   ========================================================================== */
function righeGiocatoriReport_(box, adv, teamMin) {
  const s = (x, y) => (y ? x / y : 0);
  const teamPlays = (box.team.MIA.a2 + box.team.MIA.a3) + 0.44 * box.team.MIA.fta + box.team.MIA.pp;
  const tsSquadra = adv.tsA || 0;

  return Object.keys(box.pg).map(Number)
    .map(n => {
      const gPl = box.pg[n];
      if (!(gPl.min > 0)) return null;   // non sceso in campo in questa gara
      const fga = gPl.a2 + gPl.a3, fgm = gPl.m2 + gPl.m3;
      const efg = fga ? s(fgm + 0.5 * gPl.m3, fga) * 100 : null;
      const ts = (fga || gPl.fta) ? s(gPl.pt, 2 * (fga + 0.44 * gPl.fta)) * 100 : null;
      const plays = fga + 0.44 * gPl.fta + gPl.pp;
      const usg = (gPl.min && teamPlays) ? 100 * plays * teamMin / (gPl.min * teamPlays) : 0;
      const denomR = fga + 0.44 * gPl.fta + gPl.as + gPl.pp;
      const astR = denomR ? gPl.as * 100 / denomR : 0;
      const tovR = denomR ? gPl.pp * 100 / denomR : 0;
      const forz = (ts != null && tsSquadra) ? usg * (1 - ts / tsSquadra) : null;
      return {
        num: n, nome: (typeof nomeAnalisi === "function" ? nomeAnalisi(n) : "") || "",
        min: gPl.min, pt: gPl.pt, m2: gPl.m2, a2: gPl.a2, m3: gPl.m3, a3: gPl.a3,
        ftm: gPl.ftm, fta: gPl.fta, ro: gPl.ro, rd: gPl.rd, as: gPl.as, pp: gPl.pp,
        pr: gPl.pr, ff: gPl.ff, pm: gPl.pm, efg: efg, ts: ts, usg: usg, astR: astR, tovR: tovR, forz: forz
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.min - a.min);
}

/* dec() è già definita in stats.js (isFinite(x) ? x : 0).toFixed(n) — qui
   serve solo distinguere "dato assente" (null, es. eFG% senza tiri) da 0. */
function riga1_(x, cifre) { return x == null ? "–" : dec(x, cifre); }

function testoBoxGiocatori_(righe) {
  return righe.map(r =>
    "#" + r.num + " " + (r.nome || "senza nome") + " — " + mmss(r.min) + " min · " + r.pt + " PT · " +
    r.m2 + "/" + r.a2 + " 2P · " + r.m3 + "/" + r.a3 + " 3P · " + r.ftm + "/" + r.fta + " TL · " +
    "RIM " + (r.ro + r.rd) + " (O" + r.ro + "/D" + r.rd + ") · AS " + r.as + " · PP " + r.pp + " · REC " + r.pr +
    " · Falli " + r.ff + " · eFG% " + riga1_(r.efg, 0) + " · TS% " + riga1_(r.ts, 0) + " · USG% " + riga1_(r.usg) +
    " · AST% " + riga1_(r.astR) + " · TOV% " + riga1_(r.tovR) + " · Forz. " + riga1_(r.forz) +
    " · +/- " + (r.pm > 0 ? "+" : "") + r.pm.toFixed(0)
  ).join("\n");
}

const PROMPT_REPORT_GARA =
  'Sei un assistente di coaching per una squadra di basket dilettantistica (campionato DR1 Lombardia, girone D).\n' +
  'Di seguito trovi tutti i dati di UNA partita già giocata: risultato, box score di squadra e dei singoli giocatori ' +
  '(comprese alcune statistiche avanzate — eFG%/TS%/USG%/AST%/TOV%/Forz., quest\'ultima "Indice di Forzatura" = ' +
  'USG% × (1 − TS%giocatore/TS%squadra): alto e positivo indica un giocatore che tira/attacca molto con efficienza ' +
  'sotto la media), e il play-by-play completo in ordine cronologico.\n\n' +
  'In base a questi dati, scrivi un\'analisi approfondita che includa:\n' +
  '1) i pattern offensivi e difensivi emersi dalla partita — non solo i numeri finali, ma come si sono sviluppati ' +
  'nel play-by-play (run, cali di rendimento, momenti chiave, cambi di quintetto che hanno inciso);\n' +
  '2) punti di forza e di debolezza individuali dei giocatori scesi in campo, numeri alla mano;\n' +
  '3) 2-3 spunti concreti e specifici su cosa lavorare nel prossimo allenamento in vista della prossima gara.\n' +
  'Sii specifico e concreto: evita osservazioni generiche che andrebbero bene per qualsiasi partita.';

function costruisciReportTesto_(idPartita) {
  const p = (typeof elencoPartite === "function" ? elencoPartite() : []).find(x => String(x.id_partita) === String(idPartita));
  const eventiGrezzi = (cacheEventiStagione && cacheEventiStagione.byMatch[String(idPartita)]) || [];
  if (!p || !eventiGrezzi.length) return null;

  const ev = eventiPuliti(eventiGrezzi);
  const finale = punteggioDaEventi(ev);
  const g = { partita: p, eventi: eventiGrezzi, finale: finale };
  const { box, minuti } = boxGaraSingola(g);
  const adv = calcolaAdvanced(box, minuti);
  const opp = typeof avversarioBreveAuto === "function" ? avversarioBreveAuto(p.avversario) : (p.avversario || "AVV");
  const noi = CONFIG.NOME_SQUADRA_MIA;
  const vinta = finale.MIA > finale.OPP;

  const A = box.team.MIA, B = box.team.OPP;
  const testoTeam =
    noi + ": " + A.pt + " PT · " + A.m2 + "/" + A.a2 + " 2P · " + A.m3 + "/" + A.a3 + " 3P · " + A.ftm + "/" + A.fta + " TL · " +
    "RIM " + (A.ro + A.rd) + " (O" + A.ro + "/D" + A.rd + ") · AS " + A.as + " · PP " + A.pp + " · REC " + A.pr + " · Falli " + A.ff + "\n" +
    (p.avversario || opp) + ": " + B.pt + " PT · " + B.m2 + "/" + B.a2 + " 2P · " + B.m3 + "/" + B.a3 + " 3P · " + B.ftm + "/" + B.fta + " TL · " +
    "RIM " + (B.ro + B.rd) + " (O" + B.ro + "/D" + B.rd + ") · AS " + B.as + " · PP " + B.pp + " · REC " + B.pr + " · Falli " + B.ff + "\n\n" +
    "Adv squadra — Off Rtg " + riga1_(adv.ortg) + " · Def Rtg " + riga1_(adv.drtg) + " · Net Rtg " +
    (adv.net > 0 ? "+" : "") + riga1_(adv.net) + " · Pace " + riga1_(adv.pace) + " · eFG% " + riga1_(adv.efgA, 0) + "/" + riga1_(adv.efgB, 0) +
    " · TS% " + riga1_(adv.tsA, 0) + "/" + riga1_(adv.tsB, 0) + " · TOV% " + riga1_(adv.tovA, 0) + "/" + riga1_(adv.tovB, 0) +
    " · ORB% " + riga1_(adv.orbA, 0) + "/" + riga1_(adv.orbB, 0) + " · DRB% " + riga1_(adv.drbA, 0) + "/" + riga1_(adv.drbB, 0) +
    " (" + noi + "/" + opp + ")";

  const righeGioc = righeGiocatoriReport_(box, adv, minuti);

  let prevLu = "";
  const pbp = ev.map(e => {
    const testo = descriviEvento(e, prevLu, opp);
    if (e.quintetto_mia != null && String(e.quintetto_mia) !== "") prevLu = String(e.quintetto_mia);
    const per = (e.quarto || "") + (e.tempo_partita ? " " + e.tempo_partita : "");
    const pp = /^\d+-\d+$/.test(String(e.punteggio_progressivo || "")) ? " (" + e.punteggio_progressivo + ")" : "";
    return per + " · " + testo + pp;
  }).join("\n");

  return PROMPT_REPORT_GARA + "\n\n" +
    "======================================================\n" +
    "PARTITA: " + noi + (p.luogo === "Casa" ? " vs " : " @ ") + (p.avversario || opp) +
    " — " + String(p.data_ora || "").slice(0, 10) + " — " + (p.tipo || "Campionato") + "\n" +
    "Risultato finale: " + noi + " " + finale.MIA + " - " + finale.OPP + " " + (p.avversario || opp) +
    " (" + (vinta ? "vinta" : "persa") + ")\n" +
    "======================================================\n\n" +
    "--- BOX SQUADRA ---\n" + testoTeam + "\n\n" +
    "--- BOX GIOCATORI (" + noi + ", solo chi ha giocato) ---\n" + testoBoxGiocatori_(righeGioc) + "\n\n" +
    "--- PLAY-BY-PLAY ---\n" + pbp;
}

function copiaReportGara() {
  const testo = document.getElementById("report-gara-testo") ? document.getElementById("report-gara-testo").value : "";
  if (!testo) return;
  const fatto = () => mostraToast("Report copiato — incollalo nel tuo AI preferito");
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(testo).then(fatto).catch(() => {
      if (typeof copiaPromptFallback_ === "function") copiaPromptFallback_(testo, fatto);
    });
  } else if (typeof copiaPromptFallback_ === "function") {
    copiaPromptFallback_(testo, fatto);
  }
}

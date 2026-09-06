/* ==========================================================================
   azioni.js — Tiri, falli, recuperi, palle perse, UNDO
   ========================================================================== */

function registraEvento(campi, delta, testoFeed) {
  const inCampo = state.inCampo || state.roster;
  const evento = Object.assign({
    id_partita: state.id_partita,
    id_evento: uuid(),
    timestamp: new Date().toISOString(),
    quarto: nomeQuarto(),
    tempo_partita: state.tempoPartita,
    squadra: "",
    giocatore_num: "",
    tipo_evento: "",
    dettaglio: "",
    punti_segnati: 0,
    punteggio_progressivo: state.punteggio.MIA + "-" + state.punteggio.OPP,
    quintetto_mia: inCampo.join(","),
    fallo_speciale: "NESSUNO",
    esito_tl: "",
    valido: true,
    id_evento_target: ""
  }, campi);

  if (Array.isArray(evento.esito_tl)) evento.esito_tl = evento.esito_tl.join(",");

  state.eventLog.push({ evento, delta });
  state.ultimoTestoFeed = testoFeed;

  const banner = document.getElementById("ultimo-evento-banner");
  if (banner) banner.textContent = testoFeed;

  salvaStato();
  inviaEvento(evento);
  renderPartita();
}

function richiedeSelezione() {
  if (!state.selezione) {
    mostraToast("Seleziona prima un giocatore o AVVERSARI");
    return false;
  }
  return true;
}

function selezionaGiocatore(num) {
  state.selezione = (state.selezione?.squadra === "MIA" && state.selezione?.num === num)
    ? null
    : { squadra: "MIA", num };
  salvaStato();
  renderPartita();
}

function selezionaOpp() {
  state.selezione = state.selezione?.squadra === "OPP" ? null : { squadra: "OPP", num: null };
  salvaStato();
  renderPartita();
}

function registraTiro(tipo, esito) {
  if (!richiedeSelezione()) return;
  const sq = state.selezione.squadra;
  const num = state.selezione.num;
  const punti = esito === "SEGNATO" ? (tipo === "3P" ? 3 : 2) : 0;

  state.punteggio[sq] += punti;
  const inverti = () => { state.punteggio[sq] -= punti; };

  registraEvento({
    squadra: sq,
    giocatore_num: num ? String(num) : "",
    tipo_evento: "TIRO",
    dettaglio: tipo + "_" + esito,
    punti_segnati: punti
  }, inverti, feed(sq, num, tipo + " " + (esito === "SEGNATO" ? "segnato" : "sbagliato")));

  // Macchina a stati: canestro MIA -> Assist? / tiro sbagliato -> Rimbalzo (chiunque tiri)
  if (sq === "MIA" && esito === "SEGNATO" && num) avviaOverlayAssist(num);
  else if (esito === "ERRATO") avviaOverlayRimbalzo(sq);
}

/* ==========================================================================
   MACCHINA A STATI — pannello contestuale Assist / Rimbalzo
   ========================================================================== */
let aoTimeout = null;

function aoElemento() { return document.getElementById("action-overlay"); }

function chiudiActionOverlay() {
  clearTimeout(aoTimeout);
  aoTimeout = null;
  aoElemento().classList.add("hidden");
  document.getElementById("ao-griglia").innerHTML = "";
}

function aoBottone(testo, onTap, neutro) {
  const b = document.createElement("button");
  b.className = "ao-btn" + (neutro ? " ao-neutro" : "");
  b.textContent = testo;
  b.addEventListener("click", onTap);
  return b;
}

function mostraActionOverlay(titolo, bottoni, timeoutMs) {
  document.getElementById("ao-titolo").textContent = titolo;
  const g = document.getElementById("ao-griglia");
  g.innerHTML = "";
  bottoni.forEach(b => g.appendChild(b));
  // Via di fuga sempre presente: annulla / chiudi senza registrare nulla
  const annulla = aoBottone("✕ Annulla", chiudiActionOverlay, true);
  annulla.classList.add("ao-annulla");
  g.appendChild(annulla);
  aoElemento().classList.remove("hidden");
  clearTimeout(aoTimeout);
  aoTimeout = timeoutMs ? setTimeout(chiudiActionOverlay, timeoutMs) : null;
}

/* Sigla squadra per gli overlay compatti: PVL / prime 3 lettere avversario */
function etichettaSquadra(sq) {
  if (sq === "MIA") return CONFIG.NOME_SQUADRA_MIA;
  return (state.avversarioBreve ? state.avversarioBreve.slice(0, 3) : "AVV").toUpperCase();
}

/* Nome squadra esteso per il feed "ultimo evento" */
function etichettaSquadraEstesa(sq) {
  return sq === "MIA" ? CONFIG.NOME_SQUADRA_MIA : (state.avversarioBreve || "Avversari");
}

/* "#7 Rossi" — nickname o cognome dai convocati; solo "#7" se ignoti */
function etichettaNum(n) {
  const c = (state.convocati || []).find(x => String(x.numero) === String(n));
  const nm = c ? (c.nickname || c.cognome || "") : "";
  return "#" + n + (nm ? " " + nm : "");
}

/* Riga di feed: "PVL #7 Rossi · 2P segnato" */
function feed(sq, num, azione) {
  const chi = num ? " " + etichettaNum(num) : "";
  return etichettaSquadraEstesa(sq) + chi + " · " + azione;
}

/* ---- Assist (timeout 4s) ---- */
function avviaOverlayAssist(autoreNum) {
  const bottoni = state.roster
    .filter(n => String(n) !== String(autoreNum))
    .map(n => aoBottone("#" + n, () => {
      registraAssist(n, autoreNum);
      chiudiActionOverlay();
    }));
  bottoni.push(aoBottone("Nessun assist", chiudiActionOverlay, true));
  mostraActionOverlay("Assist?", bottoni, 4000);
}

function registraAssist(num, autoreNum) {
  registraEvento({
    squadra: "MIA", giocatore_num: String(num),
    tipo_evento: "ASSIST", dettaglio: "AST_A_" + autoreNum, punti_segnati: 0
  }, () => {}, CONFIG.NOME_SQUADRA_MIA + " " + etichettaNum(num) + " · assist per " + etichettaNum(autoreNum));
}

/* ---- Rimbalzo (nessun timeout: obbligatorio).
       squadraTiro = "MIA" (default, abbiamo tirato noi) oppure "OPP". ---- */
function avviaOverlayRimbalzo(squadraTiro) {
  const nostro = CONFIG.NOME_SQUADRA_MIA;
  const avv = etichettaSquadra("OPP");
  const dopoTiroOpp = squadraTiro === "OPP";

  const btnNostro = dopoTiroOpp
    ? aoBottone("Difensivo (" + nostro + ")", () => chiediRimbalzistaMIA("DIFENSIVO"))
    : aoBottone("Offensivo (" + nostro + ")", () => chiediRimbalzistaMIA("OFFENSIVO"));
  const btnAvv = dopoTiroOpp
    ? aoBottone("Offensivo (" + avv + ")", () => { registraRimbalzo("OFFENSIVO", "OPP", null); chiudiActionOverlay(); })
    : aoBottone("Difensivo (" + avv + ")", () => { registraRimbalzo("DIFENSIVO", "OPP", null); chiudiActionOverlay(); });

  mostraActionOverlay("Rimbalzo", [
    btnNostro,
    btnAvv,
    aoBottone("Di squadra", () => { registraRimbalzo("SQUADRA", "MIA", null); chiudiActionOverlay(); }, true)
  ], 0);
}

function chiediRimbalzistaMIA(tipo) {
  tipo = tipo || "OFFENSIVO";
  const bottoni = state.roster.map(n => aoBottone(etichettaNum(n), () => {
    registraRimbalzo(tipo, "MIA", n);
    chiudiActionOverlay();
  }));
  mostraActionOverlay("Rimbalzo " + tipo.toLowerCase() + " — chi?", bottoni, 0);
}

function registraRimbalzo(tipo, squadra, num) {
  registraEvento({
    squadra: squadra, giocatore_num: num ? String(num) : "",
    tipo_evento: "RIMBALZO", dettaglio: tipo, punti_segnati: 0
  }, () => {}, feed(squadra, num, "rimbalzo " + tipo.toLowerCase()));
}

function richiedeSelezioneSquadra() {
  if (!state.selezione || (state.selezione.squadra !== "MIA" && state.selezione.squadra !== "OPP")) {
    mostraToast("Seleziona un giocatore " + CONFIG.NOME_SQUADRA_MIA + " o AVVERSARI");
    return false;
  }
  return true;
}

function registraRecupero() {
  if (!richiedeSelezioneSquadra()) return;
  const sq = state.selezione.squadra, num = state.selezione.num;
  state.selezione = null;
  registraEvento({
    squadra: sq, giocatore_num: num ? String(num) : "",
    tipo_evento: "RECUPERO", dettaglio: "REC", punti_segnati: 0
  }, () => {}, feed(sq, num, "recupero"));
}

function registraPallaPersa() {
  if (!richiedeSelezioneSquadra()) return;
  const sq = state.selezione.squadra, num = state.selezione.num;
  state.selezione = null;
  registraEvento({
    squadra: sq, giocatore_num: num ? String(num) : "",
    tipo_evento: "PALLA_PERSA", dettaglio: "PP", punti_segnati: 0
  }, () => {}, feed(sq, num, "palla persa"));
}

function registraFalloFatto() {
  if (!richiedeSelezione()) return;
  // Fallo commesso dagli avversari → flusso dedicato (personale / tecnico / doppio)
  if (state.selezione.squadra === "OPP") { apriOverlayFalloAvversario(); return; }
  // Fallo nostro → scelta TL avversari (0/1/2/3) prima di registrare
  apriTlAvversari(state.selezione.num);
}

function annullaUltimoEvento() {
  if (state.eventLog.length === 0) { mostraToast("Nessun evento da annullare"); return; }
  const ultimo = state.eventLog.pop();
  if (typeof ultimo.delta === "function") ultimo.delta();

  const eventoAnnulla = {
    id_partita: state.id_partita,
    id_evento: uuid(),
    timestamp: new Date().toISOString(),
    quarto: nomeQuarto(),
    tempo_partita: state.tempoPartita,
    squadra: ultimo.evento.squadra,
    giocatore_num: ultimo.evento.giocatore_num,
    tipo_evento: "ANNULLA",
    dettaglio: "UNDO di " + ultimo.evento.tipo_evento,
    punti_segnati: 0,
    punteggio_progressivo: state.punteggio.MIA + "-" + state.punteggio.OPP,
    quintetto_mia: (state.inCampo || state.roster).join(","),
    fallo_speciale: "NESSUNO",
    esito_tl: "",
    valido: true,
    id_evento_target: ultimo.evento.id_evento
  };
  inviaEvento(eventoAnnulla);

  state.ultimoTestoFeed = "↩ Annullato · " + (ultimo.evento.tipo_evento || "").replace(/_/g, " ").toLowerCase();
  salvaStato();
  renderPartita();
  mostraToast("Ultimo evento annullato");
}

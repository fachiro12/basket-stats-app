/* ==========================================================================
   azioni.js — Tiri, falli, recuperi, palle perse, UNDO
   ========================================================================== */

function registraEvento(campi, delta, testoFeed) {
  const evento = Object.assign({
    id_evento: uuid(),
    timestamp: new Date().toISOString(),
    quarto: nomeQuarto(),
    tempo_rimanente: formatTempo(state.timerSec),
    punteggio_progressivo: state.punteggio.MIA + "-" + state.punteggio.OPP,
    fallo_speciale: "NESSUNO",
    esito_tl: []
  }, campi);

  state.eventLog.push({ evento, delta });
  state.ultimoTestoFeed = testoFeed;
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

  const label = (num ? "#" + num + " " : "") + sq + " " + tipo + " " + (esito === "SEGNATO" ? "segnato" : "errato");
  registraEvento({
    squadra: sq,
    giocatore_num: num ? String(num) : "",
    tipo_evento: "TIRO",
    dettaglio: tipo + "_" + esito,
    punti_segnati: punti
  }, inverti, label);

  // Macchina a stati: canestro MIA -> Assist? / errore MIA -> Rimbalzo
  if (sq === "MIA") {
    if (esito === "SEGNATO" && num) avviaOverlayAssist(num);
    else if (esito === "ERRATO") avviaOverlayRimbalzo();
  }
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
  aoElemento().classList.remove("hidden");
  clearTimeout(aoTimeout);
  aoTimeout = timeoutMs ? setTimeout(chiudiActionOverlay, timeoutMs) : null;
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
  }, () => {}, "#" + num + " MIA Assist (a #" + autoreNum + ")");
}

/* ---- Rimbalzo (nessun timeout: obbligatorio) ---- */
function avviaOverlayRimbalzo() {
  mostraActionOverlay("Rimbalzo", [
    aoBottone("Offensivo (MIA)", chiediRimbalzistaMIA),
    aoBottone("Difensivo (OPP)", () => { registraRimbalzo("DIFENSIVO", "OPP", null); chiudiActionOverlay(); }),
    aoBottone("Di squadra", () => { registraRimbalzo("SQUADRA", "MIA", null); chiudiActionOverlay(); }, true)
  ], 0);
}

function chiediRimbalzistaMIA() {
  const bottoni = state.roster.map(n => aoBottone("#" + n, () => {
    registraRimbalzo("OFFENSIVO", "MIA", n);
    chiudiActionOverlay();
  }));
  mostraActionOverlay("Rimbalzo offensivo — chi?", bottoni, 0);
}

function registraRimbalzo(tipo, squadra, num) {
  registraEvento({
    squadra: squadra, giocatore_num: num ? String(num) : "",
    tipo_evento: "RIMBALZO", dettaglio: tipo, punti_segnati: 0
  }, () => {}, (num ? "#" + num + " " : "") + squadra + " Rimbalzo " + tipo.toLowerCase());
}

function registraRecupero() {
  if (!richiedeSelezione()) return;
  const sq = state.selezione.squadra, num = state.selezione.num;
  registraEvento({
    squadra: sq, giocatore_num: num ? String(num) : "",
    tipo_evento: "RECUPERO", dettaglio: "REC", punti_segnati: 0
  }, () => {}, (num ? "#" + num + " " : "") + sq + " Recupero");
}

function registraPallaPersa() {
  if (!richiedeSelezione()) return;
  const sq = state.selezione.squadra, num = state.selezione.num;
  registraEvento({
    squadra: sq, giocatore_num: num ? String(num) : "",
    tipo_evento: "PALLA_PERSA", dettaglio: "PP", punti_segnati: 0
  }, () => {}, (num ? "#" + num + " " : "") + sq + " Palla persa");
}

function registraFalloFatto() {
  if (!richiedeSelezione()) return;
  const sq = state.selezione.squadra, num = state.selezione.num;
  const qi = state.quartoIndice;

  state.falliSquadraPerQuarto[sq][qi] += 1;
  if (sq === "MIA" && num) state.falliGiocatori[num] = (state.falliGiocatori[num] || 0) + 1;

  const inverti = () => {
    state.falliSquadraPerQuarto[sq][qi] = Math.max(0, state.falliSquadraPerQuarto[sq][qi] - 1);
    if (sq === "MIA" && num) state.falliGiocatori[num] = Math.max(0, (state.falliGiocatori[num] || 0) - 1);
  };

  registraEvento({
    squadra: sq, giocatore_num: num ? String(num) : "",
    tipo_evento: "FALLO_FATTO", dettaglio: "PERSONALE", punti_segnati: 0
  }, inverti, (num ? "#" + num + " " : "") + sq + " Fallo fatto");
}

function annullaUltimoEvento() {
  if (state.eventLog.length === 0) { mostraToast("Nessun evento da annullare"); return; }
  const ultimo = state.eventLog.pop();
  if (typeof ultimo.delta === "function") ultimo.delta();

  const eventoAnnulla = {
    id_evento: uuid(),
    timestamp: new Date().toISOString(),
    quarto: nomeQuarto(),
    tempo_rimanente: formatTempo(state.timerSec),
    squadra: ultimo.evento.squadra,
    giocatore_num: ultimo.evento.giocatore_num,
    tipo_evento: "ANNULLA",
    id_evento_target: ultimo.evento.id_evento,
    dettaglio: "UNDO di " + ultimo.evento.tipo_evento,
    punti_segnati: 0,
    esito_tl: [],
    fallo_speciale: "NESSUNO",
    punteggio_progressivo: state.punteggio.MIA + "-" + state.punteggio.OPP
  };
  inviaEvento(eventoAnnulla);

  state.ultimoTestoFeed = "Annullato: " + (ultimo.evento.tipo_evento || "");
  salvaStato();
  renderPartita();
  mostraToast("Ultimo evento annullato");
}

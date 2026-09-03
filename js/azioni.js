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

  const label = (num ? "#" + num + " " : "") + sq + " " + tipo + " " + (esito === "SEGNATO" ? "✅" : "❌");
  registraEvento({
    squadra: sq,
    giocatore_num: num ? String(num) : "",
    tipo_evento: "TIRO",
    dettaglio: tipo + "_" + esito,
    punti_segnati: punti
  }, inverti, label);
}

function registraRecupero() {
  if (!richiedeSelezione()) return;
  const sq = state.selezione.squadra, num = state.selezione.num;
  registraEvento({
    squadra: sq, giocatore_num: num ? String(num) : "",
    tipo_evento: "RECUPERO", dettaglio: "REC", punti_segnati: 0
  }, () => {}, (num ? "#" + num + " " : "") + sq + " ⚡ Recupero");
}

function registraPallaPersa() {
  if (!richiedeSelezione()) return;
  const sq = state.selezione.squadra, num = state.selezione.num;
  registraEvento({
    squadra: sq, giocatore_num: num ? String(num) : "",
    tipo_evento: "PALLA_PERSA", dettaglio: "PP", punti_segnati: 0
  }, () => {}, (num ? "#" + num + " " : "") + sq + " ⚠️ Palla persa");
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
  }, inverti, (num ? "#" + num + " " : "") + sq + " 🔴 Fallo fatto");
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

  state.ultimoTestoFeed = "↩️ Annullato: " + (ultimo.evento.tipo_evento || "");
  salvaStato();
  renderPartita();
  mostraToast("Ultimo evento annullato");
}

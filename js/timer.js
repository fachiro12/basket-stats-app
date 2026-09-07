/* ==========================================================================
   timer.js — Gestione periodi di gioco (senza cronometro attivo)
   ========================================================================== */

function avanzaQuarto() {
  if (state.partitaFinita) { mostraToast("Partita terminata"); return; }

  const ultimoRegolamentare = CONFIG.QUARTI_REGOLAMENTARI - 1;

  if (state.quartoIndice < ultimoRegolamentare) {
    if (!confirm("Fine " + nomeQuarto() + " → passare a Q" + (state.quartoIndice + 2) +
                 "?\n(poi confermi il quintetto)")) return;
    passaAlPeriodo(state.quartoIndice + 1);
    return;
  }

  const vaiAiSupplementari = confirm(
    "Fine del " + nomeQuarto() + ".\n\n" +
    "OK = vai ai Supplementari (OT)\n" +
    "Annulla = termina la partita (FINALE)"
  );

  if (vaiAiSupplementari) passaAlPeriodo(state.quartoIndice + 1);
  else terminaPartita();
}

function passaAlPeriodo(indice) {
  state.quartoIndice = indice;
  const durSec = indice < CONFIG.QUARTI_REGOLAMENTARI ? CONFIG.DURATA_QUARTO_SEC : CONFIG.DURATA_OT_SEC;
  state.tempoPartita = formatTempo(durSec);
  state.ultimoCheckpoint = { quarto: nomeQuarto(), mm: Math.round(durSec / 60), ss: 0 };
  // I falli di squadra NON si azzerano in OT (contano come 4° quarto, FIBA Art. 41):
  // falliSquadraPerQuarto resta lungo QUARTI_REGOLAMENTARI, l'indice è indiceFalli().

  salvaStato();
  renderPartita();
  mostraToast("Inizia " + nomeQuarto());
  // Conferma/aggiorna il quintetto per il nuovo periodo (checkpoint a tempo pieno)
  if (typeof apriCambi === "function") apriCambi();
}

function terminaPartita() {
  state.tempoPartita = "00:00";

  // evento esplicito di fine → lo vedono anche gli altri device (Segui Live)
  registraEvento({
    squadra: "MIA", giocatore_num: "",
    tipo_evento: "FINE", dettaglio: "FINALE", punti_segnati: 0
  }, () => {
    state.partitaFinita = false;
    if (typeof impostaStatoPartita === "function") impostaStatoPartita(state.id_partita, "In corso");
  }, "Partita terminata · " + state.punteggio.MIA + "-" + state.punteggio.OPP);

  state.partitaFinita = true;
  salvaStato();
  if (typeof impostaStatoPartita === "function") impostaStatoPartita(state.id_partita, "Terminata");
  renderPartita();
  mostraToast("Partita terminata: " + state.punteggio.MIA + "-" + state.punteggio.OPP);
}

function nuovaPartita() {
  if (!confirm("Sei sicuro? Tutti i dati non salvati andranno persi.")) return;
  state = statoIniziale();
  salvaStato();
  localStorage.removeItem(STORAGE_KEYS.segnapunti);
  if (typeof fermaSeguiLive === "function") fermaSeguiLive();
  navigaA("partita");
  renderPartita();
}

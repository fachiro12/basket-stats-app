/* ==========================================================================
   timer.js — Gestione periodi di gioco (senza cronometro attivo)
   ========================================================================== */

function avanzaQuarto() {
  if (state.partitaFinita) { mostraToast("Partita terminata"); return; }

  const ultimoRegolamentare = CONFIG.QUARTI_REGOLAMENTARI - 1;

  if (state.quartoIndice < ultimoRegolamentare) {
    passaAlPeriodo(state.quartoIndice + 1);
    return;
  }

  const vaiAiSupplementari = confirm(
    "Fine del " + nomeQuarto() + ".\n\n" +
    "OK = vai ai Supplementari (OT)\n" +
    "Annulla = termina la partita (FINALE)"
  );

  if (vaiAiSupplementari) {
    aggiungiPeriodoSupplementare();
    passaAlPeriodo(state.quartoIndice + 1);
    mostraToast("Inizia " + nomeQuarto());
  } else {
    terminaPartita();
  }
}

function passaAlPeriodo(indice) {
  chiudiStintPeriodo();   // il periodo che finisce chiude lo stint corrente

  state.quartoIndice = indice;
  const durSec = indice < CONFIG.QUARTI_REGOLAMENTARI ? CONFIG.DURATA_QUARTO_SEC : CONFIG.DURATA_OT_SEC;
  state.tempoPartita = formatTempo(durSec);
  state.ultimoCheckpoint = { quarto: nomeQuarto(), mm: Math.round(durSec / 60), ss: 0 };

  // nuovo stint dall'inizio del nuovo periodo, stesso quintetto in campo
  if (typeof apriStint === "function") {
    apriStint((state.inCampo || state.roster).slice(), {
      quarto: nomeQuarto(),
      tempo: state.tempoPartita,
      punteggio: { MIA: state.punteggio.MIA, OPP: state.punteggio.OPP }
    });
  }

  salvaStato();
  renderPartita();
  if (indice < CONFIG.QUARTI_REGOLAMENTARI) mostraToast("Inizia " + nomeQuarto());
}

function chiudiStintPeriodo() {
  if (!state.stintCorrente || !state.stintCorrente.inizio || typeof chiudiStint !== "function") return;
  if (!Array.isArray(state.stints)) state.stints = [];
  chiudiStint({
    quarto: state.stintCorrente.quarto,
    tempo: "00:00",
    punteggio: { MIA: state.punteggio.MIA, OPP: state.punteggio.OPP }
  });
}

function aggiungiPeriodoSupplementare() {
  state.falliSquadraPerQuarto.MIA.push(0);
  state.falliSquadraPerQuarto.OPP.push(0);
}

function terminaPartita() {
  chiudiStintPeriodo();
  state.stintCorrente = null;
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

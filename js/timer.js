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
  state.quartoIndice = indice;
  const durSec = indice < CONFIG.QUARTI_REGOLAMENTARI ? CONFIG.DURATA_QUARTO_SEC : CONFIG.DURATA_OT_SEC;
  state.tempoPartita = formatTempo(durSec);
  state.ultimoCheckpoint = { quarto: nomeQuarto(), mm: Math.round(durSec / 60), ss: 0 };
  salvaStato();
  renderPartita();
  if (indice < CONFIG.QUARTI_REGOLAMENTARI) mostraToast("Inizia " + nomeQuarto());
}

function aggiungiPeriodoSupplementare() {
  state.falliSquadraPerQuarto.MIA.push(0);
  state.falliSquadraPerQuarto.OPP.push(0);
}

function terminaPartita() {
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

/* ==========================================================================
   timer.js — Cronometro di gioco
   ========================================================================== */

let intervalTimer = null;

function toggleTimer() {
  if (state.partitaFinita) { mostraToast("Partita terminata"); return; }
  state.timerAttivo = !state.timerAttivo;
  salvaStato();
  if (state.timerAttivo) avviaIntervallo(); else fermaIntervallo();
  renderPartita();
}

function avviaIntervallo() {
  fermaIntervallo();
  intervalTimer = setInterval(() => {
    if (state.timerSec > 0) {
      state.timerSec -= 1;
      salvaStato();
      document.getElementById("timer-display").textContent = formatTempo(state.timerSec);
    } else {
      state.timerAttivo = false;
      fermaIntervallo();
      salvaStato();
      renderPartita();
      mostraToast("Fine quarto");
    }
  }, 1000);
}

function fermaIntervallo() {
  if (intervalTimer) { clearInterval(intervalTimer); intervalTimer = null; }
}

function avanzaQuarto() {
  if (state.partitaFinita) { mostraToast("Partita terminata"); return; }

  const ultimoRegolamentare = CONFIG.QUARTI_REGOLAMENTARI - 1; // indice di Q4

  // Q1–Q3: avanzamento semplice al periodo successivo
  if (state.quartoIndice < ultimoRegolamentare) {
    passaAlPeriodo(state.quartoIndice + 1, CONFIG.DURATA_QUARTO_SEC);
    return;
  }

  // Q4 o OT in corso: l'utente sceglie se chiudere o andare ai supplementari
  const vaiAiSupplementari = confirm(
    "Fine del " + nomeQuarto() + ".\n\n" +
    "OK = vai ai Supplementari (OT)\n" +
    "Annulla = termina la partita (FINALE)"
  );

  if (vaiAiSupplementari) {
    aggiungiPeriodoSupplementare();
    passaAlPeriodo(state.quartoIndice + 1, CONFIG.DURATA_OT_SEC);
    mostraToast("Inizia " + nomeQuarto());
  } else {
    terminaPartita();
  }
}

function passaAlPeriodo(indice, durataSec) {
  state.quartoIndice = indice;
  state.timerSec = durataSec;
  state.timerAttivo = false;
  fermaIntervallo();
  salvaStato();
  renderPartita();
  if (indice < CONFIG.QUARTI_REGOLAMENTARI) mostraToast("Inizia " + nomeQuarto());
}

function aggiungiPeriodoSupplementare() {
  // Estende gli array dei falli di squadra per il nuovo periodo OT
  state.falliSquadraPerQuarto.MIA.push(0);
  state.falliSquadraPerQuarto.OPP.push(0);
}

function terminaPartita() {
  state.partitaFinita = true;
  state.timerAttivo = false;
  state.timerSec = 0;
  fermaIntervallo();
  salvaStato();
  renderPartita();
  mostraToast("Partita terminata: " + state.punteggio.MIA + "-" + state.punteggio.OPP);
}

function nuovaPartita() {
  if (!confirm("Sei sicuro? Tutti i dati non salvati andranno persi.")) return;
  state = statoIniziale();
  fermaIntervallo();
  salvaStato();
  navigaA("partita");
  renderPartita();
}

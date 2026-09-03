/* ==========================================================================
   timer.js — Cronometro di gioco
   ========================================================================== */

let intervalTimer = null;

function toggleTimer() {
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
  if (state.quartoIndice >= 3) { mostraToast("Ultimo quarto già raggiunto"); return; }
  state.quartoIndice += 1;
  state.timerSec = CONFIG.DURATA_QUARTO_SEC;
  state.timerAttivo = false;
  fermaIntervallo();
  salvaStato();
  renderPartita();
  mostraToast("Inizia " + nomeQuarto());
}

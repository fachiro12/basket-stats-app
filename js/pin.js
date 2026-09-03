/* ==========================================================================
   pin.js — PIN gate con verifica server JSONP e flag localStorage
   ========================================================================== */

function inizializzaPinGate() {
  const gate = document.getElementById("pin-gate");
  const app  = document.getElementById("app-shell");

  if (localStorage.getItem(STORAGE_KEYS.pin) === "true") {
    gate.classList.add("nascosto");
    app.classList.add("visibile");
    renderPartita();
    return;
  }

  document.getElementById("pin-submit").addEventListener("click", tentaSblocco);
  document.getElementById("pin-input").addEventListener("keydown", e => {
    if (e.key === "Enter") tentaSblocco();
  });

  function tentaSblocco() {
    const pin = document.getElementById("pin-input").value.trim();
    const erroreEl = document.getElementById("pin-errore");
    if (!pin) { erroreEl.textContent = "Inserisci il PIN"; return; }

    /* Fallback locale: se URL non configurato, sblocca comunque per test */
    if (!CONFIG.APPS_SCRIPT_URL || CONFIG.APPS_SCRIPT_URL.indexOf("INCOLLA_QUI") === 0) {
      erroreEl.textContent = "URL non configurato — modalità test locale";
      _sblocca(gate, app);
      return;
    }

    erroreEl.textContent = "Verifica in corso…";
    verificaPinServer(pin, (valido, errore) => {
      if (errore) { erroreEl.textContent = "Errore di connessione, riprova"; return; }
      if (valido) _sblocca(gate, app);
      else erroreEl.textContent = "PIN errato";
    });
  }
}

function _sblocca(gate, app) {
  localStorage.setItem(STORAGE_KEYS.pin, "true");
  gate.classList.add("nascosto");
  app.classList.add("visibile");
  renderPartita();
}

/* ==========================================================================
   pin.js — PIN gate con verifica server JSONP, fallback offline, flag localStorage
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

    /* URL non configurato: modalità test locale */
    if (!CONFIG.APPS_SCRIPT_URL || CONFIG.APPS_SCRIPT_URL.indexOf("INCOLLA_QUI") === 0) {
      erroreEl.textContent = "URL non configurato — modalità test locale";
      _sblocca(gate, app, pin);
      return;
    }

    /* Offline dichiarato dal browser: salta la rete, prova il fallback locale */
    if (navigator.onLine === false) {
      if (pinValidoOffline(pin)) {
        _sbloccaOffline(gate, app);
      } else {
        erroreEl.textContent = "Offline: usa il PIN abituale o quello di emergenza";
      }
      return;
    }

    erroreEl.textContent = "Verifica in corso…";
    verificaPinServer(pin, (valido, errore) => {
      if (valido) { _sblocca(gate, app, pin); return; }

      /* Server irraggiungibile / timeout: fallback locale sicuro */
      if (errore) {
        if (pinValidoOffline(pin)) {
          _sbloccaOffline(gate, app);
        } else {
          erroreEl.textContent = "Server non raggiungibile: PIN non riconosciuto offline";
        }
        return;
      }

      erroreEl.textContent = "PIN errato";
    });
  }
}

/* Il PIN è accettabile offline se coincide con la chiave di emergenza
   o con l'ultimo PIN validato online e memorizzato localmente. */
function pinValidoOffline(pin) {
  const emergenza = CONFIG.PIN_EMERGENZA || "";
  const ultimoValido = localStorage.getItem(STORAGE_KEYS.pinValore) || "";
  return (emergenza && pin === emergenza) || (ultimoValido && pin === ultimoValido);
}

function _sblocca(gate, app, pin) {
  localStorage.setItem(STORAGE_KEYS.pin, "true");
  if (pin) localStorage.setItem(STORAGE_KEYS.pinValore, pin);
  gate.classList.add("nascosto");
  app.classList.add("visibile");
  renderPartita();
}

function _sbloccaOffline(gate, app) {
  localStorage.setItem(STORAGE_KEYS.pin, "true");
  gate.classList.add("nascosto");
  app.classList.add("visibile");
  renderPartita();
  if (typeof mostraToast === "function") mostraToast("Accesso offline");
}

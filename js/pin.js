/* ==========================================================================
   pin.js — Login multiutente (JSONP verso Apps Script), fallback offline
   ========================================================================== */

function utenteCorrente() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.utente)) || null; }
  catch (e) { return null; }
}

function inizializzaPinGate() {
  const gate = document.getElementById("pin-gate");
  const app  = document.getElementById("app-shell");

  if (localStorage.getItem(STORAGE_KEYS.pin) === "true" && utenteCorrente()) {
    _entra(gate, app);
    return;
  }

  document.getElementById("pin-submit").addEventListener("click", tentaLogin);
  document.getElementById("login-password").addEventListener("keydown", e => {
    if (e.key === "Enter") tentaLogin();
  });

  function tentaLogin() {
    const username = document.getElementById("login-username").value.trim();
    const password = document.getElementById("login-password").value;
    const err = document.getElementById("pin-errore");
    if (!username || !password) { err.textContent = "Inserisci username e password"; return; }

    if (navigator.onLine === false) { loginOffline(username, err); return; }

    err.textContent = "Verifica in corso…";
    verificaLoginServer(username, password, (utente, ok, erroreRete, messaggio) => {
      if (ok && utente) {
        localStorage.setItem(STORAGE_KEYS.utente, JSON.stringify({
          id: utente.id, username: utente.username, ruolo: utente.ruolo
        }));
        _entra(gate, app);
        return;
      }
      if (erroreRete) { loginOffline(username, err); return; }
      err.textContent = messaggio || "Credenziali non valide";
    });
  }

  /* Server irraggiungibile: rientro consentito solo se il profilo è già
     stato autenticato su questo dispositivo. */
  function loginOffline(username, err) {
    const salvato = utenteCorrente();
    if (salvato && salvato.username === username) {
      _entra(gate, app);
      if (typeof mostraToast === "function") mostraToast("Accesso offline");
      return;
    }
    err.textContent = "Offline: nessun profilo salvato per questo utente";
  }
}

function _entra(gate, app) {
  localStorage.setItem(STORAGE_KEYS.pin, "true");
  gate.classList.add("nascosto");
  app.classList.add("visibile");
  aggiornaProfiloAttivo();
  renderPartita();
}

function aggiornaProfiloAttivo() {
  const u = utenteCorrente();
  const el = document.getElementById("profilo-attivo");
  if (el) el.textContent = u ? (u.username + (u.ruolo ? " · " + u.ruolo : "")) : "—";
}

function logout() {
  if (!confirm("Uscire dal profilo attuale?")) return;
  localStorage.removeItem(STORAGE_KEYS.pin);
  localStorage.removeItem(STORAGE_KEYS.utente);
  location.reload();
}

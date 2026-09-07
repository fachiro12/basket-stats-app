/* ==========================================================================
   api.js — Invio eventi a Google Apps Script, coda offline, retry
   ========================================================================== */

/* Token di scrittura ottenuto al login (in bsp_current_user). Il backend lo
   richiede su ogni POST se la Script Property WRITE_TOKEN è impostata. */
function tokenScrittura() {
  try { return (JSON.parse(localStorage.getItem(STORAGE_KEYS.utente)) || {}).token || ""; }
  catch (e) { return ""; }
}

function inviaEvento(evento) {
  codaInvio.push(evento);
  salvaCoda();
  processaCoda();
}

function inviaAzione(payload) {
  if (!CONFIG.APPS_SCRIPT_URL || CONFIG.APPS_SCRIPT_URL.indexOf("INCOLLA_QUI") === 0) return;
  fetch(CONFIG.APPS_SCRIPT_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(Object.assign({ token: tokenScrittura() }, payload))
  }).catch(() => {});
}

function processaCoda() {
  if (codaInvio.length === 0) { aggiornaBadgeOffline(); return; }
  if (!CONFIG.APPS_SCRIPT_URL || CONFIG.APPS_SCRIPT_URL.indexOf("INCOLLA_QUI") === 0) {
    aggiornaBadgeOffline(); return;
  }
  const token = tokenScrittura();
  const daInviare = codaInvio.slice();
  daInviare.forEach(evento => {
    fetch(CONFIG.APPS_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(Object.assign({ token: token }, evento))
    }).then(() => {
      codaInvio = codaInvio.filter(e => e.id_evento !== evento.id_evento);
      salvaCoda();
      aggiornaBadgeOffline();
    }).catch(() => {
      aggiornaBadgeOffline();
    });
  });
}

/* Login via POST: la password non transita più nella query string GET
   (niente log di esecuzione Apps Script / cronologia / proxy con la password).
   La risposta di ContentService porta Access-Control-Allow-Origin: * e la
   richiesta text/plain è "simple" → nessun preflight, JSON leggibile. */
function verificaLoginServer(username, password, callback) {
  const base = (typeof CONFIG !== "undefined" && CONFIG.APPS_SCRIPT_URL) || "";
  if (!base || base.indexOf("INCOLLA_QUI") === 0) { callback(null, false, true); return; }

  fetch(base, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ azione: "VERIFICA_LOGIN", username: username, password: password })
  })
    .then(r => r.json())
    .then(risposta => {
      if (risposta && risposta.ok) callback(risposta.utente || null, true, false);
      else callback(null, false, false, (risposta && risposta.error) || "Credenziali non valide");
    })
    .catch(() => callback(null, false, true));
}

window.addEventListener("online", processaCoda);
setInterval(processaCoda, CONFIG.RETRY_CODA_MS);

/* ==========================================================================
   api.js — Invio eventi a Google Apps Script, coda offline, retry
   ========================================================================== */

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
    body: JSON.stringify(payload)
  }).catch(() => {});
}

function processaCoda() {
  if (codaInvio.length === 0) { aggiornaBadgeOffline(); return; }
  if (!CONFIG.APPS_SCRIPT_URL || CONFIG.APPS_SCRIPT_URL.indexOf("INCOLLA_QUI") === 0) {
    aggiornaBadgeOffline(); return;
  }
  const daInviare = codaInvio.slice();
  daInviare.forEach(evento => {
    fetch(CONFIG.APPS_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(evento)
    }).then(() => {
      codaInvio = codaInvio.filter(e => e.id_evento !== evento.id_evento);
      salvaCoda();
      aggiornaBadgeOffline();
    }).catch(() => {
      aggiornaBadgeOffline();
    });
  });
}

function verificaLoginServer(username, password, callback) {
  const base = (typeof CONFIG !== "undefined" && CONFIG.APPS_SCRIPT_URL) || "";
  if (!base || base.indexOf("INCOLLA_QUI") === 0) { callback(null, false, true); return; }

  const nomeCb = "bspLoginCb_" + Date.now();
  const script = document.createElement("script");
  let concluso = false;

  const pulisci = () => {
    delete window[nomeCb];
    if (script.parentNode) script.parentNode.removeChild(script);
  };

  window[nomeCb] = function (risposta) {
    concluso = true;
    if (risposta && risposta.ok) callback(risposta.utente || null, true, false);
    else callback(null, false, false, (risposta && risposta.error) || "Credenziali non valide");
    pulisci();
  };

  script.src = base + (base.indexOf("?") > -1 ? "&" : "?") +
    "action=verificaLogin&username=" + encodeURIComponent(username) +
    "&password=" + encodeURIComponent(password) + "&callback=" + nomeCb;
  script.onerror = () => { if (!concluso) callback(null, false, true); pulisci(); };
  document.body.appendChild(script);
}

window.addEventListener("online", processaCoda);
setInterval(processaCoda, CONFIG.RETRY_CODA_MS);

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

function verificaPinServer(pin, callback) {
  const nomeCb = "bspPinCallback_" + Date.now();
  window[nomeCb] = function (risposta) {
    callback(risposta && risposta.valido === true);
    delete window[nomeCb];
    script.remove();
  };
  const script = document.createElement("script");
  const base = CONFIG.APPS_SCRIPT_URL;
  script.src = base + (base.indexOf("?") > -1 ? "&" : "?") +
    "action=auth&pin=" + encodeURIComponent(pin) + "&callback=" + nomeCb;
  script.onerror = () => { callback(false, true); delete window[nomeCb]; };
  document.body.appendChild(script);
}

window.addEventListener("online", processaCoda);
setInterval(processaCoda, CONFIG.RETRY_CODA_MS);

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

/* ==========================================================================
   Riconciliazione coda — recupero eventi persi silenziosamente
   Con no-cors la fetch().then() risolve anche su HTTP 500 di Apps Script:
   l'evento esce dalla coda ma potrebbe non essere mai arrivato sul foglio.
   Periodicamente confrontiamo gli id_evento che risultano inviati
   (state.eventLog, registro completo solo sul device segnapunti) con quelli
   effettivamente presenti sul foglio; i mancanti (più vecchi di GRAZIA_MS,
   per dare tempo all'append) rientrano in coda.
   ========================================================================== */
const RICONCILIA_MS = 45000;
const RICONCILIA_GRAZIA_MS = 30000;
let riconciliazioneInCorso = false;

function fetchEventiFoglio_(idPartita, cb) {
  const base = (typeof CONFIG !== "undefined" && CONFIG.APPS_SCRIPT_URL) || "";
  if (!base || base.indexOf("INCOLLA_QUI") === 0) { cb(null); return; }
  const nomeCb = "bspRicCb_" + Date.now();
  const s = document.createElement("script");
  let done = false;
  const pulisci = () => { delete window[nomeCb]; if (s.parentNode) s.parentNode.removeChild(s); };
  window[nomeCb] = function (r) {
    done = true;
    cb(r && r.ok && Array.isArray(r.eventi) ? r.eventi : null);
    pulisci();
  };
  s.src = base + (base.indexOf("?") > -1 ? "&" : "?") +
    "action=getEventi&id_partita=" + encodeURIComponent(idPartita) + "&callback=" + nomeCb;
  s.onerror = () => { if (!done) cb(null); pulisci(); };
  document.body.appendChild(s);
}

function riconciliaCoda() {
  if (riconciliazioneInCorso || navigator.onLine === false) return;
  const id = state && state.id_partita;
  if (!id) return;
  if (localStorage.getItem(STORAGE_KEYS.segnapunti) !== String(id)) return;   // solo il segnapunti

  const ora = Date.now();
  const attesi = (state.eventLog || [])
    .map(x => x.evento || x)
    .filter(e => e && e.id_evento && (ora - Date.parse(e.timestamp || 0) > RICONCILIA_GRAZIA_MS));
  if (!attesi.length) return;

  riconciliazioneInCorso = true;
  fetchEventiFoglio_(id, eventi => {
    riconciliazioneInCorso = false;
    if (!eventi) return;   // fetch fallito: si ritenta al giro successivo

    const presenti = {};
    eventi.forEach(e => { if (e && e.id_evento) presenti[String(e.id_evento)] = 1; });
    const inCoda = {};
    codaInvio.forEach(e => { if (e && e.id_evento) inCoda[String(e.id_evento)] = 1; });

    const mancanti = attesi.filter(e => !presenti[String(e.id_evento)] && !inCoda[String(e.id_evento)]);
    if (!mancanti.length) return;

    mancanti.forEach(e => codaInvio.push(e));
    salvaCoda();
    aggiornaBadgeOffline();
    if (typeof mostraToast === "function")
      mostraToast(mancanti.length + (mancanti.length === 1 ? " evento non arrivato: re-invio" : " eventi non arrivati: re-invio"));
    processaCoda();
  });
}

/* Svuota il foglio Eventi (manutenzione fine-test). POST con risposta JSON
   leggibile: doppia protezione lato server (token scrittura + conferma:"SVUOTA"). */
function svuotaEventiServer(callback) {
  const base = (typeof CONFIG !== "undefined" && CONFIG.APPS_SCRIPT_URL) || "";
  if (!base || base.indexOf("INCOLLA_QUI") === 0) { callback(false); return; }
  fetch(base, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      azione: "SVUOTA_EVENTI", conferma: "SVUOTA", reset_stati: true, token: tokenScrittura()
    })
  })
    .then(r => r.json())
    .then(r => callback(!!(r && r.ok && r.azione === "eventi_svuotati")))
    .catch(() => callback(false));
}

/* Come sopra ma per una SOLA gara: cancella gli eventi con quell'id_partita
   e rimette la partita a "Da giocare". */
function svuotaEventiGaraServer(idPartita, callback) {
  const base = (typeof CONFIG !== "undefined" && CONFIG.APPS_SCRIPT_URL) || "";
  if (!base || base.indexOf("INCOLLA_QUI") === 0) { callback(false); return; }
  fetch(base, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      azione: "SVUOTA_EVENTI_GARA", id_partita: String(idPartita),
      conferma: "SVUOTA", reset_stato: true, token: tokenScrittura()
    })
  })
    .then(r => r.json())
    .then(r => callback(!!(r && r.ok && r.azione === "gara_svuotata"), r))
    .catch(() => callback(false));
}

window.addEventListener("online", processaCoda);
window.addEventListener("online", riconciliaCoda);
setInterval(processaCoda, CONFIG.RETRY_CODA_MS);
setInterval(riconciliaCoda, RICONCILIA_MS);

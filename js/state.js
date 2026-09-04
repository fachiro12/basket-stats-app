/* ==========================================================================
   state.js — Configurazione globale e stato condiviso dell'app
   ========================================================================== */

const CONFIG = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbyMkSG5NW3mEFa_NPE6U1T9zz9q046-5-bRY7M9DYDnzu0nPdQQHcKgRFlMjeiZlXNV4Q/exec",
  ID_PARTITA_DEFAULT: "MATCH_001",
  TEMPO_PARTITA_DEFAULT: "10:00",
  NOME_SQUADRA_MIA: "MIA",
  NOME_SQUADRA_OPP: "OPP",
  ROSTER_INIZIALE: [8, 12, 5, 23, 33],
  DURATA_QUARTO_SEC: 10 * 60,
  DURATA_OT_SEC: 5 * 60,
  QUARTI_REGOLAMENTARI: 4,
  FALLI_SQUADRA_PER_BONUS: 5,
  FALLI_PERSONALI_LIMITE: 5,
  RETRY_CODA_MS: 15000,
  PIN_EMERGENZA: "072327"   // accesso di emergenza se offline / server irraggiungibile
};

const STORAGE_KEYS = {
  stato: "bsp_stato_partita",
  coda: "bsp_coda_invio",
  pin: "bsp_pin_ok",
  pinValore: "bsp_pin_valore"
};

function statoIniziale() {
  const falliGiocatori = {};
  CONFIG.ROSTER_INIZIALE.forEach(n => falliGiocatori[n] = 0);
  return {
    id_partita: CONFIG.ID_PARTITA_DEFAULT,
    tempoPartita: CONFIG.TEMPO_PARTITA_DEFAULT,
    quartoIndice: 0,
    partitaFinita: false,
    punteggio: { MIA: 0, OPP: 0 },
    roster: CONFIG.ROSTER_INIZIALE.slice(),
    inCampo: CONFIG.ROSTER_INIZIALE.slice(),
    falliGiocatori,
    falliSquadraPerQuarto: { MIA: [0, 0, 0, 0], OPP: [0, 0, 0, 0] },
    selezione: null,
    eventLog: [],
    stints: [],
    stintCorrente: {
      quarto: "Q1",
      inizio: { quarto: "Q1", tempo: "00:00", punteggio: { MIA: 0, OPP: 0 } },
      quintetto: CONFIG.ROSTER_INIZIALE.slice()
    },
    ultimoTestoFeed: "Pronto per iniziare."
  };
}

let state = caricaStato() || statoIniziale();
let codaInvio = caricaCoda();

function salvaStato() {
  localStorage.setItem(STORAGE_KEYS.stato, JSON.stringify(state));
}
function caricaStato() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.stato);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function salvaCoda() {
  localStorage.setItem(STORAGE_KEYS.coda, JSON.stringify(codaInvio));
}
function caricaCoda() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.coda);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}

function nomeQuarto() {
  if (state.partitaFinita) return "FINALE";
  const reg = CONFIG.QUARTI_REGOLAMENTARI;
  if (state.quartoIndice < reg) return "Q" + (state.quartoIndice + 1);
  return "OT" + (state.quartoIndice - reg + 1);
}

function formatTempo(sec) {
  sec = Math.max(0, sec);
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return m + ":" + s;
}

function uuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0, v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

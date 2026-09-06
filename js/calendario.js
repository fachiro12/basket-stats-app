/* ==========================================================================
   calendario.js — Calendario partite, avvio match, partite extra
   ========================================================================== */

const CALENDARIO_DR1 = [
  { id_partita: "992",  data_ora: "2026-09-25 21:00", avversario: "Sportlandia Tradate",   luogo: "Casa" },
  { id_partita: "999",  data_ora: "2026-10-02 21:30", avversario: "BK Paderno Dugnano",    luogo: "Trasferta" },
  { id_partita: "1010", data_ora: "2026-10-09 21:00", avversario: "Asa Cinisello",         luogo: "Casa" },
  { id_partita: "1016", data_ora: "2026-10-18 18:00", avversario: "Basket Club Arlunese",  luogo: "Trasferta" },
  { id_partita: "1023", data_ora: "2026-10-23 21:00", avversario: "Pall. Castronno",       luogo: "Casa" },
  { id_partita: "1031", data_ora: "2026-11-01 18:00", avversario: "Ardor Bollate",         luogo: "Trasferta" },
  { id_partita: "1035", data_ora: "2026-11-06 21:00", avversario: "Rondinella 1955 Sesto", luogo: "Casa" },
  { id_partita: "1046", data_ora: "2026-11-15 18:30", avversario: "Draghi Gorlazy",        luogo: "Trasferta" },
  { id_partita: "1047", data_ora: "2026-11-20 21:00", avversario: "Ardens Sedriano",       luogo: "Casa" },
  { id_partita: "1059", data_ora: "2026-11-27 21:00", avversario: "Cistellum Cislago",     luogo: "Trasferta" },
  { id_partita: "1064", data_ora: "2026-12-04 21:00", avversario: "Pol. Daverio",          luogo: "Casa" },
  { id_partita: "1072", data_ora: "2026-12-11 21:15", avversario: "Basket Venegono",       luogo: "Trasferta" },
  { id_partita: "1079", data_ora: "2026-12-18 21:00", avversario: "Robur Basket Saronno",  luogo: "Casa" },
  { id_partita: "1090", data_ora: "2027-01-08 21:15", avversario: "Sportlandia Tradate",   luogo: "Trasferta" },
  { id_partita: "1092", data_ora: "2027-01-15 21:00", avversario: "BK Paderno Dugnano",    luogo: "Casa" },
  { id_partita: "1102", data_ora: "2027-01-24 17:30", avversario: "Asa Cinisello",         luogo: "Trasferta" },
  { id_partita: "1108", data_ora: "2027-01-29 21:00", avversario: "Basket Club Arlunese",  luogo: "Casa" },
  { id_partita: "1110", data_ora: "2027-02-05 21:15", avversario: "Pall. Castronno",       luogo: "Trasferta" },
  { id_partita: "1121", data_ora: "2027-02-12 21:00", avversario: "Ardor Bollate",         luogo: "Casa" },
  { id_partita: "1128", data_ora: "2027-02-19 21:30", avversario: "Rondinella 1955 Sesto", luogo: "Trasferta" },
  { id_partita: "1131", data_ora: "2027-02-26 21:00", avversario: "Draghi Gorlazy",        luogo: "Casa" },
  { id_partita: "1141", data_ora: "2027-03-07 17:30", avversario: "Ardens Sedriano",       luogo: "Trasferta" },
  { id_partita: "1147", data_ora: "2027-03-12 21:00", avversario: "Cistellum Cislago",     luogo: "Casa" },
  { id_partita: "1153", data_ora: "2027-03-19 21:00", avversario: "Pol. Daverio",          luogo: "Trasferta" },
  { id_partita: "1164", data_ora: "2027-04-02 21:00", avversario: "Basket Venegono",       luogo: "Casa" },
  { id_partita: "1170", data_ora: "2027-04-11 18:30", avversario: "Robur Basket Saronno",  luogo: "Trasferta" }
].map(p => Object.assign({
  tipo: "Campionato",
  stagione: "2026/27",
  categoria: "DR1",
  stato: "Da giocare",
  note: ""
}, p));

const KEY_PARTITE_CACHE = "bsp_partite_cache";      // ultimo snapshot dal foglio Partite
const KEY_PARTITE_PENDING = "bsp_partite_pending";  // modifiche locali non ancora confermate dal cloud

function _leggiJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; }
  catch (e) { return fallback; }
}
function cachePartite() { return _leggiJSON(KEY_PARTITE_CACHE, []); }
function pendingPartite() { return _leggiJSON(KEY_PARTITE_PENDING, []); }
function salvaCachePartite(l) { localStorage.setItem(KEY_PARTITE_CACHE, JSON.stringify(l)); }
function salvaPendingPartite(l) { localStorage.setItem(KEY_PARTITE_PENDING, JSON.stringify(l)); }

function normalizzaPartita(p) {
  return {
    id_partita: String(p.id_partita),
    data_ora: p.data_ora || "",
    avversario: p.avversario || "",
    luogo: p.luogo === "Trasferta" ? "Trasferta" : "Casa",
    tipo: p.tipo || "Campionato",
    stagione: p.stagione || "2026/27",
    categoria: p.categoria || "DR1",
    stato: p.stato || "Da giocare",
    note: p.note || ""
  };
}

/* Vista unificata: seed offline < snapshot cloud < modifiche locali (vincono) */
function elencoPartite() {
  const byId = {};
  CALENDARIO_DR1.forEach(p => { byId[String(p.id_partita)] = normalizzaPartita(p); });
  cachePartite().forEach(p => { if (p && p.id_partita) byId[String(p.id_partita)] = normalizzaPartita(p); });
  pendingPartite().forEach(p => { if (p && p.id_partita) byId[String(p.id_partita)] = normalizzaPartita(p); });
  return Object.keys(byId).map(k => byId[k])
    .sort((a, b) => (a.data_ora || "9999").localeCompare(b.data_ora || "9999"));
}

/* ---------- Sync col foglio Partite ---------- */
function scaricaPartite(cb) {
  const base = (typeof CONFIG !== "undefined" && CONFIG.APPS_SCRIPT_URL) || "";
  if (!base || base.indexOf("INCOLLA_QUI") === 0) { if (cb) cb(false); return; }

  const nomeCb = "bspPartiteCb_" + Date.now();
  const script = document.createElement("script");
  let concluso = false;
  const pulisci = () => {
    delete window[nomeCb];
    if (script.parentNode) script.parentNode.removeChild(script);
  };

  window[nomeCb] = function (risposta) {
    concluso = true;
    if (risposta && risposta.ok && Array.isArray(risposta.partite)) {
      applicaPartiteCloud(risposta.partite);
      if (cb) cb(true);
    } else if (cb) { cb(false); }
    pulisci();
  };
  script.src = base + (base.indexOf("?") > -1 ? "&" : "?") + "action=getPartite&callback=" + nomeCb;
  script.onerror = () => { if (!concluso && cb) cb(false); pulisci(); };
  document.body.appendChild(script);
}

function applicaPartiteCloud(cloud) {
  const norm = cloud.map(normalizzaPartita).filter(p => p.id_partita);
  salvaCachePartite(norm);

  const restanti = pendingPartite().filter(p => {
    const c = norm.find(x => x.id_partita === String(p.id_partita));
    if (!c) return true;                              // non ancora sul foglio
    return String(c.stato) !== String(p.stato || ""); // stato non ancora propagato
  });
  salvaPendingPartite(restanti);

  renderCalendario();
}

/* Upsert di una partita: applica subito in locale + invia al foglio */
function salvaPartitaCloud(partita) {
  const p = normalizzaPartita(partita);
  const pend = pendingPartite().filter(x => String(x.id_partita) !== p.id_partita);
  pend.push(p);
  salvaPendingPartite(pend);

  if (typeof inviaAzione === "function") {
    inviaAzione(Object.assign({ azione: "SALVA_PARTITA" }, p));
  }
  renderCalendario();
}

function impostaStatoPartita(id, stato) {
  const attuale = elencoPartite().find(x => String(x.id_partita) === String(id)) || { id_partita: id };
  salvaPartitaCloud(Object.assign({}, attuale, { stato: stato }));
}

function formattaDataOra(s) {
  if (!s) return "Data da definire";
  s = String(s);
  const parti = s.split(/[ T]/);
  const d = (parti[0] || "").split("-");
  const ora = (parti[1] || "").slice(0, 5);
  return (d.length === 3) ? d[2] + "/" + d[1] + "/" + d[0] + (ora ? " · " + ora : "") : s;
}
function slugStato(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, "-");
}

function renderCalendario() {
  const cont = document.getElementById("calendario-lista");
  if (!cont) return;
  cont.innerHTML = "";

  elencoPartite().forEach(p => {
    const casa = p.luogo === "Casa";
    const stato = p.stato || "Da giocare";

    const card = document.createElement("div");
    card.className = "cal-card";
    card.innerHTML =
      '<div class="cal-top">' +
        '<span class="cal-luogo ' + (casa ? "casa" : "trasferta") + '">' +
          '<svg class="ico" aria-hidden="true"><use href="#i-' + (casa ? "home" : "bus") + '"></use></svg>' +
          (casa ? "Casa" : "Trasferta") +
        '</span>' +
        '<span class="cal-badge stato-' + slugStato(stato) + '">' + stato + '</span>' +
      '</div>' +
      '<div class="cal-avv">' + p.avversario + '</div>' +
      '<div class="cal-meta">Gara ' + p.id_partita + ' · ' + formattaDataOra(p.data_ora) +
        ' · ' + p.categoria + ' · ' + p.tipo + '</div>' +
      (p.note ? '<div class="cal-note">' + p.note + '</div>' : '') +
      '<div class="cal-azioni"></div>';

    const azioni = card.querySelector(".cal-azioni");
    const btn = document.createElement("button");
    if (stato === "Terminata") {
      btn.className = "cal-btn secondario";
      btn.textContent = "Statistiche";
      btn.addEventListener("click", () => apriStatistichePartita(p.id_partita));
    } else {
      btn.className = "cal-btn primario";
      btn.textContent = stato === "In corso" ? "Riprendi Partita" : "Inizia Partita";
      btn.addEventListener("click", () => iniziaPartita(p));
    }
    azioni.appendChild(btn);
    cont.appendChild(card);
  });
}

function iniziaPartita(p) {
  // Schermata intermedia: conferma/modifica convocati e maglie prima del via
  if (typeof apriPrePartita === "function") {
    apriPrePartita(p);
    return;
  }
  state = statoIniziale();
  state.id_partita = String(p.id_partita);
  salvaStato();
  impostaStatoPartita(p.id_partita, "In corso");
  navigaA("partita");
  renderPartita();
  mostraToast("Partita " + p.id_partita + " avviata");
}

function apriStatistichePartita(id) {
  id = String(id);
  if (id === String(state.id_partita)) {
    statsEventiRemoti = null;            // partita live in corso/memoria
    navigaA("stats");
    return;
  }
  const p = elencoPartite().find(x => String(x.id_partita) === id);
  const nome = p
    ? CONFIG.NOME_SQUADRA_MIA + (p.luogo === "Casa" ? " vs " : " @ ") + p.avversario
    : "Gara " + id;
  statsEventiRemoti = { id_partita: id, eventi: [], nome: nome };
  navigaA("stats");
  scaricaEventiPartita(id, ok => {
    if (ok && document.getElementById("view-stats").classList.contains("attiva")) renderStats();
  });
}

/* ---------- Modale "Aggiungi partita" ---------- */
function apriAggiungiPartita() {
  document.getElementById("ap-tipo").value = "Amichevole";
  document.getElementById("ap-data").value = "";
  document.getElementById("ap-avversario").value = "";
  document.getElementById("ap-luogo").value = "Casa";
  document.getElementById("ap-note").value = "";
  document.getElementById("overlay-aggiungi-partita").classList.add("visibile");
}
function chiudiAggiungiPartita() {
  document.getElementById("overlay-aggiungi-partita").classList.remove("visibile");
}
function confermaAggiungiPartita() {
  const avv = document.getElementById("ap-avversario").value.trim();
  if (!avv) { mostraToast("Inserisci l'avversario"); return; }

  const dl = document.getElementById("ap-data").value;
  const tipo = document.getElementById("ap-tipo").value;
  salvaPartitaCloud({
    id_partita: "X" + Date.now(),
    data_ora: dl ? dl.replace("T", " ") : "",
    avversario: avv,
    luogo: document.getElementById("ap-luogo").value,
    tipo: tipo,
    stagione: "2026/27",
    categoria: tipo,
    stato: "Da giocare",
    note: document.getElementById("ap-note").value.trim()
  });

  chiudiAggiungiPartita();
  mostraToast("Partita aggiunta");
}

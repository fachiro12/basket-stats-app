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

const KEY_PARTITE_EXTRA = "bsp_partite_extra";
const KEY_PARTITE_STATO = "bsp_partite_stato";

function caricaPartiteExtra() {
  try { return JSON.parse(localStorage.getItem(KEY_PARTITE_EXTRA)) || []; }
  catch (e) { return []; }
}
function salvaPartiteExtra(lista) {
  localStorage.setItem(KEY_PARTITE_EXTRA, JSON.stringify(lista));
}
function caricaStatiPartite() {
  try { return JSON.parse(localStorage.getItem(KEY_PARTITE_STATO)) || {}; }
  catch (e) { return {}; }
}
function salvaStatoPartitaLocale(id, stato) {
  const m = caricaStatiPartite();
  m[String(id)] = stato;
  localStorage.setItem(KEY_PARTITE_STATO, JSON.stringify(m));
}

function elencoPartite() {
  const stati = caricaStatiPartite();
  return CALENDARIO_DR1.concat(caricaPartiteExtra())
    .map(p => Object.assign({}, p, { stato: stati[String(p.id_partita)] || p.stato }))
    .sort((a, b) => (a.data_ora || "9999").localeCompare(b.data_ora || "9999"));
}

function formattaDataOra(s) {
  if (!s) return "Data da definire";
  const parti = s.split(/[ T]/);
  const [Y, M, D] = (parti[0] || "").split("-");
  return (D && M && Y) ? D + "/" + M + "/" + Y + (parti[1] ? " · " + parti[1] : "") : s;
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
  const msg = "Iniziare la rilevazione?\n\n" + p.avversario + " (" + p.luogo + ")\n" +
    "Gara " + p.id_partita + " · " + formattaDataOra(p.data_ora) +
    "\n\nI dati della partita corrente verranno azzerati.";
  if (!confirm(msg)) return;

  state = statoIniziale();
  state.id_partita = String(p.id_partita);
  salvaStato();

  salvaStatoPartitaLocale(p.id_partita, "In corso");
  aggiornaStatoPartitaBackend(p.id_partita, "In corso");

  renderCalendario();
  navigaA("partita");
  renderPartita();
  mostraToast("Partita " + p.id_partita + " avviata");
}

function apriStatistichePartita(id) {
  state.id_partita = String(id);
  salvaStato();
  navigaA("stats");
}

function aggiornaStatoPartitaBackend(id, stato) {
  if (typeof inviaAzione === "function") {
    inviaAzione({ azione: "AGGIORNA_STATO_PARTITA", id_partita: String(id), stato: stato });
  }
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
  const extra = caricaPartiteExtra();
  extra.push({
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
  salvaPartiteExtra(extra);

  chiudiAggiungiPartita();
  renderCalendario();
  mostraToast("Partita aggiunta");
}

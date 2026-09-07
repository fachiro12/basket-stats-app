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

/* Etichetta avversario breve dedotta dal nome di calendario (ultima parola
   significativa, es. "Sportlandia Tradate" → "Tradate"), per comporre
   "PVL vs Tradate" nelle schermate Stats/Adv delle partite non live. */
function avversarioBreveAuto(avversario) {
  const parti = String(avversario || "").trim().split(/\s+/).filter(Boolean);
  const scelto = parti.length > 1 ? parti[parti.length - 1] : (parti[0] || "AVV");
  return scelto.slice(0, CONFIG.MAX_LABEL_AVVERSARIO);
}
function nomePartitaDaCalendario(p) {
  return nomePartitaComposto(p && p.luogo === "Casa" ? "Casa" : "Trasferta",
    avversarioBreveAuto(p && p.avversario));
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
      const mioLive = localStorage.getItem(STORAGE_KEYS.segnapunti) === String(p.id_partita)
        && String(state.id_partita) === String(p.id_partita);
      btn.textContent = stato === "In corso"
        ? (mioLive ? "Riprendi Partita" : "Segui Live")
        : "Inizia Partita";
      btn.addEventListener("click", () => iniziaPartita(p));
    }
    azioni.appendChild(btn);

    const mioLive = localStorage.getItem(STORAGE_KEYS.segnapunti) === String(p.id_partita)
      && String(state.id_partita) === String(p.id_partita);
    if (stato === "In corso" && !mioLive) {
      const btn2 = document.createElement("button");
      btn2.className = "cal-btn secondario";
      btn2.textContent = "Riprendi come segnapunti";
      btn2.addEventListener("click", () => riprendiComeSegnapunti(p));
      azioni.appendChild(btn2);
    }

    cont.appendChild(card);
  });
}

function iniziaPartita(p) {
  const id = String(p.id_partita);
  const sonoSegnapunti = localStorage.getItem(STORAGE_KEYS.segnapunti) === id
    && String(state.id_partita) === id;

  if (p.stato === "In corso") {
    if (sonoSegnapunti) {              // ripresa in loco, stato invariato
      navigaA("partita");
      renderPartita();
      return;
    }
    if (typeof avviaModalitaSegui === "function") { avviaModalitaSegui(p); return; }
  }

  // "Da giocare" → schermata convocati → quintetto
  if (typeof apriPrePartita === "function") { apriPrePartita(p); return; }
  state = statoIniziale();
  state.id_partita = id;
  salvaStato();
  impostaStatoPartita(id, "In corso");
  navigaA("partita");
  renderPartita();
}

function apriStatistichePartita(id) {
  id = String(id);
  if (id === String(state.id_partita)) {
    statsEventiRemoti = null;            // partita live in corso/memoria
    navigaA("stats");
    return;
  }
  const p = elencoPartite().find(x => String(x.id_partita) === id);
  const nome = p ? nomePartitaDaCalendario(p) : "Gara " + id;
  statsEventiRemoti = { id_partita: id, eventi: [], nome: nome, oppLabel: p ? avversarioBreveAuto(p.avversario) : "AVV", finita: p && p.stato === "Terminata" };
  navigaA("stats");
  scaricaEventiPartita(id, ok => {
    if (ok && document.getElementById("view-stats").classList.contains("attiva")) renderStats();
  });
}

/* ==========================================================================
   RIPRENDI COME SEGNAPUNTI — ricostruzione dello stato dagli eventi del foglio
   Serve quando la partita "viva" è solo nel localStorage di un altro device
   (dati cancellati / browser cambiato / subentro di un secondo segnapunti).
   Gli eventi sul foglio sono la sorgente di verità; ciò che non è stato
   ancora sincronizzato dall'altro dispositivo va perso.
   ========================================================================== */
function indiceDaQuarto(q) {
  const reg = CONFIG.QUARTI_REGOLAMENTARI;
  const s = String(q || "Q1").toUpperCase();
  const ot = s.match(/^OT(\d+)/);
  if (ot) return reg + (parseInt(ot[1], 10) || 1) - 1;
  const qn = s.match(/^Q(\d+)/);
  if (qn) return (parseInt(qn[1], 10) || 1) - 1;
  return 0;
}

function deltaRicostruita_(ev) {
  const t = ev.tipo_evento, pt = Number(ev.punti_segnati) || 0;
  if (!pt) return () => {};
  if (t === "TIRO") { const sq = ev.squadra === "OPP" ? "OPP" : "MIA"; return () => { state.punteggio[sq] -= pt; }; }
  if (t === "FALLO_SUBITO") return () => { state.punteggio.MIA -= pt; };
  if (t === "FALLO_FATTO")  return () => { state.punteggio.OPP -= pt; };
  return () => {};
}

function ricostruisciStatoDaEventi(partita, eventiRaw) {
  const eventi = (typeof eventiPuliti === "function" ? eventiPuliti(eventiRaw) : (eventiRaw || []));
  const s = statoIniziale();
  const nums = v => String(v || "").split(",").map(x => x.trim()).filter(Boolean);

  s.id_partita = String(partita.id_partita);
  s.avversario = partita.avversario || "";
  s.avversarioBreve = avversarioBreveAuto(partita.avversario);
  s.luogoPartita = partita.luogo === "Trasferta" ? "Trasferta" : "Casa";
  s.nomePartita = (typeof nomePartitaComposto === "function")
    ? nomePartitaComposto(s.luogoPartita, s.avversarioBreve)
    : CONFIG.NOME_SQUADRA_MIA + " vs " + s.avversarioBreve;

  // Convocati: numeri visti nei quintetti + azioni MIA, arricchiti dall'anagrafica
  const visti = {};
  eventi.forEach(e => {
    nums(e.quintetto_mia).forEach(n => { visti[n] = 1; });
    const g = String(e.giocatore_num || "").trim();
    if (e.squadra === "MIA" && /^\d+$/.test(g)) visti[g] = 1;
  });
  const ana = (typeof caricaGiocatori === "function") ? caricaGiocatori() : [];
  s.convocati = Object.keys(visti).map(Number).sort((a, b) => a - b).map(n => {
    const g = ana.find(x => String(x.numero_maglia) === String(n)) || {};
    return {
      id: g.id_giocatore || "", nome: g.nome || "", cognome: g.cognome || "",
      nickname: g.nickname || "", ruolo: g.ruolo || "", numero: n
    };
  });

  // Punteggio / periodo / tempo / quintetto in campo dall'ultimo evento utile
  const ultimo = eventi[eventi.length - 1] || null;
  const ultimoPeriodo = [...eventi].reverse().find(e => /^(Q|OT)\d/i.test(String(e.quarto || "")));
  if (ultimo) {
    const mp = String(ultimo.punteggio_progressivo || "").match(/^(\d+)-(\d+)$/);
    if (mp) s.punteggio = { MIA: +mp[1], OPP: +mp[2] };
    s.tempoPartita = ultimo.tempo_partita || s.tempoPartita;
  }
  s.quartoIndice = indiceDaQuarto(ultimoPeriodo ? ultimoPeriodo.quarto : (ultimo && ultimo.quarto));
  const luFinale = nums((ultimoPeriodo || ultimo || {}).quintetto_mia).map(Number);
  if (luFinale.length) { s.roster = luFinale; s.inCampo = luFinale.slice(); }

  // Falli: personali (FALLO_FATTO per giocatore) + di squadra per quarto
  s.falliGiocatori = {};
  s.convocati.forEach(c => { s.falliGiocatori[c.numero] = 0; });
  s.falliSquadraPerQuarto = { MIA: [0, 0, 0, 0], OPP: [0, 0, 0, 0] };
  const bump = (arr, qi) => { while (arr.length <= qi) arr.push(0); arr[qi]++; };
  eventi.forEach(e => {
    const qi = indiceDaQuarto(e.quarto);
    if (e.tipo_evento === "FALLO_FATTO") {
      bump(s.falliSquadraPerQuarto.MIA, qi);
      if (String(e.fallo_speciale) === "COMPENSATO") bump(s.falliSquadraPerQuarto.OPP, qi);
      const g = String(e.giocatore_num || "").trim();
      if (/^\d+$/.test(g)) s.falliGiocatori[g] = (s.falliGiocatori[g] || 0) + 1;
    } else if (e.tipo_evento === "FALLO_SUBITO") {
      bump(s.falliSquadraPerQuarto.OPP, qi);
    }
  });

  s.eventLog = eventi.map(ev => ({ evento: ev, delta: deltaRicostruita_(ev) }));
  s.partitaFinita = eventi.some(e => String(e.tipo_evento) === "FINE");

  const tp = String(s.tempoPartita || "00:00").split(":");
  s.ultimoCheckpoint = {
    quarto: ultimoPeriodo ? ultimoPeriodo.quarto : "Q1",
    mm: parseInt(tp[0], 10) || 0, ss: parseInt(tp[1], 10) || 0
  };
  s.stints = [];
  s.stintCorrente = null;
  s.ultimoTestoFeed = "Ripreso come segnapunti · " + s.punteggio.MIA + "-" + s.punteggio.OPP;
  return s;
}

function riprendiComeSegnapunti(p) {
  if (!p) { mostraToast("Partita non trovata"); return; }
  if (!confirm("Prendere il controllo come segnapunti di \"" + (p.avversario || p.id_partita) + "\"?\n\n" +
    "Lo stato viene ricostruito dagli eventi già sul foglio. Eventi non ancora sincronizzati da un altro dispositivo andranno persi.")) return;

  mostraToast("Recupero eventi dal foglio…");
  scaricaEventiPartita(String(p.id_partita), ok => {
    const ev = (statsEventiRemoti && Array.isArray(statsEventiRemoti.eventi)) ? statsEventiRemoti.eventi : [];
    if (!ok || !ev.length) { mostraToast("Nessun evento sul foglio: impossibile ricostruire"); return; }

    state = ricostruisciStatoDaEventi(p, ev);
    salvaStato();
    localStorage.setItem(STORAGE_KEYS.segnapunti, String(p.id_partita));
    if (typeof fermaSeguiLive === "function") fermaSeguiLive();
    statsEventiRemoti = null;
    impostaStatoPartita(p.id_partita, "In corso");
    renderCalendario();
    navigaA("partita");
    renderPartita();
    mostraToast("Sei il segnapunti · " + state.punteggio.MIA + "-" + state.punteggio.OPP);
  });
}

function riprendiComeSegnapuntiId(id) {
  riprendiComeSegnapunti(elencoPartite().find(x => String(x.id_partita) === String(id)));
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

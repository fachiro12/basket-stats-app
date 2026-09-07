/* ==========================================================================
   giocatori.js — Anagrafica giocatori (localStorage + sync foglio Giocatori),
   flusso pre-partita (convocati) e numero di maglia variabile per gara.
   ========================================================================== */

const KEY_GIOCATORI = "bsp_giocatori";
const RUOLI = ["Primary Handler", "3&D", "Centro"];
const TEAM_DEFAULT = "DR1";
const MAX_REFERTO = 12;
const MIN_CONVOCATI = 5;

function nuovoIdGiocatore() {
  return "G" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function caricaGiocatori() {
  try { return JSON.parse(localStorage.getItem(KEY_GIOCATORI)) || []; }
  catch (e) { return []; }
}
function salvaGiocatori(lista) {
  localStorage.setItem(KEY_GIOCATORI, JSON.stringify(lista));
}
function giocatoriDelTeam(team) {
  return caricaGiocatori().filter(g => (g.team || TEAM_DEFAULT) === (team || TEAM_DEFAULT));
}

function upsertGiocatore(rec) {
  const lista = caricaGiocatori();
  if (rec.id) {
    const i = lista.findIndex(g => g.id === rec.id);
    if (i > -1) lista[i] = Object.assign({}, lista[i], rec);
    else lista.push(rec);
  } else {
    rec.id = nuovoIdGiocatore();
    lista.push(rec);
  }
  salvaGiocatori(lista);
  sincronizzaGiocatore(rec, false);
  return rec;
}
function rimuoviGiocatore(id) {
  salvaGiocatori(caricaGiocatori().filter(g => g.id !== id));
  sincronizzaGiocatore({ id: id }, true);
}

function sincronizzaGiocatore(rec, elimina) {
  if (typeof inviaAzione !== "function") return;
  inviaAzione({
    azione: "SALVA_GIOCATORE",
    elimina: !!elimina,
    id_giocatore: rec.id,
    nome: rec.nome || "",
    cognome: rec.cognome || "",
    nickname: rec.nickname || "",
    ruolo: rec.ruolo || "",
    numero_maglia: rec.numero_maglia != null ? rec.numero_maglia : "",
    team: rec.team || TEAM_DEFAULT
  });
}

/* ---------- Sync cloud -> client (JSONP, no CORS) ---------- */
function scaricaGiocatori(cb) {
  const base = (typeof CONFIG !== "undefined" && CONFIG.APPS_SCRIPT_URL) || "";
  if (!base || base.indexOf("INCOLLA_QUI") === 0) { if (cb) cb(false); return; }

  const nomeCb = "bspGiocatoriCb_" + Date.now();
  const script = document.createElement("script");
  let concluso = false;

  const pulisci = () => {
    delete window[nomeCb];
    if (script.parentNode) script.parentNode.removeChild(script);
  };

  window[nomeCb] = function (risposta) {
    concluso = true;
    if (risposta && risposta.ok && Array.isArray(risposta.giocatori)) {
      mergeGiocatoriCloud(risposta.giocatori);
      if (cb) cb(true);
    } else if (cb) { cb(false); }
    pulisci();
  };

  script.src = base + (base.indexOf("?") > -1 ? "&" : "?") +
    "action=getGiocatori&callback=" + nomeCb;
  script.onerror = () => { if (!concluso && cb) cb(false); pulisci(); };
  document.body.appendChild(script);
}

function mergeGiocatoriCloud(cloud) {
  const perId = {};
  caricaGiocatori().forEach(g => { if (g.id) perId[g.id] = g; });

  cloud.forEach(c => {
    const id = String(c.id_giocatore || "").trim();
    if (!id) return;
    const n = parseInt(c.numero_maglia, 10);
    const loc = perId[id] || {};
    perId[id] = {
      id: id,
      nome: (c.nome || "").toString().trim(),
      cognome: (c.cognome || "").toString().trim(),
      // se il cloud non porta ancora il nickname, non sovrascrivere quello locale
      nickname: (c.nickname || "").toString().trim().toUpperCase() || loc.nickname || "",
      ruolo: RUOLI.indexOf(c.ruolo) > -1 ? c.ruolo : (c.ruolo || ""),
      numero_maglia: isNaN(n) ? "" : n,
      team: (c.team || TEAM_DEFAULT).toString().trim()
    };
  });

  salvaGiocatori(Object.keys(perId).map(k => perId[k]));
  const ov = document.getElementById("overlay-roster");
  if (ov && ov.classList.contains("visibile")) renderRoster();
}

/* ---------- UI: anagrafica (sezione "Altro") ---------- */
function apriRoster() {
  renderRoster();
  document.getElementById("overlay-roster").classList.add("visibile");
  scaricaGiocatori(ok => { if (ok) renderRoster(); });
}
function chiudiRoster() {
  document.getElementById("overlay-roster").classList.remove("visibile");
}
function renderRoster() {
  const cont = document.getElementById("roster-lista");
  const lista = caricaGiocatori().slice().sort((a, b) =>
    (Number(a.numero_maglia) || 999) - (Number(b.numero_maglia) || 999));
  cont.innerHTML = "";
  if (!lista.length) {
    cont.innerHTML = '<p class="roster-vuoto">Nessun giocatore. Aggiungine uno.</p>';
    return;
  }
  lista.forEach(g => {
    const row = document.createElement("button");
    row.className = "roster-item";
    row.innerHTML =
      '<span class="roster-num">#' + esc(g.numero_maglia || "–") + '</span>' +
      '<span class="roster-info"><strong>' + esc(g.cognome || "") + ' ' + esc(g.nome || "") +
      (g.nickname ? ' <em>(' + esc(g.nickname) + ')</em>' : "") +
      '</strong><small>' + esc(g.ruolo || "—") + ' · ' + esc(g.team || TEAM_DEFAULT) + '</small></span>' +
      '<svg class="ico" aria-hidden="true"><use href="#i-edit"></use></svg>';
    row.addEventListener("click", () => apriFormGiocatore(g.id));
    cont.appendChild(row);
  });
}

function apriFormGiocatore(id) {
  const g = id ? caricaGiocatori().find(x => x.id === id) : null;
  document.getElementById("gioc-titolo").textContent = g ? "Modifica giocatore" : "Nuovo giocatore";
  document.getElementById("gioc-id").value = g ? g.id : "";
  document.getElementById("gioc-nome").value = g ? (g.nome || "") : "";
  document.getElementById("gioc-cognome").value = g ? (g.cognome || "") : "";
  document.getElementById("gioc-nickname").value = g ? (g.nickname || "") : "";
  document.getElementById("gioc-ruolo").value = g && RUOLI.indexOf(g.ruolo) > -1 ? g.ruolo : RUOLI[0];
  document.getElementById("gioc-numero").value = g && g.numero_maglia != null ? g.numero_maglia : "";
  document.getElementById("gioc-team").value = g ? (g.team || TEAM_DEFAULT) : TEAM_DEFAULT;
  document.getElementById("gioc-elimina").hidden = !g;
  document.getElementById("overlay-giocatore").classList.add("visibile");
}
function chiudiFormGiocatore() {
  document.getElementById("overlay-giocatore").classList.remove("visibile");
}
function confermaFormGiocatore() {
  const cognome = document.getElementById("gioc-cognome").value.trim();
  if (!cognome) { mostraToast("Inserisci almeno il cognome"); return; }
  const numRaw = document.getElementById("gioc-numero").value.trim();
  upsertGiocatore({
    id: document.getElementById("gioc-id").value || "",
    nome: document.getElementById("gioc-nome").value.trim(),
    cognome: cognome,
    nickname: document.getElementById("gioc-nickname").value.trim().toUpperCase(),
    ruolo: document.getElementById("gioc-ruolo").value,
    numero_maglia: numRaw === "" ? "" : parseInt(numRaw, 10),
    team: document.getElementById("gioc-team").value.trim() || TEAM_DEFAULT
  });
  chiudiFormGiocatore();
  renderRoster();
  mostraToast("Giocatore salvato");
}
function eliminaGiocatoreCorrente() {
  const id = document.getElementById("gioc-id").value;
  if (!id) return;
  if (!confirm("Eliminare questo giocatore dall'anagrafica?")) return;
  rimuoviGiocatore(id);
  chiudiFormGiocatore();
  renderRoster();
  mostraToast("Giocatore eliminato");
}

/* ==========================================================================
   FLUSSO PRE-PARTITA — Step 1: convocati + maglie + nome breve avversario
                        Step 2: quintetto base → avvio ufficiale
   ========================================================================== */
let prePartitaMatch = null;
let prePartitaPool = [];
let prePartitaMax = MAX_REFERTO;
let prePartitaConvocatiTemp = [];
let quintettoSel = [];

function nomePartitaComposto(luogo, breve) {
  return CONFIG.NOME_SQUADRA_MIA + " " + (luogo === "Casa" ? "vs " : "@ ") + (breve || "AVV");
}

function apriPrePartita(partita) {
  prePartitaMatch = partita;
  const team = partita.categoria === "DR1" ? "DR1" : (partita.team || TEAM_DEFAULT);
  const amichevole = partita.tipo === "Amichevole";
  prePartitaMax = amichevole ? Infinity : MAX_REFERTO;

  const inTeam = giocatoriDelTeam(team);
  const altri = caricaGiocatori().filter(g => !inTeam.some(t => t.id && t.id === g.id));

  let base = inTeam.slice();
  if (base.length < MIN_CONVOCATI) {
    base = base.concat(CONFIG.ROSTER_INIZIALE
      .filter(n => !base.some(g => Number(g.numero_maglia) === n))
      .map(n => ({ id: "", nome: "", cognome: "#" + n, nickname: "", ruolo: "", numero_maglia: n, team: team })));
  }

  prePartitaPool = base.concat(altri).map((g, i) => ({
    id: g.id || "",
    nome: g.nome || "",
    cognome: g.cognome || "",
    nickname: (g.nickname || "").toUpperCase(),
    ruolo: g.ruolo || "",
    numero_maglia: g.numero_maglia,
    convocato: i < base.length && i < MAX_REFERTO,
    numGara: g.numero_maglia != null && g.numero_maglia !== "" ? String(g.numero_maglia) : "",
    manuale: false
  }));

  document.getElementById("pp-contesto").textContent =
    partita.avversario + " · " + partita.luogo + " · " + partita.tipo +
    (amichevole ? "  ·  nessun limite convocati" : "  ·  max " + MAX_REFERTO + " a referto");

  const breve = (typeof avversarioBreveAuto === "function")
    ? avversarioBreveAuto(partita.avversario)
    : String(partita.avversario || "").slice(0, CONFIG.MAX_LABEL_AVVERSARIO);
  document.getElementById("pp-avv-breve").value = breve;
  aggiornaAnteprimaNome();

  renderPrePartita();
  document.getElementById("overlay-prepartita").classList.add("visibile");
}

function aggiornaAnteprimaNome() {
  const breve = document.getElementById("pp-avv-breve").value.trim();
  const luogo = (prePartitaMatch && prePartitaMatch.luogo) || "Casa";
  document.getElementById("pp-nome-preview").textContent = nomePartitaComposto(luogo, breve);
}

function renderPrePartita() {
  const cont = document.getElementById("pp-lista");
  cont.innerHTML = "";
  prePartitaPool.forEach((g, idx) => {
    const nome = ((g.cognome || "") + " " + (g.nome || "")).trim() || ("#" + g.numGara);
    const row = document.createElement("div");
    row.className = "pp-riga" + (g.convocato ? " on" : "");
    row.dataset.idx = idx;
    row.innerHTML =
      '<input type="checkbox" class="pp-check" data-idx="' + idx + '"' + (g.convocato ? " checked" : "") + '>' +
      '<span class="pp-nome">' + esc(nome) + (g.nickname ? ' (' + esc(g.nickname) + ')' : "") +
        '<small>' + esc(g.ruolo || "—") + (g.manuale ? " · manuale" : "") + '</small></span>' +
      '<input type="tel" inputmode="numeric" maxlength="2" class="pp-num" data-idx="' + idx + '" value="' + esc(g.numGara) + '">' +
      (g.manuale ? '<button type="button" class="pp-del" data-idx="' + idx + '" aria-label="Rimuovi">&times;</button>' : '');
    cont.appendChild(row);
  });
  aggiornaContatorePrePartita();
}

function chiudiPrePartita() {
  document.getElementById("overlay-prepartita").classList.remove("visibile");
}

function contaConvocati() { return prePartitaPool.filter(g => g.convocato).length; }

function ppToggle(idx, checked) {
  if (checked && contaConvocati() >= prePartitaMax) {
    mostraToast("Massimo " + prePartitaMax + " convocati (Campionato)");
    return;
  }
  if (!prePartitaPool[idx]) return;
  prePartitaPool[idx].convocato = checked;
  const riga = document.querySelector('#pp-lista .pp-riga[data-idx="' + idx + '"]');
  if (riga) {
    riga.classList.toggle("on", checked);
    const chk = riga.querySelector(".pp-check");
    if (chk) chk.checked = checked;
  }
  aggiornaContatorePrePartita();
}
function ppNumero(idx, val) { if (prePartitaPool[idx]) prePartitaPool[idx].numGara = val.trim(); }
function ppRimuovi(idx) { prePartitaPool.splice(idx, 1); renderPrePartita(); }

function aggiungiConvocatoManuale() {
  const raw = prompt("Nuovo convocato — numero;Cognome;NICK  (es. 47;Rossi;ROS)");
  if (!raw) return;
  const parti = raw.split(/[;,]/);
  const numero = parseInt((parti[0] || "").trim(), 10);
  if (isNaN(numero)) { mostraToast("Numero non valido"); return; }
  prePartitaPool.push({
    id: "",
    nome: "",
    cognome: (parti[1] || "").trim() || ("#" + numero),
    nickname: (parti[2] || "").trim().toUpperCase().slice(0, 6),
    ruolo: "",
    numero_maglia: numero,
    convocato: contaConvocati() < prePartitaMax,
    numGara: String(numero),
    manuale: true
  });
  renderPrePartita();
}

function aggiornaContatorePrePartita() {
  const n = contaConvocati();
  const max = prePartitaMax;
  const ok = n >= MIN_CONVOCATI && n <= max;
  const el = document.getElementById("pp-contatore");
  el.textContent = n + " convocati" +
    (n < MIN_CONVOCATI ? " · minimo " + MIN_CONVOCATI :
     (n > max ? " · massimo " + max : " · ok"));
  el.classList.toggle("ko", !ok);
  document.getElementById("pp-conferma").disabled = !ok;
}

function convocatiSelezionati() {
  return prePartitaPool.filter(g => g.convocato).map(g => {
    const numero = parseInt((g.numGara || "").trim(), 10);
    return {
      id: g.id || "",
      nome: g.nome || "",
      cognome: g.cognome || "",
      nickname: (g.nickname || "").toUpperCase(),
      ruolo: g.ruolo || "",
      numero: isNaN(numero) ? (Number(g.numero_maglia) || 0) : numero
    };
  });
}

/* ---------- Step 1 → Step 2 ---------- */
function confermaPrePartita() {
  if (!prePartitaMatch) return;
  const convocati = convocatiSelezionati();
  if (convocati.length < MIN_CONVOCATI) { mostraToast("Minimo " + MIN_CONVOCATI + " giocatori"); return; }
  if (convocati.length > prePartitaMax) { mostraToast("Massimo " + prePartitaMax + " convocati"); return; }
  const numeri = convocati.map(c => c.numero);
  if (new Set(numeri).size !== numeri.length) { mostraToast("Numeri di maglia duplicati"); return; }
  if (!document.getElementById("pp-avv-breve").value.trim()) { mostraToast("Inserisci il nome breve avversario"); return; }

  prePartitaConvocatiTemp = convocati;
  chiudiPrePartita();
  apriQuintetto();
}

/* ---------- Step 2: quintetto base ---------- */
function etichettaGiocatore(c) {
  return "#" + c.numero + (c.nickname ? " " + c.nickname : (c.cognome ? " " + c.cognome : ""));
}

function apriQuintetto() {
  quintettoSel = prePartitaConvocatiTemp.slice(0, 5).map(c => c.numero);
  document.getElementById("q-contesto").textContent =
    document.getElementById("pp-nome-preview").textContent + "  ·  scegli i 5 in campo";
  renderQuintetto();
  document.getElementById("overlay-quintetto").classList.add("visibile");
}
function chiudiQuintetto() {
  document.getElementById("overlay-quintetto").classList.remove("visibile");
}
function tornaAConvocati() {
  chiudiQuintetto();
  document.getElementById("overlay-prepartita").classList.add("visibile");
}

function renderQuintetto() {
  const cont = document.getElementById("q-lista");
  cont.innerHTML = "";
  prePartitaConvocatiTemp.forEach(c => {
    const on = quintettoSel.indexOf(c.numero) > -1;
    const row = document.createElement("label");   // tutta la riga tocca la checkbox
    row.className = "pp-riga q-riga" + (on ? " on" : "");
    row.innerHTML =
      '<input type="checkbox" class="q-check" data-num="' + esc(c.numero) + '"' + (on ? " checked" : "") + '>' +
      '<span class="pp-nome">' + esc(etichettaGiocatore(c)) +
        '<small>' + esc(c.ruolo || "—") + '</small></span>';
    cont.appendChild(row);
  });
  aggiornaContatoreQuintetto();
}

function qToggle(num, checked) {
  const i = quintettoSel.indexOf(num);
  if (checked) {
    if (i === -1) {
      if (quintettoSel.length >= 5) { mostraToast("Solo 5 in campo"); renderQuintetto(); return; }
      quintettoSel.push(num);
    }
  } else if (i > -1) {
    quintettoSel.splice(i, 1);
  }
  renderQuintetto();
}

function aggiornaContatoreQuintetto() {
  const n = quintettoSel.length;
  const el = document.getElementById("q-contatore");
  el.textContent = n + " / 5" + (n === 5 ? " · ok" : " · scegline " + (5 - n) + (n > 5 ? "" : ""));
  el.classList.toggle("ko", n !== 5);
  document.getElementById("q-conferma").disabled = n !== 5;
}

function confermaQuintetto() {
  const p = prePartitaMatch;
  if (!p || quintettoSel.length !== 5) { mostraToast("Servono 5 giocatori"); return; }

  const convocati = prePartitaConvocatiTemp;
  const numeri = convocati.map(c => c.numero);
  const breve = document.getElementById("pp-avv-breve").value.trim().slice(0, CONFIG.MAX_LABEL_AVVERSARIO);
  const durataMin = Math.round(CONFIG.DURATA_QUARTO_SEC / 60);

  state = statoIniziale();
  state.id_partita = String(p.id_partita);
  state.avversario = p.avversario || "";
  state.avversarioBreve = breve;
  state.luogoPartita = p.luogo || "Casa";
  state.nomePartita = nomePartitaComposto(state.luogoPartita, breve);
  state.convocati = convocati;
  state.roster = quintettoSel.slice();
  state.inCampo = quintettoSel.slice();
  state.falliGiocatori = {};
  numeri.forEach(n => { state.falliGiocatori[n] = 0; });
  state.tempoPartita = formatTempo(CONFIG.DURATA_QUARTO_SEC);
  state.ultimoCheckpoint = { quarto: "Q1", mm: durataMin, ss: 0 };
  state.ultimoTestoFeed = state.nomePartita + " — palla a due";
  salvaStato();
  localStorage.setItem(STORAGE_KEYS.segnapunti, String(p.id_partita));   // questo device è il segnapunti
  if (typeof fermaSeguiLive === "function") fermaSeguiLive();

  if (typeof impostaStatoPartita === "function") impostaStatoPartita(p.id_partita, "In corso");

  chiudiQuintetto();
  if (typeof renderCalendario === "function") renderCalendario();
  navigaA("partita");
  renderPartita();
  mostraToast(state.nomePartita + " avviata");
}

/* ==========================================================================
   MODIFICA CONVOCATI DURANTE LA PARTITA
   Solo la lista `state.convocati`: aggiungi un dimenticato, correggi maglia/nick.
   Chi ha già una voce a referto (giocatore_num o quintetto_mia in un evento)
   è BLOCCATO → gli eventi non vanno mai riscritti. Nessun evento toccato.
   ========================================================================== */
function haGiocatoEventi(num) {
  const s = String(num);
  return (state.eventLog || []).some(x => {
    const e = x.evento || x;
    if (String(e.giocatore_num) === s) return true;
    return String(e.quintetto_mia || "").split(",").map(v => v.trim()).indexOf(s) > -1;
  });
}

function apriConvocatiLive() {
  if (state.partitaFinita) { mostraToast("Partita terminata"); return; }
  if (typeof chiudiCambi === "function") chiudiCambi();
  renderConvocatiLive();
  document.getElementById("overlay-convocati-live").classList.add("visibile");
}
function chiudiConvocatiLive(riapriCambi) {
  document.getElementById("overlay-convocati-live").classList.remove("visibile");
  if (riapriCambi && typeof apriCambi === "function" && !state.partitaFinita) apriCambi();
}

function renderConvocatiLive() {
  const cont = document.getElementById("cl-lista");
  cont.innerHTML = "";
  (state.convocati || []).forEach((c, idx) => {
    const locked = haGiocatoEventi(c.numero);
    const inCampo = (state.roster || []).indexOf(Number(c.numero)) > -1;
    const nome = (c.cognome || c.nome || ("#" + c.numero));
    const row = document.createElement("div");
    row.className = "pp-riga" + (locked ? " cl-lock" : "");
    row.innerHTML =
      '<input type="tel" inputmode="numeric" maxlength="2" class="cl-num" data-idx="' + idx + '" value="' +
        esc(c.numero) + '"' + (locked ? " disabled" : "") + '>' +
      '<span class="pp-nome">' + esc(nome) +
        '<small>' + esc(c.ruolo || "—") +
        (locked ? " · a referto" : (inCampo ? " · in campo" : "")) + '</small></span>' +
      '<input type="text" class="cl-nick" data-idx="' + idx + '" maxlength="6" placeholder="NICK" value="' +
        esc(c.nickname || "") + '">' +
      (locked ? '' : '<button type="button" class="pp-del cl-del" data-idx="' + idx + '" aria-label="Rimuovi">&times;</button>');
    cont.appendChild(row);
  });

  const sel = document.getElementById("cl-add-select");
  const giaNum = new Set((state.convocati || []).map(c => String(c.numero)));
  const giaId = new Set((state.convocati || []).map(c => c.id).filter(Boolean));
  sel.innerHTML = '<option value="">— aggiungi da anagrafica —</option>';
  caricaGiocatori()
    .filter(g => g.numero_maglia !== "" && g.numero_maglia != null &&
                 !giaNum.has(String(g.numero_maglia)) && !(g.id && giaId.has(g.id)))
    .sort((a, b) => (Number(a.numero_maglia) || 99) - (Number(b.numero_maglia) || 99))
    .forEach(g => {
      const o = document.createElement("option");
      o.value = g.id;
      o.textContent = "#" + g.numero_maglia + " " + (g.cognome || g.nome || "");
      sel.appendChild(o);
    });
}

function clAggiungiDaAnagrafica() {
  const g = caricaGiocatori().find(x => x.id === document.getElementById("cl-add-select").value);
  if (!g) { mostraToast("Scegli un giocatore"); return; }
  clAggiungiConvocato({
    id: g.id || "", nome: g.nome || "", cognome: g.cognome || "",
    nickname: (g.nickname || "").toUpperCase(), ruolo: g.ruolo || "",
    numero: parseInt(g.numero_maglia, 10)
  });
}
function clAggiungiManuale() {
  const raw = prompt("Nuovo convocato — numero;Cognome;NICK  (es. 47;Rossi;ROS)");
  if (!raw) return;
  const p = raw.split(/[;,]/);
  clAggiungiConvocato({
    id: "", nome: "", cognome: (p[1] || "").trim() || ("#" + (p[0] || "").trim()),
    nickname: (p[2] || "").trim().toUpperCase().slice(0, 6), ruolo: "",
    numero: parseInt((p[0] || "").trim(), 10)
  });
}
function clAggiungiConvocato(c) {
  if (isNaN(c.numero)) { mostraToast("Numero di maglia non valido"); return; }
  if ((state.convocati || []).some(x => Number(x.numero) === c.numero)) {
    mostraToast("Numero #" + c.numero + " già presente"); return;
  }
  if (c.id && (state.convocati || []).some(x => x.id === c.id)) {
    mostraToast("Giocatore già convocato (con altro numero)"); return;
  }
  state.convocati = (state.convocati || []).concat([c]);
  if (!(c.numero in state.falliGiocatori)) state.falliGiocatori[c.numero] = 0;
  salvaStato();
  renderConvocatiLive();
  mostraToast("Aggiunto #" + c.numero);
}

function clRimuovi(idx) {
  const c = state.convocati[idx];
  if (!c) return;
  if (haGiocatoEventi(c.numero)) { mostraToast("Ha voci a referto — non rimovibile"); return; }
  if ((state.roster || []).indexOf(Number(c.numero)) > -1) {
    mostraToast("È in quintetto — sostituiscilo dai CAMBI"); return;
  }
  state.convocati.splice(idx, 1);
  delete state.falliGiocatori[c.numero];
  salvaStato();
  renderConvocatiLive();
}

function salvaConvocatiLive() {
  const conv = (state.convocati || []).map(c => Object.assign({}, c));

  document.querySelectorAll("#cl-lista .cl-nick").forEach(inp => {
    const i = +inp.dataset.idx;
    if (conv[i]) conv[i].nickname = inp.value.trim().toUpperCase().slice(0, 6);
  });

  const rimappa = {};
  document.querySelectorAll("#cl-lista .cl-num:not([disabled])").forEach(inp => {
    const i = +inp.dataset.idx;
    const nuovo = parseInt(inp.value, 10);
    if (conv[i] && !isNaN(nuovo) && nuovo !== Number(conv[i].numero)) {
      rimappa[conv[i].numero] = nuovo;
      conv[i].numero = nuovo;
    }
  });

  const nums = conv.map(c => Number(c.numero));
  if (new Set(nums).size !== nums.length) { mostraToast("Numeri di maglia duplicati"); return; }
  if (conv.some(c => isNaN(Number(c.numero)))) { mostraToast("Numero di maglia mancante"); return; }

  state.convocati = conv;
  // propaga i (rari) cambi numero a roster/inCampo/falliGiocatori
  Object.keys(rimappa).forEach(vecchio => {
    const nuovo = rimappa[vecchio];
    ["roster", "inCampo"].forEach(k => {
      const arr = state[k]; if (!arr) return;
      const j = arr.indexOf(Number(vecchio));
      if (j > -1) arr[j] = nuovo;
    });
    if (vecchio in state.falliGiocatori) {
      state.falliGiocatori[nuovo] = state.falliGiocatori[vecchio];
      delete state.falliGiocatori[vecchio];
    }
  });

  salvaStato();
  chiudiConvocatiLive(true);
  if (typeof renderPartita === "function") renderPartita();
  mostraToast("Convocati aggiornati");
}

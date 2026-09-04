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
    perId[id] = {
      id: id,
      nome: (c.nome || "").toString().trim(),
      cognome: (c.cognome || "").toString().trim(),
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
      '<span class="roster-num">#' + (g.numero_maglia || "–") + '</span>' +
      '<span class="roster-info"><strong>' + (g.cognome || "") + ' ' + (g.nome || "") +
      '</strong><small>' + (g.ruolo || "—") + ' · ' + (g.team || TEAM_DEFAULT) + '</small></span>' +
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

/* ---------- Flusso pre-partita: convocati + maglie ---------- */
let prePartitaMatch = null;

function apriPrePartita(partita) {
  prePartitaMatch = partita;
  const team = partita.categoria === "DR1" ? "DR1" : (partita.team || TEAM_DEFAULT);
  let pool = giocatoriDelTeam(team);

  if (pool.length < MIN_CONVOCATI) {
    pool = pool.concat(CONFIG.ROSTER_INIZIALE
      .filter(n => !pool.some(g => Number(g.numero_maglia) === n))
      .map(n => ({ id: "", nome: "", cognome: "#" + n, ruolo: "", numero_maglia: n, team: team })));
  }

  const amichevole = partita.tipo === "Amichevole";
  const maxRef = amichevole ? Infinity : MAX_REFERTO;

  document.getElementById("pp-contesto").textContent =
    partita.avversario + " · " + partita.luogo + " · " + partita.tipo +
    (amichevole ? "  (nessun limite convocati)" : "  (max " + MAX_REFERTO + " a referto)");

  const cont = document.getElementById("pp-lista");
  cont.innerHTML = "";
  pool.forEach((g, idx) => {
    const preselezionato = idx < MAX_REFERTO;
    const nome = ((g.cognome || "") + " " + (g.nome || "")).trim() || ("#" + g.numero_maglia);
    const row = document.createElement("label");
    row.className = "pp-riga";
    row.innerHTML =
      '<input type="checkbox" class="pp-check" data-idx="' + idx + '"' + (preselezionato ? " checked" : "") + '>' +
      '<span class="pp-nome">' + nome + '<small>' + (g.ruolo || "—") + '</small></span>' +
      '<input type="tel" inputmode="numeric" maxlength="2" class="pp-num" data-idx="' + idx +
      '" value="' + (g.numero_maglia != null ? g.numero_maglia : "") + '">';
    cont.appendChild(row);
  });
  cont._pool = pool;
  cont._max = maxRef;

  aggiornaContatorePrePartita();
  document.getElementById("overlay-prepartita").classList.add("visibile");
}
function chiudiPrePartita() {
  document.getElementById("overlay-prepartita").classList.remove("visibile");
}

function convocatiSelezionati() {
  const cont = document.getElementById("pp-lista");
  const pool = cont._pool || [];
  const out = [];
  cont.querySelectorAll(".pp-check").forEach(chk => {
    if (!chk.checked) return;
    const idx = parseInt(chk.dataset.idx, 10);
    const g = pool[idx];
    const numInput = cont.querySelector('.pp-num[data-idx="' + idx + '"]');
    const numero = parseInt((numInput && numInput.value || "").trim(), 10);
    out.push({
      id: g.id || "",
      nome: g.nome || "",
      cognome: g.cognome || "",
      ruolo: g.ruolo || "",
      numero: isNaN(numero) ? (Number(g.numero_maglia) || 0) : numero
    });
  });
  return out;
}

function aggiornaContatorePrePartita() {
  const cont = document.getElementById("pp-lista");
  const n = cont.querySelectorAll(".pp-check:checked").length;
  const max = cont._max || MAX_REFERTO;
  const ok = n >= MIN_CONVOCATI && n <= max;
  const el = document.getElementById("pp-contatore");
  el.textContent = n + " convocati" +
    (n < MIN_CONVOCATI ? " · minimo " + MIN_CONVOCATI :
     (n > max ? " · massimo " + max : " · ok"));
  el.classList.toggle("ko", !ok);
  document.getElementById("pp-conferma").disabled = !ok;
}

function confermaPrePartita() {
  const p = prePartitaMatch;
  if (!p) return;
  const convocati = convocatiSelezionati();
  if (convocati.length < MIN_CONVOCATI) { mostraToast("Minimo " + MIN_CONVOCATI + " giocatori"); return; }

  const numeri = convocati.map(c => c.numero);
  if (new Set(numeri).size !== numeri.length) { mostraToast("Numeri di maglia duplicati"); return; }

  state = statoIniziale();
  state.id_partita = String(p.id_partita);
  state.convocati = convocati;
  state.roster = numeri.slice(0, 5);
  state.inCampo = state.roster.slice();
  state.falliGiocatori = {};
  numeri.forEach(n => { state.falliGiocatori[n] = 0; });
  salvaStato();

  if (typeof salvaStatoPartitaLocale === "function") {
    salvaStatoPartitaLocale(p.id_partita, "In corso");
    aggiornaStatoPartitaBackend(p.id_partita, "In corso");
  }

  chiudiPrePartita();
  if (typeof renderCalendario === "function") renderCalendario();
  navigaA("partita");
  renderPartita();
  mostraToast("Partita " + p.id_partita + " avviata · " + convocati.length + " convocati");
}

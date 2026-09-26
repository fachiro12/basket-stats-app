/* ==========================================================================
   avversari.js — Scouting squadre e giocatori avversari (Altro → Avversari,
   sezione indipendente, sperimentale). Anagrafica squadre avversarie del
   girone + anagrafica dei loro giocatori, con note STRUTTURATE (non un blob
   unico): caratteristiche attacco/difesa, come li affrontiamo in attacco/
   difesa, note dall'andata — stessi 5 campi sia per la squadra sia per ogni
   singolo giocatore avversario, perché si compilano e si leggono in momenti
   diversi (durante la settimana di preparazione, durante/dopo la gara...).

   Persistenza: stesso pattern di giocatori.js/player-dev.js — localStorage +
   sync cloud fire-and-forget (SALVA_AVVERSARIO/SALVA_AVVERSARIO_GIOCATORE,
   backend V4.15) + lettura JSONP (getAvversari/getAvversariGiocatori). Il
   merge cloud→locale preserva un campo ASSENTE dalla risposta (backend non
   ancora aggiornato) invece di azzerarlo — stesso fix già fatto per Obiettivi
   in player-dev.js (mergeObiettiviCloud).

   Collegamento con CALENDARIO_DR1: SOLA LETTURA, nessuna chiave esterna
   rigida — il nome squadra è testo libero (con suggerimenti dai nomi già
   noti in elencoPartite(), per evitare typo/doppioni), e nella scheda si
   mostrano le gare in calendario con lo stesso nome esatto.

   Vedi CLAUDE.md (no-regressioni-riuso-funzioni): nuova feature = nuovo file,
   non tocca giocatori.js/player-dev.js/calendario.js.
   ========================================================================== */

const KEY_AVVERSARI = "bsp_avversari";
const KEY_AVVERSARI_GIOCATORI = "bsp_avversari_giocatori";
const CAMPI_NOTE_AVV = ["caratteristiche_attacco", "caratteristiche_difesa", "approccio_attacco", "approccio_difesa", "note_andata"];

let avvSquadraSel = null;

/* ==========================================================================
   Persistenza SQUADRE avversarie
   ========================================================================== */
function caricaAvversari() {
  try { return JSON.parse(localStorage.getItem(KEY_AVVERSARI)) || []; }
  catch (e) { return []; }
}
function salvaAvversariLocali(lista) { localStorage.setItem(KEY_AVVERSARI, JSON.stringify(lista)); }

function upsertAvversario(rec) {
  if (typeof bloccaScrittura === "function" && bloccaScrittura()) return rec;
  rec.aggiornato_il = new Date().toISOString().slice(0, 10);
  const lista = caricaAvversari();
  if (rec.id) {
    const i = lista.findIndex(a => a.id === rec.id);
    if (i > -1) lista[i] = Object.assign({}, lista[i], rec);
    else lista.push(rec);
  } else {
    rec.id = uuid();
    lista.push(rec);
  }
  salvaAvversariLocali(lista);
  sincronizzaAvversario(rec, false);
  return rec;
}
function rimuoviAvversario(id) {
  if (typeof bloccaScrittura === "function" && bloccaScrittura()) return;
  const lista = caricaAvversari();
  const i = lista.findIndex(a => a.id === id);
  if (i === -1) return;
  lista[i] = Object.assign({}, lista[i], { eliminato: true });
  salvaAvversariLocali(lista);
  sincronizzaAvversario(lista[i], true);
}
function sincronizzaAvversario(rec, elimina) {
  if (typeof inviaAzione !== "function") return;
  const payload = {
    azione: "SALVA_AVVERSARIO",
    elimina: !!elimina,
    id: rec.id,
    nome_squadra: rec.nome_squadra || "",
    aggiornato_il: rec.aggiornato_il || ""
  };
  CAMPI_NOTE_AVV.forEach(k => { payload[k] = rec[k] || ""; });
  inviaAzione(payload);
}
function scaricaAvversari(cb) {
  const base = (typeof CONFIG !== "undefined" && CONFIG.APPS_SCRIPT_URL) || "";
  if (!base || base.indexOf("INCOLLA_QUI") === 0) { if (cb) cb(false); return; }
  const nomeCb = "bspAvversariCb_" + Date.now();
  const script = document.createElement("script");
  let concluso = false;
  const pulisci = () => { delete window[nomeCb]; if (script.parentNode) script.parentNode.removeChild(script); };
  window[nomeCb] = function (risposta) {
    concluso = true;
    if (risposta && risposta.ok && Array.isArray(risposta.avversari)) { mergeAvversariCloud(risposta.avversari); if (cb) cb(true); }
    else if (cb) { cb(false); }
    pulisci();
  };
  script.src = base + (base.indexOf("?") > -1 ? "&" : "?") + "action=getAvversari&callback=" + nomeCb;
  script.onerror = () => { if (!concluso && cb) cb(false); pulisci(); };
  document.body.appendChild(script);
}
/* Un campo ASSENTE dalla risposta cloud (backend non ancora aggiornato con
   questa colonna) preserva il valore locale; un campo presente ma vuoto lo
   svuota davvero — stesso fix già fatto per Obiettivi (player-dev.js). */
function mergeAvversariCloud(cloud) {
  const perId = {};
  caricaAvversari().forEach(a => { if (a.id) perId[a.id] = a; });
  cloud.forEach(c => {
    const id = String(c.id || "").trim();
    if (!id) return;
    const esistente = perId[id] || {};
    const rec = {
      id: id,
      nome_squadra: c.nome_squadra !== undefined ? String(c.nome_squadra || "") : (esistente.nome_squadra || ""),
      aggiornato_il: c.aggiornato_il !== undefined ? (c.aggiornato_il || "") : (esistente.aggiornato_il || ""),
      eliminato: !!c.eliminato
    };
    CAMPI_NOTE_AVV.forEach(k => { rec[k] = c[k] !== undefined ? String(c[k] || "") : (esistente[k] || ""); });
    perId[id] = rec;
  });
  salvaAvversariLocali(Object.keys(perId).map(k => perId[k]));
}

/* ==========================================================================
   Persistenza GIOCATORI avversari — stesso schema, + id_squadra/nome/
   cognome/numero_maglia/ruolo (ruolo testo libero: per uno scouting ha più
   senso "playmaker/ala forte/lungo..." libero che i 3 ruoli interni di
   giocatori.js, pensati per la NOSTRA squadra).
   ========================================================================== */
function caricaAvversariGiocatori() {
  try { return JSON.parse(localStorage.getItem(KEY_AVVERSARI_GIOCATORI)) || []; }
  catch (e) { return []; }
}
function salvaAvversariGiocatoriLocali(lista) { localStorage.setItem(KEY_AVVERSARI_GIOCATORI, JSON.stringify(lista)); }

function upsertAvversarioGiocatore(rec) {
  if (typeof bloccaScrittura === "function" && bloccaScrittura()) return rec;
  rec.aggiornato_il = new Date().toISOString().slice(0, 10);
  const lista = caricaAvversariGiocatori();
  if (rec.id) {
    const i = lista.findIndex(g => g.id === rec.id);
    if (i > -1) lista[i] = Object.assign({}, lista[i], rec);
    else lista.push(rec);
  } else {
    rec.id = uuid();
    lista.push(rec);
  }
  salvaAvversariGiocatoriLocali(lista);
  sincronizzaAvversarioGiocatore(rec, false);
  return rec;
}
function rimuoviAvversarioGiocatore(id) {
  if (typeof bloccaScrittura === "function" && bloccaScrittura()) return;
  const lista = caricaAvversariGiocatori();
  const i = lista.findIndex(g => g.id === id);
  if (i === -1) return;
  lista[i] = Object.assign({}, lista[i], { eliminato: true });
  salvaAvversariGiocatoriLocali(lista);
  sincronizzaAvversarioGiocatore(lista[i], true);
}
function sincronizzaAvversarioGiocatore(rec, elimina) {
  if (typeof inviaAzione !== "function") return;
  const payload = {
    azione: "SALVA_AVVERSARIO_GIOCATORE",
    elimina: !!elimina,
    id: rec.id,
    id_squadra: rec.id_squadra || "",
    nome: rec.nome || "",
    cognome: rec.cognome || "",
    numero_maglia: rec.numero_maglia != null ? rec.numero_maglia : "",
    ruolo: rec.ruolo || "",
    aggiornato_il: rec.aggiornato_il || ""
  };
  CAMPI_NOTE_AVV.forEach(k => { payload[k] = rec[k] || ""; });
  inviaAzione(payload);
}
function scaricaAvversariGiocatori(cb) {
  const base = (typeof CONFIG !== "undefined" && CONFIG.APPS_SCRIPT_URL) || "";
  if (!base || base.indexOf("INCOLLA_QUI") === 0) { if (cb) cb(false); return; }
  const nomeCb = "bspAvvGiocCb_" + Date.now();
  const script = document.createElement("script");
  let concluso = false;
  const pulisci = () => { delete window[nomeCb]; if (script.parentNode) script.parentNode.removeChild(script); };
  window[nomeCb] = function (risposta) {
    concluso = true;
    if (risposta && risposta.ok && Array.isArray(risposta.avversari_giocatori)) { mergeAvversariGiocatoriCloud(risposta.avversari_giocatori); if (cb) cb(true); }
    else if (cb) { cb(false); }
    pulisci();
  };
  script.src = base + (base.indexOf("?") > -1 ? "&" : "?") + "action=getAvversariGiocatori&callback=" + nomeCb;
  script.onerror = () => { if (!concluso && cb) cb(false); pulisci(); };
  document.body.appendChild(script);
}
function mergeAvversariGiocatoriCloud(cloud) {
  const perId = {};
  caricaAvversariGiocatori().forEach(g => { if (g.id) perId[g.id] = g; });
  cloud.forEach(c => {
    const id = String(c.id || "").trim();
    if (!id) return;
    const esistente = perId[id] || {};
    const rec = {
      id: id,
      id_squadra: c.id_squadra !== undefined ? String(c.id_squadra || "") : (esistente.id_squadra || ""),
      nome: c.nome !== undefined ? String(c.nome || "") : (esistente.nome || ""),
      cognome: c.cognome !== undefined ? String(c.cognome || "") : (esistente.cognome || ""),
      numero_maglia: c.numero_maglia !== undefined ? c.numero_maglia : (esistente.numero_maglia != null ? esistente.numero_maglia : ""),
      ruolo: c.ruolo !== undefined ? String(c.ruolo || "") : (esistente.ruolo || ""),
      aggiornato_il: c.aggiornato_il !== undefined ? (c.aggiornato_il || "") : (esistente.aggiornato_il || ""),
      eliminato: !!c.eliminato
    };
    CAMPI_NOTE_AVV.forEach(k => { rec[k] = c[k] !== undefined ? String(c[k] || "") : (esistente[k] || ""); });
    perId[id] = rec;
  });
  salvaAvversariGiocatoriLocali(Object.keys(perId).map(k => perId[k]));
}

/* ==========================================================================
   Apertura sezione
   ========================================================================== */
function apriAvversari() {
  navigaA("avversari");
  renderAvversariLista();
  scaricaAvversari(() => renderAvversariLista());
  scaricaAvversariGiocatori(() => { if (avvSquadraSel) renderSchedaSquadraAvversaria(); });
}
function apriSquadraAvversaria(id) {
  avvSquadraSel = id;
  navigaA("squadra-avversaria");
  renderSchedaSquadraAvversaria();
}

function squadreAvversarieOrdinate() {
  return caricaAvversari().filter(a => !a.eliminato)
    .sort((a, b) => (a.nome_squadra || "").localeCompare(b.nome_squadra || "", "it"));
}
function giocatoriDiSquadraAvversaria(idSquadra) {
  return caricaAvversariGiocatori().filter(g => g.id_squadra === idSquadra && !g.eliminato)
    .sort((a, b) => (a.cognome || "").localeCompare(b.cognome || "", "it"));
}

/* ==========================================================================
   RENDER — elenco squadre
   ========================================================================== */
function renderAvversariLista() {
  const body = document.getElementById("avv-body");
  if (!body) return;
  const lista = squadreAvversarieOrdinate();
  const righe = lista.map(a => {
    const nGioc = giocatoriDiSquadraAvversaria(a.id).length;
    return '<div class="riga-altro avv-riga-squadra" data-apri-squadra="' + esc(a.id) + '">' +
      '<span class="col-testo"><span class="titolo-altro">' + esc(a.nome_squadra || "Squadra senza nome") + '</span>' +
      '<span class="sotto-altro">' + nGioc + (nGioc === 1 ? ' giocatore schedato' : ' giocatori schedati') +
      (a.aggiornato_il ? ' · agg. ' + esc(a.aggiornato_il) : '') + '</span></span>' +
      '<svg class="ico freccia-riga" aria-hidden="true"><use href="#i-chevron"></use></svg></div>';
  }).join('');
  body.innerHTML =
    (lista.length ? '<div class="lista-altro">' + righe + '</div>' : '<div class="st-hint">Nessuna squadra ancora — aggiungine una.</div>') +
    '<button class="btn-annulla-modale avv-aggiungi" id="avv-aggiungi-squadra">+ Nuova squadra avversaria</button>';
}

/* ==========================================================================
   RENDER — scheda squadra (note + gare in programma + giocatori)
   ========================================================================== */
function rigaNotaHtml_(etichetta, valore) {
  return '<div class="avv-nota-blocco">' +
    (etichetta ? '<div class="avv-nota-titolo">' + esc(etichetta) + '</div>' : '') +
    '<div class="avv-nota-testo">' + (valore ? esc(valore).replace(/\n/g, '<br>') : '<span class="st-hint">—</span>') + '</div>' +
    '</div>';
}
function renderSchedaSquadraAvversaria() {
  const body = document.getElementById("avvsq-body");
  const titolo = document.getElementById("avvsq-titolo");
  if (!body) return;
  const sq = caricaAvversari().find(a => a.id === avvSquadraSel);
  if (!sq) { body.innerHTML = '<div class="st-hint">Squadra non trovata.</div>'; return; }
  if (titolo) titolo.textContent = sq.nome_squadra || "Squadra avversaria";

  const nomeSq = (sq.nome_squadra || "").trim().toLowerCase();
  const gare = (typeof elencoPartite === "function" ? elencoPartite() : [])
    .filter(p => (p.avversario || "").trim().toLowerCase() === nomeSq);
  const gareHtml = gare.length
    ? '<div class="st-scroll"><table class="st-box"><thead><tr><th>Data</th><th>Luogo</th><th>Stato</th></tr></thead><tbody>' +
        gare.map(p => '<tr><td>' + esc((p.data_ora || "").slice(0, 10)) + '</td><td>' + esc(p.luogo || "") + '</td><td>' + esc(p.stato || "") + '</td></tr>').join('') +
      '</tbody></table></div>'
    : '<div class="st-hint">Nessuna gara in calendario con questo nome esatto.</div>';

  const giocatori = giocatoriDiSquadraAvversaria(sq.id);
  const giocatoriHtml = giocatori.length
    ? '<div class="lista-altro">' + giocatori.map(g =>
        '<div class="riga-altro avv-riga-giocatore" data-apri-giocatore="' + esc(g.id) + '">' +
          '<span class="col-testo"><span class="titolo-altro">' + esc(((g.cognome || "") + " " + (g.nome || "")).trim() || "Senza nome") +
          (g.numero_maglia !== "" && g.numero_maglia != null ? ' · #' + esc(g.numero_maglia) : '') + '</span>' +
          '<span class="sotto-altro">' + esc(g.ruolo || "—") + '</span></span>' +
          '<svg class="ico freccia-riga" aria-hidden="true"><use href="#i-chevron"></use></svg></div>'
      ).join('') + '</div>'
    : '<div class="st-hint">Nessun giocatore avversario ancora schedato.</div>';

  body.innerHTML =
    '<button class="btn-annulla-modale" id="avvsq-modifica">✎ Modifica squadra</button>' +
    '<div class="adv-tit" style="margin-top:14px">Gare in programma</div>' + gareHtml +
    '<div class="adv-tit" style="margin-top:14px">Attacco</div>' +
      rigaNotaHtml_("Caratteristiche", sq.caratteristiche_attacco) +
      rigaNotaHtml_("Come li affrontiamo (la nostra difesa)", sq.approccio_attacco) +
    '<div class="adv-tit" style="margin-top:14px">Difesa</div>' +
      rigaNotaHtml_("Caratteristiche", sq.caratteristiche_difesa) +
      rigaNotaHtml_("Come li affrontiamo (il nostro attacco)", sq.approccio_difesa) +
    '<div class="adv-tit" style="margin-top:14px">Note dall\'andata</div>' +
      rigaNotaHtml_("", sq.note_andata) +
    '<div class="adv-tit" style="margin-top:14px">Giocatori (' + giocatori.length + ')</div>' +
    giocatoriHtml +
    '<button class="btn-annulla-modale avv-aggiungi" id="avv-aggiungi-giocatore">+ Aggiungi giocatore avversario</button>';
}

/* ==========================================================================
   Form SQUADRA avversaria (modale)
   ========================================================================== */
function popolaSuggerimentiNomiAvversari_() {
  const dl = document.getElementById("avv-nomi-suggeriti");
  if (!dl || dl.dataset.popolato) return;
  const nomi = {};
  (typeof elencoPartite === "function" ? elencoPartite() : []).forEach(p => { if (p.avversario) nomi[p.avversario] = 1; });
  dl.innerHTML = Object.keys(nomi).sort((a, b) => a.localeCompare(b, "it")).map(n => '<option value="' + esc(n) + '">').join('');
  dl.dataset.popolato = "1";
}
function apriFormSquadraAvversaria(id) {
  const a = id ? caricaAvversari().find(x => x.id === id) : null;
  document.getElementById("avv-sq-titolo").textContent = a ? "Modifica squadra" : "Nuova squadra avversaria";
  document.getElementById("avv-sq-id").value = a ? a.id : "";
  document.getElementById("avv-sq-nome").value = a ? (a.nome_squadra || "") : "";
  document.getElementById("avv-sq-car-att").value = a ? (a.caratteristiche_attacco || "") : "";
  document.getElementById("avv-sq-car-dif").value = a ? (a.caratteristiche_difesa || "") : "";
  document.getElementById("avv-sq-app-att").value = a ? (a.approccio_attacco || "") : "";
  document.getElementById("avv-sq-app-dif").value = a ? (a.approccio_difesa || "") : "";
  document.getElementById("avv-sq-andata").value = a ? (a.note_andata || "") : "";
  document.getElementById("avv-sq-elimina").hidden = !a;
  popolaSuggerimentiNomiAvversari_();
  document.getElementById("overlay-avv-squadra").classList.add("visibile");
}
function chiudiFormSquadraAvversaria() {
  document.getElementById("overlay-avv-squadra").classList.remove("visibile");
}
function confermaFormSquadraAvversaria() {
  const nome = document.getElementById("avv-sq-nome").value.trim();
  if (!nome) { mostraToast("Inserisci almeno il nome della squadra"); return; }
  upsertAvversario({
    id: document.getElementById("avv-sq-id").value || "",
    nome_squadra: nome,
    caratteristiche_attacco: document.getElementById("avv-sq-car-att").value.trim(),
    caratteristiche_difesa: document.getElementById("avv-sq-car-dif").value.trim(),
    approccio_attacco: document.getElementById("avv-sq-app-att").value.trim(),
    approccio_difesa: document.getElementById("avv-sq-app-dif").value.trim(),
    note_andata: document.getElementById("avv-sq-andata").value.trim()
  });
  chiudiFormSquadraAvversaria();
  renderAvversariLista();
  if (avvSquadraSel) renderSchedaSquadraAvversaria();
  mostraToast("Squadra salvata");
}
function eliminaSquadraAvversariaCorrente() {
  const id = document.getElementById("avv-sq-id").value;
  if (!id) return;
  if (!confirm("Eliminare questa squadra avversaria e tutte le sue note?")) return;
  rimuoviAvversario(id);
  chiudiFormSquadraAvversaria();
  avvSquadraSel = null;
  navigaA("avversari");
  renderAvversariLista();
  mostraToast("Squadra eliminata");
}

/* ==========================================================================
   Form GIOCATORE avversario (modale) — sempre nel contesto di avvSquadraSel
   ========================================================================== */
function apriFormGiocatoreAvversario(id) {
  const g = id ? caricaAvversariGiocatori().find(x => x.id === id) : null;
  document.getElementById("avv-gc-titolo").textContent = g ? "Modifica giocatore avversario" : "Nuovo giocatore avversario";
  document.getElementById("avv-gc-id").value = g ? g.id : "";
  document.getElementById("avv-gc-id-squadra").value = g ? (g.id_squadra || "") : (avvSquadraSel || "");
  document.getElementById("avv-gc-nome").value = g ? (g.nome || "") : "";
  document.getElementById("avv-gc-cognome").value = g ? (g.cognome || "") : "";
  document.getElementById("avv-gc-numero").value = g && g.numero_maglia != null ? g.numero_maglia : "";
  document.getElementById("avv-gc-ruolo").value = g ? (g.ruolo || "") : "";
  document.getElementById("avv-gc-car-att").value = g ? (g.caratteristiche_attacco || "") : "";
  document.getElementById("avv-gc-car-dif").value = g ? (g.caratteristiche_difesa || "") : "";
  document.getElementById("avv-gc-app-att").value = g ? (g.approccio_attacco || "") : "";
  document.getElementById("avv-gc-app-dif").value = g ? (g.approccio_difesa || "") : "";
  document.getElementById("avv-gc-andata").value = g ? (g.note_andata || "") : "";
  document.getElementById("avv-gc-elimina").hidden = !g;
  document.getElementById("overlay-avv-giocatore").classList.add("visibile");
}
function chiudiFormGiocatoreAvversario() {
  document.getElementById("overlay-avv-giocatore").classList.remove("visibile");
}
function confermaFormGiocatoreAvversario() {
  const cognome = document.getElementById("avv-gc-cognome").value.trim();
  const nome = document.getElementById("avv-gc-nome").value.trim();
  if (!cognome && !nome) { mostraToast("Inserisci almeno nome o cognome"); return; }
  const idSquadra = document.getElementById("avv-gc-id-squadra").value;
  if (!idSquadra) { mostraToast("Nessuna squadra di riferimento — riapri dalla scheda squadra"); return; }
  const numRaw = document.getElementById("avv-gc-numero").value.trim();
  upsertAvversarioGiocatore({
    id: document.getElementById("avv-gc-id").value || "",
    id_squadra: idSquadra,
    nome: nome,
    cognome: cognome,
    numero_maglia: numRaw === "" ? "" : parseInt(numRaw, 10),
    ruolo: document.getElementById("avv-gc-ruolo").value.trim(),
    caratteristiche_attacco: document.getElementById("avv-gc-car-att").value.trim(),
    caratteristiche_difesa: document.getElementById("avv-gc-car-dif").value.trim(),
    approccio_attacco: document.getElementById("avv-gc-app-att").value.trim(),
    approccio_difesa: document.getElementById("avv-gc-app-dif").value.trim(),
    note_andata: document.getElementById("avv-gc-andata").value.trim()
  });
  chiudiFormGiocatoreAvversario();
  renderSchedaSquadraAvversaria();
  mostraToast("Giocatore avversario salvato");
}
function eliminaGiocatoreAvversarioCorrente() {
  const id = document.getElementById("avv-gc-id").value;
  if (!id) return;
  if (!confirm("Eliminare questo giocatore avversario?")) return;
  rimuoviAvversarioGiocatore(id);
  chiudiFormGiocatoreAvversario();
  renderSchedaSquadraAvversaria();
  mostraToast("Giocatore avversario eliminato");
}

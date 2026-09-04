/* ==========================================================================
   ui.js — Render vista partita, modali cambi/recap, toast, badge offline
   ========================================================================== */

/* ---------- ICONE (riuso dello sprite SVG in index.html) ---------- */
function ico(nome) {
  return '<svg class="ico" aria-hidden="true"><use href="#i-' + nome + '"></use></svg>';
}

/* ---------- TOAST ---------- */
let toastTimeout = null;
function mostraToast(testo) {
  const el = document.getElementById("toast");
  el.textContent = testo;
  el.classList.add("visibile");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => el.classList.remove("visibile"), 2200);
}

/* ---------- BADGE OFFLINE ---------- */
function aggiornaBadgeOffline() {
  const badge = document.getElementById("badge-offline");
  if (codaInvio.length > 0) {
    badge.classList.add("visibile");
    badge.innerHTML = ico("alert") + " " + codaInvio.length + " EVENTI IN CODA";
  } else {
    badge.classList.remove("visibile");
  }
}

/* ---------- RENDER VISTA PARTITA ---------- */
function renderPartita() {
  // Punteggio
  document.getElementById("punti-mia").textContent = state.punteggio.MIA;
  document.getElementById("punti-opp").textContent = state.punteggio.OPP;
  document.getElementById("quarto-badge").textContent = nomeQuarto();
  document.getElementById("timer-display").textContent = formatTempo(state.timerSec);

  // Bonus
  const bonusMia = state.falliSquadraPerQuarto.OPP[state.quartoIndice] >= CONFIG.FALLI_SQUADRA_PER_BONUS;
  const bonusOpp = state.falliSquadraPerQuarto.MIA[state.quartoIndice] >= CONFIG.FALLI_SQUADRA_PER_BONUS;
  document.getElementById("bonus-mia").classList.toggle("attivo", bonusMia);
  document.getElementById("bonus-opp").classList.toggle("attivo", bonusOpp);

  // Timer
  const btnTimer = document.getElementById("btn-timer");
  btnTimer.innerHTML = state.timerAttivo ? ico("pause") + " STOP" : ico("play") + " START";
  btnTimer.classList.toggle("in-corso", state.timerAttivo);
  btnTimer.disabled = !!state.partitaFinita;
  document.getElementById("btn-quarto").disabled = !!state.partitaFinita;
  document.getElementById("end-game-panel").classList.toggle("hidden", !state.partitaFinita);
  document.getElementById("banner-tempo-fermo").classList.toggle(
    "visibile", !state.timerAttivo && !state.partitaFinita
  );

  // Feed
  document.getElementById("quick-feed").innerHTML = "<b>Ultimo:</b> " + state.ultimoTestoFeed;

  // Roster
  const listaEl = document.getElementById("lista-giocatori");
  listaEl.innerHTML = "";
  state.roster.forEach(num => {
    const falli = state.falliGiocatori[num] || 0;
    const btn = document.createElement("button");
    const sel = state.selezione?.squadra === "MIA" && state.selezione?.num === num;
    btn.className = "btn-giocatore" + (sel ? " selezionato" : "");
    let cf = "falli";
    if (falli >= CONFIG.FALLI_PERSONALI_LIMITE) cf += " out-falli";
    else if (falli === CONFIG.FALLI_PERSONALI_LIMITE - 1) cf += " warning-falli";
    btn.innerHTML = `<span class="numero">#${num}</span><span class="${cf}">${falli}F</span>`;
    btn.addEventListener("click", () => selezionaGiocatore(num));
    listaEl.appendChild(btn);
  });

  // OPP
  document.getElementById("btn-opp").classList.toggle(
    "selezionato", !!(state.selezione?.squadra === "OPP")
  );

  // Fallo subito disabilitato senza giocatore MIA
  document.getElementById("btn-fallo-subito").disabled =
    !(state.selezione?.squadra === "MIA" || state.selezione?.squadra === "OPP");

  aggiornaBadgeOffline();
}

/* ---------- MODALE CAMBI ---------- */
function apriCambi() {
  if (state.timerAttivo) { mostraToast("Ferma il cronometro prima dei cambi"); return; }
  const container = document.getElementById("cambi-slots");
  container.innerHTML = "";
  state.roster.forEach((num, idx) => {
    const div = document.createElement("div");
    div.className = "slot-cambio";
    div.innerHTML =
      `<span>#${num}</span><span class="freccia" aria-hidden="true">→</span>` +
      `<input type="tel" inputmode="numeric" maxlength="2" data-idx="${idx}" placeholder="${num}">`;
    container.appendChild(div);
  });
  document.getElementById("overlay-cambi").classList.add("visibile");
}

function confermaCambi() {
  document.querySelectorAll("#cambi-slots input").forEach(inp => {
    const idx = parseInt(inp.dataset.idx, 10);
    const val = inp.value.trim();
    if (val && !isNaN(val)) {
      const n = parseInt(val, 10);
      state.roster[idx] = n;
      if (!(n in state.falliGiocatori)) state.falliGiocatori[n] = 0;
    }
  });
  salvaStato();
  chiudiCambi();
  renderPartita();
  mostraToast("Cambi applicati");
}

function chiudiCambi() {
  document.getElementById("overlay-cambi").classList.remove("visibile");
}

/* ---------- MODALE RECAP ---------- */
function apriRecap() {
  const pg = {};
  state.roster.forEach(n => pg[n] = { punti: 0, tiriT: 0, tiriS: 0, falli: 0, rec: 0, pp: 0 });

  state.eventLog.forEach(({ evento: ev }) => {
    if (ev.squadra !== "MIA" || !ev.giocatore_num) return;
    const n = ev.giocatore_num;
    if (!pg[n]) pg[n] = { punti: 0, tiriT: 0, tiriS: 0, falli: 0, rec: 0, pp: 0 };
    if (ev.tipo_evento === "TIRO") {
      pg[n].tiriT++;
      if (ev.dettaglio.indexOf("SEGNATO") > -1) pg[n].tiriS++;
      pg[n].punti += ev.punti_segnati || 0;
    } else if (ev.tipo_evento === "FALLO_SUBITO") {
      pg[n].punti += ev.punti_segnati || 0;
    } else if (ev.tipo_evento === "FALLO_FATTO") {
      pg[n].falli++;
    } else if (ev.tipo_evento === "RECUPERO") {
      pg[n].rec++;
    } else if (ev.tipo_evento === "PALLA_PERSA") {
      pg[n].pp++;
    }
  });

  let html = "<tr><th>#</th><th>PTS</th><th>TIRI</th><th>FL</th><th>REC</th><th>PP</th></tr>";
  Object.keys(pg).forEach(n => {
    const g = pg[n];
    html += `<tr>
      <td>#${n}</td><td>${g.punti}</td>
      <td>${g.tiriS}/${g.tiriT}</td>
      <td>${g.falli}</td><td>${g.rec}</td><td>${g.pp}</td>
    </tr>`;
  });
  document.getElementById("recap-tabella").innerHTML = html;
  document.getElementById("overlay-recap").classList.add("visibile");
}

function chiudiRecap() {
  document.getElementById("overlay-recap").classList.remove("visibile");
}

/* ---------- NAVIGAZIONE TAB ---------- */
function navigaA(viewId) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("attiva"));
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("attivo"));
  document.getElementById("view-" + viewId)?.classList.add("attiva");
  document.querySelector(`.tab-btn[data-view="${viewId}"]`)?.classList.add("attivo");
}

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
  document.getElementById("nome-mia").textContent = CONFIG.NOME_SQUADRA_MIA;
  document.getElementById("nome-opp").textContent = state.avversarioBreve || "AVV";
  document.getElementById("btn-opp-label").textContent = state.avversarioBreve || "AVVERSARI";

  // Bonus
  const bonusMia = state.falliSquadraPerQuarto.OPP[state.quartoIndice] >= CONFIG.FALLI_SQUADRA_PER_BONUS;
  const bonusOpp = state.falliSquadraPerQuarto.MIA[state.quartoIndice] >= CONFIG.FALLI_SQUADRA_PER_BONUS;
  document.getElementById("bonus-mia").classList.toggle("attivo", bonusMia);
  document.getElementById("bonus-opp").classList.toggle("attivo", bonusOpp);

  // Stato partita
  document.getElementById("btn-quarto").disabled = !!state.partitaFinita;
  document.getElementById("end-game-panel").classList.toggle("hidden", !state.partitaFinita);

  // Ultimo evento
  document.getElementById("ultimo-evento-banner").textContent = state.ultimoTestoFeed;

  // Roster
  const listaEl = document.getElementById("lista-giocatori");
  listaEl.innerHTML = "";
  state.roster.forEach(num => {
    const falli = state.falliGiocatori[num] || 0;
    const info = (state.convocati || []).find(c => String(c.numero) === String(num));
    const nick = info && info.nickname ? info.nickname : "";
    const btn = document.createElement("button");
    const sel = state.selezione?.squadra === "MIA" && state.selezione?.num === num;
    btn.className = "btn-giocatore" + (sel ? " selezionato" : "");
    let cf = "falli";
    if (falli >= CONFIG.FALLI_PERSONALI_LIMITE) cf += " out-falli";
    else if (falli === CONFIG.FALLI_PERSONALI_LIMITE - 1) cf += " warning-falli";
    btn.innerHTML =
      `<span class="g-id"><span class="numero">#${num}</span>` +
      (nick ? `<span class="nick">${nick}</span>` : "") + `</span>` +
      `<span class="${cf}">${falli}F</span>`;
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

  // Azioni in grigio finché non c'è una selezione
  document.querySelector(".pannello-destro")
    .classList.toggle("azioni-bloccate", !state.selezione);

  aggiornaBadgeOffline();
}

/* ---------- MODALE CAMBI — checkpoint tempo / quintetto / stint ---------- */
function durataQuartoMin() {
  return Math.round(
    (state.quartoIndice < CONFIG.QUARTI_REGOLAMENTARI ? CONFIG.DURATA_QUARTO_SEC : CONFIG.DURATA_OT_SEC) / 60
  );
}
function checkpointCorrente() {
  const cp = state.ultimoCheckpoint;
  if (cp && cp.quarto === nomeQuarto()) return { mm: cp.mm | 0, ss: cp.ss | 0 };
  return { mm: durataQuartoMin(), ss: 0 };  // inizio periodo (tempo pieno)
}
function opzioni(sel, valori, selezionato, etichetta) {
  sel.innerHTML = "";
  valori.forEach(v => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = etichetta ? etichetta(v) : String(v).padStart(2, "0");
    if (String(v) === String(selezionato)) o.selected = true;
    sel.appendChild(o);
  });
}
function popolaSecondiCambi() {
  const cp = checkpointCorrente();
  const min = parseInt(document.getElementById("cambi-min").value, 10);
  const maxSec = (min === cp.mm) ? cp.ss : 59;
  const secs = [];
  for (let s = 0; s <= maxSec; s++) secs.push(s);
  const sel = document.getElementById("cambi-sec");
  const attuale = Math.min(parseInt(sel.value, 10) || (min === cp.mm ? cp.ss : 0), maxSec);
  opzioni(sel, secs, attuale);
}
function popolaTempoCambi() {
  const cp = checkpointCorrente();
  const mins = [];
  for (let m = cp.mm; m >= 0; m--) mins.push(m);   // il tempo rimanente può solo calare
  opzioni(document.getElementById("cambi-min"), mins, cp.mm);
  popolaSecondiCambi();
}

function renderSlotCambi() {
  const cont = document.getElementById("cambi-slots");
  cont.innerHTML = "";
  const conv = state.convocati || [];
  const panchina = conv.filter(c => state.roster.indexOf(c.numero) === -1);

  state.roster.forEach((num, idx) => {
    const info = conv.find(c => String(c.numero) === String(num));
    const nick = info && info.nickname ? " " + info.nickname : "";
    const div = document.createElement("div");
    div.className = "slot-cambio";
    if (panchina.length || conv.length) {
      let opts = '<option value="">resta in campo</option>';
      panchina.forEach(c => {
        opts += '<option value="' + c.numero + '">↔ #' + c.numero +
                (c.nickname ? " " + c.nickname : "") + '</option>';
      });
      div.innerHTML = '<span class="slot-in">#' + num + nick + '</span>' +
        '<select class="cambio-sel" data-idx="' + idx + '">' + opts + '</select>';
    } else {
      div.innerHTML = '<span class="slot-in">#' + num + '</span>' +
        '<span class="freccia" aria-hidden="true">→</span>' +
        '<input type="tel" inputmode="numeric" maxlength="2" class="cambio-num" data-idx="' + idx +
        '" placeholder="' + num + '">';
    }
    cont.appendChild(div);
  });
}

function apriCambi() {
  document.getElementById("cambi-quarto").textContent = nomeQuarto();
  popolaTempoCambi();
  document.getElementById("cambi-min").onchange = popolaSecondiCambi;
  document.getElementById("cambi-punti-mia").value = state.punteggio.MIA;
  document.getElementById("cambi-punti-opp").value = state.punteggio.OPP;
  document.getElementById("cambi-punti-label").textContent =
    "Punteggio (" + CONFIG.NOME_SQUADRA_MIA + " − " + (state.avversarioBreve || "AVV") + ")";
  renderSlotCambi();
  document.getElementById("overlay-cambi").classList.add("visibile");
}

function confermaCambi() {
  if (!Array.isArray(state.stints)) state.stints = [];
  const quintettoPrec = state.roster.slice();

  const mm = parseInt(document.getElementById("cambi-min").value, 10) || 0;
  const ss = parseInt(document.getElementById("cambi-sec").value, 10) || 0;
  const cp = checkpointCorrente();
  if (mm * 60 + ss > cp.mm * 60 + cp.ss) {
    mostraToast("Il tempo rimanente non può aumentare nello stesso quarto");
    return;
  }
  const tempo = String(mm).padStart(2, "0") + ":" + String(ss).padStart(2, "0");

  const nuovo = state.roster.slice();
  document.querySelectorAll("#cambi-slots .cambio-sel").forEach(sel => {
    const idx = parseInt(sel.dataset.idx, 10);
    if (sel.value) nuovo[idx] = parseInt(sel.value, 10);
  });
  document.querySelectorAll("#cambi-slots .cambio-num").forEach(inp => {
    const idx = parseInt(inp.dataset.idx, 10);
    if (inp.value.trim() && !isNaN(inp.value)) nuovo[idx] = parseInt(inp.value, 10);
  });
  if (new Set(nuovo).size !== nuovo.length) { mostraToast("Quintetto non valido: numeri duplicati"); return; }
  nuovo.forEach(n => { if (!(n in state.falliGiocatori)) state.falliGiocatori[n] = 0; });
  state.roster = nuovo;

  const pMia = parseInt(document.getElementById("cambi-punti-mia").value, 10);
  const pOpp = parseInt(document.getElementById("cambi-punti-opp").value, 10);
  const checkpoint = {
    quarto: nomeQuarto(),
    tempo,
    punteggio: {
      MIA: isNaN(pMia) ? state.punteggio.MIA : pMia,
      OPP: isNaN(pOpp) ? state.punteggio.OPP : pOpp
    }
  };

  state.inCampo = state.roster.slice();
  state.tempoPartita = tempo;
  state.ultimoCheckpoint = { quarto: nomeQuarto(), mm: mm, ss: ss };

  chiudiStint(checkpoint);
  apriStint(state.inCampo.slice(), checkpoint);

  const usciti = quintettoPrec.filter(n => !state.roster.includes(n));
  const entrati = state.roster.filter(n => !quintettoPrec.includes(n));
  const descr = (usciti.length || entrati.length)
    ? "Cambio " + tempo + " — OUT " + (usciti.map(n => "#" + n).join(",") || "—") +
      " / IN " + (entrati.map(n => "#" + n).join(",") || "—")
    : "Checkpoint " + tempo;

  registraEvento({
    squadra: "MIA",
    giocatore_num: [...usciti, ...entrati].join(","),
    tipo_evento: "CAMBIO",
    dettaglio: "STINT",
    punti_segnati: 0,
    punteggio_progressivo: checkpoint.punteggio.MIA + "-" + checkpoint.punteggio.OPP
  }, () => {}, descr);

  chiudiCambi();
  mostraToast("Quintetto e checkpoint salvati");
}

function apriStint(quintetto, checkpoint) {
  state.stintCorrente = {
    quarto: checkpoint.quarto,
    inizio: checkpoint,
    quintetto: quintetto.slice()
  };
}

function chiudiStint(checkpoint) {
  const s = state.stintCorrente;
  if (!s) return;
  const pm = (checkpoint.punteggio.MIA - s.inizio.punteggio.MIA) -
             (checkpoint.punteggio.OPP - s.inizio.punteggio.OPP);
  state.stints.push({
    quarto: s.quarto,
    quintetto: s.quintetto,
    inizio: s.inizio,
    fine: checkpoint,
    plusMinus: pm
  });
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

  if (viewId === "calendario" && typeof renderCalendario === "function") renderCalendario();
}

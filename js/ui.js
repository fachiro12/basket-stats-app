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
      `<span class="g-id"><span class="numero">#${esc(num)}</span>` +
      (nick ? `<span class="nick">${esc(nick)}</span>` : "") + `</span>` +
      `<span class="${cf}">${falli}F</span>`;
    btn.addEventListener("click", () => selezionaGiocatore(num));
    listaEl.appendChild(btn);
  });

  // OPP
  document.getElementById("btn-opp").classList.toggle(
    "selezionato", !!(state.selezione?.squadra === "OPP")
  );

  // FALLO SUBITO: nostro giocatore (sua modale TL) o AVVERSARI (fallo che abbiamo fatto noi)
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
        opts += '<option value="' + esc(c.numero) + '">↔ #' + esc(c.numero) +
                (c.nickname ? " " + esc(c.nickname) : "") + '</option>';
      });
      div.innerHTML = '<span class="slot-in">#' + esc(num) + esc(nick) + '</span>' +
        '<select class="cambio-sel" data-idx="' + idx + '">' + opts + '</select>';
    } else {
      div.innerHTML = '<span class="slot-in">#' + esc(num) + '</span>' +
        '<span class="freccia" aria-hidden="true">→</span>' +
        '<input type="tel" inputmode="numeric" maxlength="2" class="cambio-num" data-idx="' + idx +
        '" placeholder="' + esc(num) + '">';
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

  /* Snapshot per l'UNDO: il CAMBIO muta roster/inCampo/tempo/checkpoint/stint
     e aggiunge chiavi a falliGiocatori. La delta ripristina tutto. */
  const snap = {
    roster: state.roster.slice(),
    inCampo: (state.inCampo || state.roster).slice(),
    tempoPartita: state.tempoPartita,
    ultimoCheckpoint: state.ultimoCheckpoint ? Object.assign({}, state.ultimoCheckpoint) : null,
    falliKeys: Object.keys(state.falliGiocatori),
    stints: (state.stints || []).slice(),
    stintCorrente: state.stintCorrente ? JSON.parse(JSON.stringify(state.stintCorrente)) : null
  };
  const ripristinaCambio = () => {
    state.roster = snap.roster.slice();
    state.inCampo = snap.inCampo.slice();
    state.tempoPartita = snap.tempoPartita;
    state.ultimoCheckpoint = snap.ultimoCheckpoint ? Object.assign({}, snap.ultimoCheckpoint) : null;
    Object.keys(state.falliGiocatori).forEach(k => {
      if (snap.falliKeys.indexOf(k) === -1) delete state.falliGiocatori[k];
    });
    state.stints = snap.stints.slice();
    state.stintCorrente = snap.stintCorrente ? JSON.parse(JSON.stringify(snap.stintCorrente)) : null;
  };

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
  }, ripristinaCambio, descr);

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
  const ctx = statsContesto(true);   // sempre la partita live
  const box = calcolaBox(ctx);
  const conv = state.convocati || [];
  const numeri = conv.length
    ? conv.map(c => c.numero)
    : Object.keys(box.pg).map(Number).sort((a, b) => a - b);
  const s = (x, y) => (y ? x / y : 0);

  let html = "<tr><th>#</th><th>G</th><th>PT</th><th>+/-</th><th>eFG%</th><th>Net/40</th><th>FF</th></tr>";
  numeri.forEach(n => {
    const g = box.pg[n] || {};
    const fga = (g.a2 || 0) + (g.a3 || 0), fgm = (g.m2 || 0) + (g.m3 || 0);
    const efg = fga ? Math.round(s(fgm + 0.5 * (g.m3 || 0), fga) * 100) + "%" : "–";
    const pm = Math.round(g.pm || 0);
    const net = g.min ? Math.round((g.pm || 0) / g.min * 40) : 0;
    html += `<tr>
      <td>#${esc(n)}</td><td style="text-align:left">${esc(nomeGiocatore(n))}</td>
      <td>${g.pt || 0}</td>
      <td class="${pm >= 0 ? "pos" : "neg"}">${pm > 0 ? "+" : ""}${pm}</td>
      <td>${efg}</td>
      <td class="${net >= 0 ? "pos" : "neg"}">${net > 0 ? "+" : ""}${net}</td>
      <td>${g.ff || 0}</td>
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
  // In "Segui live" la vista Partita è bloccata (stato non nostro)
  if (viewId === "partita" && typeof seguiLive !== "undefined" && seguiLive) {
    mostraToast("Sei in Segui live · esci per usare la Partita");
    viewId = "stats";
  }
  document.querySelectorAll(".view").forEach(v => v.classList.remove("attiva"));
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("attivo"));
  document.getElementById("view-" + viewId)?.classList.add("attiva");
  document.querySelector(`.tab-btn[data-view="${viewId}"]`)?.classList.add("attivo");

  if (viewId === "calendario" && typeof renderCalendario === "function") renderCalendario();
  if (viewId === "stats" && typeof renderStats === "function") renderStats();
  if (viewId === "adv" && typeof renderAdv === "function") renderAdv();
}

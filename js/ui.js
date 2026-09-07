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

  // Bonus (in OT si usa l'indice del 4° quarto — FIBA Art. 41)
  const fi = (typeof indiceFalli === "function") ? indiceFalli() : state.quartoIndice;
  const bonusMia = state.falliSquadraPerQuarto.OPP[fi] >= CONFIG.FALLI_SQUADRA_PER_BONUS;
  const bonusOpp = state.falliSquadraPerQuarto.MIA[fi] >= CONFIG.FALLI_SQUADRA_PER_BONUS;
  document.getElementById("bonus-mia").classList.toggle("attivo", bonusMia);
  document.getElementById("bonus-opp").classList.toggle("attivo", bonusOpp);

  // Stato partita — a partita finita si blocca ogni inserimento (resta solo UNDO)
  const fin = !!state.partitaFinita;
  document.getElementById("btn-quarto").disabled = fin;
  document.getElementById("btn-cambi").disabled = fin;
  document.getElementById("btn-opp").disabled = fin;
  document.getElementById("end-game-panel").classList.toggle("hidden", !fin);

  // Ultimo evento — se è un fallo con TL, la barra diventa "tocca per correggere"
  const bannerEl = document.getElementById("ultimo-evento-banner");
  const corr = typeof ultimoFalloCorreggibile === "function" && ultimoFalloCorreggibile();
  bannerEl.textContent = (corr ? "✎ " : "") + (state.ultimoTestoFeed || "");
  bannerEl.classList.toggle("correggibile", !!corr);

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
    btn.disabled = fin;
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

  // FALLO SUBITO / FATTO: servono una selezione (giocatore PVL o AVVERSARI)
  const selOk = state.selezione?.squadra === "MIA" || state.selezione?.squadra === "OPP";
  document.getElementById("btn-fallo-subito").disabled = fin || !selOk;
  document.getElementById("btn-fallo-fatto").disabled = fin || !selOk;

  // Azioni in grigio finché non c'è una selezione (o a partita finita)
  document.querySelector(".pannello-destro")
    .classList.toggle("azioni-bloccate", fin || !state.selezione);

  aggiornaBadgeOffline();
}

/* ---------- MODALE CAMBI — checkpoint periodo / tempo / quintetto / punteggio ---------- */
function periodoCambiSelezionato() {
  const v = parseInt((document.getElementById("cambi-quarto") || {}).value, 10);
  return isNaN(v) ? state.quartoIndice : v;
}
function durataPeriodoMin(idx) {
  return Math.round(
    (idx < CONFIG.QUARTI_REGOLAMENTARI ? CONFIG.DURATA_QUARTO_SEC : CONFIG.DURATA_OT_SEC) / 60
  );
}
/* checkpoint di riferimento per il periodo attualmente SCELTO nel select */
function checkpointCorrente() {
  const idx = periodoCambiSelezionato();
  const nome = nomePeriodo(idx);
  const cp = state.ultimoCheckpoint;
  if (cp && cp.quarto === nome) return { mm: cp.mm | 0, ss: cp.ss | 0 };
  return { mm: durataPeriodoMin(idx), ss: 0 };   // inizio periodo (tempo pieno)
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
function popolaQuartoCambi() {
  const cur = state.quartoIndice;
  const maxSel = cur + 1;   // si può correggere all'indietro o avanzare di 1 periodo
  const vals = [];
  for (let i = 0; i <= maxSel; i++) vals.push(i);
  opzioni(document.getElementById("cambi-quarto"), vals, cur, nomePeriodo);
}
function popolaSecondiCambi() {
  const cp = checkpointCorrente();
  const min = parseInt(document.getElementById("cambi-min").value, 10);
  const maxSec = (min === cp.mm) ? cp.ss : 59;
  const secs = [];
  for (let s = 0; s <= 55; s += 5) if (s <= maxSec) secs.push(s);   // passi di 5s: wheel corto su iPhone
  if (maxSec % 5 !== 0 && maxSec <= 59) secs.push(maxSec);           // includi il limite esatto
  const sel = document.getElementById("cambi-sec");
  const prev = parseInt(sel.value, 10);
  const attuale = secs.indexOf(prev) > -1 ? prev : (min === cp.mm ? cp.ss : 0);
  opzioni(sel, secs, Math.min(attuale, maxSec));
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
  if (state.partitaFinita) { mostraToast("Partita terminata"); return; }
  popolaQuartoCambi();
  document.getElementById("cambi-quarto").onchange = popolaTempoCambi;
  popolaTempoCambi();
  document.getElementById("cambi-min").onchange = popolaSecondiCambi;
  document.getElementById("cambi-punti-label").textContent =
    "Punteggio (" + CONFIG.NOME_SQUADRA_MIA + " − " + (state.avversarioBreve || "AVV") + ")";
  document.getElementById("cambi-punti-mia").value = state.punteggio.MIA;
  document.getElementById("cambi-punti-opp").value = state.punteggio.OPP;
  renderSlotCambi();
  document.getElementById("overlay-cambi").classList.add("visibile");
}

function confermaCambi() {
  if (state.partitaFinita) { mostraToast("Partita terminata"); return; }
  const quintettoPrec = state.roster.slice();

  /* Snapshot per l'UNDO: il CAMBIO muta roster/inCampo/tempo/checkpoint
     e aggiunge chiavi a falliGiocatori. La delta ripristina tutto.
     (Gli stint per le stat sono ricostruiti a parte da stintsDaEventi().) */
  const snap = {
    roster: state.roster.slice(),
    inCampo: (state.inCampo || state.roster).slice(),
    tempoPartita: state.tempoPartita,
    ultimoCheckpoint: state.ultimoCheckpoint ? Object.assign({}, state.ultimoCheckpoint) : null,
    falliKeys: Object.keys(state.falliGiocatori),
    quartoIndice: state.quartoIndice
  };
  // La delta del CAMBIO NON tocca il punteggio: l'eventuale correzione ha un
  // evento RETTIFICA proprio, con UNDO separato.
  const ripristinaCambio = () => {
    state.roster = snap.roster.slice();
    state.inCampo = snap.inCampo.slice();
    state.tempoPartita = snap.tempoPartita;
    state.ultimoCheckpoint = snap.ultimoCheckpoint ? Object.assign({}, snap.ultimoCheckpoint) : null;
    state.quartoIndice = snap.quartoIndice;
    Object.keys(state.falliGiocatori).forEach(k => {
      if (snap.falliKeys.indexOf(k) === -1) delete state.falliGiocatori[k];
    });
  };

  // --- periodo scelto ---
  const qIdx = periodoCambiSelezionato();
  const qCambiato = qIdx !== state.quartoIndice;

  // --- tempo ---
  const mm = parseInt(document.getElementById("cambi-min").value, 10) || 0;
  const ss = parseInt(document.getElementById("cambi-sec").value, 10) || 0;
  const cp = checkpointCorrente();
  if (!qCambiato && mm * 60 + ss > cp.mm * 60 + cp.ss) {
    mostraToast("Il tempo rimanente non può aumentare nello stesso periodo");
    return;
  }
  const tempo = String(mm).padStart(2, "0") + ":" + String(ss).padStart(2, "0");

  // --- quintetto ---
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

  // --- punteggio (correzione facoltativa) ---
  const pMia = parseInt(document.getElementById("cambi-punti-mia").value, 10);
  const pOpp = parseInt(document.getElementById("cambi-punti-opp").value, 10);
  const nMia = isNaN(pMia) ? state.punteggio.MIA : Math.max(0, pMia);
  const nOpp = isNaN(pOpp) ? state.punteggio.OPP : Math.max(0, pOpp);
  const scoreCambiato = nMia !== state.punteggio.MIA || nOpp !== state.punteggio.OPP;

  /* Ordine: 1) rettifica punteggio (periodo/quintetto ANCORA vecchi → l'evento
     resta nel contesto giusto), 2) cambio periodo, 3) quintetto + evento CAMBIO. */
  if (scoreCambiato) {
    const vecchio = state.punteggio.MIA + "-" + state.punteggio.OPP;
    const nuovoScore = nMia + "-" + nOpp;
    state.punteggio.MIA = nMia;
    state.punteggio.OPP = nOpp;
    registraEvento({
      squadra: "", giocatore_num: "",
      tipo_evento: "RETTIFICA", dettaglio: "PUNTEGGIO " + vecchio + " → " + nuovoScore,
      punti_segnati: 0
    }, () => {
      const m = vecchio.split("-");
      state.punteggio.MIA = +m[0]; state.punteggio.OPP = +m[1];
    }, "⚑ Rettifica punteggio → " + nuovoScore);
  }

  if (qCambiato) state.quartoIndice = qIdx;

  nuovo.forEach(n => { if (!(n in state.falliGiocatori)) state.falliGiocatori[n] = 0; });
  state.roster = nuovo;
  state.inCampo = state.roster.slice();
  state.tempoPartita = tempo;
  state.ultimoCheckpoint = { quarto: nomeQuarto(), mm: mm, ss: ss };

  const usciti = quintettoPrec.filter(n => !state.roster.includes(n));
  const entrati = state.roster.filter(n => !quintettoPrec.includes(n));
  const descr = (usciti.length || entrati.length)
    ? "Cambio " + nomeQuarto() + " " + tempo + " — OUT " + (usciti.map(n => "#" + n).join(",") || "—") +
      " / IN " + (entrati.map(n => "#" + n).join(",") || "—")
    : "Checkpoint " + nomeQuarto() + " " + tempo;

  registraEvento({
    squadra: "MIA",
    giocatore_num: [...usciti, ...entrati].join(","),
    tipo_evento: "CAMBIO",
    dettaglio: "STINT",
    punti_segnati: 0
    // punteggio_progressivo lo mette registraEvento dal punteggio corrente
  }, ripristinaCambio, descr);

  chiudiCambi();
  mostraToast(qCambiato || scoreCambiato ? "Checkpoint aggiornato" : "Quintetto e checkpoint salvati");
}

function chiudiCambi() {
  document.getElementById("overlay-cambi").classList.remove("visibile");
}

/* ---------- MODALE RECAP ---------- */
function apriRecap() {
  const tab = document.getElementById("recap-tabella");
  const overlay = document.getElementById("overlay-recap");
  const nomeG = n => (typeof nomeGiocatore === "function" ? nomeGiocatore(n) : "");

  if (typeof statsContesto !== "function" || typeof calcolaBox !== "function") {
    tab.innerHTML = '<tr><td>Statistiche non disponibili: modulo <code>stats.js</code> non caricato.</td></tr>';
    overlay.classList.add("visibile");
    return;
  }

  try {
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
        <td>#${esc(n)}</td><td style="text-align:left">${esc(nomeG(n))}</td>
        <td>${g.pt || 0}</td>
        <td class="${pm >= 0 ? "pos" : "neg"}">${pm > 0 ? "+" : ""}${pm}</td>
        <td>${efg}</td>
        <td class="${net >= 0 ? "pos" : "neg"}">${net > 0 ? "+" : ""}${net}</td>
        <td>${g.ff || 0}</td>
      </tr>`;
    });
    tab.innerHTML = html;
  } catch (e) {
    tab.innerHTML = '<tr><td>Errore nel recap: ' + esc(e && e.message || e) + '</td></tr>';
  }
  overlay.classList.add("visibile");
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

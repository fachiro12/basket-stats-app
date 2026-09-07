/* ==========================================================================
   fallo-subito.js — Flusso "Fallo Subito / Fallo Fatto"
   Tutto nell'overlay contestuale del pannello destro (#action-overlay), a passi,
   con "← indietro" ad ogni step → un mis-tap si corregge senza rifare tutto,
   e il CAMBI resta raggiungibile (cambio prima dei liberi).
   ========================================================================== */

let ffsNum = null;      // giocatore che ha subito il fallo
let ffsAnd1 = false;    // aveva appena segnato → and-1 probabile

function apriFalloSubito() {
  if (state.partitaFinita) { mostraToast("Partita terminata"); return; }
  // FALLO SUBITO = il selezionato ha SUBITO un fallo
  if (state.selezione?.squadra === "MIA" && state.selezione.num != null) {
    avviaFalloSubito(state.selezione.num);
  } else if (state.selezione?.squadra === "OPP") {
    apriOverlayAvversariSubito();
  } else {
    mostraToast("Seleziona un giocatore " + CONFIG.NOME_SQUADRA_MIA + " o AVVERSARI");
  }
}

/* AVVERSARI selezionato + FALLO SUBITO = l'avversario ha subito un fallo → l'abbiamo fatto noi */
function apriOverlayAvversariSubito() {
  mostraActionOverlay("Fallo subito dagli avversari", [
    aoBottone("Fallo di un nostro giocatore", () => chiediGiocatoreCheHaFattoFallo()),
    aoBottone("Tecnico nostra panchina / coach", () => faseEsitoTecnicoNostro()),
    aoBottone("Doppio / compensati", () => faseDoppioGiocatore(), true)
  ], 0);
}

function chiediGiocatoreCheHaFattoFallo() {
  const btns = state.roster.map(n => aoBottone(etichettaNum(n), () => {
    chiudiActionOverlay();
    apriTlAvversari(n);   // 0 / 1 / 2 / 3 TL agli avversari
  }));
  mostraActionOverlay("Chi dei nostri ha fatto il fallo?", btns, 0);
}

function faseEsitoTecnicoNostro() {
  mostraActionOverlay("Tecnico panchina " + CONFIG.NOME_SQUADRA_MIA + " — TL avversario realizzato?", [
    aoBottone("SÌ", () => { registraTecnicoPanchinaNostra(true); chiudiActionOverlay(); }),
    aoBottone("NO", () => { registraTecnicoPanchinaNostra(false); chiudiActionOverlay(); }, true)
  ], 0);
}

function registraTecnicoPanchinaNostra(segnato) {
  const qi = indiceFalli();
  const punti = segnato ? 1 : 0;
  state.punteggio.OPP += punti;
  state.falliSquadraPerQuarto.MIA[qi] += 1;
  const inverti = () => {
    state.punteggio.OPP -= punti;
    state.falliSquadraPerQuarto.MIA[qi] = Math.max(0, state.falliSquadraPerQuarto.MIA[qi] - 1);
  };
  registraEvento({
    squadra: "MIA", giocatore_num: "",
    tipo_evento: "FALLO_FATTO", dettaglio: "TECNICO_PANCHINA",
    punti_segnati: punti, esito_tl: [segnato ? "SI" : "NO"],
    fallo_speciale: "TECNICO_PANCHINA"
  }, inverti, CONFIG.NOME_SQUADRA_MIA + " · tecnico panchina · TL avv. " + (segnato ? "realizzato" : "sbagliato"));
}

function chiediGiocatoreMiaFallo() {
  const bottoni = state.roster.map(n => aoBottone(etichettaNum(n), () => {
    state.selezione = { squadra: "MIA", num: n };
    salvaStato();
    renderPartita();
    avviaFalloSubito(n);
  }));
  mostraActionOverlay("Chi ha subito il fallo?", bottoni, 0);
}

/* ==========================================================================
   FALLO AVVERSARIO — personale / tecnico panchina o giocatore / doppio-compensati
   ========================================================================== */
function apriOverlayFalloAvversario() {
  mostraActionOverlay("Fallo commesso dagli avversari", [
    aoBottone("Fallo su tiro / bonus → TL", () => { chiudiActionOverlay(); chiediGiocatoreMiaFallo(); }),
    aoBottone("Fallo senza TL", () => faseGiocatoreFalloSenzaTl()),
    aoBottone("Tecnico panchina avversaria", () => faseTiratoreTecnico("TECNICO_PANCHINA")),
    aoBottone("Tecnico giocatore avversario", () => faseTiratoreTecnico("TECNICO")),
    aoBottone("Doppio / compensati", () => faseDoppioGiocatore(), true)
  ], 0);
}

function faseGiocatoreFalloSenzaTl() {
  const btns = state.roster.map(n => aoBottone(etichettaNum(n), () => {
    registraFalloSubitoSenzaTl(n);
    chiudiActionOverlay();
  }));
  mostraActionOverlay("Chi ha subito il fallo?", btns, 0);
}

function faseTiratoreTecnico(tipoSpeciale) {
  const btns = state.roster.map(n => aoBottone(etichettaNum(n), () => faseEsitoTecnico(n, tipoSpeciale)));
  mostraActionOverlay("Chi tira il TL tecnico?", btns, 0);
}
function faseEsitoTecnico(num, tipoSpeciale) {
  mostraActionOverlay("TL tecnico " + etichettaNum(num) + " — realizzato?", [
    aoBottone("SÌ", () => { registraTecnicoAvversario(num, tipoSpeciale, true); chiudiActionOverlay(); }),
    aoBottone("NO", () => { registraTecnicoAvversario(num, tipoSpeciale, false); chiudiActionOverlay(); }, true)
  ], 0);
}

function faseDoppioGiocatore() {
  const btns = state.roster.map(n => aoBottone(etichettaNum(n), () => faseSottotipoDoppio(n)));
  mostraActionOverlay("Nostro giocatore sanzionato?", btns, 0);
}
function faseSottotipoDoppio(num) {
  mostraActionOverlay("Si compensano · 0 TL · 0 punti", [
    aoBottone("Doppio personale", () => { registraDoppioFallo(num, "DOPPIO_PERSONALE"); chiudiActionOverlay(); }),
    aoBottone("Tecnici compensati", () => { registraDoppioFallo(num, "TECNICI_COMPENSATI"); chiudiActionOverlay(); }),
    aoBottone("Antisportivi compensati", () => { registraDoppioFallo(num, "ANTISPORTIVI_COMPENSATI"); chiudiActionOverlay(); }, true)
  ], 0);
}

function registraFalloSubitoSenzaTl(num) {
  const qi = indiceFalli();
  state.falliSquadraPerQuarto.OPP[qi] += 1;
  const inverti = () => {
    state.falliSquadraPerQuarto.OPP[qi] = Math.max(0, state.falliSquadraPerQuarto.OPP[qi] - 1);
  };
  registraEvento({
    squadra: "MIA", giocatore_num: String(num),
    tipo_evento: "FALLO_SUBITO", dettaglio: "SENZA_TL", punti_segnati: 0
  }, inverti, CONFIG.NOME_SQUADRA_MIA + " " + etichettaNum(num) + " · fallo subito (senza TL)");
}

function registraTecnicoAvversario(num, tipoSpeciale, segnato) {
  const qi = indiceFalli();
  const punti = segnato ? 1 : 0;
  state.punteggio.MIA += punti;
  state.falliSquadraPerQuarto.OPP[qi] += 1;
  const inverti = () => {
    state.punteggio.MIA -= punti;
    state.falliSquadraPerQuarto.OPP[qi] = Math.max(0, state.falliSquadraPerQuarto.OPP[qi] - 1);
  };
  registraEvento({
    squadra: "MIA", giocatore_num: String(num),
    tipo_evento: "FALLO_SUBITO", dettaglio: "TECNICO_1TL",
    punti_segnati: punti, esito_tl: [segnato ? "SI" : "NO"],
    fallo_speciale: tipoSpeciale
  }, inverti, CONFIG.NOME_SQUADRA_MIA + " " + etichettaNum(num) + " · TL tecnico avv. (" + (segnato ? "realizzato" : "sbagliato") + ")");
}

/* ==========================================================================
   SCHERMATA ESITI TL — tutti gli N tiri visibili insieme, SÌ/NO ri-toccabili
   fino alla conferma. Usata da fallo-subito, fallo-fatto e "correggi ultimo".
   ========================================================================== */
let tlEsitiTmp = [];
let ffModifica = false;   // true = stiamo rifacendo gli esiti di un fallo già registrato

function aoRigaTL(i) {
  const row = document.createElement("div");
  row.className = "ao-tl-riga";
  const lab = document.createElement("span");
  lab.className = "ao-tl-lab";
  lab.textContent = "TL " + (i + 1);
  row.appendChild(lab);
  [["si", "SI", "SÌ"], ["no", "NO", "NO"]].forEach(([cls, val, txt]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ao-tl-btn " + cls + (tlEsitiTmp[i] === val ? " on" : "");
    b.textContent = txt;
    b.addEventListener("click", () => {
      tlEsitiTmp[i] = val;
      row.querySelectorAll(".ao-tl-btn").forEach(x => x.classList.toggle("on", x === b));
    });
    row.appendChild(b);
  });
  return row;
}

function schermataEsitiTL(n, esitiPre, titolo, onConferma, onIndietro) {
  tlEsitiTmp = [];
  for (let i = 0; i < n; i++) tlEsitiTmp.push(esitiPre && esitiPre[i] ? esitiPre[i] : null);
  const el = [];
  for (let i = 0; i < n; i++) el.push(aoRigaTL(i));
  const conferma = aoBottone("✓ Conferma", () => {
    if (tlEsitiTmp.some(v => v == null)) { mostraToast("Segna tutti i " + n + " TL"); return; }
    onConferma(tlEsitiTmp.slice());
  });
  conferma.classList.add("ao-conferma");
  el.push(conferma);
  el.push(aoBottone("← indietro", onIndietro));
  mostraActionOverlay(titolo, el, 0);
}

/* ---------- FALLO FATTO da un nostro giocatore: TL agli avversari ---------- */
let ffNum = null;

function apriTlAvversari(num) {
  ffNum = num;
  ffModifica = false;
  mostraActionOverlay("Fallo " + etichettaNum(num) + " — TL avversari?", [
    aoBottone("Nessun TL", () => finalizzaFalloFatto("PERSONALE", []), true),
    aoBottone("1 TL", () => faseEsitiTlAvv(1, [])),
    aoBottone("2 TL", () => faseEsitiTlAvv(2, [])),
    aoBottone("3 TL", () => faseEsitiTlAvv(3, []))
  ], 0);
}

function faseEsitiTlAvv(n, esitiPre) {
  schermataEsitiTL(n, esitiPre,
    "TL avversari · fallo " + etichettaNum(ffNum) + " — segna gli esiti",
    esiti => finalizzaFalloFatto(n + "TL", esiti),
    () => (ffModifica ? chiudiActionOverlay() : apriTlAvversari(ffNum)));
}

function finalizzaFalloFatto(opzione, esiti) {
  const eraModifica = ffModifica;
  if (ffModifica) { ffModifica = false; annullaUltimoEvento(); }
  const num = ffNum;
  const qi = indiceFalli();
  const puntiOpp = esiti.filter(v => v === "SI").length;

  state.falliSquadraPerQuarto.MIA[qi] += 1;
  if (numValido(num)) state.falliGiocatori[num] = (state.falliGiocatori[num] || 0) + 1;
  state.punteggio.OPP += puntiOpp;

  const inverti = () => {
    state.falliSquadraPerQuarto.MIA[qi] = Math.max(0, state.falliSquadraPerQuarto.MIA[qi] - 1);
    if (numValido(num)) state.falliGiocatori[num] = Math.max(0, (state.falliGiocatori[num] || 0) - 1);
    state.punteggio.OPP -= puntiOpp;
  };

  registraEvento({
    squadra: "MIA", giocatore_num: numValido(num) ? String(num) : "",
    tipo_evento: "FALLO_FATTO", dettaglio: opzione,
    punti_segnati: puntiOpp, esito_tl: esiti.slice()
  }, inverti, CONFIG.NOME_SQUADRA_MIA + " " + etichettaNum(num) + " · fallo fatto" +
     (esiti.length ? " (" + puntiOpp + "/" + esiti.length + " TL avv.)" : ""));

  chiudiActionOverlay();
  if (eraModifica) mostraToast("Tiri liberi corretti");
  else if (esiti.length && esiti[esiti.length - 1] === "NO") avviaOverlayRimbalzo("OPP");
}

function registraDoppioFallo(num, sottotipo) {
  const qi = indiceFalli();
  state.falliSquadraPerQuarto.MIA[qi] += 1;
  state.falliSquadraPerQuarto.OPP[qi] += 1;
  state.falliGiocatori[num] = (state.falliGiocatori[num] || 0) + 1;
  const inverti = () => {
    state.falliSquadraPerQuarto.MIA[qi] = Math.max(0, state.falliSquadraPerQuarto.MIA[qi] - 1);
    state.falliSquadraPerQuarto.OPP[qi] = Math.max(0, state.falliSquadraPerQuarto.OPP[qi] - 1);
    state.falliGiocatori[num] = Math.max(0, (state.falliGiocatori[num] || 0) - 1);
  };
  registraEvento({
    squadra: "MIA", giocatore_num: String(num),
    tipo_evento: "FALLO_FATTO", dettaglio: sottotipo,
    punti_segnati: 0, fallo_speciale: "COMPENSATO"
  }, inverti, CONFIG.NOME_SQUADRA_MIA + " " + etichettaNum(num) + " · " +
     sottotipo.replace(/_/g, " ").toLowerCase() + " (compensato)");
}

/* ==========================================================================
   FALLO SUBITO da un nostro giocatore — macchina a stati nell'overlay destro
   ========================================================================== */
function avviaFalloSubito(num) {
  ffsNum = num;
  ffModifica = false;
  ffsAnd1 = ultimaAzioneEraCanestro(num);
  // And-1 = 1 solo TL: salta il menu conteggio (si torna indietro col ←)
  if (ffsAnd1) faseEsitiFalloSubito(1, [], "NESSUNO");
  else faseCountFalloSubito("NESSUNO");
}

function faseCountFalloSubito(fs) {
  const speciale = fs !== "NESSUNO";
  const btns = [];
  if (!speciale) {
    btns.push(aoBottone("Nessun TL · rimessa", () => finalizzaFalloSubito("RIMESSA", [], "NESSUNO"), true));
  }
  btns.push(aoBottone("1 TL" + (ffsAnd1 && !speciale ? "  · and-1" : ""), () => faseEsitiFalloSubito(1, [], fs)));
  btns.push(aoBottone("2 TL", () => faseEsitiFalloSubito(2, [], fs)));
  btns.push(aoBottone("3 TL", () => faseEsitiFalloSubito(3, [], fs)));
  btns.push(speciale
    ? aoBottone("← indietro", () => faseCountFalloSubito("NESSUNO"))
    : aoBottone("Tecnico / Antisportivo →", () => faseSpecialeFalloSubito()));

  const et = fs === "NESSUNO" ? "" : " · " + fs.replace("+", " + ").toLowerCase();
  mostraActionOverlay("Fallo subito · " + etichettaNum(ffsNum) + et + " — quanti TL?", btns, 0);
}

function faseSpecialeFalloSubito() {
  mostraActionOverlay("Fallo speciale su " + etichettaNum(ffsNum), [
    aoBottone("Tecnico", () => faseCountFalloSubito("TECNICO")),
    aoBottone("Antisportivo", () => faseCountFalloSubito("ANTISPORTIVO")),
    aoBottone("Tecnico + Antisportivo", () => faseCountFalloSubito("TECNICO+ANTISPORTIVO")),
    aoBottone("← indietro", () => faseCountFalloSubito("NESSUNO"), true)
  ], 0);
}

function faseEsitiFalloSubito(n, esitiPre, fs) {
  const et = fs === "NESSUNO" ? "" : " · " + fs.replace("+", " + ").toLowerCase();
  schermataEsitiTL(n, esitiPre,
    "TL di " + etichettaNum(ffsNum) + et + " — segna gli esiti",
    esiti => finalizzaFalloSubito(n + "TL", esiti, fs),
    () => (ffModifica ? chiudiActionOverlay() : faseCountFalloSubito(fs)));
}

function finalizzaFalloSubito(opzione, esiti, fs) {
  const eraModifica = ffModifica;
  if (ffModifica) { ffModifica = false; annullaUltimoEvento(); }
  const num = ffsNum;
  const qi = indiceFalli();
  const puntiTl = esiti.filter(v => v === "SI").length;
  let dettaglio = opzione;
  if (opzione === "1TL" && ffsAnd1 && fs === "NESSUNO") dettaglio = "1TL_AND1";

  state.punteggio.MIA += puntiTl;
  state.falliSquadraPerQuarto.OPP[qi] += 1;
  const inverti = () => {
    state.punteggio.MIA -= puntiTl;
    state.falliSquadraPerQuarto.OPP[qi] = Math.max(0, state.falliSquadraPerQuarto.OPP[qi] - 1);
  };

  registraEvento({
    squadra: "MIA",
    giocatore_num: numValido(num) ? String(num) : "",
    tipo_evento: "FALLO_SUBITO",
    dettaglio: dettaglio,
    punti_segnati: puntiTl,
    esito_tl: esiti.slice(),
    fallo_speciale: fs
  }, inverti, CONFIG.NOME_SQUADRA_MIA + " " + etichettaNum(num) + " · fallo subito (" +
     dettaglio + (esiti.length ? " " + puntiTl + "/" + esiti.length : "") + ")");

  chiudiActionOverlay();
  if (eraModifica) {
    mostraToast("Tiri liberi corretti");
  } else if (fs === "NESSUNO" && opzione !== "RIMESSA" && esiti.length && esiti[esiti.length - 1] === "NO") {
    avviaOverlayRimbalzo();   // ultimo TL sbagliato → rimbalzo
  }
}

/* ==========================================================================
   CORREGGI ULTIMO FALLO — riapre solo la schermata esiti TL del fallo appena
   registrato (se è l'ultimo evento). Alla conferma: annulla il vecchio +
   registra il nuovo. Niente "undo grosso + rifai tutto". Trigger: tap sulla
   barra "ultimo evento" quando evidenziata.
   ========================================================================== */
function ultimoFalloCorreggibile() {
  const last = (state.eventLog || [])[state.eventLog.length - 1];
  const ev = last && (last.evento || last);
  if (!ev || state.partitaFinita) return null;
  if (ev.tipo_evento !== "FALLO_SUBITO" && ev.tipo_evento !== "FALLO_FATTO") return null;
  const esiti = String(ev.esito_tl || "").split(",").map(s => s.trim()).filter(Boolean);
  return esiti.length ? { ev: ev, esiti: esiti } : null;
}

function modificaUltimoFallo() {
  // solo a mani libere: niente hijack di un overlay già aperto
  if (typeof aoElemento === "function" && !aoElemento().classList.contains("hidden")) return;
  const c = ultimoFalloCorreggibile();
  if (!c) return;
  ffModifica = true;
  if (c.ev.tipo_evento === "FALLO_SUBITO") {
    ffsNum = c.ev.giocatore_num;
    ffsAnd1 = c.ev.dettaglio === "1TL_AND1";
    const fs = c.ev.fallo_speciale && c.ev.fallo_speciale !== "NESSUNO" ? c.ev.fallo_speciale : "NESSUNO";
    faseEsitiFalloSubito(c.esiti.length, c.esiti, fs);
  } else {
    ffNum = c.ev.giocatore_num;
    faseEsitiTlAvv(c.esiti.length, c.esiti);
  }
  mostraToast("Cambia gli esiti sbagliati, poi Conferma");
}

/* And-1: il giocatore ha segnato da 2/3 poco fa. Si guarda indietro saltando
   ASSIST/ANNULLA, così l'assist registrato in mezzo non lo nasconde. */
function ultimaAzioneEraCanestro(numArg) {
  const num = String(numArg != null ? numArg : state.selezione?.num);
  if (num === "undefined" || num === "null" || num === "") return false;
  const log = state.eventLog || [];
  for (let i = log.length - 1, k = 0; i >= 0 && k < 4; i--, k++) {
    const ev = log[i].evento;
    if (ev.tipo_evento === "ASSIST" || ev.tipo_evento === "ANNULLA") continue;
    return ev.squadra === "MIA" &&
      String(ev.giocatore_num) === num &&
      ev.tipo_evento === "TIRO" &&
      (ev.dettaglio === "2P_SEGNATO" || ev.dettaglio === "3P_SEGNATO");
  }
  return false;
}

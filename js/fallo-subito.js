/* ==========================================================================
   fallo-subito.js — Logica della modalina "Fallo Subito"
   ========================================================================== */

let fsOpzione = null;
let fsEsitiTl = [];

function apriFalloSubito() {
  if (state.partitaFinita) { mostraToast("Partita terminata"); return; }
  // FALLO SUBITO = il selezionato ha SUBITO un fallo
  if (state.selezione?.squadra === "MIA" && state.selezione.num != null) {
    apriModaleFalloSubito();
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
    chiudiActionOverlay();
    apriModaleFalloSubito();
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

/* ---------- FALLO FATTO da un nostro giocatore: TL agli avversari ---------- */
let ffNum = null;

function apriTlAvversari(num) {
  ffNum = num;
  mostraActionOverlay("Fallo " + etichettaNum(num) + " — TL avversari?", [
    aoBottone("Nessun TL", () => finalizzaFalloFatto("PERSONALE", []), true),
    aoBottone("1 TL", () => faseEsitiTlAvv(1, [])),
    aoBottone("2 TL", () => faseEsitiTlAvv(2, [])),
    aoBottone("3 TL", () => faseEsitiTlAvv(3, []))
  ], 0);
}

function faseEsitiTlAvv(n, esiti) {
  if (esiti.length >= n) { finalizzaFalloFatto(n + "TL", esiti); return; }
  const i = esiti.length + 1;
  mostraActionOverlay("TL avversario " + i + "/" + n + " — realizzato?", [
    aoBottone("SÌ", () => faseEsitiTlAvv(n, esiti.concat("SI"))),
    aoBottone("NO", () => faseEsitiTlAvv(n, esiti.concat("NO")), true)
  ], 0);
}

function finalizzaFalloFatto(opzione, esiti) {
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
  if (esiti.length && esiti[esiti.length - 1] === "NO") avviaOverlayRimbalzo("OPP");
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

function apriModaleFalloSubito() {
  fsOpzione = null;
  fsEsitiTl = [];
  document.getElementById("fs-contesto").textContent =
    etichettaNum(state.selezione.num) + " " + CONFIG.NOME_SQUADRA_MIA;
  document.getElementById("fs-tecnico").checked = false;
  document.getElementById("fs-antisportivo").checked = false;
  document.querySelectorAll("#overlay-fallo-subito .opzione-modale")
    .forEach(b => b.classList.remove("selezionata"));
  document.getElementById("fs-righe-tl").innerHTML = "";
  document.getElementById("fs-conferma").disabled = true;
  document.getElementById("overlay-fallo-subito").classList.add("visibile");

  // And-1 probabile (il selezionato ha appena segnato) → preseleziona 1 TL
  if (ultimaAzioneEraCanestro()) selezionaOpzioneFs("1TL");
}

/* And-1: il giocatore selezionato ha segnato da 2/3 poco fa. Si guarda indietro
   saltando ASSIST/ANNULLA, così l'assist registrato in mezzo non lo nasconde. */
function ultimaAzioneEraCanestro() {
  const num = String(state.selezione?.num);
  if (num === "undefined" || num === "null" || num === "") return false;
  const log = state.eventLog;
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

function selezionaOpzioneFs(opz) {
  fsOpzione = opz;
  fsEsitiTl = [];
  document.querySelectorAll("#overlay-fallo-subito .opzione-modale")
    .forEach(b => b.classList.toggle("selezionata", b.dataset.opz === opz));

  const container = document.getElementById("fs-righe-tl");
  container.innerHTML = "";

  if (opz === "RIMESSA") {
    document.getElementById("fs-conferma").disabled = false;
    return;
  }

  const nTiri = opz === "1TL" ? 1 : opz === "2TL" ? 2 : 3;
  for (let i = 0; i < nTiri; i++) {
    fsEsitiTl.push(null);
    const isAnd1 = opz === "1TL" && ultimaAzioneEraCanestro();
    const riga = document.createElement("div");
    riga.className = "riga-tl";
    riga.innerHTML =
      `<span>Tiro libero ${i + 1}${isAnd1 ? ' <span style="color:var(--color-state-positive);font-size:11px;font-weight:700;">AND-1</span>' : ""}</span>` +
      `<span class="toggle-si-no">
        <button class="si" data-idx="${i}">SI</button>
        <button class="no" data-idx="${i}">NO</button>
      </span>`;
    container.appendChild(riga);
  }
  document.getElementById("fs-conferma").disabled = true;
}

function impostaEsitoTl(idx, esito) {
  fsEsitiTl[idx] = esito;
  const riga = document.querySelectorAll("#fs-righe-tl .riga-tl")[idx];
  riga.querySelector(".si").classList.toggle("attivo", esito === "SI");
  riga.querySelector(".no").classList.toggle("attivo", esito === "NO");
  document.getElementById("fs-conferma").disabled = fsEsitiTl.some(v => v === null);
}

function confermaFalloSubito() {
  if (!fsOpzione) return;
  const num = state.selezione.num;
  const tecnico = document.getElementById("fs-tecnico").checked;
  const antisportivo = document.getElementById("fs-antisportivo").checked;
  let falloSpeciale = "NESSUNO";
  if (tecnico && antisportivo) falloSpeciale = "TECNICO+ANTISPORTIVO";
  else if (tecnico) falloSpeciale = "TECNICO";
  else if (antisportivo) falloSpeciale = "ANTISPORTIVO";

  const puntiTl = fsEsitiTl.filter(v => v === "SI").length;
  let dettaglio = fsOpzione;
  if (fsOpzione === "1TL" && ultimaAzioneEraCanestro()) dettaglio = "1TL_AND1";

  const qi = indiceFalli();
  state.punteggio.MIA += puntiTl;
  state.falliSquadraPerQuarto.OPP[qi] += 1;

  const inverti = () => {
    state.punteggio.MIA -= puntiTl;
    state.falliSquadraPerQuarto.OPP[qi] = Math.max(0, state.falliSquadraPerQuarto.OPP[qi] - 1);
  };

  registraEvento({
    squadra: "MIA",
    giocatore_num: String(num),
    tipo_evento: "FALLO_SUBITO",
    dettaglio,
    punti_segnati: puntiTl,
    esito_tl: fsEsitiTl.slice(),
    fallo_speciale: falloSpeciale
  }, inverti, CONFIG.NOME_SQUADRA_MIA + " " + etichettaNum(num) + " · fallo subito (" + dettaglio + ")");

  const rimbalzoLive = falloSpeciale === "NESSUNO" &&
    fsOpzione !== "RIMESSA" &&
    fsEsitiTl.length > 0 &&
    fsEsitiTl[fsEsitiTl.length - 1] === "NO";

  chiudiFalloSubito();
  if (rimbalzoLive) avviaOverlayRimbalzo();
}

function chiudiFalloSubito() {
  document.getElementById("overlay-fallo-subito").classList.remove("visibile");
}

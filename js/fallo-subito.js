/* ==========================================================================
   fallo-subito.js — Logica della modalina "Fallo Subito"
   ========================================================================== */

let fsOpzione = null;
let fsEsitiTl = [];

function apriFalloSubito() {
  if (state.selezione?.squadra === "MIA" && state.selezione.num != null) {
    apriModaleFalloSubito();
  } else if (state.selezione?.squadra === "OPP") {
    apriOverlayFalloAvversario();
  } else {
    mostraToast("Seleziona un giocatore " + CONFIG.NOME_SQUADRA_MIA + " o AVVERSARI");
  }
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
  mostraActionOverlay("Fallo avversario", [
    aoBottone("Fallo su tiro / bonus → TL", () => { chiudiActionOverlay(); chiediGiocatoreMiaFallo(); }),
    aoBottone("Fallo senza TL", () => faseGiocatoreFalloSenzaTl()),
    aoBottone("Tecnico panchina / coach", () => faseTiratoreTecnico("TECNICO_PANCHINA")),
    aoBottone("Tecnico giocatore avv.", () => faseTiratoreTecnico("TECNICO")),
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
  const qi = state.quartoIndice;
  state.falliSquadraPerQuarto.OPP[qi] += 1;
  const inverti = () => {
    state.falliSquadraPerQuarto.OPP[qi] = Math.max(0, state.falliSquadraPerQuarto.OPP[qi] - 1);
  };
  registraEvento({
    squadra: "MIA", giocatore_num: String(num),
    tipo_evento: "FALLO_SUBITO", dettaglio: "SENZA_TL", punti_segnati: 0
  }, inverti, "#" + num + " " + CONFIG.NOME_SQUADRA_MIA + " Fallo subito (no TL)");
}

function registraTecnicoAvversario(num, tipoSpeciale, segnato) {
  const qi = state.quartoIndice;
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
  }, inverti, etichettaNum(num) + " TL tecnico avv. (" + (segnato ? "SI" : "NO") + ")");
}

function registraDoppioFallo(num, sottotipo) {
  const qi = state.quartoIndice;
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
  }, inverti, etichettaNum(num) + " " + sottotipo.replace(/_/g, " ").toLowerCase() + " (compensato)");
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
}

function ultimaAzioneEraCanestro() {
  const ultimo = state.eventLog[state.eventLog.length - 1];
  if (!ultimo) return false;
  const ev = ultimo.evento;
  return ev.squadra === "MIA" &&
    ev.giocatore_num === String(state.selezione?.num) &&
    ev.tipo_evento === "TIRO" &&
    (ev.dettaglio === "2P_SEGNATO" || ev.dettaglio === "3P_SEGNATO");
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

  const qi = state.quartoIndice;
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
  }, inverti, "#" + num + " " + CONFIG.NOME_SQUADRA_MIA + " Fallo subito (" + dettaglio + ")");

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

/* ==========================================================================
   fallo-subito.js — Logica della modalina "Fallo Subito"
   ========================================================================== */

let fsOpzione = null;
let fsEsitiTl = [];

function apriFalloSubito() {
  if (!state.selezione || state.selezione.squadra !== "MIA") {
    mostraToast("FALLO SUBITO richiede un giocatore MIA selezionato");
    return;
  }
  fsOpzione = null;
  fsEsitiTl = [];
  document.getElementById("fs-contesto").textContent =
    "#" + state.selezione.num + " " + CONFIG.NOME_SQUADRA_MIA;
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
  }, inverti, "#" + num + " MIA Fallo subito (" + dettaglio + ")");

  chiudiFalloSubito();
}

function chiudiFalloSubito() {
  document.getElementById("overlay-fallo-subito").classList.remove("visibile");
}

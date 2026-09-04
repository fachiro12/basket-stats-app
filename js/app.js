/* ==========================================================================
   app.js — Entry point: collega tutti i listener DOM e avvia l'app
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {

  /* -------- PARTITA -------- */
  document.getElementById("btn-quarto").addEventListener("click", avanzaQuarto);
  document.getElementById("btn-undo").addEventListener("click", annullaUltimoEvento);
  document.getElementById("btn-recap").addEventListener("click", apriRecap);
  document.getElementById("btn-opp").addEventListener("click", selezionaOpp);
  document.getElementById("btn-cambi").addEventListener("click", apriCambi);
  document.getElementById("btn-rec").addEventListener("click", registraRecupero);
  document.getElementById("btn-pp").addEventListener("click", registraPallaPersa);
  document.getElementById("btn-fallo-subito").addEventListener("click", apriFalloSubito);
  document.getElementById("btn-fallo-fatto").addEventListener("click", registraFalloFatto);

  document.querySelectorAll("[data-tiro]").forEach(btn => {
    btn.addEventListener("click", () => registraTiro(btn.dataset.tiro, btn.dataset.esito));
  });

  /* -------- MODALINA FALLO SUBITO -------- */
  document.querySelectorAll("#overlay-fallo-subito .opzione-modale").forEach(btn => {
    btn.addEventListener("click", () => selezionaOpzioneFs(btn.dataset.opz));
  });
  document.getElementById("fs-righe-tl").addEventListener("click", e => {
    const b = e.target.closest("button[data-idx]");
    if (!b) return;
    impostaEsitoTl(parseInt(b.dataset.idx, 10), b.classList.contains("si") ? "SI" : "NO");
  });
  document.getElementById("fs-conferma").addEventListener("click", confermaFalloSubito);
  document.getElementById("fs-chiudi").addEventListener("click", chiudiFalloSubito);

  /* -------- CAMBI -------- */
  document.getElementById("cambi-conferma").addEventListener("click", confermaCambi);
  document.getElementById("cambi-chiudi").addEventListener("click", chiudiCambi);

  /* -------- RECAP -------- */
  document.getElementById("recap-chiudi").addEventListener("click", chiudiRecap);

  /* -------- ROSTER / ANAGRAFICA GIOCATORI -------- */
  document.querySelectorAll('[data-apri="roster"]').forEach(el =>
    el.addEventListener("click", apriRoster));
  document.getElementById("roster-nuovo").addEventListener("click", () => apriFormGiocatore());
  document.getElementById("roster-chiudi").addEventListener("click", chiudiRoster);
  document.getElementById("gioc-salva").addEventListener("click", confermaFormGiocatore);
  document.getElementById("gioc-elimina").addEventListener("click", eliminaGiocatoreCorrente);
  document.getElementById("gioc-chiudi").addEventListener("click", chiudiFormGiocatore);

  /* -------- PRE-PARTITA (convocati) -------- */
  document.getElementById("pp-conferma").addEventListener("click", confermaPrePartita);
  document.getElementById("pp-annulla").addEventListener("click", chiudiPrePartita);
  document.getElementById("pp-lista").addEventListener("change", aggiornaContatorePrePartita);

  /* -------- CALENDARIO -------- */
  document.getElementById("cal-aggiungi").addEventListener("click", apriAggiungiPartita);
  document.getElementById("cal-menu").addEventListener("click", () => mostraToast("Menu in arrivo"));
  document.getElementById("cal-stagione").addEventListener("change", renderCalendario);
  document.getElementById("ap-conferma").addEventListener("click", confermaAggiungiPartita);
  document.getElementById("ap-chiudi").addEventListener("click", chiudiAggiungiPartita);
  document.querySelector('.tab-btn[data-view="calendario"]')
    .addEventListener("click", renderCalendario);

  /* -------- TAB BAR -------- */
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => navigaA(btn.dataset.view));
  });

  /* -------- Accesso rapido pagina "Altro" -------- */
  document.querySelectorAll("[data-goto]").forEach(el => {
    el.addEventListener("click", () => navigaA(el.dataset.goto));
  });

  /* -------- Pannello Fine Partita -------- */
  document.getElementById("btn-vai-stats").addEventListener("click", () => {
    document.querySelector('.tab-btn[data-view="stats"]').click();
  });
  document.getElementById("btn-nuova-partita").addEventListener("click", nuovaPartita);

  /* -------- AVVIO -------- */
  navigaA("partita");          // vista di default
  if (typeof renderCalendario === "function") renderCalendario();  // popola la lista partite
  if (typeof scaricaGiocatori === "function") scaricaGiocatori();  // sync anagrafica cloud -> client
  inizializzaPinGate();        // mostra pin gate o app direttamente
  processaCoda();              // tentativo invio eventi in coda
});

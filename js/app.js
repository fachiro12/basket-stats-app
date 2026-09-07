/* ==========================================================================
   app.js — Entry point: collega tutti i listener DOM e avvia l'app
   ========================================================================== */

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

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
  document.getElementById("cambi-convocati").addEventListener("click", apriConvocatiLive);

  /* -------- CONVOCATI IN PARTITA -------- */
  document.getElementById("cl-salva").addEventListener("click", salvaConvocatiLive);
  document.getElementById("cl-chiudi").addEventListener("click", () => chiudiConvocatiLive(true));
  document.getElementById("cl-add-btn").addEventListener("click", clAggiungiDaAnagrafica);
  document.getElementById("cl-add-manuale").addEventListener("click", clAggiungiManuale);
  document.getElementById("cl-lista").addEventListener("click", e => {
    const b = e.target.closest(".cl-del");
    if (b) clRimuovi(+b.dataset.idx);
  });

  /* -------- RECAP -------- */
  document.getElementById("recap-chiudi").addEventListener("click", chiudiRecap);

  /* -------- PROFILO / LOGOUT -------- */
  document.getElementById("btn-logout").addEventListener("click", logout);
  const btnReset = document.getElementById("btn-reset-dati");
  if (btnReset && typeof apriResetDati === "function") btnReset.addEventListener("click", apriResetDati);

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
  document.getElementById("pp-aggiungi").addEventListener("click", aggiungiConvocatoManuale);
  const ppLista = document.getElementById("pp-lista");
  ppLista.addEventListener("input", e => {
    if (e.target.classList.contains("pp-num")) ppNumero(+e.target.dataset.idx, e.target.value);
  });
  ppLista.addEventListener("click", e => {
    const del = e.target.closest(".pp-del");
    if (del) { ppRimuovi(+del.dataset.idx); return; }
    if (e.target.closest(".pp-num")) return;                 // scrivere il numero non convoca
    const riga = e.target.closest(".pp-riga");
    if (!riga || riga.dataset.idx == null) return;
    const idx = +riga.dataset.idx;
    ppToggle(idx, !(prePartitaPool[idx] && prePartitaPool[idx].convocato));
  });
  document.getElementById("pp-avv-breve").addEventListener("input", aggiornaAnteprimaNome);

  /* -------- QUINTETTO BASE -------- */
  document.getElementById("q-conferma").addEventListener("click", confermaQuintetto);
  document.getElementById("q-indietro").addEventListener("click", tornaAConvocati);
  document.getElementById("q-lista").addEventListener("change", e => {
    if (e.target.classList.contains("q-check")) qToggle(+e.target.dataset.num, e.target.checked);
  });

  /* -------- STATS / ADVANCED -------- */
  document.querySelectorAll("#view-stats .stats-tabs button").forEach(b =>
    b.addEventListener("click", () => renderStats(b.dataset.stab)));
  document.querySelectorAll("#adv-tabs button").forEach(b =>
    b.addEventListener("click", () => renderAdv(b.dataset.atab)));
  document.getElementById("stats-refresh").addEventListener("click", aggiornaStatsDaFoglio);
  document.getElementById("adv-refresh").addEventListener("click", aggiornaStatsDaFoglio);
  const azioniStats = e => {
    const t = e.target;
    if (!t) return;
    if (t.id === "segui-stop") {
      fermaSeguiLive();
      statsEventiRemoti = null;
      navigaA("calendario");
    } else if (t.id === "segui-prendi") {
      if (seguiLive && seguiLive.id && typeof riprendiComeSegnapuntiId === "function")
        riprendiComeSegnapuntiId(seguiLive.id);
    } else if (t.dataset && t.dataset.fmt) {
      statsFmt = t.dataset.fmt;
      renderStats();
    }
  };
  document.getElementById("stats-body").addEventListener("click", azioniStats);
  document.getElementById("adv-body").addEventListener("click", azioniStats);

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
  if (typeof inizializzaTema === "function") inizializzaTema();     // tema chiaro/arena + switch
  navigaA("partita");          // vista di default
  if (typeof renderCalendario === "function") renderCalendario();  // lista partite (cache/seed)
  if (typeof scaricaPartite === "function") scaricaPartite();      // sync calendario dal foglio
  if (typeof scaricaGiocatori === "function") scaricaGiocatori();  // sync anagrafica dal foglio
  inizializzaPinGate();        // mostra pin gate o app direttamente
  processaCoda();              // tentativo invio eventi in coda
});

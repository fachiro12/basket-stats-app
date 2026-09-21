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
  document.getElementById("ultimo-evento-banner").addEventListener("click", () => {
    if (typeof modificaUltimoFallo === "function") modificaUltimoFallo();
  });

  document.querySelectorAll("[data-tiro]").forEach(btn => {
    btn.addEventListener("click", () => registraTiro(btn.dataset.tiro, btn.dataset.esito));
  });

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
  const btnAzzeraGara = document.getElementById("btn-azzera-gara");
  if (btnAzzeraGara && typeof apriAzzeraGara === "function") btnAzzeraGara.addEventListener("click", apriAzzeraGara);

  /* -------- VERSIONE APP + forza-aggiornamento (contro la cache PWA su mobile) -------- */
  (function mostraVersioneApp() {
    const el = document.getElementById("app-versione");
    if (!el) return;
    const sc = document.querySelector('script[src*="app.js"]');
    const m = sc && sc.getAttribute("src").match(/[?&]v=(\d+)/);
    let txt = m ? "app v" + m[1] : "";
    if (window.caches && caches.keys) {
      caches.keys().then(ks => {
        const sw = (ks.find(k => /^bsp-v\d+$/.test(k)) || "").replace("bsp-v", "");
        if (sw && sw !== (m && m[1])) txt += " · cache v" + sw + " ⚠";
        el.textContent = txt;
      }).catch(() => { el.textContent = txt; });
    } else { el.textContent = txt; }
  })();
  const btnAgg = document.getElementById("btn-aggiorna-app");
  if (btnAgg) btnAgg.addEventListener("click", async () => {
    if (typeof mostraToast === "function") mostraToast("Aggiorno l'app…");
    try {
      if (window.caches && caches.keys) {
        const ks = await caches.keys();
        await Promise.all(ks.map(k => caches.delete(k)));
      }
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
    } catch (e) {}
    location.reload();
  });

  /* -------- ANALISI STAGIONE -------- */
  const apriAn = document.getElementById("apri-analisi");
  if (apriAn && typeof apriAnalisi === "function") apriAn.addEventListener("click", apriAnalisi);
  const anIndietro = document.getElementById("analisi-indietro");
  if (anIndietro) anIndietro.addEventListener("click", () => navigaA("squadra"));
  const anRefresh = document.getElementById("analisi-refresh");
  if (anRefresh && typeof caricaEventiStagione === "function")
    anRefresh.addEventListener("click", () => caricaEventiStagione());
  document.querySelectorAll("#analisi-tabs button").forEach(b =>
    b.addEventListener("click", () => renderAnalisi(b.dataset.antab)));
  const anFiltri = document.getElementById("analisi-filtri");
  if (anFiltri) anFiltri.addEventListener("click", e => {
    const btn = e.target.closest(".an-chip");
    if (!btn) return;
    const grp = btn.closest(".an-chip-grp");
    if (grp && typeof impostaFiltroAnalisi === "function")
      impostaFiltroAnalisi(grp.dataset.fil, btn.dataset.val);
  });
  const anBody = document.getElementById("analisi-body");
  if (anBody) anBody.addEventListener("click", e => {
    const th = e.target.closest("th[data-sort]");
    if (th && typeof impostaOrdineAnalisi === "function") { impostaOrdineAnalisi(th.dataset.sort); return; }
    const fb = e.target.closest("[data-anfmt]");
    if (fb && typeof impostaFmtAnalisi === "function") { impostaFmtAnalisi(fb.dataset.anfmt); return; }
    const avzBtn = e.target.closest("[data-avzopen]");
    if (avzBtn && typeof apriAnalisiAvanzata === "function") apriAnalisiAvanzata(avzBtn.dataset.avzopen);
  });

  /* -------- ANALISI AVANZATA: AIS / BPM·VORP / Def. Rating (sperimentale) -------- */
  const avzIndietro = document.getElementById("avz-indietro");
  if (avzIndietro) avzIndietro.addEventListener("click", () => navigaA("analisi"));
  document.querySelectorAll("#avz-tabs button").forEach(b =>
    b.addEventListener("click", () => {
      if (typeof cambiaTabAvz === "function") cambiaTabAvz(b.dataset.avztab);
    }));

  /* -------- ROTAZIONI (sperimentale) -------- */
  const apriRot = document.getElementById("apri-rotazioni");
  if (apriRot && typeof apriRotazioni === "function") apriRot.addEventListener("click", apriRotazioni);
  const rotIndietro = document.getElementById("rot-indietro");
  if (rotIndietro) rotIndietro.addEventListener("click", () => navigaA("squadra"));
  const rotFiltri = document.getElementById("rot-filtri");
  if (rotFiltri) rotFiltri.addEventListener("click", e => {
    const btn = e.target.closest(".an-chip");
    if (!btn) return;
    const grp = btn.closest(".an-chip-grp");
    if (grp && typeof impostaFiltroRotazioni === "function")
      impostaFiltroRotazioni(grp.dataset.fil, btn.dataset.val);
  });
  document.querySelectorAll("#rot-tabs button").forEach(b =>
    b.addEventListener("click", () => {
      if (typeof cambiaTabRot === "function") cambiaTabRot(b.dataset.rtab);
    }));
  const rotBody = document.getElementById("rot-body");
  if (rotBody) {
    rotBody.addEventListener("click", e => {
      const apriBtn = e.target.closest("[data-apri-giocatori]");
      if (apriBtn && typeof apriGiocatoriQuintetto === "function") { apriGiocatoriQuintetto(apriBtn.dataset.apriGiocatori); return; }
      const th = e.target.closest("th[data-sort]");
      if (!th) return;
      const inTabQuintetti = !!th.closest("table.rot-lineup-tab");
      if (inTabQuintetti && typeof impostaOrdineLineup === "function") impostaOrdineLineup(th.dataset.sort);
      else if (!inTabQuintetti && typeof impostaOrdineGiocatoriQuintetto === "function") impostaOrdineGiocatoriQuintetto(th.dataset.sort);
    });
    rotBody.addEventListener("input", e => {
      if (e.target.id === "rot-lineup-filtro" && typeof impostaFiltroTestoLineup === "function") {
        impostaFiltroTestoLineup(e.target.value); return;
      }
      if (e.target.dataset.soglia && typeof impostaSogliaLineup === "function")
        impostaSogliaLineup(e.target.dataset.soglia, e.target.value);
    });
    rotBody.addEventListener("change", e => {
      if (e.target.id === "rot-lineup-rumore" && typeof impostaNascondiRumoreLineup === "function") {
        impostaNascondiRumoreLineup(e.target.checked); return;
      }
      if (e.target.id === "rot-lineup-difesa" && typeof impostaMostraDifesaLineup === "function") {
        impostaMostraDifesaLineup(e.target.checked); return;
      }
      if (e.target.id === "rot-giocatori-quintetto-sel" && typeof impostaQuintettoSelGiocatori === "function")
        impostaQuintettoSelGiocatori(e.target.value);
    });
  }

  /* -------- BREAKDOWN POSSESSI (sperimentale) -------- */
  const apriBrk = document.getElementById("apri-breakdown");
  if (apriBrk && typeof apriBreakdown === "function") apriBrk.addEventListener("click", apriBreakdown);
  const brkIndietro = document.getElementById("brk-indietro");
  if (brkIndietro) brkIndietro.addEventListener("click", () => navigaA("squadra"));
  const brkFiltri = document.getElementById("brk-filtri");
  if (brkFiltri) brkFiltri.addEventListener("click", e => {
    const btn = e.target.closest(".an-chip");
    if (!btn) return;
    const grp = btn.closest(".an-chip-grp");
    if (grp && typeof impostaFiltroBreakdown === "function")
      impostaFiltroBreakdown(grp.dataset.fil, btn.dataset.val);
  });

  /* -------- RATING NET (sperimentale) -------- */
  const apriRN = document.getElementById("apri-rating-net");
  if (apriRN && typeof apriRatingNet === "function") apriRN.addEventListener("click", apriRatingNet);
  const rnIndietro = document.getElementById("rn-indietro");
  if (rnIndietro) rnIndietro.addEventListener("click", () => navigaA("squadra"));
  const rnFiltri = document.getElementById("rn-filtri");
  if (rnFiltri) rnFiltri.addEventListener("click", e => {
    const btn = e.target.closest(".an-chip");
    if (!btn) return;
    const grp = btn.closest(".an-chip-grp");
    if (grp && typeof impostaFiltroRatingNet === "function")
      impostaFiltroRatingNet(grp.dataset.fil, btn.dataset.val);
  });

  /* -------- PLAYER DEVELOPMENT (sperimentale) -------- */
  const apriPD = document.getElementById("apri-player-dev");
  if (apriPD && typeof apriPlayerDev === "function") apriPD.addEventListener("click", apriPlayerDev);
  const pdIndietro = document.getElementById("pd-indietro");
  if (pdIndietro) pdIndietro.addEventListener("click", () => navigaA("squadra"));
  const pdFiltri = document.getElementById("pd-filtri");
  if (pdFiltri) pdFiltri.addEventListener("click", e => {
    const btn = e.target.closest(".an-chip");
    if (!btn) return;
    const grp = btn.closest(".an-chip-grp");
    if (grp && typeof impostaFiltroPlayerDev === "function")
      impostaFiltroPlayerDev(grp.dataset.fil, btn.dataset.val);
  });
  const pdBody = document.getElementById("pd-body");
  if (pdBody) pdBody.addEventListener("click", e => {
    const riga = e.target.closest("[data-apri-scheda]");
    if (riga && typeof apriSchedaGiocatore === "function") apriSchedaGiocatore(riga.dataset.apriScheda);
  });
  const schedaIndietro = document.getElementById("scheda-indietro");
  if (schedaIndietro) schedaIndietro.addEventListener("click", () => {
    if (typeof apriPlayerDev === "function") apriPlayerDev();
  });
  const schedaBody = document.getElementById("scheda-body");
  if (schedaBody) schedaBody.addEventListener("click", e => {
    if (e.target.closest("#pd-aggiungi-obiettivo")) { if (typeof apriFormObiettivo === "function") apriFormObiettivo(); return; }
    const mod = e.target.closest("[data-obiettivo]");
    if (mod && typeof apriFormObiettivo === "function") { apriFormObiettivo(mod.dataset.obiettivo); return; }
    if (e.target.closest("#pd-stampa-btn")) { if (typeof stampaScheda === "function") stampaScheda(); return; }
    if (e.target.closest("#pd-copia-prompt")) { if (typeof copiaPromptAI === "function") copiaPromptAI(); return; }
  });
  const obSalva = document.getElementById("ob-salva");
  if (obSalva && typeof confermaFormObiettivo === "function") obSalva.addEventListener("click", confermaFormObiettivo);
  const obElimina = document.getElementById("ob-elimina");
  if (obElimina && typeof eliminaObiettivoCorrente === "function") obElimina.addEventListener("click", eliminaObiettivoCorrente);
  const obChiudi = document.getElementById("ob-chiudi");
  if (obChiudi && typeof chiudiFormObiettivo === "function") obChiudi.addEventListener("click", chiudiFormObiettivo);

  /* -------- DEBRIEF POSSESSI (sperimentale) -------- */
  const apriDeb = document.getElementById("apri-debrief");
  if (apriDeb && typeof apriDebrief === "function") apriDeb.addEventListener("click", apriDebrief);
  const debIndietro = document.getElementById("debrief-indietro");
  if (debIndietro) debIndietro.addEventListener("click", () => navigaA("squadra"));
  const debGaraSel = document.getElementById("debrief-gara-sel");
  if (debGaraSel && typeof cambiaGaraDebrief === "function")
    debGaraSel.addEventListener("change", e => cambiaGaraDebrief(e.target.value));
  const debQuarti = document.getElementById("debrief-quarti");
  if (debQuarti) debQuarti.addEventListener("click", e => {
    const b = e.target.closest("button[data-quarto]");
    if (b && typeof cambiaQuartoDebrief === "function") cambiaQuartoDebrief(b.dataset.quarto);
  });
  document.querySelectorAll("#debrief-tabs button").forEach(b =>
    b.addEventListener("click", () => {
      possTab = b.dataset.dtab;
      if (typeof renderDebrief === "function") renderDebrief();
    }));
  const debFotoInput = document.getElementById("debrief-foto-input");
  if (debFotoInput) debFotoInput.addEventListener("change", e => {
    if (typeof gestisciFotoSelezionata === "function") gestisciFotoSelezionata(e.target.files[0]);
    e.target.value = "";
  });
  const debBody = document.getElementById("debrief-body");
  if (debBody) debBody.addEventListener("click", e => {
    const t = e.target;
    const numBtn = t.closest(".ps-num");
    if (numBtn) { possRigaTmp.giocatore_num = numBtn.dataset.num; renderDebrief(); return; }
    const esBtn = t.closest(".ps-esito[data-esito]");
    if (esBtn) { possRigaTmp.esito = (possRigaTmp.esito === esBtn.dataset.esito ? "" : esBtn.dataset.esito); renderDebrief(); return; }
    const togAttr = t.closest(".ps-tog[data-attrib]");
    if (togAttr) { const k = togAttr.dataset.attrib; possRigaTmp[k] = !possRigaTmp[k]; renderDebrief(); return; }
    const togTiro = t.closest(".ps-tog[data-tiro]");
    if (togTiro) { const v = togTiro.dataset.tiro; possRigaTmp.tiro = (possRigaTmp.tiro === v ? "" : v); renderDebrief(); return; }
    const chipG = t.closest(".ps-chip[data-gioco]");
    if (chipG) { possRigaTmp.gioco = (possRigaTmp.gioco === chipG.dataset.gioco ? "" : chipG.dataset.gioco); renderDebrief(); return; }
    if (t.closest("#ps-gioco-add") || t.closest("#ps-gioco-add2")) {
      if (typeof aggiungiCodiceLegenda === "function") aggiungiCodiceLegenda(); return;
    }
    if (t.closest("#ps-aggiungi")) { if (typeof aggiungiRigaDebrief === "function") aggiungiRigaDebrief(); return; }
    if (t.closest("#ps-salva-quarto")) { if (typeof salvaQuartoDebrief === "function") salvaQuartoDebrief(); return; }
    if (t.closest("#ps-foto-scatta") || t.closest("#ps-foto-cambia")) {
      const inp = document.getElementById("debrief-foto-input"); if (inp) inp.click(); return;
    }
    if (t.closest("#ps-leggi-foglio")) { if (typeof leggiFoglioPossessi === "function") leggiFoglioPossessi(); return; }
    const editBtn = t.closest(".ps-riga-testo[data-edit]");
    if (editBtn) { if (typeof modificaRigaDebrief === "function") modificaRigaDebrief(+editBtn.dataset.edit); return; }
    const delBtn = t.closest(".ps-del[data-i]");
    if (delBtn) { if (typeof rimuoviRigaDebrief === "function") rimuoviRigaDebrief(+delBtn.dataset.i); return; }
    const rmLeg = t.closest(".ps-del[data-rm]");
    if (rmLeg) { if (typeof rimuoviCodiceLegenda === "function") rimuoviCodiceLegenda(rmLeg.dataset.rm); return; }
  });

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
      statsTargetId = null;
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
  const statsCtrl = document.getElementById("stats-controlli");
  if (statsCtrl) statsCtrl.addEventListener("click", e => {
    const per = e.target.closest("[data-periodo]");
    if (per) { statsPeriodo = per.dataset.periodo; renderStats(); return; }
    const fmt = e.target.closest("[data-fmt]");
    if (fmt) { statsFmt = fmt.dataset.fmt; renderStats(); }
  });

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

  /* -------- Hint una-tantum: telefono ruotato = niente nav, si ruota per navigare -------- */
  try {
    const mqL = window.matchMedia("(orientation: landscape) and (pointer: coarse)");
    const hintLandscape = () => {
      if (!mqL.matches || localStorage.getItem("bsp_hint_landscape")) return;
      if (typeof mostraToast === "function") mostraToast("Ruota in verticale per cambiare schermata");
      try { localStorage.setItem("bsp_hint_landscape", "1"); } catch (e) {}
    };
    mqL.addEventListener ? mqL.addEventListener("change", hintLandscape) : mqL.addListener(hintLandscape);
    setTimeout(hintLandscape, 1200);
  } catch (e) {}

  /* -------- AVVIO -------- */
  if (typeof inizializzaTema === "function") inizializzaTema();     // tema chiaro/arena + switch
  navigaA("partita");          // vista di default
  if (typeof renderCalendario === "function") renderCalendario();  // lista partite (cache/seed)
  if (typeof scaricaPartite === "function") scaricaPartite();      // sync calendario dal foglio
  if (typeof scaricaGiocatori === "function") scaricaGiocatori();  // sync anagrafica dal foglio
  inizializzaPinGate();        // mostra pin gate o app direttamente
  processaCoda();              // tentativo invio eventi in coda
});

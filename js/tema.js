/* ==========================================================================
   tema.js — Tema Chiaro (default) / Arena (scuro).
   Preferenza salvata sul DEVICE (bsp_tema): un display setting, non un dato
   d'account — lo stesso utente vuole chiaro a casa e scuro in palestra.
   L'applicazione PRIMA del paint è nello <script> inline di index.html
   (evita il flash). Qui: lettura, toggle e persistenza.
   ========================================================================== */
function temaCorrente() {
  try { return localStorage.getItem(STORAGE_KEYS.tema) === "arena" ? "arena" : "chiaro"; }
  catch (e) { return "chiaro"; }
}

function applicaTema(t) {
  const arena = t === "arena";
  document.documentElement.dataset.tema = arena ? "arena" : "chiaro";
  try { localStorage.setItem(STORAGE_KEYS.tema, arena ? "arena" : "chiaro"); } catch (e) {}

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", arena ? "#0A0F1C" : "#1E3C8C");

  const chk = document.getElementById("switch-arena");
  if (chk) chk.checked = arena;
}

function inizializzaTema() {
  applicaTema(temaCorrente());
  const chk = document.getElementById("switch-arena");
  if (chk) {
    chk.addEventListener("change", () => {
      applicaTema(chk.checked ? "arena" : "chiaro");
      if (typeof mostraToast === "function")
        mostraToast(chk.checked ? "Arena mode attiva" : "Tema chiaro");
    });
  }
}

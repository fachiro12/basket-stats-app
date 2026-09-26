/* ==========================================================================
   permessi.js — Ruolo "Lettura": blocca davvero ogni scrittura per l'account,
   non solo un'etichetta. Stesso identico stile del gate Admin già esistente
   in js/calendario.js (`ruolo !== "Admin"` → toast + return), applicato qui
   in modo condiviso.

   Gate al funnel più basso di ogni dominio (upsert.../rimuovi.../salva...Cloud,
   registraEvento), non a ogni singolo bottone: blocca la mutazione LOCALE
   (localStorage) e la sync cloud in un colpo solo — vedi ogni chiamata a
   bloccaScrittura() sparsa nei vari file per il dettaglio.

   Difesa vera lato server: verificaLogin_ (backend V4.16) restituisce un
   token vuoto a un utente "Lettura" — il controllo WRITE_TOKEN già esistente
   in doPost rifiuta ogni suo POST. Questo file è la difesa lato client (UX
   pulita: niente "sembra salvato" che poi sparisce al refresh) + difesa in
   profondità (js/api.js) nel caso un futuro punto di scrittura dimentichi
   la guardia locale.
   ========================================================================== */

function soloLettura() {
  const u = (typeof utenteCorrente === "function") ? utenteCorrente() : null;
  return !!(u && u.ruolo === "Lettura");
}

function bloccaScrittura() {
  if (!soloLettura()) return false;
  if (typeof mostraToast === "function") mostraToast("Account di sola lettura — azione non disponibile");
  return true;
}

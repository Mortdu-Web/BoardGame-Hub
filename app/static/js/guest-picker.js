/**
 * guest-picker.js — modal de choix d'un joueur du compte générique « jeux ».
 *
 * Script classique (pas un module) : expose window.GuestPicker.
 *   const joueur = await GuestPicker.open();   // {id, prenom, nom} ou null si annulé
 *
 * Utilise l'URL globale GUESTS_URL (GET = liste, POST = création), injectée par baseScore.html.
 * Le <dialog> est construit à la première ouverture : aucune modification de gabarit nécessaire.
 */
(function () {
  "use strict";

  let dialog = null;
  let finish = null; // résout la promesse en cours

  const el = (tag, props = {}, ...children) => {
    const node = Object.assign(document.createElement(tag), props);
    children.forEach(c => node.append(c));
    return node;
  };

  function build() {
    const list     = el("ul", { className: "gp-list" });
    const empty    = el("p",  { className: "gp-empty", textContent: "Aucun joueur pour l'instant." });
    const error    = el("p",  { className: "gp-error", hidden: true, role: "alert" });
    const btnNew   = el("button", { type: "button", className: "gp-new", textContent: "+ Nouveau joueur" });
    const btnClose = el("button", { type: "button", className: "gp-close", textContent: "✕", ariaLabel: "Fermer" });
    const prenom   = el("input", { type: "text", name: "prenom", placeholder: "Prénom", autocomplete: "off", required: true });
    const nom      = el("input", { type: "text", name: "nom",    placeholder: "Nom",    autocomplete: "off", required: true });
    const submit   = el("button", { type: "submit", className: "btn-primary", textContent: "Créer et choisir" });
    const cancel   = el("button", { type: "button", className: "btn-secondary", textContent: "Annuler" });
    const form     = el("form", { className: "gp-form", hidden: true },
      el("div", { className: "gp-fields" }, prenom, nom),
      el("div", { className: "gp-actions" }, cancel, submit),
    );

    const dlg = el("dialog", { className: "guest-picker" },
      el("div", { className: "gp-header" }, el("h2", { textContent: "Quel joueur ?" }), btnClose),
      el("div", { className: "gp-body" }, list, empty, error, btnNew, form),
    );
    dlg._ui = { list, empty, error, btnNew, form, prenom, nom, submit };

    btnClose.addEventListener("click", () => close(null));
    cancel.addEventListener("click", () => {
      form.hidden = true;
      btnNew.hidden = false;
      error.hidden = true;
    });
    btnNew.addEventListener("click", () => {
      form.hidden = false;
      btnNew.hidden = true;
      prenom.focus();
    });
    // Clic sur le fond (hors boîte) = annuler
    dlg.addEventListener("click", e => { if (e.target === dlg) close(null); });
    // Échap
    dlg.addEventListener("cancel", e => { e.preventDefault(); close(null); });

    form.addEventListener("submit", async e => {
      e.preventDefault();
      showError("");
      submit.disabled = true;
      try {
        const resp = await fetch(GUESTS_URL, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ prenom: prenom.value, nom: nom.value }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data.error || "Impossible de créer le joueur.");
        close(data);
      } catch (err) {
        showError(err.message);
      } finally {
        submit.disabled = false;
      }
    });

    document.body.appendChild(dlg);
    return dlg;
  }

  function showError(msg) {
    const { error } = dialog._ui;
    error.textContent = msg;
    error.hidden = !msg;
  }

  function close(value) {
    if (dialog.open) dialog.close();
    if (finish) { const f = finish; finish = null; f(value); }
  }

  function renderGuests(guests) {
    const { list, empty } = dialog._ui;
    list.innerHTML = "";
    guests.forEach(g => {
      const btn = el("button", { type: "button", className: "gp-item", textContent: `${g.prenom} ${g.nom}` });
      btn.addEventListener("click", () => close(g));
      list.appendChild(el("li", {}, btn));
    });
    empty.hidden = guests.length > 0;
  }

  async function open() {
    if (!dialog) dialog = build();
    if (finish) return Promise.resolve(null); // déjà ouvert

    const { form, btnNew, prenom, nom } = dialog._ui;
    form.hidden = true;
    btnNew.hidden = false;
    prenom.value = nom.value = "";
    showError("");
    renderGuests([]);

    const promise = new Promise(resolve => { finish = resolve; });
    dialog.showModal();

    try {
      const resp = await fetch(GUESTS_URL);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      renderGuests(await resp.json());
    } catch (e) {
      showError(`Impossible de charger les joueurs : ${e.message}`);
    }
    return promise;
  }

  window.GuestPicker = { open };
})();

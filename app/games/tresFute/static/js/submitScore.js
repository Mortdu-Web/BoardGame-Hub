/* ═══════════════════════════════════════════════════════════════
   submitScore.js — Envoi du score au serveur — Très Futé

   Ouvre une modale permettant de choisir (ou créer) un joueur et une
   partie, affiche le score courant (calculé par calculScore.js) et
   l'envoie au serveur via l'API du blueprint tresFute.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const btnOuvrir  = document.getElementById('btn-envoyer-score');
  const overlay    = document.getElementById('tf-modal-overlay');
  const btnFermer  = document.getElementById('tf-modal-close');
  const btnAnnuler = document.getElementById('tf-modal-cancel');
  const form       = document.getElementById('tf-modal-form');
  const btnValider = document.getElementById('tf-modal-submit');

  const selectJoueur   = document.getElementById('tf-select-joueur');
  const champsNvJoueur = document.getElementById('tf-new-joueur-fields');
  const inputPrenom    = document.getElementById('tf-new-joueur-prenom');
  const inputNom       = document.getElementById('tf-new-joueur-nom');

  const selectPartie      = document.getElementById('tf-select-partie');
  const champsNvPartie    = document.getElementById('tf-new-partie-fields');
  const inputNbJoueurs    = document.getElementById('tf-new-partie-nb-joueurs');

  const inputScore   = document.getElementById('tf-modal-score');
  const zoneErreur   = document.getElementById('tf-modal-error');

  if (!btnOuvrir || !overlay) return;

  // Base de l'API : la page est servie sur .../jeux/tresFute/game
  // → on retire "/game" pour obtenir .../jeux/tresFute
  const API_BASE = window.location.pathname.replace(/\/game\/?$/, '');

  /* ── Helpers ──────────────────────────────────────────────── */

  function afficherErreur(msg) {
    zoneErreur.textContent = msg;
    zoneErreur.hidden = false;
  }

  function cacherErreur() {
    zoneErreur.hidden = true;
    zoneErreur.textContent = '';
  }

  function scoreActuel() {
    if (window.tresFuteScore && typeof window.tresFuteScore.calculerScores === 'function') {
      return window.tresFuteScore.calculerScores().total;
    }
    const el = document.getElementById('score-total');
    return el ? (parseInt(el.textContent, 10) || 0) : 0;
  }

  function viderOptions(select) {
    [...select.options].forEach((opt) => {
      if (opt.value !== '' && opt.value !== '__new__') opt.remove();
    });
  }

  function optionNouveau(select) {
    return select.querySelector('option[value="__new__"]');
  }

  /* ── Chargement des listes ────────────────────────────────── */

  async function chargerJoueurs() {
    const res = await fetch(`${API_BASE}/api/joueurs`);
    if (!res.ok) throw new Error("Impossible de charger la liste des joueurs.");
    const joueurs = await res.json();

    viderOptions(selectJoueur);
    joueurs
      .slice()
      .sort((a, b) => `${a.nom}${a.prenom}`.localeCompare(`${b.nom}${b.prenom}`))
      .forEach((j) => {
        const opt = document.createElement('option');
        opt.value = String(j.id);
        opt.textContent = `${j.prenom} ${j.nom}`;
        selectJoueur.insertBefore(opt, optionNouveau(selectJoueur));
      });
  }

  async function chargerParties() {
    const res = await fetch(`${API_BASE}/api/parties`);
    if (!res.ok) throw new Error("Impossible de charger la liste des parties.");
    const parties = await res.json();

    viderOptions(selectPartie);
    parties.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = String(p.id);
      opt.textContent = `Partie #${p.id} (${p.nb_scores}/${p.nb_joueurs} joueurs)`;
      selectPartie.insertBefore(opt, optionNouveau(selectPartie));
    });
  }

  /* ── Ouverture / fermeture de la modale ──────────────────────*/

  async function ouvrirModale() {
    cacherErreur();
    form.reset();
    champsNvJoueur.hidden = true;
    champsNvPartie.hidden = true;
    inputScore.value = scoreActuel();

    overlay.hidden = false;
    btnValider.disabled = true;
    btnValider.textContent = 'Chargement…';

    try {
      await Promise.all([chargerJoueurs(), chargerParties()]);
    } catch (err) {
      afficherErreur(err.message);
    } finally {
      btnValider.disabled = false;
      btnValider.textContent = 'Valider';
    }
  }

  function fermerModale() {
    overlay.hidden = true;
  }

  selectJoueur.addEventListener('change', () => {
    const nouveau = selectJoueur.value === '__new__';
    champsNvJoueur.hidden = !nouveau;
  });

  selectPartie.addEventListener('change', () => {
    const nouvelle = selectPartie.value === '__new__';
    champsNvPartie.hidden = !nouvelle;
  });

  btnOuvrir.addEventListener('click', ouvrirModale);
  btnFermer.addEventListener('click', fermerModale);
  btnAnnuler.addEventListener('click', fermerModale);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) fermerModale();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden) fermerModale();
  });

  /* ── Résolution joueur / partie (existant ou création) ──────*/

  async function resoudreJoueurId() {
    if (selectJoueur.value === '__new__') {
      const prenom = inputPrenom.value.trim();
      const nom = inputNom.value.trim();
      if (!prenom || !nom) {
        throw new Error('Merci de renseigner le prénom et le nom du nouveau joueur.');
      }

      const res = await fetch(`${API_BASE}/api/joueurs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prenom, nom }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Impossible de créer le joueur.');
      return data.id;
    }

    if (!selectJoueur.value) throw new Error('Merci de choisir un joueur.');
    return parseInt(selectJoueur.value, 10);
  }

  async function resoudrePartieId() {
    if (selectPartie.value === '__new__') {
      const nbJoueurs = parseInt(inputNbJoueurs.value, 10);
      if (!Number.isInteger(nbJoueurs) || nbJoueurs < 1) {
        throw new Error('Merci de renseigner le nombre de joueurs de la nouvelle partie.');
      }

      const res = await fetch(`${API_BASE}/api/parties`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nb_joueurs: nbJoueurs }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Impossible de créer la partie.');
      return data.id;
    }

    if (!selectPartie.value) throw new Error('Merci de choisir une partie.');
    return parseInt(selectPartie.value, 10);
  }

  /* ── Soumission du formulaire ────────────────────────────────*/

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    cacherErreur();
    btnValider.disabled = true;
    btnValider.textContent = 'Envoi…';

    try {
      const joueur_id = await resoudreJoueurId();
      const partie_id = await resoudrePartieId();
      const score = scoreActuel();

      const res = await fetch(`${API_BASE}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ joueur_id, partie_id, score }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Échec de l'envoi du score.");

      fermerModale();
      afficherConfirmation();
    } catch (err) {
      afficherErreur(err.message);
    } finally {
      btnValider.disabled = false;
      btnValider.textContent = 'Valider';
    }
  });

  /* ── Petit retour visuel après succès ────────────────────────*/

  function afficherConfirmation() {
    const toast = document.createElement('div');
    toast.textContent = '✅ Score envoyé avec succès';
    toast.style.cssText = `
      position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
      background: #1e5030; border: 1px solid #4fae7a; color: #d0ffe6;
      padding: 10px 18px; border-radius: 8px; font-size: 0.9rem;
      box-shadow: 0 6px 18px rgba(0,0,0,0.4); z-index: 1100;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  }
})();
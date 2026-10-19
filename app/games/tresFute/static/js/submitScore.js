/* ═══════════════════════════════════════════════════════════════
   submitScore.js — Envoi du score au serveur — Très Futé

   Ouvre une modale permettant de choisir un joueur et une partie
   (ou de créer une partie), affiche le score courant (calculé par
   calculScore.js) et l'envoie au serveur via l'API du blueprint tresFute.

   Joueur :
   - compte Keycloak « jeux » (partagé) : liste de ses joueurs + création
     d'un nouveau joueur (prénom, nom) ;
   - autre compte : liste des utilisateurs Keycloak, son propre joueur
     est présélectionné ; l'entrée « jeux » ouvre le modal de choix d'un
     joueur de « jeux » (guest-picker.js).
   PLAYERS_URL, PLAYER_ME_URL et GUESTS_URL sont injectés par baseScore.html.
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

  const GENERIC_VALUE = '__generic__';
  let precedent = '';

  function ajouterOptionJoueur(j, avantGenerique = false) {
    const opt = document.createElement('option');
    opt.value = String(j.id);
    opt.textContent = `${j.prenom} ${j.nom}`;
    const generique = avantGenerique && selectJoueur.querySelector(`option[value="${GENERIC_VALUE}"]`);
    selectJoueur.insertBefore(opt, generique || null);
    return opt;
  }

  async function chargerJoueurs() {
    // Qui est connecté ? (échec toléré : on se comporte comme un compte ordinaire)
    let moi = {};
    try {
      const r = await fetch(PLAYER_ME_URL);
      if (r.ok) moi = await r.json();
    } catch (_) { /* ignoré */ }

    // On repart d'un select vide (placeholder uniquement)
    [...selectJoueur.options].forEach((opt) => { if (opt.value !== '') opt.remove(); });

    if (moi.generic) {
      // Compte « jeux » : ses joueurs + création d'un nouveau
      const res = await fetch(GUESTS_URL);
      if (!res.ok) throw new Error("Impossible de charger la liste des joueurs.");
      (await res.json()).forEach((j) => ajouterOptionJoueur(j));

      const nouveau = document.createElement('option');
      nouveau.value = '__new__';
      nouveau.textContent = '➕ Nouveau joueur…';
      selectJoueur.appendChild(nouveau);
    } else {
      // Compte ordinaire : utilisateurs Keycloak (+ entrée « jeux » → choix d'un de ses joueurs)
      const res = await fetch(PLAYERS_URL);
      if (!res.ok) throw new Error("Impossible de charger la liste des joueurs.");
      (await res.json()).forEach((j) => {
        if (j.generic) {
          const opt = document.createElement('option');
          opt.value = GENERIC_VALUE;
          opt.textContent = `${j.prenom} (choisir un joueur…)`;
          selectJoueur.appendChild(opt);
        } else {
          ajouterOptionJoueur(j);
        }
      });
      if (moi.joueur && moi.joueur.id != null && selectJoueur.querySelector(`option[value="${moi.joueur.id}"]`)) {
        selectJoueur.value = String(moi.joueur.id); // présélection de son propre joueur
      }
    }
    precedent = selectJoueur.value;
  }

  async function chargerParties() {
    const res = await fetch(`${API_BASE}/api/parties`);
    if (!res.ok) throw new Error("Impossible de charger la liste des parties.");
    const parties = await res.json();

    viderOptions(selectPartie);
    parties.filter((p) => p.nb_scores < p.nb_joueurs).forEach((p) => { // parties completes exclues
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

  selectJoueur.addEventListener('change', async () => {
    if (selectJoueur.value === GENERIC_VALUE) {
      // Entrée « jeux » : choisir (ou créer) un de ses joueurs dans le modal
      const joueur = await window.GuestPicker?.open();
      if (joueur) {
        const opt = selectJoueur.querySelector(`option[value="${joueur.id}"]`)
          || ajouterOptionJoueur(joueur, true);
        selectJoueur.value = opt.value;
      } else {
        selectJoueur.value = precedent;
      }
    }
    precedent = selectJoueur.value;
    champsNvJoueur.hidden = selectJoueur.value !== '__new__';
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

      const res = await fetch(GUESTS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prenom, nom }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Impossible de créer le joueur.');
      return data.id;
    }

    if (!selectJoueur.value || selectJoueur.value === GENERIC_VALUE) throw new Error('Merci de choisir un joueur.');
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
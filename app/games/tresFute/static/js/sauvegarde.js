/* ═══════════════════════════════════════════════════════════════
   sauvegarde.js — Sauvegarde locale automatique — Très Futé

   Sauvegarde l'état complet de la fiche (cases + dés) dans le
   localStorage du navigateur :

   - Survit à un rechargement de page ET à l'ouverture de la page
     dans un autre onglet (localStorage est partagé pour tout le
     site, contrairement à sessionStorage).
   - Expire automatiquement 1h après la DERNIÈRE modification
     (fenêtre glissante : toute interaction relance le compte à
     rebours). Si l'onglet reste ouvert et inactif, la sauvegarde
     s'efface d'elle-même sans qu'il soit nécessaire de recharger.
   - S'efface immédiatement si l'utilisateur clique sur le bouton
     de réinitialisation (#btn-reset-sauvegarde).

   Ne dépend pas d'un ordre de rendu particulier : s'appuie sur les
   API publiques exposées par Case.js (coche/decoche/setEtat/
   setValeur) et sur l'attribut `value`/`color` de Dice.js.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const CLE_STOCKAGE      = 'tresFute:sauvegarde:v1';
  const DUREE_VALIDITE_MS = 60 * 60 * 1000; // 1 heure

  let timerExpiration = null;

  /* ── Capture de l'état courant ────────────────────────────── */

  // Chaque <case-fute> de la fiche est capturée dans l'ordre du DOM.
  // Le template étant statique (toujours le même nombre de cases dans
  // le même ordre), cet ordre sert d'identifiant stable d'un
  // chargement à l'autre.
  function capturerEtatCases() {
    const cases = [...document.querySelectorAll('#tf-sheet case-fute')];
    return cases.map((c) => {
      if (c.hasAttribute('entourable')) {
        return { type: 'entourable', etat: typeof c.etat === 'number' ? c.etat : 0 };
      }
      if (c.hasAttribute('modifiable')) {
        return { type: 'modifiable', valeur: c.valeur ?? null };
      }
      if (c.hasAttribute('cochable')) {
        return { type: 'cochable', cochee: !!c.estCochee };
      }
      // Case fixe (pré-cochée en dur ou cellule vide) : rien à sauvegarder.
      return { type: 'fixe' };
    });
  }

  // Les dés peuvent se déplacer entre 3 zones (active / mis de côté /
  // sélectionné). On les identifie par leur couleur (stable et unique)
  // plutôt que par leur position dans le DOM, qui change justement
  // quand on les déplace.
  function capturerEtatDes() {
    const des = [...document.querySelectorAll('#tf-dice-zone jeu-dice')];
    const etatDes = {};
    des.forEach((d) => {
      const couleur = d.getAttribute('color') || 'default';
      const zoneEl = d.closest('#dice-active, #dice-aside, #dice-selected');
      let zone = 'active';
      if (zoneEl) {
        if (zoneEl.id === 'dice-aside') zone = 'aside';
        else if (zoneEl.id === 'dice-selected') zone = 'selected';
      }
      const brut = d.getAttribute('value');
      etatDes[couleur] = {
        zone,
        valeur: brut !== null ? parseInt(brut, 10) : null,
      };
    });
    return etatDes;
  }

  function capturerEtat() {
    return {
      horodatage: Date.now(),
      cases: capturerEtatCases(),
      des: capturerEtatDes(),
    };
  }

  /* ── Application d'un état sauvegardé ─────────────────────── */

  function appliquerEtatCases(casesSauvegarde) {
    if (!Array.isArray(casesSauvegarde)) return;
    const cases = [...document.querySelectorAll('#tf-sheet case-fute')];
    cases.forEach((c, i) => {
      const info = casesSauvegarde[i];
      if (!info) return;

      if (info.type === 'entourable' && typeof c.setEtat === 'function') {
        c.setEtat(info.etat);
      } else if (info.type === 'modifiable' && typeof c.setValeur === 'function') {
        c.setValeur(info.valeur);
      } else if (info.type === 'cochable') {
        if (info.cochee) c.coche();
        else c.decoche();
      }
    });
  }

  function mettreAJourVisibiliteDes() {
    const aside          = document.getElementById('dice-aside');
    const asideWrapper    = document.getElementById('dice-aside-wrapper');
    const selectedZone    = document.getElementById('dice-selected');
    const selectedWrapper = document.getElementById('dice-selected-wrapper');
    if (aside && asideWrapper) {
      asideWrapper.hidden = aside.querySelectorAll('jeu-dice').length === 0;
    }
    if (selectedZone && selectedWrapper) {
      selectedWrapper.hidden = selectedZone.querySelectorAll('jeu-dice').length === 0;
    }
  }

  function appliquerEtatDes(desSauvegarde) {
    if (!desSauvegarde) return;
    const zones = {
      active:   document.getElementById('dice-active'),
      aside:    document.getElementById('dice-aside'),
      selected: document.getElementById('dice-selected'),
    };
    if (!zones.active) return;

    document.querySelectorAll('#tf-dice-zone jeu-dice').forEach((d) => {
      const couleur = d.getAttribute('color') || 'default';
      const info = desSauvegarde[couleur];
      if (!info) return;

      if (info.valeur !== null && !Number.isNaN(info.valeur)) {
        d.setAttribute('value', info.valeur);
      } else {
        d.removeAttribute('value');
      }

      const cible = zones[info.zone] || zones.active;
      cible.appendChild(d);
    });

    mettreAJourVisibiliteDes();
  }

  function appliquerEtat(etat) {
    appliquerEtatCases(etat.cases);
    appliquerEtatDes(etat.des);

    // Recalcule les scores + bonus débloqués à partir de l'état restauré.
    if (window.tresFuteScore && typeof window.tresFuteScore.afficherScores === 'function') {
      window.tresFuteScore.afficherScores();
    }
  }

  /* ── Lecture / écriture / suppression du stockage ────────────*/

  function lireSauvegarde() {
    let brut;
    try {
      brut = localStorage.getItem(CLE_STOCKAGE);
    } catch (err) {
      return null; // localStorage indisponible (navigation privée stricte, etc.)
    }
    if (!brut) return null;

    let etat;
    try {
      etat = JSON.parse(brut);
    } catch (err) {
      effacerSauvegarde();
      return null;
    }

    const age = Date.now() - (etat.horodatage || 0);
    if (!etat.horodatage || age > DUREE_VALIDITE_MS) {
      effacerSauvegarde();
      return null;
    }
    return etat;
  }

  function ecrireSauvegarde() {
    try {
      localStorage.setItem(CLE_STOCKAGE, JSON.stringify(capturerEtat()));
    } catch (err) {
      // Quota dépassé ou stockage indisponible : on continue sans bloquer l'utilisateur.
    }
    planifierExpiration(DUREE_VALIDITE_MS);
  }

  function effacerSauvegarde() {
    try {
      localStorage.removeItem(CLE_STOCKAGE);
    } catch (err) { /* ignore */ }
    if (timerExpiration) {
      clearTimeout(timerExpiration);
      timerExpiration = null;
    }
  }

  // Programme la suppression automatique de la sauvegarde après `delaiMs`,
  // même si l'onglet reste ouvert sans interaction ni rechargement.
  function planifierExpiration(delaiMs) {
    if (timerExpiration) clearTimeout(timerExpiration);
    timerExpiration = setTimeout(effacerSauvegarde, Math.max(0, delaiMs));
  }

  /* ── Sauvegarde automatique sur interaction ──────────────────*/

  let sauvegardePlanifiee = false;
  function planifierSauvegarde() {
    if (sauvegardePlanifiee) return;
    sauvegardePlanifiee = true;
    requestAnimationFrame(() => {
      sauvegardePlanifiee = false;
      ecrireSauvegarde();
    });
  }

  function initSauvegardeAuto() {
    const feuille = document.getElementById('tf-sheet');
    if (feuille) {
      feuille.addEventListener('click', planifierSauvegarde, true);
      feuille.addEventListener('input', planifierSauvegarde, true);
      feuille.addEventListener('change', planifierSauvegarde, true);
    }

    const zoneDes = document.getElementById('tf-dice-zone');
    if (zoneDes) {
      zoneDes.addEventListener('click', planifierSauvegarde, true);
      // dice-roll est émis (avec bubbling) une fois l'animation de lancer
      // terminée : on sauvegarde la valeur finale, pas la valeur intermédiaire.
      zoneDes.addEventListener('dice-roll', planifierSauvegarde, true);
    }
  }

  /* ── Bouton de réinitialisation ───────────────────────────────*/

  function initBoutonReset() {
    const btn = document.getElementById('btn-reset-sauvegarde');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const confirme = window.confirm(
        'Réinitialiser complètement la fiche ? Cette action est irréversible.'
      );
      if (!confirme) return;
      effacerSauvegarde();
      window.location.reload();
    });
  }

  /* ── Initialisation ───────────────────────────────────────────*/

  function initialiser() {
    const sauvegarde = lireSauvegarde();
    if (sauvegarde) {
      appliquerEtat(sauvegarde);
      // On respecte le temps déjà écoulé plutôt que de relancer 1h complète
      // simplement parce que la page a été rouverte sans interaction.
      planifierExpiration(DUREE_VALIDITE_MS - (Date.now() - sauvegarde.horodatage));
    }
    initSauvegardeAuto();
    initBoutonReset();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialiser);
  } else {
    initialiser();
  }
})();
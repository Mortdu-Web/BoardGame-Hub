/* ═══════════════════════════════════════════════════════════════
   calculScore.js — Calcul et affichage des scores — Très Futé
   ═══════════════════════════════════════════════════════════════

   S'appuie sur l'API publique exposée par Case.js :
   - caseEl.estCochee  → true si la case (cochable ou pré-cochée) est cochée
   - caseEl.etat       → pour une case "entourable" : 0 = rien | 1 = entourée | 2 = cochée
   - caseEl.valeur     → nombre saisi dans une case "modifiable" (ou null)
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── Tableaux de score ─────────────────────────────────────── */
  const TABLE_BLEUE = [1, 2, 4, 7, 11, 16, 22, 29, 37, 46, 56];
  const TABLE_VERTE = [1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 66];

  /* ── Helpers d'état ────────────────────────────────────────── */

  // Une case est "cochée" (cochable cochée, ou pré-cochée en dur dans le HTML).
  function estCochee(caseEl) {
    if (!caseEl) return false;
    if (typeof caseEl.estCochee === 'boolean') return caseEl.estCochee;
    return caseEl.hasAttribute('cochee'); // repli si l'élément n'est pas encore "upgradé"
  }

  // Une case "entourable" est entourée (état 1, distinct de "cochée" = état 2).
  function estEntouree(caseEl) {
    if (!caseEl) return false;
    if (typeof caseEl.etat === 'number') return caseEl.etat === 1;
    const div = caseEl.querySelector('.case');
    return !!div && div.classList.contains('case--entouree');
  }

  // Lit la valeur numérique saisie dans une case "modifiable".
  function valeurModifiable(caseEl) {
    if (!caseEl) return 0;
    if ('valeur' in caseEl) {
      const v = caseEl.valeur;
      return v === null || v === undefined ? 0 : v;
    }
    const input = caseEl.querySelector('input');
    if (input) {
      const v = parseFloat(input.value);
      return Number.isNaN(v) ? 0 : v;
    }
    return 0;
  }

  // Compte les <case-fute> cochées, enfants directs d'un conteneur.
  function compterCochees(container) {
    if (!container) return 0;
    return [...container.querySelectorAll(':scope > case-fute')].filter(estCochee).length;
  }

  // true si l'élément est une vraie case de jeu (pas une cellule de
  // remplissage vide dans une grille).
  function estCaseReelle(el) {
    return !!el && (
      el.hasAttribute('cochable') ||
      el.hasAttribute('cochee') ||
      el.hasAttribute('entourable') ||
      el.hasAttribute('modifiable')
    );
  }

  // true si une case "modifiable" contient une valeur saisie.
  function aUneValeur(caseEl) {
    if (!caseEl) return false;
    if ('valeur' in caseEl) return caseEl.valeur !== null && caseEl.valeur !== undefined;
    const input = caseEl.querySelector('input');
    if (input) return input.value.trim() !== '';
    return (caseEl.textContent || '').trim() !== '';
  }

  /* ── Bonus débloqués mais pas encore utilisés ────────────────
     On ajoute/enlève la classe "bonus-disponible" (stylée en CSS)
     sur chaque case bonus (+1, image, 🔄…) dès que sa condition de
     déblocage est remplie et qu'elle n'a pas encore été cochée.  */

  function marquerBonus(bonusEl, disponible) {
    if (!bonusEl) return;
    bonusEl.classList.toggle('bonus-disponible', !!disponible);
  }

  // true si l'élément est une case-bonus "interactive" (cochable ou
  // entourable — ce qui inclut les renards) — par opposition à une
  // cellule de remplissage vide ou à une étiquette purement textuelle
  // (ex. "x2", "3j").
  function estBonusActionnable(caseEl) {
    return !!caseEl && (caseEl.hasAttribute('cochable') || caseEl.hasAttribute('entourable'));
  }

  // true si une case-bonus a déjà été "utilisée" par le joueur :
  // - cochable  → cochée
  // - entourable (dont les renards) → sortie de l'état "rien" (0)
  function estBonusUtilisee(caseEl) {
    if (!caseEl) return true;
    if (caseEl.hasAttribute('entourable')) {
      if (typeof caseEl.etat === 'number') return caseEl.etat !== 0;
      const div = caseEl.querySelector('.case');
      return !!div && (div.classList.contains('case--entouree') || div.classList.contains('case--cochee'));
    }
    return estCochee(caseEl);
  }

  /* ── Calcul par section ───────────────────────────────────── */

  // Jaune : pour chaque score (10, 14, 16, 20), toutes les cases
  // de la colonne au-dessus doivent être cochées.
  function calculerScoreJaune() {
    const grille = document.querySelector('.tf-yellow-grid');
    if (!grille) return 0;

    const lignes = grille.querySelectorAll('.tf-yellow-row');
    if (lignes.length < 5) return 0;

    const lignesDeCases = [...lignes].slice(0, 4); // 4 lignes de cases à cocher
    const ligneDesScores = lignes[4];               // ligne avec 10 / 14 / 16 / 20
    const casesDeScore = ligneDesScores.querySelectorAll('case-fute');

    let total = 0;
    for (let col = 0; col < 4; col++) {
      const toutesCochees = lignesDeCases.every((ligne) => {
        const cases = ligne.querySelectorAll('case-fute');
        return estCochee(cases[col]);
      });
      if (toutesCochees) {
        const valeur = parseInt((casesDeScore[col]?.textContent || '').trim(), 10);
        if (!Number.isNaN(valeur)) total += valeur;
      }
    }
    return total;
  }

  // Bleu : la grille .tf-blue-grid mélange les 11 cases "valeur" (2 à 12)
  // avec des cases bonus (icônes de couleur, renard, +1, 🔄) qui ne
  // comptent pas dans le total de cases bleues cochées. On ne garde
  // donc que les cases cochables dont le contenu est un nombre pur.
  function compterCocheesBleu() {
    const grille = document.querySelector('.tf-blue-value-container .tf-blue-grid');
    if (!grille) return 0;
    const cases = grille.querySelectorAll(':scope > .tf-blue-row > case-fute[cochable]');
    let n = 0;
    cases.forEach((c) => {
      const contientImage = !!c.querySelector('img');
      const texte = (c.textContent || '').trim();
      if (!contientImage && /^\d+$/.test(texte) && estCochee(c)) n++;
    });
    return n;
  }

  function calculerScoreBleu() {
    const n = compterCocheesBleu();
    if (n <= 0) return 0;
    return TABLE_BLEUE[Math.min(n, TABLE_BLEUE.length) - 1];
  }

  // Vert : la ligne .tf-green-container (≥1 à ≥6) est la vraie ligne
  // de cases à cocher — les 11 cases y sont toutes cochables et
  // comptent directement.
  function calculerScoreVert() {
    const ligne = document.querySelector('.tf-green-container');
    const n = compterCochees(ligne);
    if (n <= 0) return 0;
    return TABLE_VERTE[Math.min(n, TABLE_VERTE.length) - 1];
  }

  // Orange : somme des valeurs saisies.
  function calculerScoreOrange() {
    const container = document.querySelector('.tf-orange-container');
    if (!container) return 0;
    return [...container.querySelectorAll(':scope > case-fute[modifiable]')]
      .reduce((somme, el) => somme + valeurModifiable(el), 0);
  }

  // Violet : somme des valeurs saisies.
  function calculerScoreViolet() {
    const container = document.querySelector('.tf-purple-container');
    if (!container) return 0;
    return [...container.querySelectorAll(':scope > case-fute[modifiable]')]
      .reduce((somme, el) => somme + valeurModifiable(el), 0);
  }

  // Blanc (renards) : chaque case 🦊 entourée (état 1, pas cochée) vaut
  // [nombre de renards entourés] × [score le plus faible parmi les autres couleurs].
  function compterRenardsEntoures() {
    return [...document.querySelectorAll('case-fute.renard[entourable]')].filter(estEntouree).length;
  }

  function calculerScoreBlanc(autresScores) {
    const n = compterRenardsEntoures();
    if (n <= 0) return 0;
    const minimum = Math.min(
      autresScores.jaune,
      autresScores.bleu,
      autresScores.vert,
      autresScores.orange,
      autresScores.violet
    );
    return n * minimum;
  }

  /* ── Déblocage des bonus par section ─────────────────────────── */

  // Jaune : chaque case-image ou renard (colonne 5, lignes 1 à 4) se
  // débloque quand sa ligne (colonnes 1 à 4) est complète. La case "+1"
  // (ligne 5, colonne 5) se débloque quand la diagonale
  // (r1c1, r2c2, r3c3, r4c4) est complète. Chaque score (colonne, ligne
  // 5) se débloque quand sa colonne (lignes 1 à 4) est complète.
  function majBonusJaune() {
    const grille = document.querySelector('.tf-yellow-grid');
    if (!grille) return;
    const lignes = [...grille.querySelectorAll('.tf-yellow-row')];
    if (lignes.length < 5) return;
    const cellules = lignes.map((l) => [...l.querySelectorAll('case-fute')]);

    for (let i = 0; i < 4; i++) {
      const bonus = cellules[i][4];
      if (!estBonusActionnable(bonus)) continue;
      const ligneComplete = cellules[i].slice(0, 4).every(estCochee);
      marquerBonus(bonus, ligneComplete && !estBonusUtilisee(bonus));
    }

    const bonusPlusUn = cellules[4][4];
    if (estBonusActionnable(bonusPlusUn)) {
      const diagonaleComplete = [0, 1, 2, 3].every((i) => estCochee(cellules[i][i]));
      marquerBonus(bonusPlusUn, diagonaleComplete && !estBonusUtilisee(bonusPlusUn));
    }

    for (let col = 0; col < 4; col++) {
      const scoreCell = cellules[4][col];
      if (!estBonusActionnable(scoreCell)) continue;
      const colonneComplete = [0, 1, 2, 3].every((row) => estCochee(cellules[row][col]));
      marquerBonus(scoreCell, colonneComplete && !estBonusUtilisee(scoreCell));
    }
  }

  // Bleu : les bonus des lignes 1 et 2 (colonne 5) se débloquent en
  // terminant leur ligne. Les bonus de la ligne 4 (colonnes 1 à 4)
  // se débloquent en terminant leur colonne (lignes 1 à 3).
  function majBonusBleu() {
    const grille = document.querySelector('.tf-blue-value-container .tf-blue-grid');
    if (!grille) return;
    const lignes = [...grille.querySelectorAll('.tf-blue-row')];
    if (lignes.length < 4) return;
    const cellules = lignes.map((l) => [...l.querySelectorAll('case-fute')]);

    const bonusLigne1 = cellules[0][4];
    if (bonusLigne1 && bonusLigne1.hasAttribute('cochable')) {
      const complete = [1, 2, 3].every((c) => estCochee(cellules[0][c]));
      marquerBonus(bonusLigne1, complete && !estCochee(bonusLigne1));
    }

    const bonusLigne2 = cellules[1][4];
    if (bonusLigne2 && bonusLigne2.hasAttribute('cochable')) {
      const complete = [0, 1, 2, 3].every((c) => estCochee(cellules[1][c]));
      marquerBonus(bonusLigne2, complete && !estCochee(bonusLigne2));
    }

    // Ligne 3 (colonne 5) : le renard, débloqué comme les deux bonus
    // du dessus quand sa ligne (colonnes 1 à 4) est complète.
    const bonusLigne3 = cellules[2][4];
    if (estBonusActionnable(bonusLigne3)) {
      const complete = [0, 1, 2, 3].every((c) => estCochee(cellules[2][c]));
      marquerBonus(bonusLigne3, complete && !estBonusUtilisee(bonusLigne3));
    }

    for (let col = 0; col < 4; col++) {
      const bonus = cellules[3][col];
      if (!estBonusActionnable(bonus)) continue;
      const celluleColonne = [0, 1, 2].map((row) => cellules[row][col]).filter(estCaseReelle);
      const colonneComplete = celluleColonne.every(estCochee);
      marquerBonus(bonus, colonneComplete && !estBonusUtilisee(bonus));
    }
  }

  // Vert : chaque bonus se débloque quand la case juste au-dessus
  // (même colonne, ligne "≥") est cochée.
  function majBonusVert() {
    const ligneCentre = document.querySelector('.tf-green-container');
    const ligneBonus = document.querySelector('.tf-green-bonus-container');
    if (!ligneCentre || !ligneBonus) return;
    const centre = [...ligneCentre.querySelectorAll(':scope > case-fute')];
    const bonus = [...ligneBonus.querySelectorAll(':scope > case-fute')];

    bonus.forEach((el, i) => {
      if (!estBonusActionnable(el)) return; // ignore les cellules vides
      const disponible = estCochee(centre[i]) && !estBonusUtilisee(el);
      marquerBonus(el, disponible);
    });
  }

  // Orange / Violet : chaque bonus se débloque quand la case
  // modifiable juste au-dessus contient une valeur.
  function majBonusModifiable(selecteurValeurs, selecteurBonus) {
    const ligneValeurs = document.querySelector(selecteurValeurs);
    const ligneBonus = document.querySelector(selecteurBonus);
    if (!ligneValeurs || !ligneBonus) return;
    const valeurs = [...ligneValeurs.querySelectorAll(':scope > case-fute')];
    const bonus = [...ligneBonus.querySelectorAll(':scope > case-fute')];

    bonus.forEach((el, i) => {
      if (!estBonusActionnable(el)) return; // ignore "x2"/"x3" et les cellules vides
      const disponible = aUneValeur(valeurs[i]) && !estBonusUtilisee(el);
      marquerBonus(el, disponible);
    });
  }

  // Tours : chaque bonus se débloque quand la case "tour" juste
  // au-dessus (même colonne) est cochée.
  function majBonusTours() {
    const ligneTours = document.querySelector('.tf-tours-container');
    const ligneBonus = document.querySelector('.tf-tours-container-bonus');
    if (!ligneTours || !ligneBonus) return;
    const tours = [...ligneTours.querySelectorAll(':scope > case-fute')];
    const bonus = [...ligneBonus.querySelectorAll(':scope > case-fute')];

    bonus.forEach((el, i) => {
      if (!estBonusActionnable(el)) return; // ignore "3j" / "1|2j" et les cellules vides
      const disponible = estCochee(tours[i]) && !estBonusUtilisee(el);
      marquerBonus(el, disponible);
    });
  }

  function majTousLesBonus() {
    majBonusTours();
    majBonusJaune();
    majBonusBleu();
    majBonusVert();
    majBonusModifiable('.tf-orange-container', '.tf-orange-bonus-container');
    majBonusModifiable('.tf-purple-container', '.tf-purple-bonus-container');
  }

  /* ── Agrégation ───────────────────────────────────────────── */

  function calculerScores() {
    const scores = {
      jaune: calculerScoreJaune(),
      bleu: calculerScoreBleu(),
      vert: calculerScoreVert(),
      orange: calculerScoreOrange(),
      violet: calculerScoreViolet(),
    };
    scores.blanc = calculerScoreBlanc(scores);
    scores.total =
      scores.jaune + scores.bleu + scores.vert + scores.orange + scores.violet + scores.blanc;
    return scores;
  }

  /* ── Affichage ────────────────────────────────────────────── */

  function majTexte(id, valeur) {
    const el = document.getElementById(id);
    if (el) el.textContent = valeur;
  }

  function afficherScores() {
    const scores = calculerScores();
    majTexte('score-jaune', scores.jaune);
    majTexte('score-bleu', scores.bleu);
    majTexte('score-vert', scores.vert);
    majTexte('score-orange', scores.orange);
    majTexte('score-violet', scores.violet);
    majTexte('score-blanc', scores.blanc);
    majTexte('score-total', scores.total);
    majTousLesBonus();
  }

  /* ── Recalcul (déclenché par les interactions utilisateur) ──── */

  let recalculPlanifie = false;
  function planifierRecalcul() {
    if (recalculPlanifie) return;
    recalculPlanifie = true;
    requestAnimationFrame(() => {
      recalculPlanifie = false;
      afficherScores();
    });
  }

  function initialiser() {
    afficherScores();

    const feuille = document.getElementById('tf-sheet');
    if (feuille) {
      // Clic sur une case (cochable) → recalcul.
      feuille.addEventListener('click', planifierRecalcul, true);
      // Saisie dans une case modifiable → recalcul.
      feuille.addEventListener('input', planifierRecalcul, true);
      feuille.addEventListener('change', planifierRecalcul, true);

      // Filet de sécurité : si Case.js modifie les classes/attributs
      // sans passer par un évènement DOM standard, on les observe
      // directement.
      const observateur = new MutationObserver(planifierRecalcul);
      observateur.observe(feuille, {
        attributes: true,
        attributeFilter: ['class', 'cochee'],
        subtree: true,
      });
    }

    // Le bouton réinitialiser vide les cases : on recalcule après coup.
    const btnReset = document.getElementById('btn-reset');
    if (btnReset) {
      btnReset.addEventListener('click', planifierRecalcul);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialiser);
  } else {
    initialiser();
  }

  // Exposé au cas où d'autres scripts (ex: tresFute.js) voudraient
  // déclencher un recalcul manuellement ou lire les scores.
  window.tresFuteScore = { calculerScores, afficherScores };
})();

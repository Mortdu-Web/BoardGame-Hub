/* ── Logique dés : sélection + mise de côté automatique ─────── */
(function () {
  const active          = document.getElementById('dice-active');
  const aside           = document.getElementById('dice-aside');
  const asideWrapper    = document.getElementById('dice-aside-wrapper');
  const selectedZone    = document.getElementById('dice-selected');
  const selectedWrapper = document.getElementById('dice-selected-wrapper');
  const btnReroll       = document.getElementById('btn-reroll');
  const btnReset        = document.getElementById('btn-dice-reset');

  // Valeur du dé via l'attribut (persisté par _roll dans Dice.js)
  function getDiceValue(dice) {
    const v = parseInt(dice.getAttribute('value'), 10);
    return isNaN(v) ? null : v;
  }

  // Met à jour la visibilité des zones
  function updateVisibility() {
    asideWrapper.hidden    = aside.querySelectorAll('jeu-dice').length === 0;
    selectedWrapper.hidden = selectedZone.querySelectorAll('jeu-dice').length === 0;
  }

  // Déplace vers "aside" les dés actifs dont la valeur < seuil
  function moveInferiorToAside(seuil) {
    [...active.querySelectorAll('jeu-dice')].forEach(dice => {
      const v = getDiceValue(dice);
      if (v !== null && v < seuil) aside.appendChild(dice);
    });
    updateVisibility();
  }

  // Relance tous les dés de la zone active
  function rerollActive() {
    [...active.querySelectorAll('jeu-dice')].forEach(dice => dice._roll?.());
  }

  // Attache le listener de clic sur chaque dé
  function attachClickListener(dice) {
    dice.addEventListener('click', () => {
      // Ignorer si le dé n'est pas dans la zone active
      if (!active.contains(dice)) return;

      const selectedValue = getDiceValue(dice);
      if (selectedValue === null) return; // dé pas encore lancé

      // 1. Déplacer le dé cliqué dans "sélectionné" — les dés déjà sélectionnés restent
      selectedZone.appendChild(dice);
      updateVisibility();

      // 2. Mettre de côté les dés actifs dont la valeur < selectedValue
      moveInferiorToAside(selectedValue);
    });
  }

  // Bouton "Lancer les dés"
  btnReroll.addEventListener('click', rerollActive);

  // Bouton "Reset dés"
  btnReset.addEventListener('click', () => {
    [...aside.querySelectorAll('jeu-dice')].forEach(d => active.appendChild(d));
    [...selectedZone.querySelectorAll('jeu-dice')].forEach(d => active.appendChild(d));
    updateVisibility();
    [...active.querySelectorAll('jeu-dice')].forEach(dice => dice._reset?.());
  });

  // Initialisation
  [...active.querySelectorAll('jeu-dice')].forEach(attachClickListener);

  // Ajouter curseur pointer sur les dés actifs via CSS dynamique
  const style = document.createElement('style');
  style.textContent = `
    #dice-active jeu-dice { cursor: pointer; }
    #dice-active jeu-dice:hover { transform: scale(1.08); transition: transform 0.15s; }
    .tf-dice-reset-btn {
      padding: 0 14px;
      height: 34px;
      border-radius: 8px;
      border: 2px solid #505090;
      background: linear-gradient(135deg, #1e1e50, #111130);
      color: #a0a0e0;
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.15s, border-color 0.15s, transform 0.1s;
      box-shadow: 0 3px 8px rgba(0,0,0,0.4);
    }
    .tf-dice-reset-btn:hover {
      background: linear-gradient(135deg, #2a2a70, #181858);
      border-color: #7070b0;
      color: #c8c8ff;
    }
    .tf-dice-reset-btn:active { transform: scale(0.96); }
    .tf-dice-selected-wrapper {
      margin-bottom: 14px;
      padding-bottom: 12px;
      border-bottom: 1px dashed rgba(255,220,50,0.25);
    }
    .tf-dice-selected-wrapper .tf-dice-aside-label {
      color: rgba(255, 220, 80, 0.7);
    }
    .tf-dice-selected {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      justify-content: center;
    }
    #dice-selected jeu-dice {
      filter: drop-shadow(0 0 10px rgba(255, 200, 0, 0.6));
    }
  `;
  document.head.appendChild(style);
})();
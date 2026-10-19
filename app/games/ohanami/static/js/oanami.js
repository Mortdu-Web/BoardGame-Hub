const { GameScore } = await import(BASE_JS_URL);

// Barème cartes roses : index = nombre de cartes - 1
const BAREME_ROSE = [1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 66, 78, 91, 105, 120];

new GameScore({
  maxPlayers: 4,
  showSaison: true,   // colonne Saison visible
  showType:   true,   // colonne Type visible

  rows: [
    { saison: "Saison 1", type: "eau",    cls: "badge-eau",    icon: "💧" },
    { saison: "Saison 2", type: "eau",    cls: "badge-eau",    icon: "💧" },
    { saison: "Saison 2", type: "herbe",  cls: "badge-herbe",  icon: "🌿" },
    { saison: "Saison 3", type: "eau",    cls: "badge-eau",    icon: "💧" },
    { saison: "Saison 3", type: "herbe",  cls: "badge-herbe",  icon: "🌿" },
    { saison: "Saison 3", type: "pierre", cls: "badge-pierre", icon: "🪨" },
    { saison: "Saison 3", type: "sakura", cls: "badge-sakura", icon: "🌸" },
  ],

  computeScore(j, rows, nb, gs) {
    const eau1    = gs.getInputValue(0, j);
    const eau2    = gs.getInputValue(1, j);
    const herbe2  = gs.getInputValue(2, j);
    const eau3    = gs.getInputValue(3, j);
    const herbe3  = gs.getInputValue(4, j);
    const pierre3 = gs.getInputValue(5, j);
    const rose3   = gs.getInputValue(6, j);

    const scoreSaison1 = eau1 * 3;
    const scoreSaison2 = (eau2 * 3) + (herbe2 * 4);
    const nbRose       = Math.min(rose3, 15);
    const scoreRose    = nbRose > 0 ? BAREME_ROSE[nbRose - 1] : 0;
    const scoreSaison3 = (eau3 * 3) + (herbe3 * 4) + (pierre3 * 7) + scoreRose;

    return scoreSaison1 + scoreSaison2 + scoreSaison3;
  },

  buildPayload(nb, rows, players) {
    return {
      nb_joueurs: nb,
      joueurs: players,
      scores: rows.map((row, ri) => {
        const entry = { saison: row.saison, type: row.type, joueurs: {} };
        for (let j = 1; j <= nb; j++) {
          const inp = document.getElementById(`score_s${ri}_j${j}`);
          entry.joueurs[`joueur${j}`] = inp ? (parseInt(inp.value) || 0) : 0;
        }
        return entry;
      }),
    };
  },
});
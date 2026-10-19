const { GameScore } = await import(BASE_JS_URL);

// ─── Définition des 13 manches (double 12 → double blanc) ────────────────────

const MANCHES = [
  { saison: "", type: "double 12",        cls: "badge-d12", icon: "🎲" },
  { saison: "", type: "double 11",        cls: "badge-d11", icon: "🎲" },
  { saison: "", type: "double 10",        cls: "badge-d10", icon: "🎲" },
  { saison: "", type: "double 9",         cls: "badge-d9",  icon: "🎲" },
  { saison: "", type: "double 8",         cls: "badge-d8",  icon: "🎲" },
  { saison: "", type: "double 7",         cls: "badge-d7",  icon: "🎲" },
  { saison: "", type: "double 6",         cls: "badge-d6",  icon: "🎲" },
  { saison: "", type: "double 5",         cls: "badge-d5",  icon: "🎲" },
  { saison: "", type: "double 4",         cls: "badge-d4",  icon: "🎲" },
  { saison: "", type: "double 3",         cls: "badge-d3",  icon: "🎲" },
  { saison: "", type: "double 2",         cls: "badge-d2",  icon: "🎲" },
  { saison: "", type: "double 1",         cls: "badge-d1",  icon: "🎲" },
  { saison: "", type: "double 0 (blanc)", cls: "badge-d0",  icon: "⬜" },
];

// ─── Gestion de l'ordre des joueurs & affichage du tour ──────────────────────

class TourManager {
  constructor(gameScore) {
    this.gs        = gameScore;
    this.tourIndex = 0;
    this.ordre     = [];

    this._buildOrdreTable();

    document.getElementById("btn-next-tour")
      ?.addEventListener("click", () => this.nextTour());
  }

  _buildOrdreTable() {
    let container = document.getElementById("ordre-container");
    if (!container) {
      container           = document.createElement("div");
      container.id        = "ordre-container";
      container.className = "ordre-container";

      const title       = document.createElement("h3");
      title.className   = "ordre-title";
      title.textContent = "🚂 Ordre des joueurs";
      container.appendChild(title);

      const subtitle       = document.createElement("p");
      subtitle.className   = "ordre-subtitle";
      subtitle.textContent = "Glissez pour réorganiser l'ordre de jeu";
      container.appendChild(subtitle);

      const list     = document.createElement("ol");
      list.id        = "ordre-list";
      list.className = "ordre-list";
      container.appendChild(list);

      const tableWrapper = document.querySelector(".table-wrapper");
      tableWrapper?.parentNode.insertBefore(container, tableWrapper);
    }

    this._refreshOrdreList();
  }

  _refreshOrdreList() {
    const nb   = this.gs.nbJoueurs;
    const list = document.getElementById("ordre-list");
    if (!list) return;

    list.innerHTML = "";

    if (this.ordre.length !== nb) {
      this.ordre = Array.from({ length: nb }, (_, i) => i + 1);
    }

    this.ordre.forEach((joueurIdx, pos) => {
      const li          = document.createElement("li");
      li.className      = "ordre-item";
      li.draggable      = true;
      li.dataset.pos    = pos;
      li.dataset.joueur = joueurIdx;

      const numSpan       = document.createElement("span");
      numSpan.className   = "ordre-num";
      numSpan.textContent = pos + 1;

      const nameSpan       = document.createElement("span");
      nameSpan.className   = "ordre-name";
      nameSpan.id          = `ordre-name-j${joueurIdx}`;
      nameSpan.textContent = this._getPlayerName(joueurIdx);

      const grip       = document.createElement("span");
      grip.className   = "ordre-grip";
      grip.textContent = "⠿";

      li.appendChild(numSpan);
      li.appendChild(nameSpan);
      li.appendChild(grip);
      list.appendChild(li);

      li.addEventListener("dragstart", e => {
        e.dataTransfer.setData("text/plain", pos);
        li.classList.add("dragging");
      });
      li.addEventListener("dragend",   () => li.classList.remove("dragging"));
      li.addEventListener("dragover",  e => { e.preventDefault(); li.classList.add("drag-over"); });
      li.addEventListener("dragleave", () => li.classList.remove("drag-over"));
      li.addEventListener("drop", e => {
        e.preventDefault();
        li.classList.remove("drag-over");
        const fromPos = parseInt(e.dataTransfer.getData("text/plain"));
        const toPos   = pos;
        if (fromPos !== toPos) {
          [this.ordre[fromPos], this.ordre[toPos]] = [this.ordre[toPos], this.ordre[fromPos]];
          this.tourIndex = 0;
          this._refreshOrdreList();
          this._refreshTourDisplay();
        }
      });
    });

    this._refreshTourDisplay();
  }

  _getPlayerName(joueurIdx) {
    const sel = document.getElementById(`player_j${joueurIdx}`);
    if (!sel || !sel.value || sel.value === "__new__") return `J${joueurIdx}`;
    return sel.options[sel.selectedIndex]?.text ?? `J${joueurIdx}`;
  }

  refresh(nb) {
    if (this.ordre.length !== nb) {
      this.ordre     = Array.from({ length: nb }, (_, i) => i + 1);
      this.tourIndex = 0;
    }
    this._refreshOrdreList();
    this._refreshTourDisplay();
  }

  refreshNames() {
    this.ordre.forEach(joueurIdx => {
      const el = document.getElementById(`ordre-name-j${joueurIdx}`);
      if (el) el.textContent = this._getPlayerName(joueurIdx);
    });
    this._refreshTourDisplay();
  }

  _refreshTourDisplay() {
    if (!this.ordre.length) return;
    const joueurIdx = this.ordre[this.tourIndex % this.ordre.length];
    const nomEl     = document.getElementById("tour-nom");
    const iconEl    = document.getElementById("tour-icon");
    if (nomEl)  nomEl.textContent  = this._getPlayerName(joueurIdx);
    if (iconEl) iconEl.textContent = "🚂";

    document.querySelectorAll(".ordre-item").forEach((li, i) => {
      li.classList.toggle("tour-actif", i === this.tourIndex % this.ordre.length);
    });
  }

  nextTour() {
    this.tourIndex++;
    this._refreshTourDisplay();
  }
}

// ─── Instanciation du GameScore ───────────────────────────────────────────────

const game = new GameScore({
  maxPlayers: 8,
  showSaison: false,  // pas de colonne Saison pour le Train Mexicain
  showType:   true,   // on affiche uniquement le double joué

  rows: MANCHES,

  // Score = somme des points restants — le plus bas gagne
  computeScore(j, rows, nb, gs) {
    let total = 0;
    rows.forEach((_, ri) => { total += gs.getInputValue(ri, j); });
    return total;
  },

  buildPayload(nb, rows, players) {
    return {
      nb_joueurs: nb,
      joueurs:    players,
      scores: rows.map((row, ri) => {
        const entry = { double: row.type, joueurs: {} };
        for (let j = 1; j <= nb; j++) {
          const inp = document.getElementById(`score_s${ri}_j${j}`);
          entry.joueurs[`joueur${j}`] = inp ? (parseInt(inp.value) || 0) : 0;
        }
        return entry;
      }),
    };
  },
});

// ─── TourManager branché sur le GameScore ────────────────────────────────────

const tourManager = new TourManager(game);

const originalRender = game.render.bind(game);
game.render = function () {
  originalRender();
  tourManager.refresh(this.nbJoueurs);

  for (let j = 1; j <= this.nbJoueurs; j++) {
    document.getElementById(`player_j${j}`)
      ?.addEventListener("change", () => tourManager.refreshNames());
  }
};

game.render();
/**
 * base.js — base commune pour tous les tableaux de scores
 *
 * config = {
 *   maxPlayers         : number   — nombre max de joueurs pour ce jeu (défaut : 6)
 *   showSaison         : boolean  — affiche la colonne Saison (défaut : true)
 *   showType           : boolean  — affiche la colonne Type (défaut : true)
 *   rows               : Array<{
 *     saison           : string,
 *     type             : string,
 *     cls              : string,
 *     icon             : string,
 *     extra?           : Array<{ label, key, type, placeholder?, min? }>
 *   }>
 *   computeScore(joueur, rows, nb, gs) : number
 *   buildPayload(nb, rows, players)    : any
 * }
 *
 * PLAYERS_URL, SUBMIT_URL et NEW_PLAYER_URL sont injectés globalement par Jinja2.
 */

export class GameScore {
  constructor(config) {
    this.config     = config;
    this.players    = [];
    this.nbJoueurs  = 2;
    this.maxPlayers = config.maxPlayers ?? 6;
    this.showSaison = config.showSaison ?? true;
    this.showType   = config.showType   ?? true;

    // rows vide par défaut — chaque jeu fournit les siennes
    this.config.rows = config.rows ?? [];

    this.select   = document.getElementById("nb-joueurs");
    this.theadRow = document.getElementById("thead-row");
    this.tbody    = document.getElementById("tbody");
    this.nbLabel  = document.getElementById("nb-label");
    this.flash    = document.getElementById("flash");
    this.btnEnv   = document.getElementById("btn-envoyer");

    this._limitSelect();

    this.select.addEventListener("change", () => {
      this.nbJoueurs = parseInt(this.select.value);
      this.render();
    });
    this.btnEnv.addEventListener("click", () => this.handleSubmit());

    this._loadPlayers();
  }

  // ─── Limite les options du select nb-joueurs selon maxPlayers ─────────────

  _limitSelect() {
    Array.from(this.select.options).forEach(opt => {
      if (parseInt(opt.value) > this.maxPlayers) opt.remove();
    });
  }

  // ─── Chargement des joueurs ────────────────────────────────────────────────

  async _loadPlayers() {
    try {
      const resp = await fetch(PLAYERS_URL);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      this.players = await resp.json();
    } catch (e) {
      console.warn("Impossible de charger les joueurs :", e.message);
      this.players = [];
    } finally {
      this.nbJoueurs = parseInt(this.select.value);
      this.render();
    }
  }

  // ─── Select joueur dans chaque colonne ────────────────────────────────────

  _makePlayerSelect(j) {
    const sel          = document.createElement("select");
    sel.className      = "player-select";
    sel.id             = `player_j${j}`;
    sel.dataset.joueur = j;

    const defaultOpt       = document.createElement("option");
    defaultOpt.value       = "";
    defaultOpt.textContent = `— J${j} —`;
    sel.appendChild(defaultOpt);

    this.players.forEach(p => {
      const opt       = document.createElement("option");
      opt.value       = p.id;
      opt.textContent = `${p.prenom}\n${p.nom}`;
      sel.appendChild(opt);
    });

    const addOpt       = document.createElement("option");
    addOpt.value       = "__new__";
    addOpt.textContent = "+ Nouveau joueur";
    sel.appendChild(addOpt);

    sel.addEventListener("change", () => {
      if (sel.value === "__new__") {
        const next = encodeURIComponent(window.location.href);
        window.location.href = `${NEW_PLAYER_URL}?next=${next}`;
      }
      this._updatePlayerHeader(j);
      this._updateScores();
    });

    return sel;
  }

  _updatePlayerHeader(j) {
    const sel = document.getElementById(`player_j${j}`);
    const th  = sel?.closest("th");
    if (!th) return;

    const prenom = document.createElement("span");
    prenom.className = "player-prenom";
    const nom = document.createElement("span");
    nom.className = "player-nom";

    if (sel.value && sel.value !== "__new__") {
      const player = this.players.find(p => p.id === parseInt(sel.value));
      prenom.textContent = player?.prenom ?? "";
      nom.textContent    = player?.nom    ?? "";
    } else {
      prenom.textContent = `— J${j} —`;
      nom.textContent    = "";
    }

    th.innerHTML = "";
    th.appendChild(sel);
    th.appendChild(prenom);
    th.appendChild(nom);

    this._adjustPlayerColWidths();
  }

  _adjustPlayerColWidths() {
    let maxLen = 0;
    for (let j = 1; j <= this.nbJoueurs; j++) {
      const sel = document.getElementById(`player_j${j}`);
      if (!sel?.value || sel.value === "__new__") continue;
      const player = this.players.find(p => p.id === parseInt(sel.value));
      if (!player) continue;
      maxLen = Math.max(maxLen, player.prenom.length, player.nom.length);
    }

    const width = Math.max(80, maxLen * 7.5 + 16);

    document.querySelectorAll(".th-player").forEach(th => {
      th.style.width    = `${width}px`;
      th.style.minWidth = `${width}px`;
    });
  }

  // ─── Récupère la valeur d'un input de score ───────────────────────────────

  getInputValue(ri, j) {
    const inp = document.getElementById(`score_s${ri}_j${j}`);
    return inp ? (parseInt(inp.value) || 0) : 0;
  }

  // ─── Zone de scores en temps réel (ligne thead) ───────────────────────────

  _renderScoreBoard() {
    const old = document.getElementById("thead-score-row");
    if (old) old.remove();
    const oldBoard = document.getElementById("score-board");
    if (oldBoard) oldBoard.remove();

    const thead = document.querySelector("#score-table thead");
    const tr    = document.createElement("tr");
    tr.id        = "thead-score-row";
    tr.className = "score-board-row";

    const extraCols = this.config.rows[0]?.extra ?? [];
    let labelSpan = extraCols.length;
    if (this.showSaison) labelSpan++;
    if (this.showType)   labelSpan++;

    const tdLabel       = document.createElement("td");
    tdLabel.colSpan     = labelSpan;
    tdLabel.className   = "score-board-label";
    tdLabel.textContent = "Scores en cours";
    tr.appendChild(tdLabel);

    for (let j = 1; j <= this.nbJoueurs; j++) {
      const td     = document.createElement("td");
      td.className = "score-card";
      td.id        = `score-card-j${j}`;

      const pts       = document.createElement("div");
      pts.className   = "score-card-pts";
      pts.id          = `score-card-pts-j${j}`;
      pts.textContent = "0";

      td.appendChild(pts);
      tr.appendChild(td);
    }

    thead.appendChild(tr);
  }

  _updateScores() {
    if (!this.config.computeScore) return;

    const nb     = this.nbJoueurs;
    const scores = [];

    for (let j = 1; j <= nb; j++) {
      const score = this.config.computeScore(j, this.config.rows, nb, this);
      scores.push(score);

      const ptsEl = document.getElementById(`score-card-pts-j${j}`);
      if (ptsEl) ptsEl.textContent = score;

      const sel    = document.getElementById(`player_j${j}`);
      const nameEl = document.getElementById(`score-card-name-j${j}`);
      if (nameEl && sel) {
        const txt = sel.options[sel.selectedIndex]?.text;
        nameEl.textContent = (txt && sel.value && sel.value !== "__new__") ? txt : `J${j}`;
      }
    }

    const max = Math.max(...scores);
    for (let j = 1; j <= nb; j++) {
      const card = document.getElementById(`score-card-j${j}`);
      if (card) {
        card.classList.toggle("score-card-leader", scores[j - 1] === max && max > 0);
      }
    }
  }

  // ─── Rendu du tableau ──────────────────────────────────────────────────────

  render() {
    const nb     = this.nbJoueurs;
    const plural = nb > 1;
    this.nbLabel.textContent =
      `${nb} colonne${plural ? "s" : ""} joueur${plural ? "s" : ""} active${plural ? "s" : ""}`;

    const main = document.querySelector("main");
    if (main) {
      main.classList.remove(...Array.from(main.classList).filter(c => c.startsWith("players-")));
      main.classList.add(`players-${nb}`);
    }

    // ── En-têtes fixes (Saison / Type) ──
    // Repart de zéro : on vide toutes les colonnes dynamiques
    while (this.theadRow.children.length > 0) {
      this.theadRow.removeChild(this.theadRow.lastChild);
    }

    if (this.showSaison) {
      const th       = document.createElement("th");
      th.textContent = "Saison";
      this.theadRow.appendChild(th);
    }

    if (this.showType) {
      const th       = document.createElement("th");
      th.textContent = "Type";
      this.theadRow.appendChild(th);
    }

    const extraCols = this.config.rows[0]?.extra ?? [];
    extraCols.forEach(col => {
      const th       = document.createElement("th");
      th.className   = "th-extra";
      th.textContent = col.label;
      this.theadRow.appendChild(th);
    });

    for (let j = 1; j <= nb; j++) {
      const th     = document.createElement("th");
      th.className = "th-player";
      th.appendChild(this._makePlayerSelect(j));
      this.theadRow.appendChild(th);
      this._updatePlayerHeader(j);
    }
    this._adjustPlayerColWidths();

    // ── Lignes ──
    this.tbody.innerHTML = "";
    let lastSaison = null;

    this.config.rows.forEach((row, ri) => {
      const tr = document.createElement("tr");

      if (this.showSaison) {
        const td       = document.createElement("td");
        td.className   = "td-saison";
        td.textContent = row.saison !== lastSaison ? row.saison : "";
        lastSaison     = row.saison;
        tr.appendChild(td);
      }

      if (this.showType) {
        const td    = document.createElement("td");
        const badge = document.createElement("span");
        badge.className   = `badge-type ${row.cls}`;
        badge.textContent = `${row.icon} ${row.type.charAt(0).toUpperCase() + row.type.slice(1)}`;
        td.appendChild(badge);
        tr.appendChild(td);
      }

      (row.extra ?? []).forEach(col => {
        const td  = document.createElement("td");
        const inp = document.createElement("input");
        inp.type        = col.type ?? "number";
        inp.className   = "score-input";
        inp.placeholder = col.placeholder ?? "";
        inp.min         = col.min ?? "0";
        inp.id          = `extra_${col.key}_s${ri}`;
        inp.name        = `extra_${col.key}_s${ri}`;
        td.appendChild(inp);
        tr.appendChild(td);
      });

      for (let j = 1; j <= nb; j++) {
        const td  = document.createElement("td");
        const inp = document.createElement("input");
        inp.type           = "number";
        inp.className      = "score-input";
        inp.placeholder    = "0";
        inp.min            = "0";
        inp.dataset.row    = ri;
        inp.dataset.joueur = j;
        inp.id             = `score_s${ri}_j${j}`;
        inp.name           = `score_s${ri}_j${j}`;
        inp.addEventListener("input", () => this._updateScores());
        td.appendChild(inp);
        tr.appendChild(td);
      }

      this.tbody.appendChild(tr);
    });

    this._renderScoreBoard();
    this._updateScores();
  }

  // ─── Récupération des joueurs sélectionnés ────────────────────────────────

  _getSelectedPlayers() {
    const result = [];
    for (let j = 1; j <= this.nbJoueurs; j++) {
      const sel      = document.getElementById(`player_j${j}`);
      const playerId = sel?.value && sel.value !== "__new__" ? parseInt(sel.value) : null;
      const player   = this.players.find(p => p.id === playerId) ?? null;
      result.push({
        joueur: j,
        id:     playerId,
        prenom: player?.prenom ?? null,
        nom:    player?.nom    ?? null,
      });
    }
    return result;
  }

  // ─── Flash & bouton ───────────────────────────────────────────────────────

  setFlash(type, msg) {
    this.flash.className   = `flash-msg ${type}`;
    this.flash.textContent = msg;
  }

  resetBtn() {
    this.btnEnv.disabled    = false;
    this.btnEnv.textContent = "Envoyer au serveur";
  }

  // ─── Envoi ────────────────────────────────────────────────────────────────

  async handleSubmit() {
    this.flash.className   = "flash-msg";
    this.flash.textContent = "";

    const nb      = this.nbJoueurs;
    const players = this._getSelectedPlayers();
    const payload = this.config.buildPayload(nb, this.config.rows, players);

    this.btnEnv.disabled    = true;
    this.btnEnv.textContent = "Envoi…";

    try {
      const resp = await fetch(SUBMIT_URL, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });

      if (resp.ok) {
        this.setFlash("success", "✓ Scores envoyés avec succès !");
      } else {
        const err = await resp.json().catch(() => ({}));
        this.setFlash("error", `Erreur ${resp.status} : ${err.message || resp.statusText}`);
      }
    } catch (e) {
      this.setFlash("error", `Erreur réseau : ${e.message}`);
    } finally {
      this.resetBtn();
    }
  }
}
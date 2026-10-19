/**
 * skyjo.js — Tableau de scores Skyjo
 *
 * Contrairement aux autres jeux (Oanami…), Skyjo n'a pas de lignes fixes
 * connues à l'avance : chaque manche ajoute une nouvelle ligne de saisie,
 * et une ligne "Total" en tête de tableau se recalcule en direct.
 * Ce script est donc autonome (n'utilise pas GameScore de base.js).
 *
 * PLAYERS_URL, SUBMIT_URL et NEW_PLAYER_URL sont injectés globalement par Jinja2.
 */

class SkyjoScore {
  constructor() {
    this.players    = [];
    this.nbJoueurs  = 2;
    this.maxPlayers = 8;
    this.round      = 0; // nombre de manches actuellement affichées

    this.select   = document.getElementById("nb-joueurs");
    this.theadRow = document.getElementById("thead-row");
    this.tbody    = document.getElementById("tbody");
    this.nbLabel  = document.getElementById("nb-label");
    this.flash    = document.getElementById("flash");
    this.btnEnv   = document.getElementById("btn-envoyer");

    this.select.addEventListener("change", () => {
      this.nbJoueurs = parseInt(this.select.value);
      this.render();
    });
    this.btnEnv.addEventListener("click", () => this.handleSubmit());

    this._loadPlayers();
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

  // ─── Select joueur dans chaque colonne d'en-tête ──────────────────────────

  _makePlayerSelect(j) {
    const sel          = document.createElement("select");
    sel.className      = "player-select";
    sel.id             = `player_j${j}`;
    sel.dataset.joueur = j;

    const defaultOpt       = document.createElement("option");
    defaultOpt.value       = "";
    defaultOpt.textContent = `--J${j}--`;
    sel.appendChild(defaultOpt);

    this.players.forEach(p => {
      const opt       = document.createElement("option");
      opt.value       = p.id;
      opt.textContent = `${p.prenom} ${p.nom}`;
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
        return;
      }
      this._updatePlayerHeader(j);
      this._updateTotals();
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
      prenom.textContent = player?.prenom ?? `--J${j}--`;
      nom.textContent    = player?.nom    ?? "";
    } else {
      prenom.textContent = `--J${j}--`;
      nom.textContent    = "";
    }

    th.innerHTML = "";
    th.appendChild(sel);
    th.appendChild(prenom);
    th.appendChild(nom);
  }

  // ─── Construction du tableau ───────────────────────────────────────────────

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

    // ── En-tête : 1 colonne "Manche" + 1 colonne par joueur ──
    this.theadRow.innerHTML = "";

    const thManche       = document.createElement("th");
    thManche.className   = "th-manche";
    thManche.textContent = "Manche";
    this.theadRow.appendChild(thManche);

    for (let j = 1; j <= nb; j++) {
      const th     = document.createElement("th");
      th.className = "th-player";
      th.appendChild(this._makePlayerSelect(j));
      this.theadRow.appendChild(th);
      this._updatePlayerHeader(j);
    }

    // ── Corps : ligne Total, puis les manches déjà saisies, puis le bouton "+" ──
    this.tbody.innerHTML = "";
    this.tbody.appendChild(this._buildTotalRow(nb));

    this.round = 0;
    this._appendRoundRow(nb); // toujours au moins une manche au départ

    this._buildAddRow(nb);
  }

  _buildTotalRow(nb) {
    const tr     = document.createElement("tr");
    tr.id        = "total-row";
    tr.className = "total-row";

    const tdLabel       = document.createElement("td");
    tdLabel.className   = "td-label";
    tdLabel.textContent = "Total";
    tr.appendChild(tdLabel);

    for (let j = 1; j <= nb; j++) {
      const td       = document.createElement("td");
      td.className   = "td-total";
      td.id          = `total-j${j}`;
      td.textContent = "0";
      tr.appendChild(td);
    }

    return tr;
  }

  _appendRoundRow(nb) {
    this.round += 1;
    const r = this.round;

    const tr     = document.createElement("tr");
    tr.className = "round-row";
    tr.dataset.round = r;

    const tdLabel       = document.createElement("td");
    tdLabel.className   = "td-label";
    tdLabel.textContent = `Manche ${r}`;
    tr.appendChild(tdLabel);

    for (let j = 1; j <= nb; j++) {
      const td  = document.createElement("td");
      const inp = document.createElement("input");
      inp.type           = "number";
      inp.step            = "1";
      inp.className      = "score-input";
      inp.placeholder    = "0";
      inp.dataset.round  = r;
      inp.dataset.joueur = j;
      inp.id             = `round_r${r}_j${j}`;
      inp.name           = `round_r${r}_j${j}`;
      inp.addEventListener("input", () => this._updateTotals());
      td.appendChild(inp);
      tr.appendChild(td);
    }

    // Insère la nouvelle ligne juste avant la ligne "+ Ajouter une manche"
    const addRow = document.getElementById("add-round-row");
    if (addRow) {
      this.tbody.insertBefore(tr, addRow);
    } else {
      this.tbody.appendChild(tr);
    }
  }

  _buildAddRow(nb) {
    const old = document.getElementById("add-round-row");
    if (old) old.remove();

    const tr     = document.createElement("tr");
    tr.id        = "add-round-row";
    tr.className = "add-round-row";

    const td     = document.createElement("td");
    td.colSpan   = nb + 1;

    const btn         = document.createElement("button");
    btn.type          = "button";
    btn.className     = "btn-add-round";
    btn.textContent   = "+ Ajouter une manche";
    btn.addEventListener("click", () => {
      this._appendRoundRow(this.nbJoueurs);
    });

    td.appendChild(btn);
    tr.appendChild(td);
    this.tbody.appendChild(tr);
  }

  // ─── Calcul des totaux en direct ───────────────────────────────────────────

  _updateTotals() {
    const nb = this.nbJoueurs;

    for (let j = 1; j <= nb; j++) {
      let total = 0;
      document.querySelectorAll(`.round-row input[data-joueur="${j}"]`).forEach(inp => {
        total += parseInt(inp.value) || 0;
      });

      const totalEl = document.getElementById(`total-j${j}`);
      if (totalEl) totalEl.textContent = total;
    }
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

  _buildPayload() {
    const nb      = this.nbJoueurs;
    const players = this._getSelectedPlayers();

    // Ajouter le score total à chaque joueur
    const joueursAvecScores = players.map(p => {
      const totalEl = document.getElementById(`total-j${p.joueur}`);
      const score   = totalEl ? (parseInt(totalEl.textContent) || 0) : 0;
      return {
        joueur: p.joueur,
        id:     p.id,
        prenom: p.prenom,
        nom:    p.nom,
        score:  score,
      };
    });

    return {
      nb_joueurs: nb,
      joueurs:    joueursAvecScores,
    };
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

    const payload = this._buildPayload();

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

new SkyjoScore();
import { injectCSS } from './Utils.js';

// ─────────────────────────────────────────────
//  <jeu-case></jeu-case>
//
//  Attributs :
//    cochable   – clic = barre / débarre la case
//    cochee     – case barrée au chargement
//    entourable – clic 1 = entoure | clic 2 = coche | clic 3 = remet à zéro
//    modifiable – clic = ouvre un champ pour saisir un nombre (0–18)
//
//  Contenu :
//    <jeu-case>valeur</jeu-case>  →  texte, nombre, image…
// ─────────────────────────────────────────────
class Case extends HTMLElement {

  static get observedAttributes() {
    return ['cochee'];
  }

  connectedCallback() {
    injectCSS('case', 'case.css', import.meta.url);

    const cochable   = this.hasAttribute('cochable');
    const entourable = this.hasAttribute('entourable');
    const modifiable = this.hasAttribute('modifiable');
    const cochee     = this.hasAttribute('cochee');

    // Sauvegarde du contenu avant réécriture du DOM
    const contenuOriginal = this.innerHTML.trim();

    // État interne pour entourable : 0 = rien | 1 = entouré | 2 = coché
    this._etat   = cochee ? 2 : 0;

    // Valeur interne pour modifiable
    this._valeur = contenuOriginal !== '' ? contenuOriginal : null;

    this.innerHTML = `
      <div class="case ${cochee ? 'case--cochee' : ''}">
        <div class="case__contenu">${contenuOriginal}</div>

        <!-- Cercle SVG pour "entourable" -->
        <svg class="case__cercle" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <ellipse cx="50" cy="50" rx="44" ry="44"/>
        </svg>

        <!-- Croix SVG pour "cochable" et "entourable" -->
        <svg class="case__croix" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <line x1="10" y1="10" x2="90" y2="90" stroke-linecap="round"/>
          <line x1="90" y1="10" x2="10" y2="90" stroke-linecap="round"/>
        </svg>
      </div>
    `;

    // ── cochable ────────────────────────────────────
    if (cochable) {
      this.style.cursor = 'pointer';
      this.addEventListener('click', () => this._toggleCoche());
    }

    // ── entourable ──────────────────────────────────
    if (entourable) {
      this.style.cursor = 'pointer';
      this.addEventListener('click', () => this._cycleEtat());
    }

    // ── modifiable ──────────────────────────────────
    if (modifiable) {
      this.style.cursor = 'text';
      // On vérifie que le clic ne vient pas de l'input lui-même
      this.addEventListener('click', (e) => {
        if (e.target.tagName === 'INPUT') return;
        this._activerEdition();
      });
    }
  }

  // ── attributeChangedCallback ─────────────────────
  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'cochee') {
      const div = this.querySelector('.case');
      if (!div) return;
      if (newValue === null) {
        div.classList.remove('case--cochee');
      } else {
        div.classList.add('case--cochee');
      }
    }
  }

  // ── cochable : bascule croix ─────────────────────
  _toggleCoche() {
    if (this.hasAttribute('cochee')) {
      this.removeAttribute('cochee');
    } else {
      this.setAttribute('cochee', '');
    }
  }

  // ── entourable : cycle rien → entouré → coché ────
  _cycleEtat() {
    this._etat = (this._etat + 1) % 3;

    const div = this.querySelector('.case');
    div.classList.remove('case--entouree', 'case--cochee');

    if (this._etat === 1) div.classList.add('case--entouree');
    if (this._etat === 2) div.classList.add('case--cochee');
  }

  // ── modifiable : édition inline ──────────────────
  _activerEdition() {
    // Évite d'ouvrir un deuxième input si déjà en cours d'édition
    if (this.querySelector('.case__input')) return;

    const contenu = this.querySelector('.case__contenu');

    contenu.innerHTML = `
      <input
        class="case__input"
        type="number"
        min="0"
        max="18"
        value="${this._valeur ?? ''}"
        placeholder="–"
      >
    `;

    const input = contenu.querySelector('.case__input');
    input.focus();
    input.select();

    // Validation et fermeture de l'édition
    const confirmer = () => {
      const raw = input.value.trim();
      const num = parseInt(raw, 10);

      if (raw === '' || isNaN(num) || num < 0 || num > 18) {
        // Valeur invalide ou vide → on efface
        this._valeur = null;
        contenu.textContent = '';
      } else {
        this._valeur = num;
        contenu.textContent = num;
      }
    };

    // Annulation avec Échap : restaure l'ancienne valeur sans appeler confirmer
    const annuler = () => {
      input.removeEventListener('blur', confirmer);
      contenu.textContent = this._valeur !== null ? this._valeur : '';
    };

    input.addEventListener('blur', confirmer);

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter')  { input.blur(); }
      if (e.key === 'Escape') { annuler(); }
    });
  }

  // ── API publique ─────────────────────────────────

  /** Coche la case */
  coche()   { this.setAttribute('cochee', ''); }

  /** Décoche la case */
  decoche() { this.removeAttribute('cochee'); }

  /**
   * Force l'état d'une case "entourable" sans passer par un clic.
   * 0 = rien | 1 = entourée | 2 = cochée
   * Utilisé notamment par la restauration de sauvegarde locale.
   */
  setEtat(etat) {
    if (![0, 1, 2].includes(etat)) return;
    this._etat = etat;
    const div = this.querySelector('.case');
    if (!div) return;
    div.classList.remove('case--entouree', 'case--cochee');
    if (etat === 1) div.classList.add('case--entouree');
    if (etat === 2) div.classList.add('case--cochee');
  }

  /**
   * Force la valeur d'une case "modifiable" sans passer par la saisie.
   * Passer null (ou une valeur hors 0–18) efface la case.
   * Utilisé notamment par la restauration de sauvegarde locale.
   */
  setValeur(valeur) {
    const contenu = this.querySelector('.case__contenu');
    if (!contenu) return;

    const num = parseInt(valeur, 10);
    if (valeur === null || valeur === undefined || isNaN(num) || num < 0 || num > 18) {
      this._valeur = null;
      contenu.textContent = '';
    } else {
      this._valeur = num;
      contenu.textContent = num;
    }
  }

  /** true si la case est cochée */
  get estCochee() { return this.hasAttribute('cochee'); }

  /** État courant d'une case entourable : 0 = rien | 1 = entourée | 2 = cochée */
  get etat() { return this._etat; }

  /** Valeur saisie dans une case modifiable (null si vide) */
  get valeur() { return this._valeur ?? null; }
}

customElements.define('case-fute', Case);
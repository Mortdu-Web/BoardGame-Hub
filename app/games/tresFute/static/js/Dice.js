import { injectCSS } from './Utils.js';
// ─────────────────────────────────────────────
//  <jeu-dice></jeu-dice>
//
//  Attributs :
//    size   – nombre de faces (4, 6, 8, 10, 12, 20)
//    color  – couleur du dé (red, blue, green, black, …)
//    value  – valeur affichée (peut aussi être définie via le contenu de la balise)
//
//  Événements émis :
//    dice-roll  – { detail: { result, size } }
// ─────────────────────────────────────────────

const DICE_SHAPES = {
  4:  { sides: 4,  label: 'D4'  },
  6:  { sides: 6,  label: 'D6'  },
  8:  { sides: 8,  label: 'D8'  },
  10: { sides: 10, label: 'D10' },
  12: { sides: 12, label: 'D12' },
  20: { sides: 20, label: 'D20' },
};

class Dice extends HTMLElement {
  /* ── Cycle de vie ─────────────────────────────── */

  static get observedAttributes() {
    return ['size', 'color', 'value'];
  }

  connectedCallback() {
    injectCSS('dice', 'dice.css', import.meta.url);
    this._render();
    this._attachEvents();
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal !== newVal && this.isConnected) {
      if (name === 'value') {
        // Mise à jour légère : juste le texte, sans re-render complet
        const el = this.querySelector('.dice-value');
        if (el) { el.textContent = newVal ?? '?'; return; }
      }
      this._render();
      this._attachEvents();
    }
  }

  /* ── Accesseurs ───────────────────────────────── */

  get size()  { return parseInt(this.getAttribute('size') || '6', 10); }
  get color() { return this.getAttribute('color') || 'black'; }

  get value() { return this.getAttribute('value'); }
  set value(v) {
    if (v === null || v === undefined) this.removeAttribute('value');
    else this.setAttribute('value', String(v));
  }

  get _sides() {
    const n = this.size;
    return DICE_SHAPES[n] ? n : 6;      // fallback D6
  }

  /* ── Rendu ────────────────────────────────────── */

  _render() {
    // Priorité : attribut value > contenu texte de la balise > '?'
    const attrVal  = this.getAttribute('value');
    const textVal  = this.querySelector('[slot="value"]')?.innerHTML
                  ?? [...this.childNodes]
                       .filter(n => n.nodeType === Node.TEXT_NODE)
                       .map(n => n.textContent.trim())
                       .find(t => t) ?? '';
    const displayValue = attrVal ?? textVal ?? '?';

    this.innerHTML = `
      <div class="dice-shell" data-size="${this._sides}" data-color="${this.color}">
        <div class="dice-face">
          <span class="dice-label">D${this._sides}</span>
          <span class="dice-value">${displayValue}</span>
        </div>
        <div class="dice-shadow"></div>
      </div>
    `;
  }

  /* ── Événements ───────────────────────────────── */

  _attachEvents() {
    const shell = this.querySelector('.dice-shell');
    if (!shell) return;

    // Le clic sur le shell ne déclenche plus _roll directement :
    // c'est le script externe (tresFute) qui gère le clic pour la sélection.
    // _roll reste appelable programmatiquement.
    shell.setAttribute('role', 'button');
    shell.setAttribute('tabindex', '0');
    shell.setAttribute('aria-label', `Lancer le D${this._sides}`);

    shell.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this._roll();
      }
    });
  }

  /* ── Logique de lancer ────────────────────────── */

  _roll() {
    const shell = this.querySelector('.dice-shell');
    const valueEl = this.querySelector('.dice-value');
    if (!shell || shell.classList.contains('rolling')) return;

    const result = Math.floor(Math.random() * this._sides) + 1;

    shell.classList.add('rolling');

    let tick = 0;
    const interval = setInterval(() => {
      const fake = Math.floor(Math.random() * this._sides) + 1;
      valueEl.textContent = fake;
      tick++;
    }, 60);

    setTimeout(() => {
      clearInterval(interval);
      valueEl.textContent = result;
      // Persister la valeur dans l'attribut → survit aux déplacements DOM
      this.setAttribute('value', result);
      shell.classList.remove('rolling');
      shell.classList.add('landed');
      setTimeout(() => shell.classList.remove('landed'), 600);

      this.dispatchEvent(new CustomEvent('dice-roll', {
        bubbles: true,
        composed: true,
        detail: { result, size: this._sides },
      }));
    }, 800);
  }

  /* ── Reset ────────────────────────────────────── */

  _reset() {
    this.removeAttribute('value');
    const valueEl = this.querySelector('.dice-value');
    if (valueEl) valueEl.textContent = '?';
    const shell = this.querySelector('.dice-shell');
    shell?.classList.remove('rolling', 'landed');
  }
}

customElements.define('jeu-dice', Dice);
export { Dice };
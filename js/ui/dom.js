// Small shared UI helpers.

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

export const EYE_NAMES = { L: "Left", R: "Right" };
export const TYPE_NAMES = { monthly: "Monthly", daily: "Daily" };

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Format a number that may be a .5 median. */
export const fmtNum = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * Progress ring as an SVG string. `fraction` is already clamped to 0..1.
 * `color` is a CSS colour/var; the track uses --track.
 */
export function ring(fraction, color, { size = 120, stroke = 10 } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, fraction));
  const arc = f > 0
    ? `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}"
         stroke-width="${stroke}" stroke-linecap="round"
         stroke-dasharray="${(c * f).toFixed(2)} ${c.toFixed(2)}"
         transform="rotate(-90 ${size / 2} ${size / 2})" class="ring-arc"/>`
    : "";
  return `<svg class="ring" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--track)" stroke-width="${stroke}"/>
    ${arc}
  </svg>`;
}

export const ICONS = {
  back: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>`,
  chevron: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`,
  close: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  star: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>`,
};

/** Date chip with a transparent native date input on top (reliable picker on iOS). */
export function dateChip(value, label, max) {
  return `<label class="date-chip">
    ${ICONS.calendar}<span class="date-chip-label">${esc(label)}</span>
    <input type="date" class="date-chip-input" value="${esc(value)}" max="${esc(max)}" aria-label="Date">
  </label>`;
}

/** 5-step comfort slider that reads "Not rated" until touched. */
export function comfortField(value, labels) {
  const rated = value >= 1 && value <= 5;
  return `<div class="field comfort ${rated ? "" : "is-unrated"}">
    <div class="comfort-head">
      <span class="field-label">Comfort <span class="faint">(optional)</span></span>
      <span class="comfort-value">${esc(rated ? labels[value - 1] : "Not rated")}</span>
      <button type="button" class="link-btn comfort-clear" ${rated ? "" : "hidden"}>Clear</button>
    </div>
    <input type="range" class="comfort-range" min="1" max="5" step="1" value="${rated ? value : 3}" aria-label="Comfort">
    <div class="comfort-scale"><span>${esc(labels[0])}</span><span>${esc(labels[4])}</span></div>
  </div>`;
}

/** Wire up a comfortField inside `root`. Returns a getter for the value (null = not rated). */
export function bindComfort(root, labels, initial = null) {
  let value = initial >= 1 && initial <= 5 ? initial : null;
  const wrap = root.querySelector(".comfort");
  const range = wrap.querySelector(".comfort-range");
  const out = wrap.querySelector(".comfort-value");
  const clear = wrap.querySelector(".comfort-clear");
  const paint = () => {
    wrap.classList.toggle("is-unrated", value === null);
    out.textContent = value === null ? "Not rated" : labels[value - 1];
    clear.hidden = value === null;
  };
  range.addEventListener("input", () => { value = Number(range.value); paint(); });
  clear.addEventListener("click", () => { value = null; range.value = 3; paint(); });
  return () => value;
}

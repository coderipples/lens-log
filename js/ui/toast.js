// Single toast with an optional Undo button.

import { esc } from "./dom.js";

let timer = null;

export function showToast(message, { undo = null, duration = 5000, error = false } = {}) {
  const root = document.getElementById("toast-root");
  clearTimeout(timer);
  root.innerHTML = `<div class="toast ${error ? "is-error" : ""}" role="status">
    <span class="toast-msg">${esc(message)}</span>
    ${undo ? `<button type="button" class="toast-undo">Undo</button>` : ""}
  </div>`;
  const el = root.firstElementChild;
  requestAnimationFrame(() => el.classList.add("is-in"));
  if (undo) {
    el.querySelector(".toast-undo").addEventListener("click", () => {
      undo();
      showToast("Undone", { duration: 1500 });
    });
  }
  timer = setTimeout(hideToast, duration);
}

export function showError(err) {
  showToast(err?.message ?? String(err), { error: true, duration: 4000 });
}

export function hideToast() {
  const el = document.querySelector("#toast-root .toast");
  if (!el) return;
  el.classList.remove("is-in");
  setTimeout(() => el.remove(), 250);
}

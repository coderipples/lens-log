// Settings: brands and defaults, activity kinds, export and import.

import * as store from "../store.js";
import { addBrand, removeBrand, setDefaultBrand, addActivityKind, removeActivityKind } from "../actions.js";
import { todayISO } from "../dates.js";
import { showToast, showError } from "./toast.js";
import { esc, ICONS, plural, TYPE_NAMES } from "./dom.js";

export function renderSettings(el, state) {
  el.innerHTML = `
    ${["monthly", "daily"].map((type) => brandSection(state, type)).join("")}
    ${activitySection(state)}

    <h2 class="section-title">Data</h2>
    <div class="card settings-data">
      <button type="button" class="btn btn-block" data-export>Export JSON</button>
      <label class="btn btn-block file-btn">
        Import JSON
        <input type="file" accept="application/json,.json" data-import hidden>
      </label>
      <p class="note muted">
        Your data is stored only on this device. On iPhone, the Home Screen app and Safari keep
        separate storage, so use Export and Import to move data between them or to make a backup.
      </p>
    </div>
    <p class="hint">Lens Log · data format v${state.version} · ${plural(state.lenses.length, "lens", "lenses")}</p>
  `;

  el.onclick = (e) => {
    const t = e.target.closest("[data-act]");
    if (t) {
      const { act, type, brand } = t.dataset;
      try {
        if (act === "default") {
          store.update((d) => setDefaultBrand(d, type, brand));
        } else if (act === "remove") {
          const { undo } = store.update((d) => removeBrand(d, type, brand));
          showToast(`Removed ${brand}`, { undo });
        } else if (act === "remove-activity") {
          const { kind } = t.dataset;
          const { undo } = store.update((d) => removeActivityKind(d, kind));
          showToast(`Removed ${kind}`, { undo });
        }
      } catch (err) { showError(err); }
      return;
    }
    if (e.target.closest("[data-export]")) exportData();
  };

  for (const form of el.querySelectorAll("[data-add-brand]")) {
    form.onsubmit = (e) => {
      e.preventDefault();
      try {
        store.update((d) => addBrand(d, form.dataset.addBrand, form.brand.value));
      } catch (err) { showError(err); }
    };
  }

  el.querySelector("[data-add-activity]").onsubmit = (e) => {
    e.preventDefault();
    try {
      store.update((d) => addActivityKind(d, e.target.kind.value));
    } catch (err) { showError(err); }
  };

  el.querySelector("[data-import]").onchange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) importData(file);
  };
}

function brandSection(state, type) {
  const def = state.defaults[type];
  return `
    <h2 class="section-title">${TYPE_NAMES[type]} brands</h2>
    <div class="card list-card">
      <ul class="brand-list">
        ${state.brands[type].map((b) => `
          <li class="brand-row">
            <span class="dot ${type}"></span>
            <span class="brand-name">${esc(b)}</span>
            ${b === def
              ? `<span class="pill ${type}">Default</span>`
              : `<button type="button" class="link-btn" data-act="default" data-type="${type}" data-brand="${esc(b)}">Make default</button>
                 <button type="button" class="icon-btn" data-act="remove" data-type="${type}" data-brand="${esc(b)}" aria-label="Remove ${esc(b)}">${ICONS.close}</button>`}
          </li>`).join("")}
      </ul>
      <form class="inline-form" data-add-brand="${type}">
        <input class="input" name="brand" placeholder="Add ${type} brand" autocomplete="off" autocapitalize="words" enterkeyhint="done">
        <button class="btn" type="submit">Add</button>
      </form>
    </div>`;
}

function activitySection(state) {
  return `
    <h2 class="section-title">Activities</h2>
    <div class="card list-card">
      ${state.activityKinds.length ? `<ul class="brand-list">
        ${state.activityKinds.map((k) => `
          <li class="brand-row">
            <span class="brand-name">${esc(k)}</span>
            <button type="button" class="icon-btn" data-act="remove-activity" data-kind="${esc(k)}" aria-label="Remove ${esc(k)}">${ICONS.close}</button>
          </li>`).join("")}
      </ul>` : ""}
      <form class="inline-form" data-add-activity>
        <input class="input" name="kind" placeholder="Add activity" autocomplete="off" autocapitalize="sentences" enterkeyhint="done">
        <button class="btn" type="submit">Add</button>
      </form>
      <p class="note muted">Removing an activity only hides it from the picker. Days already logged keep it.</p>
    </div>`;
}

async function exportData() {
  const json = store.exportJSON();
  const name = `lenslog-export-${todayISO()}.json`;
  const file = new File([json], name, { type: "application/json" });
  // iOS standalone apps can't download files directly; the share sheet can "Save to Files".
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Lens Log export" });
      return;
    } catch (err) {
      if (err.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importData(file) {
  try {
    const data = JSON.parse(await file.text());
    const n = Array.isArray(data?.lenses) ? data.lenses.length : 0;
    // The one confirm in the app: import replaces everything and can't be undone with the toast.
    if (!confirm(`Replace all current data with ${plural(n, "lens", "lenses")} from “${file.name}”?`)) return;
    store.replaceState(data);
    showToast("Data imported");
  } catch (err) {
    showError(new Error(`Import failed: ${err.message}`));
  }
}

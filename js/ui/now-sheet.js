// Bottom sheet opened from a Now card: switch, open, remove or discard lenses.

import * as store from "../store.js";
import { eyeStatus, lensSummary, REASONS, COMFORT_LABELS } from "../calc.js";
import { todayISO, formatRelative } from "../dates.js";
import { openLens, switchTo, discardLens, addBrand } from "../actions.js";
import { openSheet } from "./sheet.js";
import { showToast, showError } from "./toast.js";
import { esc, dateChip, comfortField, bindComfort, ICONS, EYE_NAMES, TYPE_NAMES } from "./dom.js";

const OTHER = { L: "R", R: "L" };

// Remembered for the session: once turned off, stays off until reload.
let bothPref = true;

/** The undiscarded lens of `type` in an eye (at most one exists, by invariant). */
function lensOfType(st, type) {
  if (st.active?.type === type) return st.active;
  return type === "monthly" ? st.restingMonthly : st.restingDaily;
}
function restingOfType(st, type) {
  return type === "monthly" ? st.restingMonthly : st.restingDaily;
}

function eyesLabel(eyes) {
  return eyes.length === 2 ? "both eyes" : `${EYE_NAMES[eyes[0]].toLowerCase()} eye`;
}

export function openNowSheet(eye) {
  const ui = { eye, both: bothPref, date: todayISO(), view: "main", type: null, brand: null, adding: false };
  openSheet((sheet) => {
    ui.render = () => VIEWS[ui.view](sheet, ui);
    ui.render();
  }, { label: `${EYE_NAMES[eye]} eye actions` });
}

const targetEyes = (ui) => (ui.both ? [ui.eye, OTHER[ui.eye]] : [ui.eye]);

function statuses(ui) {
  const state = store.getState();
  return targetEyes(ui).map((eye) => ({ eye, st: eyeStatus(state, eye, ui.date) }));
}

function whenText(ui) {
  const today = todayISO();
  return ui.date === today ? "" : ` · ${formatRelative(ui.date, today)}`;
}

/** Apply `perEye(draft, eye, st)` to each target eye in one undoable update. */
function run(sheet, ui, perEye, describe) {
  try {
    const touched = [];
    const discarded = [];
    const { undo } = store.update((draft) => {
      for (const eye of targetEyes(ui)) {
        const st = eyeStatus(draft, eye, ui.date);
        const res = perEye(draft, eye, st);
        if (res === false) continue;
        touched.push(eye);
        if (res?.discarded) discarded.push(...res.discarded);
      }
      if (!touched.length) throw new Error("Nothing to change");
    });
    sheet.close();
    let msg = `${describe} · ${eyesLabel(touched)}${whenText(ui)}`;
    if (discarded.length) msg += ` · old ${discarded.length > 1 ? "lenses" : "lens"} discarded`;
    showToast(msg, { undo });
  } catch (err) {
    showError(err);
  }
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

const VIEWS = { main: mainView, brand: brandView, discard: discardView };

function mainView(sheet, ui) {
  const state = store.getState();
  const today = todayISO();
  const list = statuses(ui);
  const primary = list[0].st;
  const actions = [];

  // Back to a resting lens (monthly first).
  for (const type of ["monthly", "daily"]) {
    const hit = list.map((x) => restingOfType(x.st, type)).find(Boolean);
    if (!hit) continue;
    const s = lensSummary(hit, state.switches, ui.date);
    actions.push({
      id: `resume:${type}`, type,
      title: `Back to ${hit.brand}`,
      sub: `Resting ${type} · day ${s.age} of ${s.limit}`,
    });
  }
  actions.push({ id: "open:daily", type: "daily", title: "Open new daily", sub: state.defaults.daily });
  actions.push({ id: "open:monthly", type: "monthly", title: "Open new monthly", sub: state.defaults.monthly });
  if (list.some((x) => x.st.active)) {
    actions.push({ id: "none", type: "none", title: "No lens", sub: "Glasses or a break" });
  }
  for (const type of ["daily", "monthly"]) {
    const hit = list.map((x) => lensOfType(x.st, type)).find(Boolean);
    if (!hit) continue;
    actions.push({
      id: `discard:${type}`, type: "discard",
      title: `Discard ${hit.brand}`,
      sub: `${TYPE_NAMES[type]} · ${list.some((x) => x.st.active === hit) ? "in eye" : "resting"}`,
    });
  }

  const current = primary.active
    ? (() => {
        const s = lensSummary(primary.active, state.switches, ui.date);
        return `${esc(primary.active.brand)} · day ${s.age} of ${s.limit}`;
      })()
    : "No lens";

  sheet.setContent(`
    <div class="sheet-head">
      <div>
        <h2 class="sheet-title">${EYE_NAMES[ui.eye]} eye</h2>
        <p class="sheet-sub muted">${current}</p>
      </div>
      <button type="button" class="toggle" role="switch" aria-checked="${ui.both}" data-both>
        <span class="toggle-label">Both eyes</span><span class="toggle-track"><span class="toggle-thumb"></span></span>
      </button>
    </div>
    <div class="sheet-row">${dateChip(ui.date, formatRelative(ui.date, today), today)}</div>
    <div class="action-list">
      ${actions.map((a) => `
        <button type="button" class="action-row" data-action="${a.id}">
          <span class="action-dot is-${a.type}"></span>
          <span class="action-text">
            <span class="action-title">${esc(a.title)}</span>
            <span class="action-sub">${esc(a.sub)}</span>
          </span>
          ${ICONS.chevron}
        </button>`).join("")}
    </div>
  `);

  const body = sheet.body;
  body.querySelector("[data-both]").onclick = () => {
    ui.both = bothPref = !ui.both;
    ui.render();
  };
  body.querySelector(".date-chip-input").onchange = (e) => {
    const v = e.target.value;
    ui.date = v && v <= today ? v : today;
    ui.render();
  };
  body.querySelector(".action-list").onclick = (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const [kind, type] = btn.dataset.action.split(":");
    if (kind === "open") {
      Object.assign(ui, { view: "brand", type, brand: null, adding: false });
      ui.render();
    } else if (kind === "discard") {
      Object.assign(ui, { view: "discard", type });
      ui.render();
    } else if (kind === "resume") {
      const brand = btn.querySelector(".action-title").textContent.replace(/^Back to /, "");
      run(sheet, ui, (draft, eye, st) => {
        const lens = restingOfType(st, type);
        if (!lens) return false;
        return switchTo(draft, { eye, lensId: lens.id, date: ui.date });
      }, `Back to ${brand}`);
    } else if (kind === "none") {
      run(sheet, ui, (draft, eye, st) => {
        if (!st.active) return false;
        return switchTo(draft, { eye, lensId: null, date: ui.date });
      }, "No lens");
    }
  };
}

function subHead(ui, title) {
  return `
    <div class="sheet-head">
      <button type="button" class="icon-btn back-btn" data-back aria-label="Back">${ICONS.back}</button>
      <div class="sheet-head-text">
        <h2 class="sheet-title">${esc(title)}</h2>
        <p class="sheet-sub muted">${ui.both ? "Both eyes" : `${EYE_NAMES[ui.eye]} eye`} · ${esc(formatRelative(ui.date))}</p>
      </div>
    </div>`;
}

/** "Your current Total30 (both eyes) and Total1 (left) will be marked discarded." */
function replacingText(lenses) {
  const groups = new Map();
  for (const l of lenses) {
    const key = `${l.brand}|${l.type}`;
    groups.set(key, [...(groups.get(key) ?? []), l.eye]);
  }
  const parts = [...groups].map(([key, eyes]) => {
    const where = eyes.length === 2 ? "both eyes" : EYE_NAMES[eyes[0]].toLowerCase();
    return `${esc(key.split("|")[0])} (${where})`;
  });
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0];
  return `Your current ${list} will be marked discarded.`;
}

function brandView(sheet, ui) {
  const state = store.getState();
  const type = ui.type;
  ui.brand ??= state.defaults[type];
  const replacing = statuses(ui)
    .flatMap(({ st }) => [lensOfType(st, type), type === "monthly" && st.active?.type === "daily" ? st.active : null])
    .filter(Boolean);

  sheet.setContent(`
    ${subHead(ui, `Open new ${type}`)}
    <div class="field">
      <span class="field-label">Brand</span>
      <div class="chips" data-brands>
        ${state.brands[type].map((b) => `
          <button type="button" class="chip ${type === "daily" ? "is-daily" : ""}" data-brand="${esc(b)}"
                  aria-pressed="${b === ui.brand}">
            ${esc(b)}${b === state.defaults[type] ? ` <span class="faint">· default</span>` : ""}
          </button>`).join("")}
        ${ui.adding ? "" : `<button type="button" class="chip chip-ghost" data-add>${ICONS.plus} New brand</button>`}
      </div>
      ${ui.adding ? `
        <form class="inline-form" data-add-form>
          <input class="input" name="brand" placeholder="Brand name" autocomplete="off" autocapitalize="words" enterkeyhint="done">
          <button class="btn" type="submit">Add</button>
        </form>` : ""}
    </div>
    ${replacing.length ? `<p class="note muted">${replacingText(replacing)}</p>` : ""}
    <button type="button" class="btn btn-block ${type === "daily" ? "btn-daily" : "btn-primary"}" data-confirm>
      Open ${esc(ui.brand)}
    </button>
  `);

  const body = sheet.body;
  body.querySelector("[data-back]").onclick = () => { ui.view = "main"; ui.render(); };
  body.querySelector("[data-brands]").onclick = (e) => {
    if (e.target.closest("[data-add]")) { ui.adding = true; ui.render(); body.querySelector("[name=brand]").focus(); return; }
    const chip = e.target.closest("[data-brand]");
    if (chip) { ui.brand = chip.dataset.brand; ui.render(); }
  };
  const form = body.querySelector("[data-add-form]");
  if (form) {
    form.onsubmit = (e) => {
      e.preventDefault();
      try {
        const { result } = store.update((d) => addBrand(d, type, form.brand.value));
        Object.assign(ui, { brand: result, adding: false });
        ui.render();
      } catch (err) { showError(err); }
    };
  }
  body.querySelector("[data-confirm]").onclick = () => {
    run(sheet, ui, (draft, eye) => openLens(draft, { eye, type, brand: ui.brand, date: ui.date }), `Opened ${ui.brand}`);
  };
}

function discardView(sheet, ui) {
  const type = ui.type;
  const targets = statuses(ui).map((x) => lensOfType(x.st, type)).filter(Boolean);
  const brand = targets[0]?.brand ?? TYPE_NAMES[type];
  let reason = null;

  sheet.setContent(`
    ${subHead(ui, `Discard ${brand}`)}
    <div class="field">
      <span class="field-label">Reason</span>
      <div class="chips" data-reasons>
        ${REASONS.map((r) => `<button type="button" class="chip" data-reason="${r.key}" aria-pressed="false">${esc(r.label)}</button>`).join("")}
      </div>
    </div>
    ${comfortField(null, COMFORT_LABELS)}
    <label class="field">
      <span class="field-label">Note <span class="faint">(optional)</span></span>
      <textarea class="textarea" name="note" rows="2" placeholder="Anything worth remembering"></textarea>
    </label>
    <button type="button" class="btn btn-block btn-danger" data-confirm>Discard</button>
  `);

  const body = sheet.body;
  const getComfort = bindComfort(body, COMFORT_LABELS);
  body.querySelector("[data-back]").onclick = () => { ui.view = "main"; ui.render(); };
  body.querySelector("[data-reasons]").onclick = (e) => {
    const chip = e.target.closest("[data-reason]");
    if (!chip) return;
    reason = reason === chip.dataset.reason ? null : chip.dataset.reason;
    for (const c of body.querySelectorAll("[data-reason]")) c.setAttribute("aria-pressed", String(c.dataset.reason === reason));
  };
  body.querySelector("[data-confirm]").onclick = () => {
    const comfort = getComfort();
    const note = body.querySelector("[name=note]").value;
    run(sheet, ui, (draft, eye, st) => {
      const lens = lensOfType(st, type);
      if (!lens) return false;
      return discardLens(draft, { lensId: lens.id, date: ui.date, reason, comfort, note });
    }, `Discarded ${brand}`);
  };
}

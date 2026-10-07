// History screen: every lens, newest first. Tap to edit or delete.

import * as store from "../store.js";
import { lensSummary, lensActivities, reasonLabel, comfortLabel, REASONS, COMFORT_LABELS } from "../calc.js";
import { formatShort, todayISO } from "../dates.js";
import { editLens, deleteLens } from "../actions.js";
import { openSheet } from "./sheet.js";
import { showToast, showError } from "./toast.js";
import { esc, plural, comfortField, bindComfort, EYE_NAMES, TYPE_NAMES } from "./dom.js";

export function renderHistory(el, state, today) {
  if (!state.lenses.length) {
    el.innerHTML = `<div class="card empty">
      <div class="empty-title">No lenses yet</div>
      <p>Lenses you open from the Now tab show up here.</p>
    </div>`;
    return;
  }
  const lenses = [...state.lenses].sort((a, b) =>
    a.openedOn !== b.openedOn ? (a.openedOn < b.openedOn ? 1 : -1) : a.eye < b.eye ? -1 : 1);

  el.innerHTML = `<ul class="history-list">${lenses.map((l) => historyItem(l, state, today)).join("")}</ul>`;
  el.onclick = (e) => {
    const item = e.target.closest("[data-lens]");
    if (item) openEditSheet(item.dataset.lens);
  };
}

function historyItem(lens, state, today) {
  const s = lensSummary(lens, state.switches, today);
  const end = lens.discardedOn ? formatShort(lens.discardedOn, today) : "now";
  const reason = reasonLabel(lens.discardReason);
  const comfort = comfortLabel(lens.comfort);
  const extras = [reason, comfort && `Comfort: ${comfort}`].filter(Boolean);
  const activities = lensActivities(lens, state.switches, state.activities, today)
    .map((a) => `${a.kind} ×${a.days}`);
  return `<li>
    <button type="button" class="history-item" data-lens="${esc(lens.id)}">
      <div class="history-top">
        <span class="eye-badge">${lens.eye}</span>
        <span class="history-brand">${esc(lens.brand)}</span>
        <span class="pill ${lens.type}">${TYPE_NAMES[lens.type]}</span>
        ${s.inProgress ? `<span class="pill">In use</span>` : ""}
      </div>
      <div class="history-line num">${esc(formatShort(lens.openedOn, today))} – ${esc(end)} · ${plural(s.age, "day")}</div>
      <div class="history-line muted num">${s.worn} worn · ${s.rest} rest${s.isOver ? ` · <span class="text-over">${s.over} over</span>` : ""}</div>
      ${extras.length ? `<div class="history-line muted">${esc(extras.join(" · "))}</div>` : ""}
      ${activities.length ? `<div class="history-line muted num">${esc(activities.join(" · "))}</div>` : ""}
      ${lens.note ? `<div class="history-note">${esc(lens.note)}</div>` : ""}
    </button>
  </li>`;
}

function openEditSheet(id) {
  const state = store.getState();
  const lens = state.lenses.find((l) => l.id === id);
  if (!lens) return;
  const today = todayISO();
  const brands = state.brands[lens.type].includes(lens.brand)
    ? state.brands[lens.type]
    : [lens.brand, ...state.brands[lens.type]];
  let reason = lens.discardReason;

  openSheet((sheet) => {
    sheet.setContent(`
      <div class="sheet-head">
        <div class="sheet-head-text">
          <h2 class="sheet-title">Edit lens</h2>
          <p class="sheet-sub muted">${EYE_NAMES[lens.eye]} eye · ${TYPE_NAMES[lens.type]}</p>
        </div>
      </div>
      <form class="edit-form" novalidate>
        <label class="field">
          <span class="field-label">Brand</span>
          <select class="select" name="brand">
            ${brands.map((b) => `<option ${b === lens.brand ? "selected" : ""}>${esc(b)}</option>`).join("")}
          </select>
        </label>
        <div class="field-row">
          <label class="field">
            <span class="field-label">Opened</span>
            <input class="input" type="date" name="openedOn" value="${lens.openedOn}" max="${today}" required>
          </label>
          <label class="field">
            <span class="field-label">Discarded</span>
            <input class="input" type="date" name="discardedOn" value="${lens.discardedOn ?? ""}" max="${today}">
          </label>
        </div>
        <div class="field" data-discard-fields ${lens.discardedOn ? "" : "hidden"}>
          <span class="field-label">Reason</span>
          <div class="chips" data-reasons>
            ${REASONS.map((r) => `<button type="button" class="chip" data-reason="${r.key}" aria-pressed="${r.key === reason}">${esc(r.label)}</button>`).join("")}
          </div>
        </div>
        ${comfortField(lens.comfort, COMFORT_LABELS)}
        <label class="field">
          <span class="field-label">Note</span>
          <textarea class="textarea" name="note" rows="2">${esc(lens.note)}</textarea>
        </label>
        <button type="submit" class="btn btn-block btn-primary">Save</button>
        <button type="button" class="btn btn-block btn-danger" data-delete>Delete lens</button>
      </form>
    `);

    const form = sheet.body.querySelector("form");
    const getComfort = bindComfort(form, COMFORT_LABELS, lens.comfort);
    const discardFields = form.querySelector("[data-discard-fields]");
    form.discardedOn.addEventListener("change", () => { discardFields.hidden = !form.discardedOn.value; });
    form.querySelector("[data-reasons]").onclick = (e) => {
      const chip = e.target.closest("[data-reason]");
      if (!chip) return;
      reason = reason === chip.dataset.reason ? null : chip.dataset.reason;
      for (const c of form.querySelectorAll("[data-reason]")) c.setAttribute("aria-pressed", String(c.dataset.reason === reason));
    };

    form.onsubmit = (e) => {
      e.preventDefault();
      try {
        const { undo } = store.update((d) => editLens(d, id, {
          brand: form.brand.value,
          openedOn: form.openedOn.value,
          discardedOn: form.discardedOn.value || null,
          discardReason: reason,
          comfort: getComfort(),
          note: form.note.value,
        }));
        sheet.close();
        showToast("Lens updated", { undo });
      } catch (err) { showError(err); }
    };

    form.querySelector("[data-delete]").onclick = () => {
      const { undo } = store.update((d) => deleteLens(d, id));
      sheet.close();
      showToast(`Deleted ${lens.brand}`, { undo });
    };
  }, { label: "Edit lens" });
}

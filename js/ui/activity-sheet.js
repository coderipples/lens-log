// Bottom sheet for logging activities and the day note (both eyes) on a day.
// Tapping a chip logs or removes it right away; the sheet stays open for more.

import * as store from "../store.js";
import { activitiesOn, noteOn } from "../calc.js";
import { todayISO, formatRelative } from "../dates.js";
import { toggleActivity, addActivityKind } from "../actions.js";
import { openSheet } from "./sheet.js";
import { showToast, showError } from "./toast.js";
import { esc, dateChip, ICONS } from "./dom.js";
import { dayNoteField, saveDayNote } from "./day-note.js";

export function openActivitySheet() {
  // draft: unsaved note text, kept while chips re-render the sheet.
  const ui = { date: todayISO(), adding: false, draft: null };
  openSheet((sheet) => {
    const render = () => view(sheet, ui, render);
    // Repaint after an Undo from the toast; stop listening once the sheet is gone.
    const unsubscribe = store.subscribe(() => (sheet.body.isConnected ? render() : unsubscribe()));
    render();
  }, { label: "Activities and note" });
}

function view(sheet, ui, render) {
  const state = store.getState();
  const today = todayISO();
  const logged = activitiesOn(state.activities, ui.date);
  // Kinds removed in Settings still show on days they were logged, so they can be untoggled.
  const kinds = [...state.activityKinds, ...logged.filter((k) => !state.activityKinds.includes(k))];

  sheet.setContent(`
    <div class="sheet-head">
      <div class="sheet-head-text">
        <h2 class="sheet-title">Activities &amp; note</h2>
        <p class="sheet-sub muted">Both eyes · count for the lenses worn that day</p>
      </div>
    </div>
    <div class="sheet-row">${dateChip(ui.date, formatRelative(ui.date, today), today)}</div>
    <div class="chips" data-kinds>
      ${kinds.map((k) => `
        <button type="button" class="chip is-activity" data-kind="${esc(k)}" aria-pressed="${logged.includes(k)}">${esc(k)}</button>`).join("")}
      ${ui.adding ? "" : `<button type="button" class="chip chip-ghost" data-add>${ICONS.plus} New activity</button>`}
    </div>
    ${ui.adding ? `
      <form class="inline-form" data-add-form>
        <input class="input" name="kind" placeholder="Activity name" autocomplete="off" autocapitalize="sentences" enterkeyhint="done">
        <button class="btn" type="submit">Add</button>
      </form>` : ""}
    ${dayNoteField(ui.draft ?? noteOn(state.dayNotes, ui.date))}
  `);

  const body = sheet.body;
  const when = () => (ui.date === today ? "" : ` · ${formatRelative(ui.date, today)}`);

  body.querySelector(".date-chip-input").onchange = (e) => {
    const v = e.target.value;
    // Don't lose typed text: save it to the day it was written for.
    const draft = ui.draft;
    ui.draft = null;
    if (draft !== null && draft.trim() !== noteOn(store.getState().dayNotes, ui.date)) saveDayNote(ui.date, draft);
    ui.date = v && v <= today ? v : today;
    render();
  };
  const note = body.querySelector("[name=day-note]");
  note.oninput = () => { ui.draft = note.value; };
  body.querySelector("[data-save-note]").onclick = () => {
    const text = note.value;
    ui.draft = null;
    if (!saveDayNote(ui.date, text)) { ui.draft = text; render(); }
  };
  body.querySelector("[data-kinds]").onclick = (e) => {
    if (e.target.closest("[data-add]")) {
      ui.adding = true;
      render();
      body.querySelector("[name=kind]").focus();
      return;
    }
    const chip = e.target.closest("[data-kind]");
    if (!chip) return;
    const kind = chip.dataset.kind;
    try {
      const { result, undo } = store.update((d) => toggleActivity(d, { date: ui.date, kind }));
      showToast(`${kind} ${result.logged ? "logged" : "removed"}${when()}`, { undo });
    } catch (err) { showError(err); }
  };
  const form = body.querySelector("[data-add-form]");
  if (form) {
    form.onsubmit = (e) => {
      e.preventDefault();
      try {
        // Adding a new kind also logs it for the chosen day.
        ui.adding = false;
        const { result: kind, undo } = store.update((d) => {
          const name = addActivityKind(d, form.kind.value);
          if (!activitiesOn(d.activities, ui.date).includes(name)) toggleActivity(d, { date: ui.date, kind: name });
          return name;
        });
        showToast(`${kind} logged${when()}`, { undo });
      } catch (err) { ui.adding = true; showError(err); }
    };
  }
}

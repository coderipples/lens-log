// The day-note field shared by the activity sheet and the eye sheet.

import * as store from "../store.js";
import { noteOn } from "../calc.js";
import { todayISO, formatRelative } from "../dates.js";
import { setDayNote } from "../actions.js";
import { showToast, showError } from "./toast.js";
import { esc } from "./dom.js";

export function dayNoteField(text) {
  return `
    <label class="field">
      <span class="field-label">Note <span class="faint">(both eyes)</span></span>
      <textarea class="textarea" name="day-note" rows="3"
                placeholder="How your eyes felt, where you were, anything unusual">${esc(text)}</textarea>
    </label>
    <button type="button" class="btn btn-block" data-save-note>Save note</button>`;
}

/** Save the note for `date` with an Undo toast. Returns false if nothing changed or it failed. */
export function saveDayNote(date, text) {
  const today = todayISO();
  const when = date === today ? "" : ` · ${formatRelative(date, today)}`;
  if (text.trim() === noteOn(store.getState().dayNotes, date)) {
    showToast("No changes to the note", { duration: 1500 });
    return false;
  }
  try {
    const { result, undo } = store.update((d) => setDayNote(d, { date, text }));
    showToast(`Note ${result.saved === "removed" ? "removed" : "saved"}${when}`, { undo });
    return true;
  } catch (err) {
    showError(err);
    return false;
  }
}

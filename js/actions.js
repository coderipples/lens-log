// State mutations. Each function mutates the `state` it is given (store.js hands
// it a draft copy) and throws an Error with a user-facing message on invalid input.
// No DOM, no storage. Rules: see CLAUDE.md "Date rules".

import { addDays, maxISO, isValidISO } from "./dates.js";
import { eyeStatus } from "./calc.js";

export function makeId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function assertDate(date, what = "Date") {
  if (!isValidISO(date)) throw new Error(`${what} is not a valid date`);
}

function findLens(state, id) {
  const lens = state.lenses.find((l) => l.id === id);
  if (!lens) throw new Error("Lens not found");
  return lens;
}

function pushSwitch(state, eye, lensId, date) {
  state.switches.push({ id: makeId(), date, eye, lensId, seq: state.nextSeq++ });
}

/** Discard triggered by a switch on `switchDate`: last day is the day before (never before opening). */
function autoDiscard(lens, switchDate) {
  lens.discardedOn = maxISO(lens.openedOn, addDays(switchDate, -1));
  lens.discardReason = null;
}

/**
 * Open a new lens in one eye and put it in.
 * Auto-discards the previous undiscarded lens of the same type in that eye,
 * and an active daily when opening a monthly.
 * Returns { lens, discarded: Lens[] }.
 */
export function openLens(state, { eye, type, brand, date }) {
  assertDate(date);
  if (!brand?.trim()) throw new Error("Choose a brand");
  const status = eyeStatus(state, eye, date);
  const discarded = [];

  for (const l of state.lenses) {
    if (l.eye !== eye || l.type !== type || l.discardedOn) continue;
    if (l.openedOn > date) throw new Error(`There's a newer ${type} lens opened ${l.openedOn}`);
    autoDiscard(l, date);
    discarded.push(l);
  }
  if (status.active && status.active.type === "daily" && type !== "daily") {
    autoDiscard(status.active, date);
    discarded.push(status.active);
  }

  const lens = {
    id: makeId(),
    eye,
    type,
    brand: brand.trim(),
    openedOn: date,
    discardedOn: null,
    discardReason: null,
    comfort: null,
    note: "",
  };
  state.lenses.push(lens);
  pushSwitch(state, eye, lens.id, date);
  return { lens, discarded };
}

/**
 * Put an existing (resting) lens back in, or take the lens out (lensId = null).
 * Leaving an active daily for another lens auto-discards the daily.
 * Returns { discarded: Lens[] }.
 */
export function switchTo(state, { eye, lensId, date }) {
  assertDate(date);
  if (lensId) {
    const lens = findLens(state, lensId);
    if (lens.eye !== eye) throw new Error("That lens belongs to the other eye");
    if (lens.discardedOn) throw new Error("That lens was discarded");
    if (date < lens.openedOn) throw new Error("Date is before that lens was opened");
  }
  const status = eyeStatus(state, eye, date);
  const discarded = [];
  if (lensId && status.active?.type === "daily" && status.active.id !== lensId) {
    autoDiscard(status.active, date);
    discarded.push(status.active);
  }
  pushSwitch(state, eye, lensId, date);
  return { discarded };
}

/** Discard a lens. `date` is its last day. comfort is 1–5 or null. */
export function discardLens(state, { lensId, date, reason = null, comfort = null, note = "" }) {
  assertDate(date);
  const lens = findLens(state, lensId);
  if (date < lens.openedOn) throw new Error("Date is before the lens was opened");
  lens.discardedOn = date;
  lens.discardReason = reason;
  lens.comfort = comfort;
  if (note.trim()) lens.note = note.trim();
  return { lens };
}

/**
 * Edit lens fields. Changing openedOn also moves the lens's opening switch
 * (the one dated on the old openedOn).
 */
export function editLens(state, id, patch) {
  const lens = findLens(state, id);
  const next = { ...lens, ...patch };
  assertDate(next.openedOn, "Opened date");
  if (next.discardedOn) {
    assertDate(next.discardedOn, "Discarded date");
    if (next.discardedOn < next.openedOn) throw new Error("Discarded date is before opened date");
  }
  if (!next.brand?.trim()) throw new Error("Brand can't be empty");
  if (next.comfort !== null && !(next.comfort >= 1 && next.comfort <= 5)) throw new Error("Invalid comfort");

  if (next.openedOn !== lens.openedOn) {
    for (const s of state.switches) {
      if (s.lensId === id && s.date === lens.openedOn) s.date = next.openedOn;
    }
  }
  Object.assign(lens, {
    brand: next.brand.trim(),
    openedOn: next.openedOn,
    discardedOn: next.discardedOn || null,
    discardReason: next.discardedOn ? next.discardReason ?? null : null,
    comfort: next.comfort ?? null,
    note: (next.note ?? "").trim(),
  });
  return { lens };
}

/** Delete a lens and every switch that pointed to it. */
export function deleteLens(state, id) {
  findLens(state, id);
  state.lenses = state.lenses.filter((l) => l.id !== id);
  state.switches = state.switches.filter((s) => s.lensId !== id);
}

// ---------------------------------------------------------------------------
// Brands
// ---------------------------------------------------------------------------

/** Add a name to a list (trimmed, case-insensitive dedupe). Returns the stored name. */
function addName(list, name, what) {
  const clean = (name ?? "").trim().replace(/\s+/g, " ");
  if (!clean) throw new Error(`${what} can't be empty`);
  const existing = list.find((b) => b.toLowerCase() === clean.toLowerCase());
  if (existing) return existing;
  list.push(clean);
  return clean;
}

/** Add a brand (case-insensitive dedupe). Returns the stored name. */
export function addBrand(state, type, name) {
  return addName(state.brands[type], name, "Brand name");
}

export function removeBrand(state, type, name) {
  if (state.defaults[type] === name) throw new Error("Pick another default first");
  state.brands[type] = state.brands[type].filter((b) => b !== name);
}

export function setDefaultBrand(state, type, name) {
  if (!state.brands[type].includes(name)) throw new Error("Unknown brand");
  state.defaults[type] = name;
}

// ---------------------------------------------------------------------------
// Activities (both eyes, by date; linked to lenses through the switches)
// ---------------------------------------------------------------------------

/** Log `kind` on `date`, or remove it if already logged that day. Returns { logged }. */
export function toggleActivity(state, { date, kind }) {
  assertDate(date);
  if (!kind?.trim()) throw new Error("Choose an activity");
  const before = state.activities.length;
  state.activities = state.activities.filter((a) => !(a.date === date && a.kind === kind));
  if (state.activities.length < before) return { logged: false };
  state.activities.push({ id: makeId(), date, kind });
  return { logged: true };
}

/** Add an activity kind (case-insensitive dedupe). Returns the stored name. */
export function addActivityKind(state, name) {
  return addName(state.activityKinds, name, "Activity name");
}

/** Remove a kind from the picker. Activities already logged with it are kept. */
export function removeActivityKind(state, name) {
  state.activityKinds = state.activityKinds.filter((k) => k !== name);
}

// ---------------------------------------------------------------------------
// Day notes (one per date, both eyes)
// ---------------------------------------------------------------------------

/** Set the note for `date`; empty text removes it. Returns { saved: "saved" | "removed" | "unchanged" }. */
export function setDayNote(state, { date, text }) {
  assertDate(date);
  const clean = (text ?? "").trim();
  const existing = state.dayNotes.find((n) => n.date === date);
  if (!clean) {
    if (!existing) return { saved: "unchanged" };
    state.dayNotes = state.dayNotes.filter((n) => n.date !== date);
    return { saved: "removed" };
  }
  if (existing) {
    if (existing.text === clean) return { saved: "unchanged" };
    existing.text = clean;
  } else {
    state.dayNotes.push({ id: makeId(), date, text: clean });
  }
  return { saved: "saved" };
}

// Persistence: one versioned localStorage key, schema migration, and undo.

import { isValidISO } from "./dates.js";

export const STORAGE_KEY = "lenslog.v1";
export const SCHEMA_VERSION = 1;

export function seedState() {
  return {
    version: SCHEMA_VERSION,
    lenses: [],
    switches: [],
    brands: { monthly: ["Total30"], daily: ["Total1"] },
    defaults: { monthly: "Total30", daily: "Total1" },
    nextSeq: 1,
  };
}

/**
 * Bring any stored/imported object up to the current schema.
 * Add a step here for every future version bump; never drop data silently.
 */
export function migrate(raw) {
  if (!raw || typeof raw !== "object") throw new Error("Not a Lens Log data file");
  const s = structuredClone(raw);
  s.version ??= 1;
  if (s.version > SCHEMA_VERSION) throw new Error("This data is from a newer version of Lens Log");
  // if (s.version === 1) { …transform…; s.version = 2; }
  return normalize(s);
}

/** Fill defaults and repair small inconsistencies so the rest of the app can trust the shape. */
function normalize(s) {
  const seed = seedState();
  const out = {
    version: SCHEMA_VERSION,
    lenses: Array.isArray(s.lenses) ? s.lenses : [],
    switches: Array.isArray(s.switches) ? s.switches : [],
    brands: {
      monthly: Array.isArray(s.brands?.monthly) ? s.brands.monthly : seed.brands.monthly,
      daily: Array.isArray(s.brands?.daily) ? s.brands.daily : seed.brands.daily,
    },
    defaults: { ...seed.defaults, ...(s.defaults ?? {}) },
    nextSeq: 1,
  };
  for (const type of ["monthly", "daily"]) {
    if (!out.brands[type].length) out.brands[type] = [...seed.brands[type]];
    if (!out.brands[type].includes(out.defaults[type])) out.defaults[type] = out.brands[type][0];
  }
  out.lenses = out.lenses.map((l) => ({
    id: l.id,
    eye: l.eye,
    type: l.type,
    brand: l.brand ?? "",
    openedOn: l.openedOn,
    discardedOn: l.discardedOn ?? null,
    discardReason: l.discardReason ?? null,
    comfort: l.comfort ?? null,
    note: l.note ?? "",
  }));
  let maxSeq = 0;
  out.switches = out.switches.map((sw, i) => {
    const seq = Number.isFinite(sw.seq) ? sw.seq : i + 1;
    maxSeq = Math.max(maxSeq, seq);
    return { id: sw.id, date: sw.date, eye: sw.eye, lensId: sw.lensId ?? null, seq };
  });
  out.nextSeq = Math.max(maxSeq + 1, Number.isFinite(s.nextSeq) ? s.nextSeq : 1);
  return out;
}

/** Returns a list of problems (empty when valid). Used before importing. */
export function validate(s) {
  const errors = [];
  const ids = new Set();
  for (const l of s.lenses) {
    const tag = `Lens ${l.id ?? "?"}`;
    if (!l.id || ids.has(l.id)) errors.push(`${tag}: missing or duplicate id`);
    ids.add(l.id);
    if (l.eye !== "L" && l.eye !== "R") errors.push(`${tag}: eye must be L or R`);
    if (l.type !== "monthly" && l.type !== "daily") errors.push(`${tag}: unknown type`);
    if (!isValidISO(l.openedOn)) errors.push(`${tag}: invalid openedOn`);
    if (l.discardedOn !== null && !isValidISO(l.discardedOn)) errors.push(`${tag}: invalid discardedOn`);
    if (l.discardedOn && l.discardedOn < l.openedOn) errors.push(`${tag}: discarded before opened`);
    if (l.comfort !== null && !(Number.isInteger(l.comfort) && l.comfort >= 1 && l.comfort <= 5))
      errors.push(`${tag}: comfort must be 1–5 or null`);
  }
  for (const sw of s.switches) {
    if (!isValidISO(sw.date)) errors.push(`Switch ${sw.id ?? "?"}: invalid date`);
    if (sw.eye !== "L" && sw.eye !== "R") errors.push(`Switch ${sw.id ?? "?"}: eye must be L or R`);
    if (sw.lensId !== null && !ids.has(sw.lensId)) errors.push(`Switch ${sw.id ?? "?"}: unknown lens`);
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Runtime store
// ---------------------------------------------------------------------------

let state = seedState();
const listeners = new Set();
let onSaveError = () => {};

export const getState = () => state;
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));
export const setSaveErrorHandler = (fn) => { onSaveError = fn; };

function emit() { for (const fn of listeners) fn(state); }

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error(err);
    onSaveError(err);
  }
}

export function init() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    state = raw ? migrate(JSON.parse(raw)) : seedState();
  } catch (err) {
    console.error("Could not read saved data", err);
    // Keep the unreadable data aside rather than overwriting it.
    try { if (raw) localStorage.setItem(`${STORAGE_KEY}.unreadable-${Date.now()}`, raw); } catch {}
    state = seedState();
  }
  return state;
}

/**
 * Apply a mutation to a copy of the state. If it throws, nothing changes.
 * Returns { result, undo }.
 */
export function update(mutator) {
  const snapshot = state;
  const draft = structuredClone(state);
  const result = mutator(draft);
  state = draft;
  persist();
  emit();
  return {
    result,
    undo() {
      state = snapshot;
      persist();
      emit();
    },
  };
}

/** Replace everything (import). Validates first and throws on problems. */
export function replaceState(raw) {
  const next = migrate(raw);
  const errors = validate(next);
  if (errors.length) throw new Error(errors.slice(0, 3).join("\n"));
  state = next;
  persist();
  emit();
}

export function exportJSON() {
  return JSON.stringify(state, null, 2);
}

// Derived values: active lenses, ages, wear/rest days and stats.
// Pure: no DOM, no storage. All dates are "YYYY-MM-DD" (see dates.js).
// The rules are documented in CLAUDE.md under "Date rules".

import { addDays, diffDays } from "./dates.js";

export const LIMITS = { monthly: 30, daily: 3 };

export const REASONS = [
  { key: "dry", label: "Dry / uncomfortable" },
  { key: "damaged", label: "Damaged" },
  { key: "reached-date", label: "Reached date" },
  { key: "lost", label: "Lost" },
];

export const COMFORT_LABELS = ["Irritated", "Noticeable", "Fine", "Comfortable", "Can't feel it"];

export const reasonLabel = (key) => REASONS.find((r) => r.key === key)?.label ?? null;
export const comfortLabel = (v) => (v >= 1 && v <= 5 ? COMFORT_LABELS[v - 1] : null);

// ---------------------------------------------------------------------------
// Switches and active lens
// ---------------------------------------------------------------------------

/** Switches for one eye in chronological order (date, then seq). */
export function eyeSwitches(switches, eye) {
  return switches
    .filter((s) => s.eye === eye)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.seq ?? 0) - (b.seq ?? 0)));
}

/** lensId (or null) set by the last switch on or before `date`, from pre-sorted switches. */
export function activeLensIdOn(sortedSwitches, date) {
  let id = null;
  for (const s of sortedSwitches) {
    if (s.date > date) break;
    id = s.lensId;
  }
  return id;
}

/**
 * Current situation for one eye on `date`.
 * active: the lens in the eye (never a discarded one).
 * restingMonthly / restingDaily: undiscarded lenses of that eye that are not in the eye.
 */
export function eyeStatus(state, eye, date) {
  const sorted = eyeSwitches(state.switches, eye);
  const activeId = activeLensIdOn(sorted, date);
  const open = state.lenses.filter((l) => l.eye === eye && !l.discardedOn && l.openedOn <= date);
  const active = open.find((l) => l.id === activeId) ?? null;
  const resting = open
    .filter((l) => l !== active)
    .sort((a, b) => (a.openedOn < b.openedOn ? 1 : -1));
  return {
    active,
    restingMonthly: resting.find((l) => l.type === "monthly") ?? null,
    restingDaily: resting.find((l) => l.type === "daily") ?? null,
  };
}

// ---------------------------------------------------------------------------
// Per-lens derivations
// ---------------------------------------------------------------------------

/** Last calendar day the lens counts for: its discard date, or today. */
export const lensEnd = (lens, today) => lens.discardedOn ?? today;

/** Calendar age in days; the opening day is day 1. Never capped. 0 if not yet opened. */
export function calendarAge(lens, today) {
  return Math.max(0, diffDays(lens.openedOn, lensEnd(lens, today)) + 1);
}

/** One entry per calendar day of the lens's life: "worn" or "rest". */
export function lensDays(lens, switches, today) {
  const sorted = eyeSwitches(switches, lens.eye);
  const age = calendarAge(lens, today);
  const days = new Array(age);
  let i = 0;
  let current = null;
  for (let k = 0; k < age; k++) {
    const d = addDays(lens.openedOn, k);
    while (i < sorted.length && sorted[i].date <= d) current = sorted[i++].lensId;
    days[k] = current === lens.id ? "worn" : "rest";
  }
  return days;
}

/** Run-length encode a day array: [{ kind: "worn", days: 5 }, { kind: "rest", days: 2 }, …] */
export function toRuns(days) {
  const runs = [];
  for (const kind of days) {
    const last = runs[runs.length - 1];
    if (last && last.kind === kind) last.days++;
    else runs.push({ kind, days: 1 });
  }
  return runs;
}

/** Everything the UI needs to show one lens. */
export function lensSummary(lens, switches, today) {
  const days = lensDays(lens, switches, today);
  const age = days.length;
  const worn = days.filter((d) => d === "worn").length;
  const limit = LIMITS[lens.type];
  return {
    age,
    worn,
    rest: age - worn,
    limit,
    over: Math.max(0, age - limit),
    isOver: age > limit,
    fraction: limit ? Math.min(age / limit, 1) : 0,
    runs: toRuns(days),
    inProgress: !lens.discardedOn,
  };
}

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

/** Kinds logged on `date`, in the order they were logged. */
export function activitiesOn(activities, date) {
  return [...new Set(activities.filter((a) => a.date === date).map((a) => a.kind))];
}

/**
 * Activities on the days the lens was worn (rest days don't count):
 * [{ kind, days }], most days first, then by name.
 */
export function lensActivities(lens, switches, activities, today) {
  if (!activities.length) return [];
  const days = lensDays(lens, switches, today);
  const byKind = new Map();
  for (const a of activities) {
    const k = diffDays(lens.openedOn, a.date);
    if (k < 0 || k >= days.length || days[k] !== "worn") continue;
    if (!byKind.has(a.kind)) byKind.set(a.kind, new Set());
    byKind.get(a.kind).add(a.date);
  }
  return [...byKind]
    .map(([kind, dates]) => ({ kind, days: dates.size }))
    .sort((a, b) => b.days - a.days || a.kind.localeCompare(b.kind));
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** { n, median, min, max } or null for an empty list. */
export function summarize(nums) {
  if (!nums.length) return null;
  return { n: nums.length, median: median(nums), min: Math.min(...nums), max: Math.max(...nums) };
}

/** Monthly lenses that count toward lifespan stats: discarded and not lost. */
export const isLifespanEligible = (l) =>
  l.type === "monthly" && !!l.discardedOn && l.discardReason !== "lost";

export function monthlyStats(state, today) {
  const done = state.lenses.filter(isLifespanEligible);
  const sums = done.map((l) => lensSummary(l, state.switches, today));
  return {
    life: summarize(sums.map((s) => s.age)),
    worn: summarize(sums.map((s) => s.worn)),
  };
}

/**
 * Rows for the lifespan strip chart: completed (non-lost) monthlies plus the
 * current in-progress ones, newest first.
 */
export function lifespanRows(state, today) {
  return state.lenses
    .filter((l) => l.type === "monthly" && l.discardReason !== "lost" && l.openedOn <= today)
    .sort((a, b) => (a.openedOn < b.openedOn ? 1 : a.openedOn > b.openedOn ? -1 : a.eye < b.eye ? -1 : 1))
    .map((lens) => ({ lens, ...lensSummary(lens, state.switches, today) }));
}

/** Counts per discard reason, in REASONS order, including zeros. */
export function reasonCounts(lenses, type = null) {
  return REASONS.map((r) => ({
    ...r,
    count: lenses.filter((l) => l.discardReason === r.key && (!type || l.type === type)).length,
  }));
}

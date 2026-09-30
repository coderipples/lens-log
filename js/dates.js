// Local calendar-date helpers. Pure: no DOM, no storage.
//
// Dates are "YYYY-MM-DD" strings for the user's local calendar day. For arithmetic
// we map a date to an integer day number via Date.UTC, which has no DST, so
// differences are always whole days regardless of time zone or clock changes.

const MS_PER_DAY = 86400000;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (n) => String(n).padStart(2, "0");

/** Today's local calendar date. `now` is injectable for tests. */
export function todayISO(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function isValidISO(s) {
  if (typeof s !== "string") return false;
  const m = ISO_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Integer day number (days since 1970-01-01) for a calendar date. */
export function toDayNumber(iso) {
  const m = ISO_RE.exec(iso);
  if (!m) throw new Error(`Invalid date: ${iso}`);
  return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / MS_PER_DAY);
}

export function fromDayNumber(n) {
  const dt = new Date(n * MS_PER_DAY);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function addDays(iso, n) {
  return fromDayNumber(toDayNumber(iso) + n);
}

/** Whole days from `a` to `b` (b − a). diffDays("2026-09-01", "2026-09-02") === 1 */
export function diffDays(a, b) {
  return toDayNumber(b) - toDayNumber(a);
}

export function maxISO(a, b) { return a >= b ? a : b; }
export function minISO(a, b) { return a <= b ? a : b; }

// ---- Formatting (locale-aware, but always on the calendar date, never shifted) ----

function utcDate(iso) {
  return new Date(toDayNumber(iso) * MS_PER_DAY);
}

/** "3 Sep" or "3 Sep 2025" when not in the reference year. */
export function formatShort(iso, today = todayISO()) {
  const opts = { day: "numeric", month: "short", timeZone: "UTC" };
  if (iso.slice(0, 4) !== today.slice(0, 4)) opts.year = "numeric";
  return utcDate(iso).toLocaleDateString(undefined, opts);
}

/** "Today", "Yesterday", or "Mon 28 Sep". */
export function formatRelative(iso, today = todayISO()) {
  const d = diffDays(iso, today);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  const opts = { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" };
  if (iso.slice(0, 4) !== today.slice(0, 4)) opts.year = "numeric";
  return utcDate(iso).toLocaleDateString(undefined, opts);
}

import { test } from "node:test";
import assert from "node:assert/strict";

import { todayISO, isValidISO, addDays, diffDays } from "../js/dates.js";
import {
  calendarAge, lensDays, lensSummary, toRuns, eyeStatus,
  median, summarize, monthlyStats, lifespanRows, reasonCounts,
  activitiesOn, lensActivities,
} from "../js/calc.js";
import {
  openLens, switchTo, discardLens, editLens, deleteLens, addBrand,
  toggleActivity, addActivityKind, removeActivityKind,
} from "../js/actions.js";
import { seedState, migrate, validate, DEFAULT_ACTIVITY_KINDS } from "../js/store.js";

// ---------------------------------------------------------------------------
// dates.js
// ---------------------------------------------------------------------------

test("todayISO uses the local calendar date", () => {
  assert.equal(todayISO(new Date(2026, 8, 30, 0, 5)), "2026-09-30");
  assert.equal(todayISO(new Date(2026, 8, 30, 23, 59)), "2026-09-30");
});

test("isValidISO rejects impossible dates", () => {
  assert.ok(isValidISO("2028-02-29"));
  assert.ok(!isValidISO("2026-02-29"));
  assert.ok(!isValidISO("2026-9-1"));
  assert.ok(!isValidISO(null));
});

test("date arithmetic is whole days across DST and month/year ends", () => {
  assert.equal(diffDays("2026-03-28", "2026-03-30"), 2); // EU spring forward
  assert.equal(diffDays("2026-10-24", "2026-10-26"), 2); // EU fall back
  assert.equal(diffDays("2026-03-07", "2026-03-09"), 2); // US spring forward
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2028-03-01", -1), "2028-02-29");
  assert.equal(diffDays("2026-09-30", "2026-09-01"), -29);
});

// ---------------------------------------------------------------------------
// Scenario helpers
// ---------------------------------------------------------------------------

function scenario() {
  // Left eye: monthly opened Sep 1, daily Sep 10–12, back to monthly Sep 13.
  const s = seedState();
  const { lens: monthly } = openLens(s, { eye: "L", type: "monthly", brand: "Total30", date: "2026-09-01" });
  const { lens: daily } = openLens(s, { eye: "L", type: "daily", brand: "Total1", date: "2026-09-10" });
  const { discarded } = switchTo(s, { eye: "L", lensId: monthly.id, date: "2026-09-13" });
  return { s, monthly, daily, discarded };
}

// ---------------------------------------------------------------------------
// calc.js
// ---------------------------------------------------------------------------

test("opening day is day 1 and the count is never capped", () => {
  const lens = { openedOn: "2026-09-01", discardedOn: null };
  assert.equal(calendarAge(lens, "2026-09-01"), 1);
  assert.equal(calendarAge(lens, "2026-09-30"), 30);
  assert.equal(calendarAge(lens, "2026-10-05"), 35);
  assert.equal(calendarAge(lens, "2026-08-31"), 0);
  assert.equal(calendarAge({ openedOn: "2026-09-01", discardedOn: "2026-09-03" }, "2026-12-01"), 3);
});

test("monthly rests while a daily is worn, then resumes", () => {
  const { s, monthly, daily, discarded } = scenario();
  const today = "2026-09-20";

  const m = lensSummary(monthly, s.switches, today);
  assert.equal(m.age, 20);
  assert.equal(m.worn, 17); // Sep 1–9 (9) + Sep 13–20 (8)
  assert.equal(m.rest, 3); // Sep 10–12
  assert.deepEqual(m.runs, [
    { kind: "worn", days: 9 },
    { kind: "rest", days: 3 },
    { kind: "worn", days: 8 },
  ]);

  // Leaving the active daily for the monthly auto-discarded it the day before.
  assert.deepEqual(discarded.map((l) => l.id), [daily.id]);
  const d = s.lenses.find((l) => l.id === daily.id);
  assert.equal(d.discardedOn, "2026-09-12");
  assert.equal(d.discardReason, null);
  const ds = lensSummary(d, s.switches, today);
  assert.equal(ds.age, 3);
  assert.equal(ds.worn, 3);
  assert.equal(ds.isOver, false);
});

test("ring fraction clamps at 1 but the over count keeps going", () => {
  const s = seedState();
  const { lens } = openLens(s, { eye: "R", type: "monthly", brand: "Total30", date: "2026-09-01" });
  const sum = lensSummary(lens, s.switches, "2026-10-03");
  assert.equal(sum.age, 33);
  assert.equal(sum.fraction, 1);
  assert.equal(sum.over, 3);
  assert.equal(sum.isOver, true);

  const half = lensSummary(lens, s.switches, "2026-09-15");
  assert.equal(half.fraction, 0.5);
  assert.equal(half.over, 0);
});

test("daily limit is 3 days", () => {
  const s = seedState();
  const { lens } = openLens(s, { eye: "L", type: "daily", brand: "Total1", date: "2026-09-28" });
  assert.equal(lensSummary(lens, s.switches, "2026-09-30").isOver, false);
  const over = lensSummary(lens, s.switches, "2026-10-01");
  assert.equal(over.over, 1);
  assert.equal(over.fraction, 1);
});

test("no lens counts as rest; eyeStatus reports resting lenses", () => {
  const s = seedState();
  const { lens } = openLens(s, { eye: "L", type: "monthly", brand: "Total30", date: "2026-09-01" });
  switchTo(s, { eye: "L", lensId: null, date: "2026-09-05" });

  const st = eyeStatus(s, "L", "2026-09-06");
  assert.equal(st.active, null);
  assert.equal(st.restingMonthly.id, lens.id);

  assert.deepEqual(toRuns(lensDays(lens, s.switches, "2026-09-06")), [
    { kind: "worn", days: 4 },
    { kind: "rest", days: 2 },
  ]);
  // Status before the switch still shows it active.
  assert.equal(eyeStatus(s, "L", "2026-09-04").active.id, lens.id);
});

test("switching to no lens keeps a daily resting", () => {
  const s = seedState();
  const { lens } = openLens(s, { eye: "R", type: "daily", brand: "Total1", date: "2026-09-01" });
  switchTo(s, { eye: "R", lensId: null, date: "2026-09-02" });
  const st = eyeStatus(s, "R", "2026-09-02");
  assert.equal(st.active, null);
  assert.equal(st.restingDaily.id, lens.id);
  assert.equal(lens.discardedOn, null);
});

test("same-day switches: the later one wins", () => {
  const s = seedState();
  const { lens: m } = openLens(s, { eye: "L", type: "monthly", brand: "Total30", date: "2026-09-01" });
  switchTo(s, { eye: "L", lensId: null, date: "2026-09-03" });
  switchTo(s, { eye: "L", lensId: m.id, date: "2026-09-03" });
  assert.equal(lensSummary(m, s.switches, "2026-09-03").worn, 3);
});

test("a discarded lens is worn on its discard day but never current afterwards", () => {
  const s = seedState();
  const { lens } = openLens(s, { eye: "L", type: "monthly", brand: "Total30", date: "2026-09-01" });
  discardLens(s, { lensId: lens.id, date: "2026-09-30", reason: "reached-date", comfort: null });
  const sum = lensSummary(lens, s.switches, "2026-10-10");
  assert.equal(sum.age, 30);
  assert.equal(sum.worn, 30);
  assert.equal(eyeStatus(s, "L", "2026-09-30").active, null);
});

test("opening a new monthly auto-discards the previous one the day before", () => {
  const s = seedState();
  const { lens: old } = openLens(s, { eye: "L", type: "monthly", brand: "Total30", date: "2026-08-01" });
  const { discarded } = openLens(s, { eye: "L", type: "monthly", brand: "Total30", date: "2026-09-01" });
  assert.deepEqual(discarded.map((l) => l.id), [old.id]);
  assert.equal(old.discardedOn, "2026-08-31");
  assert.equal(calendarAge(old, "2026-09-10"), 31);
});

test("opening a daily leaves the monthly resting, not discarded", () => {
  const s = seedState();
  const { lens: m } = openLens(s, { eye: "L", type: "monthly", brand: "Total30", date: "2026-09-01" });
  const { discarded } = openLens(s, { eye: "L", type: "daily", brand: "Total1", date: "2026-09-10" });
  assert.equal(discarded.length, 0);
  assert.equal(m.discardedOn, null);
  assert.equal(eyeStatus(s, "L", "2026-09-10").restingMonthly.id, m.id);
});

test("eyes are independent", () => {
  const s = seedState();
  const { lens: l } = openLens(s, { eye: "L", type: "monthly", brand: "Total30", date: "2026-09-01" });
  openLens(s, { eye: "R", type: "daily", brand: "Total1", date: "2026-09-05" });
  assert.equal(lensSummary(l, s.switches, "2026-09-10").worn, 10);
});

test("invalid actions throw and describe the problem", () => {
  const s = seedState();
  const { lens } = openLens(s, { eye: "L", type: "monthly", brand: "Total30", date: "2026-09-10" });
  assert.throws(() => switchTo(s, { eye: "L", lensId: lens.id, date: "2026-09-01" }), /before/);
  assert.throws(() => switchTo(s, { eye: "R", lensId: lens.id, date: "2026-09-12" }), /other eye/);
  assert.throws(() => discardLens(s, { lensId: lens.id, date: "2026-09-09" }), /before/);
  assert.throws(() => openLens(s, { eye: "L", type: "monthly", brand: " ", date: "2026-09-12" }), /brand/);
});

test("editing openedOn moves the opening switch; delete removes switches", () => {
  const { s, monthly } = scenario();
  editLens(s, monthly.id, { openedOn: "2026-08-30" });
  assert.equal(lensSummary(monthly, s.switches, "2026-09-01").worn, 3);
  deleteLens(s, monthly.id);
  assert.equal(s.switches.some((sw) => sw.lensId === monthly.id), false);
});

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

test("median and summarize", () => {
  assert.equal(median([]), null);
  assert.equal(median([5]), 5);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.deepEqual(summarize([30, 28, 35]), { n: 3, median: 30, min: 28, max: 35 });
  assert.equal(summarize([]), null);
});

test("monthly stats exclude lost and in-progress lenses", () => {
  const s = seedState();
  const a = openLens(s, { eye: "L", type: "monthly", brand: "Total30", date: "2026-06-01" }).lens;
  discardLens(s, { lensId: a.id, date: "2026-06-30", reason: "reached-date" }); // 30 days
  const b = openLens(s, { eye: "L", type: "monthly", brand: "Total30", date: "2026-07-01" }).lens;
  discardLens(s, { lensId: b.id, date: "2026-07-03", reason: "lost" }); // excluded
  const c = openLens(s, { eye: "L", type: "monthly", brand: "Total30", date: "2026-07-04" }).lens;
  switchTo(s, { eye: "L", lensId: null, date: "2026-07-20" });
  switchTo(s, { eye: "L", lensId: c.id, date: "2026-07-25" });
  discardLens(s, { lensId: c.id, date: "2026-08-07", reason: "dry" }); // 35 days, 30 worn
  openLens(s, { eye: "L", type: "monthly", brand: "Total30", date: "2026-09-01" }); // in progress

  const st = monthlyStats(s, "2026-09-10");
  assert.deepEqual(st.life, { n: 2, median: 32.5, min: 30, max: 35 });
  assert.deepEqual(st.worn, { n: 2, median: 30, min: 30, max: 30 });

  const rows = lifespanRows(s, "2026-09-10");
  assert.equal(rows.length, 3); // lost one excluded
  assert.equal(rows[0].inProgress, true);
  assert.equal(rows[0].age, 10);

  const counts = Object.fromEntries(reasonCounts(s.lenses).map((r) => [r.key, r.count]));
  assert.deepEqual(counts, { dry: 1, damaged: 0, "reached-date": 1, lost: 1 });
});

test("empty stats are null", () => {
  const st = monthlyStats(seedState(), "2026-09-30");
  assert.equal(st.life, null);
  assert.equal(st.worn, null);
});

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

test("migrate fills defaults, keeps data, and rejects newer versions", () => {
  const m = migrate({ lenses: [], switches: [{ id: "a", date: "2026-09-01", eye: "L", lensId: null }] });
  assert.equal(m.version, 2);
  assert.deepEqual(m.brands.monthly, ["Total30"]);
  assert.equal(m.switches[0].seq, 1);
  assert.equal(m.nextSeq, 2);
  assert.throws(() => migrate({ version: 99 }), /newer version/);
  assert.throws(() => migrate("nope"), /Not a Lens Log/);
});

test("migrating v1 data keeps every lens and switch and adds an empty activity log", () => {
  const { s } = scenario();
  const v1 = structuredClone(s);
  v1.version = 1;
  delete v1.activities;
  delete v1.activityKinds;
  const m = migrate(v1);
  assert.equal(m.version, 2);
  assert.deepEqual(m.lenses, s.lenses);
  assert.deepEqual(m.switches, s.switches);
  assert.deepEqual(m.brands, s.brands);
  assert.deepEqual(m.activities, []);
  assert.deepEqual(m.activityKinds, DEFAULT_ACTIVITY_KINDS);
});

test("v2 activities and kinds survive a save/load round trip", () => {
  const s = seedState();
  toggleActivity(s, { date: "2026-09-02", kind: "Swimming" });
  removeActivityKind(s, "Sauna");
  const m = migrate(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(m.activities, s.activities);
  assert.ok(!m.activityKinds.includes("Sauna"));
  s.activityKinds = [];
  assert.deepEqual(migrate(s).activityKinds, []);
});

test("validate catches broken references and dates", () => {
  const { s } = scenario();
  assert.deepEqual(validate(s), []);
  const bad = structuredClone(s);
  bad.switches.push({ id: "x", date: "2026-13-01", eye: "L", lensId: "missing", seq: 99 });
  bad.activities.push({ id: "y", date: "2026-09-31", kind: " " });
  assert.equal(validate(bad).length, 4);
});

test("addBrand dedupes case-insensitively", () => {
  const s = seedState();
  assert.equal(addBrand(s, "monthly", "  total30 "), "Total30");
  assert.equal(addBrand(s, "monthly", "Acuvue  Oasys"), "Acuvue Oasys");
  assert.deepEqual(s.brands.monthly, ["Total30", "Acuvue Oasys"]);
});

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

test("toggleActivity logs once per kind per day and toggles off", () => {
  const s = seedState();
  assert.deepEqual(toggleActivity(s, { date: "2026-09-02", kind: "Swimming" }), { logged: true });
  toggleActivity(s, { date: "2026-09-02", kind: "Climbing" });
  assert.deepEqual(activitiesOn(s.activities, "2026-09-02"), ["Swimming", "Climbing"]);
  assert.deepEqual(toggleActivity(s, { date: "2026-09-02", kind: "Swimming" }), { logged: false });
  assert.deepEqual(activitiesOn(s.activities, "2026-09-02"), ["Climbing"]);
  assert.throws(() => toggleActivity(s, { date: "2026-02-30", kind: "Swimming" }), /valid date/);
  assert.throws(() => toggleActivity(s, { date: "2026-09-02", kind: "" }), /Choose/);
});

test("activities count only on days the lens was worn", () => {
  // Left: monthly worn Sep 1–9 and from Sep 13, daily worn Sep 10–12 (discarded Sep 12).
  const { s, monthly, daily } = scenario();
  for (const date of ["2026-08-31", "2026-09-02", "2026-09-05", "2026-09-11", "2026-09-14"]) {
    toggleActivity(s, { date, kind: "Swimming" });
  }
  toggleActivity(s, { date: "2026-09-05", kind: "Climbing" });
  const today = "2026-09-20";
  assert.deepEqual(lensActivities(monthly, s.switches, s.activities, today), [
    { kind: "Swimming", days: 3 },
    { kind: "Climbing", days: 1 },
  ]);
  assert.deepEqual(lensActivities(daily, s.switches, s.activities, today), [{ kind: "Swimming", days: 1 }]);

  // A day with no lens in doesn't count.
  switchTo(s, { eye: "L", lensId: null, date: "2026-09-16" });
  toggleActivity(s, { date: "2026-09-17", kind: "Swimming" });
  assert.equal(lensActivities(monthly, s.switches, s.activities, today)[0].days, 3);
});

test("activities apply to both eyes and can be logged retroactively", () => {
  const s = seedState();
  const { lens: left } = openLens(s, { eye: "L", type: "monthly", brand: "Total30", date: "2026-09-01" });
  const { lens: right } = openLens(s, { eye: "R", type: "monthly", brand: "Total30", date: "2026-09-04" });
  toggleActivity(s, { date: "2026-09-02", kind: "Sauna" }); // logged later, dated in the past
  toggleActivity(s, { date: "2026-09-05", kind: "Sauna" });
  const today = "2026-09-10";
  assert.deepEqual(lensActivities(left, s.switches, s.activities, today), [{ kind: "Sauna", days: 2 }]);
  assert.deepEqual(lensActivities(right, s.switches, s.activities, today), [{ kind: "Sauna", days: 1 }]);
});

test("activity kinds dedupe, and removing a kind keeps what was logged", () => {
  const s = seedState();
  assert.equal(addActivityKind(s, " swimming "), "Swimming");
  assert.equal(addActivityKind(s, "Hot  yoga"), "Hot yoga");
  assert.equal(s.activityKinds.at(-1), "Hot yoga");
  toggleActivity(s, { date: "2026-09-02", kind: "Hot yoga" });
  removeActivityKind(s, "Hot yoga");
  assert.ok(!s.activityKinds.includes("Hot yoga"));
  assert.equal(s.activities.length, 1);
});

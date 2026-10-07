# Lens Log

Contact lens tracker for iPhone, used as a Home Screen web app.

## Stack and constraints

- Plain HTML, CSS and JavaScript (ES modules). No frameworks, no build step, no runtime dependencies.
- Serve over HTTP to run (`python3 -m http.server 8000`); modules don't load from `file://`.
- Tests: `npm test` (runs `node --test tests/*.test.js`, no dependencies). `package.json` exists only for `"type": "module"` and the test script.
- All paths are relative so the app works from a subfolder (e.g. GitHub Pages).
- The owner does Git themselves: never commit or push.

## Files

- `js/dates.js`: PURE local calendar-date helpers. No DOM, no storage.
- `js/calc.js`: PURE derivations (active lens, age, wear/rest days, stats). No DOM, no storage.
- `js/actions.js`: state mutations (open, switch, discard, edit, delete). No DOM.
- `js/store.js`: localStorage persistence, seeding, migration, undo snapshots.
- `js/app.js`: entry point, tab routing, rendering.
- `js/ui/*.js`: one module per screen, plus the sheet, toast and DOM helpers.
- `css/styles.css`: every colour, spacing, radius, font and size is a CSS variable on `:root`.
- `sw.js`: network-first offline cache. Add any new file to `ASSETS` and bump `VERSION`.

Keep date and stats logic in `dates.js` and `calc.js`, and cover changes to them with tests.

## Data

- One localStorage key, `lenslog.v1`, holding
  `{ version, lenses, switches, brands: {monthly, daily}, defaults: {monthly, daily}, activities, activityKinds, dayNotes, nextSeq }`
  (schema version 3).
- Schema changes: bump `version` and add a step to `migrate()` in `store.js`. Never silently drop data.
- Lens: `{ id, eye: "L"|"R", type: "monthly"|"daily", brand, openedOn, discardedOn, discardReason, comfort, note }`
- Switch: `{ id, date, eye, lensId | null, seq }`. `null` means no lens. `seq` orders switches on the same day.
- Discard reasons: `dry`, `damaged`, `reached-date`, `lost` (or `null` for auto-discards).
- Comfort is 1–5, or `null` when not rated.
- Activity: `{ id, date, kind }`, for both eyes, at most one per kind per day. It is never linked to a lens directly:
  it counts for each lens that was worn (active) on that date, so it can be logged retroactively.
  `activityKinds` is the picker list; removing a kind keeps the activities already logged with it.
- Day note: `{ id, date, text }`, for both eyes, at most one per day (empty text removes it). History shows it
  under every lens whose life (worn or resting) includes that date. Separate from a lens's own `note`.

## Date rules

- Dates are local calendar dates stored as `YYYY-MM-DD` strings, never timestamps. Do arithmetic through
  `dates.js`, which converts to day numbers via `Date.UTC`, so DST and midnight never shift a count.
- The day of opening is day 1: `calendarAge = (discardedOn ?? today) − openedOn + 1`. Never cap it.
- The active lens on day D for an eye comes from the last switch dated on or before D (ties are broken by `seq`).
  A switch on D gives day D to the new lens.
- A lens counts as worn on each day, from `openedOn` to its end, on which it is active. `rest = age − worn`.
- A lens with `discardedOn` is never "current", even if the last switch points to it.
- Only log switches, never daily insert/removal.
- Invariant: at most one undiscarded lens per eye per type. Opening a new lens auto-discards the previous
  undiscarded lens of that type in that eye. Switching away from an active daily to another lens
  auto-discards the daily. Auto-discards use the day before the switch (never earlier than `openedOn`)
  and have no reason. Switching to "no lens" keeps a daily resting.
- Ring fraction is `min(age / limit, 1)` (monthly 30, daily 3). Past the limit it turns amber and shows "N days over".
- Stats: monthly lenses with `discardedOn`, excluding `discardReason === "lost"`.

## UX conventions

- Actions apply immediately and show an Undo toast. No confirm dialogs (the only exception is import, which replaces all data).
- Touch targets are at least 44px (`--tap`). Respect safe areas (`env(safe-area-inset-*)`).
- Colours: purple = monthly, cyan = daily, amber = over the limit (and nothing else).
- Charts are inline SVG. No chart libraries.

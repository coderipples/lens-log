// Now screen: one card per eye with a progress ring.

import { eyeStatus, lensSummary, activitiesOn } from "../calc.js";
import { formatShort } from "../dates.js";
import { esc, ring, plural, ICONS, EYE_NAMES, TYPE_NAMES } from "./dom.js";
import { openNowSheet } from "./now-sheet.js";
import { openActivitySheet } from "./activity-sheet.js";

export function renderNow(el, state, today) {
  const hasAny = state.lenses.length > 0;
  el.innerHTML = `
    <div class="eye-grid">
      ${eyeCard(state, "L", today)}
      ${eyeCard(state, "R", today)}
    </div>
    ${hasAny ? "" : `<p class="hint">Tap an eye to open your first lens.</p>`}
    ${activityRow(state, today)}
  `;
  el.onclick = (e) => {
    const card = e.target.closest("[data-eye]");
    if (card) openNowSheet(card.dataset.eye);
    else if (e.target.closest("[data-activities]")) openActivitySheet();
  };
}

function activityRow(state, today) {
  const kinds = activitiesOn(state.activities, today);
  return `
    <button type="button" class="action-row activity-row" data-activities>
      <span class="action-text">
        <span class="action-title">Activities today</span>
        <span class="action-sub">${kinds.length ? esc(kinds.join(" · ")) : "Nothing logged · tap to add"}</span>
      </span>
      ${ICONS.chevron}
    </button>`;
}

function eyeCard(state, eye, today) {
  const st = eyeStatus(state, eye, today);
  const lens = st.active;
  const resting = [st.restingMonthly, st.restingDaily].filter(Boolean);

  let ringHtml, centre, body;
  if (lens) {
    const s = lensSummary(lens, state.switches, today);
    const color = s.isOver ? "var(--over)" : `var(--${lens.type})`;
    ringHtml = ring(s.fraction, color, { size: 132, stroke: 10 });
    centre = `<div class="ring-day num ${s.isOver ? "is-over" : ""}">${s.age}</div>
              <div class="ring-of">of ${s.limit}</div>`;
    body = `
      <div class="eye-brand">${esc(lens.brand)}</div>
      <div class="eye-meta"><span class="pill ${lens.type}">${TYPE_NAMES[lens.type]}</span></div>
      <div class="eye-meta num">${s.worn} worn · ${s.rest} rest</div>
      ${s.isOver ? `<div class="eye-meta"><span class="pill over">${plural(s.over, "day")} over</span></div>` : ""}
      <div class="eye-sub faint">Opened ${esc(formatShort(lens.openedOn, today))}</div>`;
  } else {
    ringHtml = ring(0, "var(--track)", { size: 132, stroke: 10 });
    centre = `<div class="ring-none">No lens</div>`;
    body = `<div class="eye-brand muted">${resting.length ? "Glasses / none" : "Nothing logged"}</div>`;
  }

  const restingHtml = resting
    .map((r) => {
      const s = lensSummary(r, state.switches, today);
      return `<div class="eye-resting ${s.isOver ? "is-over" : ""}">
        <span class="dot ${r.type}"></span>${esc(r.brand)} resting · day ${s.age}
      </div>`;
    })
    .join("");

  return `
    <button type="button" class="eye-card ${lens ? `is-${lens.type}` : "is-empty"}" data-eye="${eye}"
            aria-label="${EYE_NAMES[eye]} eye: ${lens ? `${esc(lens.brand)}` : "no lens"}. Tap for actions.">
      <div class="eye-label">${EYE_NAMES[eye]}</div>
      <div class="ring-wrap">
        ${ringHtml}
        <div class="ring-centre">${centre}</div>
      </div>
      <div class="eye-body">${body}</div>
      ${restingHtml}
    </button>`;
}

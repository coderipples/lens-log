// Stats screen: headline medians, lifespan strip chart, discard reasons.

import { monthlyStats, lifespanRows, reasonCounts, LIMITS } from "../calc.js";
import { formatShort } from "../dates.js";
import { esc, fmtNum, plural, EYE_NAMES } from "./dom.js";

export function renderStats(el, state, today) {
  const stats = monthlyStats(state, today);

  if (!stats.life) {
    el.innerHTML = `
      <div class="card empty">
        <div class="empty-title">No finished monthlies yet</div>
        <p>Stats appear once you discard your first monthly lens: how long it lasted and how many days you actually wore it.</p>
      </div>`;
    return;
  }

  const rows = lifespanRows(state, today);
  const reasons = reasonCounts(state.lenses);
  el.innerHTML = `
    <div class="stat-grid">
      ${statTile("Median monthly life", stats.life, "calendar days")}
      ${statTile("Median days worn", stats.worn, "days in the eye")}
    </div>

    <h2 class="section-title">Monthly lifespans</h2>
    <div class="card chart-card">
      ${legend()}
      ${stripChart(rows, today)}
      <div class="chart-detail muted" aria-live="polite">Tap a bar for details.</div>
    </div>

    <h2 class="section-title">Discard reasons</h2>
    <div class="card">${reasonList(reasons)}</div>
    <p class="hint">Lifespan stats leave out lost lenses and lenses still in use.</p>
  `;

  const detail = el.querySelector(".chart-detail");
  const svg = el.querySelector(".strip");
  const select = (target) => {
    const row = target?.closest?.("[data-row]");
    if (!row) return;
    for (const r of svg.querySelectorAll("[data-row]")) r.classList.toggle("is-active", r === row);
    const { lens, age, worn, rest, inProgress } = rows[Number(row.dataset.row)];
    const end = inProgress ? "now" : formatShort(lens.discardedOn, today);
    detail.innerHTML = `<strong>${EYE_NAMES[lens.eye]} · ${esc(lens.brand)}</strong>
      <span class="num">${esc(formatShort(lens.openedOn, today))} – ${esc(end)} · ${plural(age, "day")}
      · ${worn} worn · ${rest} rest${inProgress ? " · in progress" : ""}</span>`;
  };
  svg.addEventListener("click", (e) => select(e.target));
  svg.addEventListener("pointerover", (e) => e.pointerType === "mouse" && select(e.target));
}

function statTile(label, s, unit) {
  const range = s.min === s.max ? `all ${s.min}` : `${s.min}–${s.max}`;
  return `<div class="card stat">
    <div class="stat-label">${esc(label)}</div>
    <div class="stat-value num">${fmtNum(s.median)}<span class="stat-unit"> days</span></div>
    <div class="stat-meta num">range ${range} · n ${s.n}</div>
    <div class="stat-meta faint">${esc(unit)}</div>
  </div>`;
}

function legend() {
  return `<div class="legend">
    <span class="legend-item"><span class="swatch swatch-worn"></span>Worn</span>
    <span class="legend-item"><span class="swatch swatch-rest"></span>Resting</span>
    <span class="legend-item"><span class="swatch swatch-limit"></span>${LIMITS.monthly} days</span>
    <span class="legend-item"><span class="swatch swatch-worn is-faded"></span>In progress</span>
  </div>`;
}

/**
 * One horizontal bar per monthly lens, split into worn/rest runs in day order.
 * Inline SVG; the viewBox is fixed-width and scales to the card.
 */
function stripChart(rows, today) {
  const W = 340;
  const labelW = 64;
  const barH = 12;
  const rowH = 26;
  const padTop = 18;
  const gap = 2; // surface gap between segments
  const maxAge = Math.max(LIMITS.monthly + 5, ...rows.map((r) => r.age));
  const plotW = W - labelW - 8;
  const x = (days) => labelW + (days / maxAge) * plotW;
  const H = padTop + rows.length * rowH + 4;
  const limitX = x(LIMITS.monthly);

  const bars = rows.map((r, i) => {
    const y = padTop + i * rowH + (rowH - barH) / 2;
    let start = 0;
    const segs = r.runs.map((run, k) => {
      const x0 = x(start);
      const x1 = x(start + run.days) - (k < r.runs.length - 1 ? gap : 0);
      start += run.days;
      const cls = run.kind === "worn" ? "seg-worn" : "seg-rest";
      return `<rect class="${cls}" x="${x0.toFixed(1)}" y="${y}" width="${Math.max(1, x1 - x0).toFixed(1)}" height="${barH}"/>`;
    }).join("");
    const clipId = `bar-${i}`;
    const label = `${r.lens.eye} · ${formatShort(r.lens.openedOn, today)}`;
    return `<g class="strip-row ${r.inProgress ? "is-progress" : ""}" data-row="${i}">
      <rect class="row-hit" x="0" y="${padTop + i * rowH}" width="${W}" height="${rowH}"/>
      <text class="strip-label" x="0" y="${y + barH / 2}" dominant-baseline="central">${esc(label)}</text>
      <clipPath id="${clipId}"><rect x="${x(0)}" y="${y}" width="${(x(r.age) - x(0)).toFixed(1)}" height="${barH}" rx="4"/></clipPath>
      <g clip-path="url(#${clipId})">${segs}</g>
      <title>${esc(`${r.lens.brand}: ${r.age} days, ${r.worn} worn, ${r.rest} rest${r.inProgress ? " (in progress)" : ""}`)}</title>
    </g>`;
  }).join("");

  return `<svg class="strip" viewBox="0 0 ${W} ${H}" role="img"
      aria-label="Lifespan of each monthly lens in days, split into worn and resting days">
    <defs>
      <pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="4" height="4" class="hatch-bg"/><line x1="0" y1="0" x2="0" y2="4" class="hatch-line"/>
      </pattern>
    </defs>
    <line class="limit-line" x1="${limitX}" x2="${limitX}" y1="${padTop - 4}" y2="${H}"/>
    <text class="limit-label" x="${limitX}" y="10" text-anchor="middle">${LIMITS.monthly}</text>
    ${bars}
  </svg>`;
}

function reasonList(reasons) {
  const total = reasons.reduce((a, r) => a + r.count, 0);
  if (!total) return `<p class="muted">No reasons recorded yet.</p>`;
  const max = Math.max(...reasons.map((r) => r.count));
  return `<ul class="reason-list">
    ${reasons.map((r) => `
      <li class="reason-row">
        <span class="reason-name">${esc(r.label)}</span>
        <span class="reason-bar"><span style="width:${max ? (r.count / max) * 100 : 0}%"></span></span>
        <span class="reason-count num">${r.count}</span>
      </li>`).join("")}
  </ul>`;
}

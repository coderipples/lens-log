// Entry point: load data, route between tabs, re-render on every change.

import * as store from "./store.js";
import { todayISO } from "./dates.js";
import { renderNow } from "./ui/now.js";
import { renderStats } from "./ui/stats.js";
import { renderHistory } from "./ui/history.js";
import { renderSettings } from "./ui/settings.js";
import { showToast } from "./ui/toast.js";
import { closeSheet } from "./ui/sheet.js";

const SCREENS = {
  now: { title: "Now", render: renderNow },
  stats: { title: "Stats", render: renderStats },
  history: { title: "History", render: renderHistory },
  settings: { title: "Settings", render: renderSettings },
};

let current = "now";
let lastTab = "now";
let renderedDay = todayISO();

const titleEl = document.getElementById("screen-title");
const settingsBtn = document.getElementById("settings-btn");
const gearIcon = settingsBtn.innerHTML;

function render() {
  renderedDay = todayISO();
  const el = document.getElementById(`screen-${current}`);
  SCREENS[current].render(el, store.getState(), renderedDay);
}

function show(name) {
  closeSheet(true);
  current = name;
  if (name !== "settings") lastTab = name;
  for (const key of Object.keys(SCREENS)) {
    document.getElementById(`screen-${key}`).hidden = key !== name;
  }
  for (const tab of document.querySelectorAll(".tab")) {
    if (tab.dataset.tab === name) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  }
  titleEl.textContent = SCREENS[name].title;
  const inSettings = name === "settings";
  settingsBtn.classList.toggle("is-text", inSettings);
  settingsBtn.innerHTML = inSettings ? "Done" : gearIcon;
  settingsBtn.setAttribute("aria-label", inSettings ? "Close settings" : "Settings");
  history.replaceState(null, "", name === "now" ? location.pathname : `#${name}`);
  window.scrollTo(0, 0);
  render();
}

document.querySelector(".tabbar").addEventListener("click", (e) => {
  const tab = e.target.closest("[data-tab]");
  if (tab) show(tab.dataset.tab);
});
settingsBtn.addEventListener("click", () => show(current === "settings" ? lastTab : "settings"));

store.setSaveErrorHandler(() =>
  showToast("Couldn't save. Storage may be full or blocked.", { error: true, duration: 6000 }));
store.init();
store.subscribe(render);

// Keep day counts right when the app is reopened or left open past midnight.
const refreshIfNewDay = () => { if (todayISO() !== renderedDay) render(); };
document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshIfNewDay(); });
setInterval(refreshIfNewDay, 60_000);

const initial = location.hash.slice(1);
if (initial === "settings") lastTab = "now";
show(initial in SCREENS ? initial : "now");

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch((err) => console.warn("SW registration failed", err));
}

// Generic bottom sheet. Content is provided by the caller.

let current = null;

/**
 * Open a sheet. `build(sheet)` receives { body, close, setContent }.
 * Only one sheet is open at a time.
 */
export function openSheet(build, { label = "Actions" } = {}) {
  closeSheet(true);
  const root = document.getElementById("sheet-root");
  root.innerHTML = `
    <div class="sheet-scrim"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${label}">
      <div class="sheet-handle" aria-hidden="true"></div>
      <div class="sheet-body"></div>
    </div>`;
  const body = root.querySelector(".sheet-body");
  const sheetEl = root.querySelector(".sheet");
  const api = {
    body,
    close: () => closeSheet(),
    setContent(html) {
      body.innerHTML = html;
      sheetEl.scrollTop = 0;
    },
  };
  current = { root, onKey: (e) => e.key === "Escape" && closeSheet() };
  root.querySelector(".sheet-scrim").addEventListener("click", () => closeSheet());
  document.addEventListener("keydown", current.onKey);
  enableSwipeToClose(sheetEl);
  document.body.classList.add("has-sheet");
  build(api);
  requestAnimationFrame(() => root.classList.add("is-open"));
  return api;
}

export function closeSheet(immediate = false) {
  if (!current) return;
  const { root, onKey } = current;
  current = null;
  document.removeEventListener("keydown", onKey);
  document.body.classList.remove("has-sheet");
  root.classList.remove("is-open");
  const clear = () => { if (!current) root.innerHTML = ""; };
  immediate ? clear() : setTimeout(clear, 260);
}

/** Drag the handle area (or the sheet when scrolled to top) down to dismiss. */
function enableSwipeToClose(sheet) {
  let startY = null;
  let dy = 0;
  sheet.addEventListener("touchstart", (e) => {
    const onHandle = e.target.closest(".sheet-handle");
    if (!onHandle && sheet.scrollTop > 0) return;
    if (e.target.closest("input, textarea, select")) return;
    startY = e.touches[0].clientY;
    dy = 0;
  }, { passive: true });
  sheet.addEventListener("touchmove", (e) => {
    if (startY === null) return;
    dy = Math.max(0, e.touches[0].clientY - startY);
    if (dy > 0) sheet.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  sheet.addEventListener("touchend", () => {
    if (startY === null) return;
    startY = null;
    sheet.style.transform = "";
    if (dy > 90) closeSheet();
  });
}

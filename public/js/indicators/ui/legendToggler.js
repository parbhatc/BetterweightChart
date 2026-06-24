import { ICON_LEGEND_TOGGLER_ARROW, ICON_LEGEND_TOGGLER_LAYERS } from "./icons.js";

/** @param {HTMLElement} studiesEl */
export function ensureLegendToggler(studiesEl) {
  let toggler = studiesEl.querySelector(".study-legend-toggler");
  if (toggler instanceof HTMLButtonElement) return toggler;

  toggler = document.createElement("button");
  toggler.type = "button";
  toggler.className = "study-legend-toggler";
  toggler.dataset.qaId = "legend-toggler";
  toggler.tabIndex = -1;
  toggler.setAttribute("aria-label", "Hide indicator legend");
  toggler.innerHTML = `<span class="study-legend-toggler__arrow">${ICON_LEGEND_TOGGLER_ARROW}</span><span class="study-legend-toggler__icon">${ICON_LEGEND_TOGGLER_LAYERS}</span><span class="study-legend-toggler__counter" aria-hidden="true">0</span>`;
  studiesEl.appendChild(toggler);
  return toggler;
}

/**
 * @param {HTMLElement} studiesEl
 * @param {HTMLButtonElement} toggler
 * @param {number} count
 * @param {boolean} collapsed
 */
export function syncLegendToggler(studiesEl, toggler, count, collapsed) {
  const visible = count > 0;
  toggler.hidden = !visible;
  if (!visible) {
    studiesEl.classList.remove("is-legend-collapsed");
    return;
  }

  const counter = toggler.querySelector(".study-legend-toggler__counter");
  if (counter) counter.textContent = String(count);

  toggler.classList.toggle("is-collapsed", collapsed);
  studiesEl.classList.toggle("is-legend-collapsed", collapsed);

  const label = collapsed ? "Show indicator legend" : "Hide indicator legend";
  toggler.setAttribute("aria-label", label);
  if (collapsed) toggler.title = label;
  else toggler.removeAttribute("title");
}

import { CHEVRON_DOWN, INDICATORS, REPLAY } from "./icons.js";

/**
 * TradingView-style Indicators + Replay controls on the left header bar.
 * @param {HTMLElement} mountEl `.tv-toolbar__left`
 */
export function mountChartToolbarTools(mountEl) {
  const sep = document.createElement("div");
  sep.className = "tv-toolbar__sep";
  sep.setAttribute("aria-hidden", "true");

  const indicatorsWrap = document.createElement("div");
  indicatorsWrap.className = "tv-chart-tools";
  indicatorsWrap.id = "header-toolbar-indicators";
  indicatorsWrap.innerHTML = `<div class="tv-chart-tools__group">
    <button
      type="button"
      class="tv-chart-tools__btn tv-chart-tools__btn--text"
      data-name="open-indicators-dialog"
      aria-label="Indicators, metrics, and strategies"
      title="Indicators, metrics, and strategies"
      data-tooltip="Indicators, metrics, and strategies"
    >
      <span class="tv-chart-tools__icon" aria-hidden="true">${INDICATORS}</span>
      <span class="tv-chart-tools__label">Indicators</span>
    </button>
    <button
      type="button"
      class="tv-chart-tools__fav-btn"
      data-name="show-favorite-indicators"
      aria-label="Favorite indicators"
      title="Favorite indicators"
      data-tooltip="Favorite indicators"
      aria-haspopup="menu"
      aria-expanded="false"
    >
      <span class="tv-chart-tools__chev" aria-hidden="true">${CHEVRON_DOWN}</span>
    </button>
  </div>`;

  const replayBtn = document.createElement("button");
  replayBtn.type = "button";
  replayBtn.className = "tv-chart-tools__btn tv-chart-tools__btn--text";
  replayBtn.id = "header-toolbar-replay";
  replayBtn.setAttribute("aria-label", "Bar replay");
  replayBtn.setAttribute("aria-pressed", "false");
  replayBtn.title = "Bar replay";
  replayBtn.dataset.tooltip = "Bar replay";
  replayBtn.innerHTML = `<span class="tv-chart-tools__icon" aria-hidden="true">${REPLAY}</span><span class="tv-chart-tools__label">Replay</span>`;

  mountEl.appendChild(sep);
  mountEl.appendChild(indicatorsWrap);
  mountEl.appendChild(replayBtn);

  const indicatorsBtn = indicatorsWrap.querySelector('[data-name="open-indicators-dialog"]');
  const favBtn = indicatorsWrap.querySelector("[data-name=show-favorite-indicators]");

  replayBtn.addEventListener("click", () => {
    const on = replayBtn.getAttribute("aria-pressed") !== "true";
    replayBtn.setAttribute("aria-pressed", on ? "true" : "false");
    replayBtn.classList.toggle("is-pressed", on);
  });

  return {
    indicatorsBtn,
    favBtn,
    replayBtn,
  };
}

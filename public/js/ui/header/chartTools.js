import { INDICATORS, REPLAY } from "./icons.js";

/**
 * TradingView-style Indicators + Replay controls on the left header bar.
 * @param {HTMLElement} mountEl `.tv-toolbar__left`
 * @param {{ replay?: boolean }} [opts]
 */
export function mountChartToolbarTools(mountEl, opts = {}) {
  const replayEnabled = opts.replay !== false;
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
    <div class="tv-chart-tools__favorites" role="group" aria-label="Favorite indicators"></div>
  </div>`;

  /** @type {HTMLButtonElement | null} */
  let replayBtn = null;
  if (replayEnabled) {
    replayBtn = document.createElement("button");
    replayBtn.type = "button";
    replayBtn.className = "tv-chart-tools__btn tv-chart-tools__btn--text";
    replayBtn.id = "header-toolbar-replay";
    replayBtn.setAttribute("aria-label", "Bar replay");
    replayBtn.setAttribute("aria-pressed", "false");
    replayBtn.title = "Bar replay";
    replayBtn.dataset.tooltip = "Bar replay";
    replayBtn.innerHTML = `<span class="tv-chart-tools__icon" aria-hidden="true">${REPLAY}</span><span class="tv-chart-tools__label">Replay</span>`;
  }

  mountEl.appendChild(sep);
  mountEl.appendChild(indicatorsWrap);
  if (replayBtn) mountEl.appendChild(replayBtn);

  const indicatorsBtn = indicatorsWrap.querySelector('[data-name="open-indicators-dialog"]');
  const favoritesEl = indicatorsWrap.querySelector(".tv-chart-tools__favorites");

  return {
    indicatorsBtn,
    favoritesEl,
    replayBtn,
  };
}

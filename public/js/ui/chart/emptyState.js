import { resolutionShortLabel } from "../../chart/resolutions.js";

const CHART_ICON = `<svg viewBox="0 0 120 120" width="88" height="88" aria-hidden="true"><path fill="currentColor" d="M18 92V28h10v64H18zm22-18V28h10v46H40zm22-12V28h10v34H62zm22 24V28h10v58H84zM12 98h96v8H12v-8z"/></svg>`;

/** @typedef {{ title: string, text: string, primary: { label: string, action: "symbol"|"interval" }, secondary?: { label: string, action: "symbol"|"interval" } }} EmptyStateCopy */

/**
 * @param {object | null | undefined} meta
 * @param {{ symbol?: string, resolution?: string }} pane
 * @returns {EmptyStateCopy}
 */
export function emptyStateCopy(meta, pane) {
  const symbol = pane.symbol?.split(":").pop() ?? pane.symbol ?? "this symbol";
  const interval = resolutionShortLabel(pane.resolution ?? "");

  if (meta?.reason === "unsupported_resolution") {
    return {
      title: "Interval not supported",
      text: `${interval} isn't available for ${symbol}. Choose a supported interval or try another symbol.`,
      primary: { label: "Change interval", action: "interval" },
      secondary: { label: "Change symbol", action: "symbol" },
    };
  }

  if (meta?.error) {
    return {
      title: "Couldn't load chart data",
      text: String(meta.error),
      primary: { label: "Change symbol", action: "symbol" },
      secondary: { label: "Change interval", action: "interval" },
    };
  }

  return {
    title: "No data for this symbol",
    text: "Try another symbol or interval to see chart data here.",
    primary: { label: "Change symbol", action: "symbol" },
    secondary: { label: "Change interval", action: "interval" },
  };
}

/**
 * @param {object} pane
 * @returns {HTMLElement | null}
 */
function paneStageEl(pane) {
  return pane?.el?.closest?.(".tv-chart-wrap__stage") ?? null;
}

/**
 * @param {object} pane
 * @param {{ onChangeSymbol?: () => void, onChangeInterval?: () => void }} handlers
 */
export function ensurePaneEmptyState(pane, handlers = {}) {
  const stage = paneStageEl(pane);
  if (!stage) return null;

  let root = stage.querySelector(".tv-chart-empty");
  if (root instanceof HTMLElement) return root;

  root = document.createElement("div");
  root.className = "tv-chart-empty";
  root.hidden = true;
  root.setAttribute("role", "status");
  root.innerHTML = `<div class="tv-chart-empty__card">
    <div class="tv-chart-empty__icon">${CHART_ICON}</div>
    <strong class="tv-chart-empty__title"></strong>
    <p class="tv-chart-empty__text"></p>
    <div class="tv-chart-empty__actions"></div>
  </div>`;

  root.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-empty-action]");
    if (!(btn instanceof HTMLButtonElement)) return;
    const action = btn.dataset.emptyAction;
    if (action === "symbol") handlers.onChangeSymbol?.();
    if (action === "interval") handlers.onChangeInterval?.();
  });

  stage.appendChild(root);
  return root;
}

/**
 * @param {object} pane
 * @param {{ show?: boolean, meta?: object | null, onChangeSymbol?: () => void, onChangeInterval?: () => void }} opts
 */
export function syncPaneEmptyState(pane, opts = {}) {
  const { show = false, meta = null, onChangeSymbol, onChangeInterval } = opts;
  const root = ensurePaneEmptyState(pane, { onChangeSymbol, onChangeInterval });
  if (!root) return;

  const stage = paneStageEl(pane);
  const wrap = stage?.closest(".tv-chart-wrap");
  if (!show) {
    root.hidden = true;
    wrap?.classList.remove("tv-chart-wrap--empty");
    return;
  }

  const copy = emptyStateCopy(meta, pane);
  const title = root.querySelector(".tv-chart-empty__title");
  const text = root.querySelector(".tv-chart-empty__text");
  const actions = root.querySelector(".tv-chart-empty__actions");
  if (title) title.textContent = copy.title;
  if (text) text.textContent = copy.text;
  if (actions) {
    const buttons = [copy.primary, copy.secondary].filter(Boolean);
    actions.innerHTML = buttons
      .map(
        (btn, i) =>
          `<button type="button" class="tv-chart-empty__btn tv-chart-empty__btn--${i === 0 ? "primary" : "secondary"}" data-empty-action="${btn.action}">${btn.label}</button>`,
      )
      .join("");
  }

  root.hidden = false;
  wrap?.classList.add("tv-chart-wrap--empty");
}

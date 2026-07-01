import { NEWS_ICON } from "./icons.js";
import { createNewsPanel, chartDayFromPane } from "./panel.js";
import { getNewsSettingsStore } from "../../news/settings.js";

/**
 * @param {object} opts
 * @param {HTMLElement} opts.mountEl
 * @param {() => object | null | undefined} opts.getActivePane
 * @param {() => { active?: boolean, currentBarTime?: number|null, selectedBarTime?: number|null } | null | undefined} [opts.getReplayState]
 * @param {() => Record<string, { events?: object[] }>} opts.getNewsByDay
 * @param {() => void} [opts.onSettingsChange]
 */
export function mountNewsToolbar(opts) {
  const { mountEl, getActivePane, getReplayState, getNewsByDay, onSettingsChange } = opts;
  const newsStore = getNewsSettingsStore();

  const wrap = document.createElement("div");
  wrap.className = "tv-news-toolbar";
  wrap.innerHTML = `<button type="button" class="tv-news-toolbar__btn" aria-label="News calendar" title="News" aria-expanded="false">${NEWS_ICON}</button>`;
  mountEl.appendChild(wrap);

  const btn = wrap.querySelector(".tv-news-toolbar__btn");
  if (!(btn instanceof HTMLButtonElement)) throw new Error("News toolbar button missing");

  function syncBtnState() {
    const enabled = newsStore.isEnabled();
    wrap.hidden = !enabled;
    if (!enabled) {
      panel.close();
      btn.setAttribute("aria-expanded", "false");
      return;
    }
    btn.classList.remove("is-disabled");
    btn.title = "News";
  }

  const panel = createNewsPanel({
    anchor: btn,
    anchorRoot: wrap,
    getChartDayYmd: () => chartDayFromPane(getActivePane(), getReplayState?.()),
    getNewsByDay,
    newsStore,
  });

  btn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    if (!newsStore.isEnabled()) return;
    panel.toggle();
    syncBtnState();
  });

  newsStore.onChange(() => {
    syncBtnState();
    if (panel.isOpen()) panel.refresh();
  });

  syncBtnState();

  return {
    refresh: () => panel.refresh(),
    close: () => panel.close(),
  };
}

import { getNewsSettingsStore } from "../../../news/settings.js";
import { enabledNewsTypeIds } from "../../../news/events.js";
import { uniqueEtDaysFromBars } from "../../../core/etTime.js";
import { getPaneChartView } from "../../../chart/pane/viewCache.js";
import {
  fetchNewsCalendarDay,
  getCachedNewsDay,
  newsDaysReady,
} from "../../news/newsCache.js";
import { mountNewsToolbar } from "../../../ui/news/toolbar.js";

/**
 * @param {import("./state.js").BootContext} ctx
 */
export function attachNewsBoot(ctx) {
  const newsStore = getNewsSettingsStore();

  /** @returns {{ source: string, types: string[] }} */
  function newsFetchOpts() {
    const s = newsStore.get();
    return {
      source: s.source ?? "forexfactory",
      // Fetch ALL events for the day so the panel can show everything.
      // We still use `eventTypes` to decide which releases generate Levels H/L.
      types: [],
    };
  }

  /** @param {object} pane */
  function visibleEtDays(pane) {
    const view = getPaneChartView(
      pane,
      ctx.settingsStore,
      pane.symbolInfo ?? ctx.symbolInfo,
      ctx.resolutions,
    );
    return uniqueEtDaysFromBars(view.utcBars);
  }

  /** @param {string[]} days */
  async function ensureNewsDays(days) {
    if (!newsStore.isEnabled() || !days.length) return;
    const opts = newsFetchOpts();
    await Promise.all(
      days.map(async (day) => {
        if (getCachedNewsDay(day, opts)) return;
        await fetchNewsCalendarDay(day, opts);
      }),
    );
  }

  /** @param {object} [pane] */
  function getNewsByDayForPane(pane) {
    if (!newsStore.isEnabled()) return {};
    const p = pane ?? ctx.getActivePane?.() ?? ctx.chartPanes?.get(0);
    if (!p) return {};
    const days = visibleEtDays(p);
    const opts = newsFetchOpts();
    /** @type {Record<string, object>} */
    const out = {};
    for (const day of days) {
      const hit = getCachedNewsDay(day, opts);
      if (hit) out[day] = hit;
    }
    return out;
  }

  function scheduleNewsLoad() {
    if (!newsStore.isEnabled()) return;
    const days = new Set();
    for (const pane of ctx.getAllChartPanes()) {
      for (const day of visibleEtDays(pane)) days.add(day);
    }
    void ensureNewsDays([...days]).then(() => {
      ctx.refreshIndicators?.();
      newsUi?.refresh();
    });
  }

  let newsUi = null;
  if (ctx.bottomToolbar) {
    newsUi = mountNewsToolbar({
      mountEl: ctx.bottomToolbar,
      getActivePane: () => ctx.getActivePane?.() ?? ctx.chartPanes?.get(0),
      getReplayState: () => ctx.replay?.getState?.(),
      getNewsByDay: () => getNewsByDayForPane(),
      onSettingsChange: () => {
        scheduleNewsLoad();
        ctx.refreshIndicators?.();
      },
    });
  }

  newsStore.onChange(() => {
    scheduleNewsLoad();
    ctx.refreshIndicators?.();
  });

  const origLoadBars = ctx.loadBars;
  if (typeof origLoadBars === "function") {
    ctx.loadBars = async (...args) => {
      const result = await origLoadBars(...args);
      scheduleNewsLoad();
      return result;
    };
  }

  ctx.newsStore = newsStore;
  ctx.scheduleNewsLoad = scheduleNewsLoad;
  ctx.getNewsByDayForPane = getNewsByDayForPane;
  ctx.isNewsEnabled = () => newsStore.isEnabled();
  ctx.getNewsRows = () => {
    if (!newsStore.isEnabled()) return [];
    return (newsStore.get().eventTypes ?? []).filter((r) => r.enabled !== false);
  };
  ctx.newsPendingForPane = (pane) => {
    if (!newsStore.isEnabled()) return false;
    const opts = newsFetchOpts();
    const days = visibleEtDays(pane);
    return days.length > 0 && !newsDaysReady(days, opts);
  };

  scheduleNewsLoad();
}

export { getNewsSettingsStore };

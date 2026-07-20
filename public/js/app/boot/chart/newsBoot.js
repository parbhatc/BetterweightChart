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
import { buildNewsTimeScaleMarkers } from "../../../news/markers.js";
import { buildDemoNewsMarker } from "../../../news/demoMarkers.js";
import { mountTimeScaleMarkers } from "../../../primitives/timeScaleMarkers.js";

/**
 * @param {import("./state.js").BootContext} ctx
 */
export function attachNewsBoot(ctx) {
  const newsStore = getNewsSettingsStore();
  const markerHosts = new Map();
  const demoMarkersEnabled =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("_codex_markers") === "demo";

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
    if (demoMarkersEnabled) {
      const demo = buildDemoNewsMarker(p.bars ?? []);
      if (demo) {
        const existing = out[demo.day];
        out[demo.day] = {
          ...(existing ?? { day: demo.day }),
          events: [...(existing?.events ?? []), demo.event],
        };
      }
    }
    return out;
  }

  function ensureMarkerHosts() {
    const panes = ctx.getAllChartPanes();
    const live = new Set(panes.map((pane) => pane.index));
    for (const [index, host] of markerHosts) {
      if (live.has(index)) continue;
      host.destroy();
      markerHosts.delete(index);
    }
    for (const pane of panes) {
      if (markerHosts.has(pane.index) || !(pane.el instanceof HTMLElement)) continue;
      const host = mountTimeScaleMarkers({ mountEl: pane.el, chart: pane.chart });
      markerHosts.set(pane.index, host);
      pane.newsMarkers = host;
    }
  }

  function syncNewsMarkers() {
    ensureMarkerHosts();
    const settings = newsStore.get();
    for (const pane of ctx.getAllChartPanes()) {
      const host = markerHosts.get(pane.index);
      if (!host) continue;
      const markers = buildNewsTimeScaleMarkers({
        bars: pane.bars,
        timeAdapter: pane.timeAdapter,
        newsByDay: getNewsByDayForPane(pane),
        settings,
      });
      host.setMarkers(markers);
    }
  }

  function scheduleNewsLoad() {
    if (!newsStore.isEnabled()) {
      syncNewsMarkers();
      return;
    }
    const days = new Set();
    for (const pane of ctx.getAllChartPanes()) {
      for (const day of visibleEtDays(pane)) days.add(day);
    }
    void ensureNewsDays([...days]).then(() => {
      ctx.refreshIndicators?.();
      newsUi?.refresh();
      syncNewsMarkers();
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
    syncNewsMarkers();
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
  ctx.refreshNewsMarkers = syncNewsMarkers;
  ctx.newsMarkerHosts = markerHosts;

  ensureMarkerHosts();
  scheduleNewsLoad();
}

export { getNewsSettingsStore };

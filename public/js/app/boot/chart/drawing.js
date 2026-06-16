import { precisionFromSettings } from "../../../chart/timezone/list.js";
import { getPaneChartView } from "../../../chart/pane/viewCache.js";
import { measureVisiblePriceRange, snapTimeToNearestBar } from "../../../chart/coords/timeScale.js";
import { formatChartTimeLabel } from "../../../chart/time/labelFormat.js";
import { createMultiPaneDrawingHub } from "../../../drawings/multi/paneHub.js";
import { applyCursorMode, resolveThemeCrosshair } from "../../cursor/mode.js";

/**
 * @param {import("./state.js").BootContext} ctx
 */
export function attachDrawingBoot(ctx) {
  function attachPaneDrawings(pane) {
    if (!ctx.drawingHub || !pane) return;
    ctx.drawingHub.attachPane(pane.index, {
      chart: pane.chart,
      series: pane.series,
      container: pane.el,
    });
  }

  function applyDrawingCursorAll() {
    if (!ctx.drawing) return;
    const tool = ctx.drawing.getActiveTool();
    const isCursor = ctx.drawing.isCursorTool();
    const themeCrosshair = resolveThemeCrosshair(ctx.settingsStore, ctx.themeColors);
    for (const pane of ctx.getAllChartPanes()) {
      applyCursorMode(pane.chart, pane.el, tool, isCursor, pane.series, themeCrosshair);
    }
  }

  function formatUtcPointTime(utcSec) {
    const sc = ctx.settingsStore.get().scales ?? {};
    return formatChartTimeLabel(utcSec, sc, "Etc/UTC", { includeTime: true });
  }

  function buildDrawingContext(pane) {
    const sym = ctx.settingsStore.get().symbol ?? {};
    const view = getPaneChartView(
      pane,
      ctx.settingsStore,
      ctx.symbolInfo ?? pane.symbolInfo,
      ctx.resolutions,
    );
    const visiblePriceRange = measureVisiblePriceRange(pane.chart, pane.series);
    return {
      timeAdapter: view.timeAdapter,
      bars: view.utcBars,
      mapBars: view.mapBars,
      barSec: view.barSec,
      paneSymbol: pane.symbol,
      precision: precisionFromSettings(ctx.settingsStore.get(), pane.symbolInfo ?? ctx.symbolInfo),
      visiblePriceRange,
      chart: pane.chart,
      series: pane.series,
      colorBarsOnPrevClose: sym.colorBarsOnPrevClose ?? false,
      symbol: sym,
      formatPointTime: formatUtcPointTime,
    };
  }

  function alignDrawingsToChartTimeScale() {
    if (!ctx.drawing) return;
    const pane = ctx.getActivePane();
    if (!pane) return;
    const view = getPaneChartView(
      pane,
      ctx.settingsStore,
      ctx.symbolInfo ?? pane.symbolInfo,
      ctx.resolutions,
    );
    if (!view.utcBars.length) return;
    for (const d of ctx.drawing.getDrawings()) {
      const points = d.points.map((p) => ({
        ...p,
        time: snapTimeToNearestBar(p.time, view.utcBars, view.barSec),
      }));
      ctx.drawing.updateDrawing(d.id, { points }, { silent: true });
    }
  }

  function refreshDrawingSettingsContext() {
    ctx.drawingHub?.editToolbar?.refreshSettingsContext?.();
  }

  function afterTimeframeChange() {
    alignDrawingsToChartTimeScale();
    refreshDrawingSettingsContext();
    ctx.scheduleAutosaveLayout();
  }

  function setupDrawingHub() {
    if (!ctx.opts.drawings || !ctx.drawToolbar) return;

    ctx.drawingHub = createMultiPaneDrawingHub({
      toolbarEl: ctx.drawToolbar,
      getContextForPane: (idx) => {
        const pane = ctx.chartPanes.get(idx) ?? ctx.getActivePane();
        return pane ? buildDrawingContext(pane) : { bars: [], barSec: 60, timeAdapter: null };
      },
      getSyncDrawings: () => ctx.layoutManager?.getSync().drawings ?? false,
      getSyncCrosshair: () => ctx.layoutManager?.getSync().crosshair ?? false,
      onValuesTooltipBarChange: (paneIndex, bar, prev) => {
        const pane = ctx.chartPanes.get(paneIndex);
        if (!pane) return;
        pane.hoverBar = bar;
        pane.hoverPrev = prev ?? undefined;
        const activeIdx = ctx.layoutManager?.getActivePaneIndex() ?? 0;
        if (paneIndex === activeIdx) {
          ctx.ui.hoverBar = bar;
          ctx.ui.hoverPrev = prev ?? undefined;
          ctx.applySymbolLineStyleLocal();
        }
        ctx.scheduleStatusLine(pane);
      },
    });
    ctx.drawing = ctx.drawingHub.facade;
    attachPaneDrawings(ctx.chartPanes.get(0));
    ctx.drawing.on("toolChange", applyDrawingCursorAll);
    applyDrawingCursorAll();
    ctx.drawingHub.editToolbar?.syncVisibility?.();

    const DRAWINGS_SESSION_KEY = "tv-chart-drawings-session";
    if (!ctx.opts.chrome) {
      try {
        const raw = localStorage.getItem(DRAWINGS_SESSION_KEY);
        if (raw) ctx.drawingHub.setDrawingsByPane(JSON.parse(raw));
      } catch {
        /* ignore */
      }
      ctx.drawing.on("change", () => {
        try {
          localStorage.setItem(DRAWINGS_SESSION_KEY, JSON.stringify(ctx.drawingHub.getDrawingsByPane()));
        } catch {
          /* ignore */
        }
      });
    }
  }

  Object.assign(ctx, {
    attachPaneDrawings,
    applyDrawingCursorAll,
    buildDrawingContext,
    afterTimeframeChange,
    setupDrawingHub,
  });
}

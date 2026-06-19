import { barsForPane } from "../../../chart/pane/data.js";
import { mountMarketStatusPopup } from "../../../chart/market/status.js";
import { mountStatusLineContextMenu } from "../../../ui/context/statusLine.js";
import { applySymbolLineStyle } from "../../symbol/lineStyle.js";
import { createPaneExtras } from "../paneExtras.js";

/**
 * @param {import("./state.js").BootContext} ctx
 */
export function attachPaneExtrasBoot(ctx) {
  function applySymbolLineStyleLocal() {
    applySymbolLineStyle({
      settingsStore: ctx.settingsStore,
      getAllChartPanes: ctx.getAllChartPanes,
      symbolInfo: ctx.symbolInfo,
    });
    for (const pane of ctx.getAllChartPanes()) {
      pane.priceLineLabel?.requestRefresh();
    }
  }
  ctx.applySymbolLineStyleLocal = applySymbolLineStyleLocal;

  ctx.viewportDeps = {
    maintainLockedRatio: null,
    syncLayoutDateRangeFrom: null,
    getLayoutManager: () => ctx.layoutManager,
    prependHistory: null,
    ensureHistoryNearEdge: null,
    setPrimaryFutureWhitespace: (n) => {
      ctx.futureWhitespaceBars = n;
    },
  };

  const paneExtras = createPaneExtras({
    settingsStore: ctx.settingsStore,
    symbolInfo: ctx.symbolInfo,
    resolutions: ctx.resolutions,
    barsForPane: (pane) => barsForPane(pane, ctx.settingsStore, ctx.symbolInfo),
    barSecForPane: ctx.barSecForPaneLocal,
    getLayoutManager: () => ctx.layoutManager,
    getActivePane: ctx.getActivePane,
    getAllChartPanes: ctx.getAllChartPanes,
    panFps: ctx.panFps,
    syncLayoutCrosshairFrom: ctx.syncLayoutCrosshairFrom,
    applySymbolLineStyleLocal,
    getDrawingHub: () => ctx.drawingHub,
    ui: ctx.ui,
    viewportDeps: ctx.viewportDeps,
    getReplayActive: () => ctx.replay?.isActive?.() ?? false,
  });

  ctx.paneExtras = paneExtras;
  ctx.setupPaneExtras = paneExtras.setupPaneExtras;
  ctx.refreshPaneStatusLine = paneExtras.refreshPaneStatusLine;
  ctx.refreshStatusLine = paneExtras.refreshStatusLine;
  ctx.scheduleStatusLine = paneExtras.scheduleStatusLine;

  setupStatusLine(ctx);
}

/**
 * @param {import("./state.js").BootContext} ctx
 */
function setupStatusLine(ctx) {
  if (!ctx.statusEl) return;
  mountStatusLineContextMenu({
    statusEl: ctx.statusEl,
    getStatusLineSettings: () => ctx.settingsStore.get().statusLine,
    setToggle: (key, value) => ctx.settingsStore.set("statusLine", key, value),
    openSettings: () => ctx.mountChartSettingsUi().open("statusLine"),
  });
  mountMarketStatusPopup(ctx.statusEl, () => ({ symbolInfo: ctx.symbolInfo }));
}

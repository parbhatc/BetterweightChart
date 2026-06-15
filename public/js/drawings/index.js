import { createDrawingController } from "./controller/index.js";
import { mountMainToolbar } from "./toolbars/main/index.js";
import { mountEditToolbar } from "./toolbars/edit/index.js";
import { createMultiPaneDrawingHub } from "./multi/paneHub.js";

export { createDrawingController } from "./controller/index.js";
export { createMultiPaneDrawingHub } from "./multi/paneHub.js";
export { mountMainToolbar, mountDrawingToolbar } from "./toolbars/main/index.js";
export { mountEditToolbar } from "./toolbars/edit/index.js";
export { createFavoriteToolbar } from "./toolbars/favorite/index.js";
export * from "./catalog/tools.js";
export * from "./catalog/icons.js";
export * from "./registry/tools.js";
export * from "./constants.js";

/**
 * One-call setup: drawing controller + left toolbar + floating edit toolbar.
 *
 * @param {object} opts
 * @param {import("lightweight-charts").IChartApi} opts.chart
 * @param {import("lightweight-charts").ISeriesApi} opts.series
 * @param {HTMLElement} opts.container Chart pane element (receives pointer events).
 * @param {HTMLElement} opts.toolbarEl Left drawing toolbar mount node.
 * @param {() => object} opts.getContext Bars + barSec for magnet snap and labels.
 * @returns {{ controller: ReturnType<typeof createDrawingController>, mainToolbar: object, editToolbar: object }}
 */
export function mountDrawings(opts) {
  const { chart, series, container, toolbarEl, getContext } = opts;

  const controller = createDrawingController({ chart, series, container, getContext });
  const mainToolbar = mountMainToolbar({ controller, toolbarEl });
  const editToolbar = mountEditToolbar({ controller, chart, getContext });

  return { controller, mainToolbar, editToolbar };
}

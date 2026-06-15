import { createDrawingController } from "./controller/drawingController.js";
import { mountMainToolbar } from "./toolbars/mainToolbar.js";
import { mountEditToolbar } from "./toolbars/editToolbar.js";
import { createMultiPaneDrawingHub } from "./multiPaneHub.js";

export { createDrawingController } from "./controller/drawingController.js";
export { createMultiPaneDrawingHub } from "./multiPaneHub.js";
export { mountMainToolbar, mountDrawingToolbar } from "./toolbars/mainToolbar.js";
export { mountEditToolbar } from "./toolbars/editToolbar.js";
export { createFavoriteToolbar } from "./toolbars/favoriteToolbar.js";
export * from "./catalog/toolCatalog.js";
export * from "./catalog/toolIcons.js";
export * from "./registry/toolRegistry.js";
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

import { chartXAt, chartVisibleRightX, pixelToPoint, safePriceToY, coordMapBars } from "../../chart/coords/timeScale.js";
import { applyMagnetSnap } from "../tools/snap/magnet.js";
import { clampRegressionPoint } from "../tools/regression/trend.js";

/** @param {import("./state.js").ControllerState} ctx */
export function attachCoords(ctx) {
  function resolveChartPoint(clientX, clientY) {
    const rect = ctx.container.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const { barSec } = ctx.getContext();
    const mapBars = coordMapBars(ctx.getContext());
    const point = pixelToPoint(ctx.chart, ctx.series, mapBars, barSec, x, y);
    if (!point) return null;
    return applyMagnetSnap(point, ctx.magnetMode, mapBars);
  }

  function resolvePoint(clientX, clientY) {
    return resolveChartPoint(clientX, clientY);
  }

  function resolveRegressionPoint(clientX, clientY) {
    const point = resolvePoint(clientX, clientY);
    if (!point) return null;
    const { bars, barSec } = ctx.getContext();
    return clampRegressionPoint(point, bars, barSec);
  }

  /** @param {import("../types.js").UserDrawing} drawing */
  function drawingCoords(drawing) {
    const context = ctx.getContext();
    const { barSec } = context;
    const mapBars = coordMapBars(context);
    const ts = ctx.chart.timeScale();
    const timeToX = (t) => chartXAt(ts, mapBars, barSec, undefined, t);
    const priceToY = (p) => safePriceToY(ctx.series, p);
    const right = chartVisibleRightX(ts) ?? 0;
    const bottom = ctx.container.clientHeight || 400;

    const pts = drawing.points.map((p) => {
      const x = timeToX(p.time);
      const y = priceToY(p.price);
      if (x == null || y == null) return null;
      return { x, y };
    });

    return { pts, right, bottom, timeToX, priceToY, bars: context.bars };
  }

  /** @param {import("../types.js").UserDrawing} drawing */
  function getDrawingScreenAnchor(drawing) {
    const { pts } = drawingCoords(drawing);
    if (!pts[0]) return null;
    const a = pts[0];
    const b = pts[1] ?? pts[0];
    const rect = ctx.container.getBoundingClientRect();
    return {
      left: rect.left + (a.x + b.x) / 2,
      top: rect.top + (a.y + b.y) / 2,
    };
  }

  Object.assign(ctx, {
    resolveChartPoint,
    resolvePoint,
    resolveRegressionPoint,
    drawingCoords,
    getDrawingScreenAnchor,
  });
}

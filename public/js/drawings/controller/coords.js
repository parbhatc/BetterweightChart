import { applyMagnetSnap } from "../tools/snap/magnet.js";
import { clampRegressionPoint } from "../tools/regression/trend.js";
import { chartDebug, chartDebugThrottle } from "../../debug/chart/index.js";

/** @param {import("./state.js").ControllerState} ctx */
export function attachCoords(ctx) {
  function timeAdapter() {
    return ctx.getContext().timeAdapter;
  }

  function resolveChartPoint(clientX, clientY, opts = {}) {
    const { magnet = true } = opts;
    const ta = timeAdapter();
    if (!ta) {
      chartDebug("drawings", "resolveChartPoint: no timeAdapter", {
        bars: ctx.getContext().bars?.length ?? 0,
        mapBars: ctx.getContext().mapBars?.length ?? 0,
      });
      return null;
    }
    const chartPt = ta.coord.fromClient(
      ctx.chart,
      ctx.series,
      ctx.container,
      clientX,
      clientY,
    );
    if (!chartPt) {
      const rect = ctx.container.getBoundingClientRect();
      chartDebug("drawings", "resolveChartPoint: fromClient null", {
        x: clientX - rect.left,
        y: clientY - rect.top,
        mapBars: ctx.getContext().mapBars?.length ?? 0,
      });
      return null;
    }
    const point = { time: ta.time.toUtc(chartPt.time), price: chartPt.price };
    const bars = ctx.getContext().bars ?? [];
    const lastUtc = bars.at(-1)?.time;
    if (!magnet || (lastUtc != null && point.time > lastUtc)) {
      return point;
    }
    return applyMagnetSnap(point, ctx.magnetMode, bars);
  }

  function resolvePoint(clientX, clientY) {
    return resolveChartPoint(clientX, clientY);
  }

  function resolveDragPoint(clientX, clientY) {
    return resolveChartPoint(clientX, clientY, { magnet: false });
  }

  /** Pane pixel {x,y} per anchor at drag start — used for rigid screen-space body drag. */
  function captureMoveDragAnchorPx(points) {
    const ta = timeAdapter();
    if (!ta) return null;
    return points.map((p) => ({
      x: ta.coord.xFromUtc(ctx.chart, p.time),
      y: ta.coord.yFromPrice(ctx.series, p.price),
    }));
  }

  /**
   * Rigid body drag: shift each anchor's start pixel by cursor delta, then map back to UTC.
   * @param {import("../types.js").DrawPoint[]} points
   * @param {({ x: number | null, y: number | null } | null)[]} startAnchorPx
   * @param {number} startClientX
   * @param {number} startClientY
   * @param {number} clientX
   * @param {number} clientY
   */
  function shiftPointsByClientDelta(
    points,
    startAnchorPx,
    startClientX,
    startClientY,
    clientX,
    clientY,
  ) {
    const ta = timeAdapter();
    if (!ta || !startAnchorPx?.length) return points;
    const dx = clientX - startClientX;
    const dy = clientY - startClientY;
    return points.map((p, i) => {
      const ap = startAnchorPx[i];
      if (ap?.x == null || ap?.y == null || !Number.isFinite(ap.x) || !Number.isFinite(ap.y)) {
        return p;
      }
      const chartPt = ta.coord.fromPixel(ctx.chart, ctx.series, ap.x + dx, ap.y + dy);
      if (!chartPt) return p;
      const time = ta.time.toUtc(chartPt.time);
      return {
        time: time != null && Number.isFinite(time) ? time : p.time,
        price: chartPt.price,
      };
    });
  }

  function moveDragPriceDelta(startClientY, clientY) {
    const rect = ctx.container.getBoundingClientRect();
    const p0 = ctx.series.coordinateToPrice(startClientY - rect.top);
    const p1 = ctx.series.coordinateToPrice(clientY - rect.top);
    if (p0 == null || p1 == null || !Number.isFinite(p0) || !Number.isFinite(p1)) return 0;
    return p1 - p0;
  }

  function resolveRegressionPoint(clientX, clientY) {
    const point = resolvePoint(clientX, clientY);
    if (!point) return null;
    const { bars, barSec } = ctx.getContext();
    return clampRegressionPoint(point, bars, barSec);
  }

  /** @param {import("../types.js").UserDrawing} drawing */
  function drawingCoords(drawing) {
    const ta = timeAdapter();
    const { bars } = ctx.getContext();
    if (!ta) {
      return {
        pts: [],
        right: 0,
        bottom: ctx.container.clientHeight || 400,
        timeToX: () => null,
        priceToY: () => null,
        bars: bars ?? [],
      };
    }
    const priceToY = (p) => ta.coord.yFromPrice(ctx.series, p);
    const timeToX = (utcT) => ta.coord.xFromUtc(ctx.chart, utcT);
    const right = ta.coord.visibleRightX(ctx.chart) ?? 0;
    const bottom = ctx.container.clientHeight || 400;

    const pts = drawing.points.map((p) => {
      const x = timeToX(p.time);
      const y = priceToY(p.price);
      if (x == null || y == null) return null;
      return { x, y };
    });

    return { pts, right, bottom, timeToX, priceToY, bars: bars ?? [] };
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
    resolveDragPoint,
    captureMoveDragAnchorPx,
    shiftPointsByClientDelta,
    moveDragPriceDelta,
    resolveRegressionPoint,
    drawingCoords,
    getDrawingScreenAnchor,
  });
}

import { safePriceToY } from "../../chart/coords/timeScale.js";

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ time: number, upper: number, lower: number }[]} points
 * @param {(time: number) => number | null} timeToX
 * @param {(price: number) => number | null} priceToY
 */
function drawBandSegment(ctx, points, timeToX, priceToY) {
  if (points.length < 2) return;

  ctx.beginPath();
  const firstX = timeToX(points[0].time);
  const firstY = priceToY(points[0].upper);
  if (firstX == null || firstY == null || !Number.isFinite(firstX) || !Number.isFinite(firstY)) return;
  ctx.moveTo(firstX, firstY);

  for (let i = 1; i < points.length; i++) {
    const x = timeToX(points[i].time);
    const y = priceToY(points[i].upper);
    if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) return;
    ctx.lineTo(x, y);
  }

  for (let i = points.length - 1; i >= 0; i--) {
    const x = timeToX(points[i].time);
    const y = priceToY(points[i].lower);
    if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) return;
    ctx.lineTo(x, y);
  }

  ctx.closePath();
  ctx.fill();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ time: number, upper: number, lower: number }[]} points
 * @param {(time: number) => number | null} timeToX
 * @param {(price: number) => number | null} priceToY
 * @param {number} rightX
 */
function extendBandSegmentRight(ctx, points, timeToX, priceToY, rightX) {
  const last = points[points.length - 1];
  const lastX = timeToX(last.time);
  const yUpper = priceToY(last.upper);
  const yLower = priceToY(last.lower);
  if (lastX == null || yUpper == null || yLower == null || !Number.isFinite(lastX)) return;
  if (lastX >= rightX) return;
  const topY = Math.min(yUpper, yLower);
  const height = Math.abs(yLower - yUpper);
  if (!Number.isFinite(height) || height <= 0) return;
  ctx.fillRect(lastX, topY, rightX - lastX, height);
}

class IndicatorBandFillPrimitive {
  /** @param {() => object} getConfig */
  constructor(getConfig) {
    /** @type {import("lightweight-charts").IChartApi | null} */
    this._chart = null;
    /** @type {import("lightweight-charts").ISeriesApi | null} */
    this._series = null;
    /** @type {(() => void) | null} */
    this._requestUpdate = null;
    this._getConfig = getConfig;
    this._paneView = new IndicatorBandFillPaneView(this);
    /** @type {(() => void) | null} */
    this._unsub = null;
  }

  requestRefresh() {
    this._requestUpdate?.();
  }

  /** @param {import("lightweight-charts").SeriesAttachedParameter} param */
  attached(param) {
    this._chart = param.chart;
    this._series = param.series;
    this._requestUpdate = param.requestUpdate;
    const ts = this._chart.timeScale();
    const onRange = () => this._requestUpdate?.();
    ts.subscribeVisibleLogicalRangeChange(onRange);
    this._unsub = () => ts.unsubscribeVisibleLogicalRangeChange(onRange);
  }

  detached() {
    this._unsub?.();
    this._unsub = null;
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
  }

  updateAllViews() {}

  paneViews() {
    return [this._paneView];
  }

  drawData() {
    const config = this._getConfig();
    const chart = this._chart;
    const series = this._series;
    if (!chart || !series) return { fills: [], timeToX: null, priceToY: null };

    const fills = config.getFills?.() ?? [];
    if (!fills.length) return { fills: [], timeToX: null, priceToY: null };

    const ts = chart.timeScale();
    return {
      fills,
      timeToX: (time) => {
        const x = ts.timeToCoordinate(time);
        return x == null || !Number.isFinite(x) ? null : x;
      },
      priceToY: (price) => safePriceToY(series, price),
    };
  }
}

class IndicatorBandFillPaneView {
  /** @param {IndicatorBandFillPrimitive} source */
  constructor(source) {
    this._source = source;
  }

  zOrder() {
    return "bottom";
  }

  renderer() {
    return new IndicatorBandFillPaneRenderer(this._source);
  }
}

class IndicatorBandFillPaneRenderer {
  /** @param {IndicatorBandFillPrimitive} source */
  constructor(source) {
    this._source = source;
  }

  draw(target) {
    const { fills, timeToX, priceToY } = this._source.drawData();
    if (!fills.length || !timeToX || !priceToY) return;

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const rightX = mediaSize.width;
      ctx.save();
      for (const fill of fills) {
        if (!fill.segments?.length) continue;
        ctx.fillStyle = fill.color;
        for (const segment of fill.segments) {
          drawBandSegment(ctx, segment, timeToX, priceToY);
          if (fill.extendRight && segment.length) {
            extendBandSegmentRight(ctx, segment, timeToX, priceToY, rightX);
          }
        }
      }
      ctx.restore();
    });
  }
}

/**
 * @param {object} opts
 * @param {import("lightweight-charts").ISeriesApi} opts.series
 * @param {() => object} opts.getConfig
 */
export function attachIndicatorBandFillPrimitive(opts) {
  const primitive = new IndicatorBandFillPrimitive(opts.getConfig);
  opts.series.attachPrimitive(primitive);
  return {
    requestRefresh: () => primitive.requestRefresh(),
    destroy: () => {
      try {
        opts.series.detachPrimitive(primitive);
      } catch {
        /* ignore */
      }
    },
  };
}

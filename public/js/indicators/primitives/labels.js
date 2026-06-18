import { safePriceToY, safeTimeToX } from "../../chart/coords/timeScale.js";
import { drawLabelCallout } from "./labelCallout.js";

class LabelsPaneRenderer {
  /** @param {() => object} getData */
  constructor(getData) {
    this._getData = getData;
  }

  /** @param {import("fancy-canvas").CanvasRenderingTarget2D} target */
  draw(target) {
    const { labels, timeToX, priceToY } = this._getData();
    if (!labels?.length) return;

    target.useMediaCoordinateSpace(({ context: ctx }) => {
      for (const lbl of labels) {
        const x = timeToX(lbl.time);
        const y = priceToY(lbl.price);
        if (x == null || y == null) continue;

        ctx.save();
        drawLabelCallout(
          ctx,
          x,
          y,
          String(lbl.text ?? ""),
          lbl.bgColor ?? "#ffffff",
          lbl.textColor ?? "#131722",
          lbl.kind === "low" ? "low" : "high",
        );
        ctx.restore();
      }
    });
  }
}

class LabelsPaneView {
  /** @param {LabelsPrimitive} source */
  constructor(source) {
    this._source = source;
  }

  zOrder() {
    return "top";
  }

  renderer() {
    return new LabelsPaneRenderer(() => this._source.drawData());
  }
}

class LabelsPrimitive {
  constructor() {
    /** @type {object[]} */
    this._labels = [];
    /** @type {import("lightweight-charts").IChartApi | null} */
    this._chart = null;
    /** @type {import("lightweight-charts").ISeriesApi | null} */
    this._series = null;
    /** @type {(() => void) | null} */
    this._requestUpdate = null;
    /** @type {(() => void) | null} */
    this._unsub = null;
    this._paneView = new LabelsPaneView(this);
  }

  /** @param {object[]} labels */
  setLabels(labels) {
    this._labels = labels ?? [];
    this._requestUpdate?.();
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
    const handler = () => this._requestUpdate?.();
    ts.subscribeVisibleLogicalRangeChange(handler);
    this._unsub = () => {
      try {
        ts.unsubscribeVisibleLogicalRangeChange(handler);
      } catch {
        /* ignore */
      }
    };
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
    const chart = this._chart;
    const series = this._series;
    if (!chart || !series) {
      return { labels: [], timeToX: () => null, priceToY: () => null };
    }
    const ts = chart.timeScale();
    return {
      labels: this._labels,
      timeToX: (t) => safeTimeToX(ts, t),
      priceToY: (p) => safePriceToY(series, p),
    };
  }
}

/** @param {{ series: import("lightweight-charts").ISeriesApi }} opts */
export function attachLabelsPrimitive(opts) {
  const primitive = new LabelsPrimitive();
  opts.series.attachPrimitive(primitive);
  return {
    setLabels: (labels) => primitive.setLabels(labels),
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

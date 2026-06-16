import { chartVisibleRightX, chartXAt, safePriceToY, coordMapBars } from "../../../chart/coords/timeScale.js";
import { finalizeMeasureDrawing } from "../../tools/measure/index.js";
import { renderDrawing } from "../renderers/index.js";
import { DrawingPriceLinesSync } from "../priceLines/index.js";

/** @typedef {import("../../types.js").UserDrawing} UserDrawing */

export class UserDrawingsPrimitive {
  constructor() {
    /** @type {UserDrawing[]} */
    this._drawings = [];
    /** @type {UserDrawing | null} */
    this._preview = null;
    /** @type {{ start: { time: number, price: number }, end: { time: number, price: number } } | null} */
    this._measureOverlay = null;
    this._drawingsHidden = false;
    /** @type {string | null} */
    this._selectedId = null;
    /** @type {string | null} */
    this._hoveredId = null;
    /** @type {string | null} */
    this._regressionGuideDrawingId = null;
    /** @type {any} */
    this._chart = null;
    /** @type {any} */
    this._series = null;
    /** @type {(() => void) | null} */
    this._requestUpdate = null;
    /** @type {() => { bars: { time: number }[], barSec: number }} */
    this._getContext = () => ({ bars: [], barSec: 60 });
    this._paneView = new DrawingsPaneView(this);
    this._unsub = null;
    this._priceLines = new DrawingPriceLinesSync();
  }

  /** @param {() => { bars: { time: number }[], barSec: number }} fn */
  setContextProvider(fn) {
    this._getContext = fn;
  }

  /** @param {UserDrawing[]} drawings @param {{ skipPriceLines?: boolean }} [opts] */
  setDrawings(drawings, opts = {}) {
    this._drawings = drawings ?? [];
    if (!opts.skipPriceLines) this._syncPriceLines();
    this._requestUpdate?.();
  }

  /** @param {string | null} id */
  setRegressionGuideDrawingId(id) {
    this._regressionGuideDrawingId = id;
    this._requestUpdate?.();
  }

  /** @param {UserDrawing | null} preview */
  setPreview(preview) {
    this._preview = preview;
    this._requestUpdate?.();
  }

  /** @param {{ start: { time: number, price: number }, end: { time: number, price: number } } | null} overlay */
  setMeasureOverlay(overlay) {
    this._measureOverlay = overlay;
    this._requestUpdate?.();
  }

  /** @param {boolean} hidden @param {{ skipPriceLines?: boolean }} [opts] */
  setDrawingsHidden(hidden, opts = {}) {
    this._drawingsHidden = Boolean(hidden);
    if (!opts.skipPriceLines) this._syncPriceLines();
    this._requestUpdate?.();
  }

  _syncPriceLines() {
    const items = this._drawingsHidden ? [] : this._drawings;
    this._priceLines.sync(items, {
      hidden: this._drawingsHidden,
      selectedId: this._selectedId,
      hoveredId: this._hoveredId,
    });
  }

  /** @param {string | null} id @param {{ skipPriceLines?: boolean }} [opts] */
  setSelectedId(id, opts = {}) {
    this._selectedId = id;
    if (!opts.skipPriceLines) this._syncPriceLines();
    this._requestUpdate?.();
  }

  /** @param {string | null} id */
  setHoveredId(id) {
    if (this._hoveredId === id) return;
    this._hoveredId = id;
    this._syncPriceLines();
    this._requestUpdate?.();
  }

  getDrawings() {
    return this._drawings;
  }

  /** @param {import("lightweight-charts").SeriesAttachedParameter} param */
  attached(param) {
    this._chart = param.chart;
    this._series = param.series;
    this._requestUpdate = param.requestUpdate;
    this._priceLines.setSeries(this._series);
    this._syncPriceLines();
    const ts = this._chart.timeScale();
    const onRange = () => this._requestUpdate?.();
    ts.subscribeVisibleLogicalRangeChange(onRange);
    this._unsub = () => ts.unsubscribeVisibleLogicalRangeChange(onRange);
  }

  detached() {
    this._unsub?.();
    this._unsub = null;
    this._priceLines.setSeries(null);
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
    const ctx = this._getContext();
    const { bars, barSec, precision, formatPointTime } = ctx;
    const mapBars = coordMapBars(ctx);
    if (!chart || !series) {
      return {
        items: [],
        bars,
        barSec,
        precision,
        formatPointTime,
        chart: null,
        series: null,
        timeToX: () => null,
        priceToY: () => null,
        rightX: () => 0,
        selectedId: null,
        hoveredId: null,
      };
    }
    const ts = chart.timeScale();
    const items = this._drawingsHidden ? [] : [...this._drawings];
    if (this._preview) items.push({ ...this._preview, id: "__preview__" });

    return {
      items,
      measureOverlay: this._measureOverlay,
      bars,
      barSec,
      precision,
      formatPointTime,
      chart,
      series,
      timeToX: (t) => chartXAt(ts, mapBars, barSec, undefined, t),
      priceToY: (p) => safePriceToY(series, p),
      rightX: () => chartVisibleRightX(ts) ?? 0,
      selectedId: this._selectedId,
      hoveredId: this._hoveredId,
      regressionGuideDrawingId: this._regressionGuideDrawingId,
    };
  }
}

class DrawingsPaneView {
  /** @param {UserDrawingsPrimitive} source */
  constructor(source) {
    this._source = source;
  }

  zOrder() {
    return "top";
  }

  renderer() {
    return new DrawingsPaneRenderer(this._source);
  }
}

class DrawingsPaneRenderer {
  /** @param {UserDrawingsPrimitive} source */
  constructor(source) {
    this._source = source;
  }

  draw(target) {
    const data = this._source.drawData();
    const {
      items,
      measureOverlay,
      timeToX,
      priceToY,
      rightX,
      selectedId,
      hoveredId,
      regressionGuideDrawingId,
      barSec,
      precision,
      formatPointTime,
      bars = [],
    } = data;
    if (!items.length && !measureOverlay) return;

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const right = rightX() || mediaSize.width;
      const bottom = mediaSize.height;

      if (measureOverlay) {
        const measureDrawing = finalizeMeasureDrawing({
          id: "__measure__",
          type: "date-price-range",
          points: [measureOverlay.start, measureOverlay.end],
        });
        renderDrawing(ctx, measureDrawing, timeToX, priceToY, right, bottom, {
          isPreview: true,
          precision: precision ?? 2,
          bars,
          barSec,
        });
      }

      for (const d of items) {
        const isPreview = d.id === "__preview__";
        renderDrawing(ctx, d, timeToX, priceToY, right, bottom, {
          isPreview,
          isSelected: !isPreview && d.id === selectedId,
          isHovered: !isPreview && d.id === hoveredId,
          hoveredDrawingId: hoveredId,
          regressionGuidesOnly: !isPreview && d.id === regressionGuideDrawingId,
          barSec,
          precision: precision ?? 2,
          formatPointTime,
          bars,
        });
      }
    });
  }
}

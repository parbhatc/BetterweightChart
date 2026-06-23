import { LineStyle } from "lightweight-charts";
import { safePriceToY } from "../../chart/coords/timeScale.js";
import { formatDisplayPrice } from "../../chart/format.js";
import { lineStyleDashPattern } from "../../chart/line/style.js";
import { resolveStudyLabelPositions } from "../../indicators/primitives/scaleLabels.js";
import {
  axisLabelHeight,
  createPriceAxisRendererOptions,
  drawPriceAxisLabel,
  drawStackedPriceAxisLabel,
  stackedLabelCenterOffset,
  stackedAxisLabelTotalHeight,
} from "./axisLabelRenderer.js";

/**
 * @typedef {object} CustomPriceLineOptions
 * @property {string} [id]
 * @property {number} price
 * @property {string} color
 * @property {number} [lineWidth]
 * @property {import("lightweight-charts").LineStyle} [lineStyle]
 * @property {boolean} [lineVisible]
 * @property {boolean} [axisLabelVisible]
 * @property {string} [axisLabelColor]
 * @property {string} [axisLabelTextColor]
 * @property {string} [title]
 * @property {string} [axisLabelText]
 * @property {string} [axisSubtitleText]
 */

/**
 * @typedef {object} CustomPriceLineHandle
 * @property {(options: Partial<CustomPriceLineOptions>) => void} applyOptions
 * @property {() => Readonly<ReturnType<typeof normalizeOptions>>} options
 * @property {() => void} remove
 */

/** @param {Partial<CustomPriceLineOptions>} options */
function normalizeOptions(options) {
  return {
    id: options.id ?? "",
    price: Number(options.price),
    color: options.color ?? "#2962FF",
    lineWidth: Math.max(1, Number(options.lineWidth) || 1),
    lineStyle: options.lineStyle ?? LineStyle.Dotted,
    lineVisible: options.lineVisible !== false,
    axisLabelVisible: options.axisLabelVisible !== false,
    axisLabelColor: options.axisLabelColor ?? options.color ?? "#2962FF",
    axisLabelTextColor: options.axisLabelTextColor ?? "#ffffff",
    title: options.title ?? "",
    axisLabelText: options.axisLabelText ?? "",
    axisSubtitleText: options.axisSubtitleText ?? "",
  };
}

/** @param {ReturnType<typeof createPriceAxisRendererOptions>} ro @param {ReturnType<typeof normalizeOptions>} line */
function lineLabelHeight(ro, line) {
  return stackedAxisLabelTotalHeight(ro, Boolean(line.axisSubtitleText));
}

/** @param {ReturnType<typeof normalizeOptions>} line @param {number} naturalY */
function stackedLabelCenterY(line, naturalY) {
  return line.axisSubtitleText ? naturalY + stackedLabelCenterOffset() : naturalY;
}

/** @param {object} row */
function rowLabelCenterY(row) {
  return stackedLabelCenterY(row.line, row.y);
}

/**
 * @param {import("lightweight-charts").IChartApi} chart
 * @param {string} scaleId
 * @param {number} mediaWidth
 */
function resolvePlotBounds(chart, scaleId, mediaWidth) {
  const plotW = chart.paneSize().width;
  const leftW = chart.priceScale("left").width();
  const spansScales = mediaWidth > plotW + 1;

  if (!spansScales) {
    return {
      lineX1: 0,
      lineX2: mediaWidth,
      titleEdge: scaleId === "left" ? 0 : mediaWidth,
    };
  }

  const plotLeft = leftW;
  const plotRight = leftW + plotW;
  return {
    lineX1: plotLeft,
    lineX2: plotRight,
    titleEdge: scaleId === "left" ? plotLeft : plotRight,
  };
}

/** @param {import("lightweight-charts").ISeriesApi} series @param {number} price */
function formatSeriesPrice(series, price) {
  try {
    const formatter = series.priceScale?.()?.formatter?.();
    if (formatter?.format) return formatter.format(price);
  } catch {
    //
  }
  return formatDisplayPrice(price, 2);
}

class CustomPriceLinesPrimitive {
  constructor() {
    /** @type {import("lightweight-charts").IChartApi | null} */
    this._chart = null;
    /** @type {import("lightweight-charts").ISeriesApi | null} */
    this._series = null;
    /** @type {(() => void) | null} */
    this._requestUpdate = null;
    /** @type {Map<string, ReturnType<typeof normalizeOptions>>} */
    this._lines = new Map();
    /** @type {(() => object) | null} */
    this._getContext = null;
    /** @type {(() => void) | null} */
    this._unsub = null;
    this._linePaneView = new CustomPriceLinePaneView(this);
    this._titlePaneView = new CustomPriceLineTitlePaneView(this);
    this._priceAxisPaneView = new CustomPriceLinePriceAxisPaneView(this);
  }

  /** @param {() => object} fn */
  setContextProvider(fn) {
    this._getContext = fn;
  }

  /** @param {string} id @param {Partial<CustomPriceLineOptions>} options */
  upsertLine(id, options) {
    this._lines.set(id, normalizeOptions({ ...options, id }));
    this._requestUpdate?.();
  }

  /** @param {string} id */
  removeLine(id) {
    if (!this._lines.delete(id)) return;
    this._requestUpdate?.();
  }

  clear() {
    this._lines.clear();
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
    const onRange = () => this._requestUpdate?.();
    ts.subscribeVisibleLogicalRangeChange(onRange);
    this._unsub = () => ts.unsubscribeVisibleLogicalRangeChange(onRange);
    queueMicrotask(() => this._requestUpdate?.());
    requestAnimationFrame(() => this._requestUpdate?.());
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
    return [this._linePaneView, this._titlePaneView];
  }

  priceAxisPaneViews() {
    return [this._priceAxisPaneView];
  }

  context() {
    return this._getContext?.() ?? {};
  }

  rendererOptions() {
    if (!this._chart) return null;
    return createPriceAxisRendererOptions(this._chart);
  }

  layoutLines() {
    const chart = this._chart;
    const series = this._series;
    if (!chart || !series || this._lines.size === 0) return [];

    const ctx = this.context();
    const paneH = chart.paneSize().height;
    const scaleId = ctx.scaleId ?? "right";
    if (ctx.scaleVisible === false || chart.priceScale(scaleId).width() <= 0) return [];

    /** @type {object[]} */
    const out = [];

    for (const [id, line] of this._lines) {
      if (!Number.isFinite(line.price)) continue;
      const y = safePriceToY(series, line.price);
      if (y == null || y < 0 || y > paneH) continue;

      const labelText =
        line.axisLabelText ||
        (line.axisLabelVisible ? formatSeriesPrice(series, line.price) : "");

      out.push({
        id,
        y,
        line,
        labelText,
        scaleId,
      });
    }

    return out;
  }
}

class CustomPriceLinePaneView {
  /** @param {CustomPriceLinesPrimitive} source */
  constructor(source) {
    this._source = source;
  }

  zOrder() {
    return "top";
  }

  renderer() {
    return new CustomPriceLinePaneRenderer(this._source);
  }
}

class CustomPriceLinePaneRenderer {
  /** @param {CustomPriceLinesPrimitive} source */
  constructor(source) {
    this._source = source;
  }

  draw(target) {
    const lines = this._source.layoutLines();
    if (!lines.length) return;

    target.useBitmapCoordinateSpace(
      ({ context: ctx, horizontalPixelRatio, verticalPixelRatio, mediaSize }) => {
      const chart = this._source._chart;
      const scaleId = this._source.context().scaleId ?? "right";
      const bounds = chart
        ? resolvePlotBounds(chart, scaleId, mediaSize.width)
        : { lineX1: 0, lineX2: mediaSize.width };
      const x1 = Math.round(bounds.lineX1 * horizontalPixelRatio);
      const x2 = Math.round(bounds.lineX2 * horizontalPixelRatio);

      for (const row of lines) {
        if (!row.line.lineVisible) continue;
        const lineWidth = row.line.lineWidth;
        const y =
          Math.round(row.y * verticalPixelRatio) +
          ((lineWidth * verticalPixelRatio) % 2 ? 0.5 : 0);
        const dash = lineStyleDashPattern(row.line.lineStyle, lineWidth).map(
          (n) => n * horizontalPixelRatio,
        );

        ctx.save();
        ctx.strokeStyle = row.line.color;
        ctx.lineWidth = lineWidth * verticalPixelRatio;
        ctx.lineCap = "butt";
        ctx.setLineDash(dash);
        ctx.beginPath();
        ctx.moveTo(x1, y);
        ctx.lineTo(x2, y);
        ctx.stroke();
        ctx.restore();
      }
    },
    );
  }
}

/**
 * Title on plot edge — LWC PanePriceAxisView + paneRenderer (extends left into chart).
 */
class CustomPriceLineTitlePaneView {
  /** @param {CustomPriceLinesPrimitive} source */
  constructor(source) {
    this._source = source;
  }

  zOrder() {
    return "top";
  }

  renderer() {
    return new CustomPriceLineTitlePaneRenderer(this._source);
  }
}

class CustomPriceLineTitlePaneRenderer {
  /** @param {CustomPriceLinesPrimitive} source */
  constructor(source) {
    this._source = source;
  }

  draw(target) {
    const ro = this._source.rendererOptions();
    if (!ro) return;

    const lines = this._source
      .layoutLines()
      .filter((row) => row.line.title);
    if (!lines.length) return;

    const resolved = resolveAxisLabelCenters(this._source, lines, ro);
    const chart = this._source._chart;

    target.useMediaCoordinateSpace(({ mediaSize }) => {
      const scaleId = resolved[0]?.scaleId ?? "right";
      const align = scaleId === "left" ? "left" : "right";
      const titleEdge = chart
        ? resolvePlotBounds(chart, scaleId, mediaSize.width).titleEdge
        : mediaSize.width;

      for (const row of resolved) {
        const subtitle = row.line.axisSubtitleText;
        const titleCenterY = subtitle
          ? row.centerY - stackedLabelCenterOffset()
          : row.centerY;

        drawPriceAxisLabel(
          target,
          {
            text: row.line.title,
            visible: true,
            tickVisible: false,
            moveTextToInvisibleTick: true,
            borderVisible: true,
            separatorVisible: true,
            color: row.line.axisLabelTextColor,
          },
          {
            coordinate: row.y,
            fixedCoordinate: titleCenterY,
            background: row.line.axisLabelColor,
          },
          ro,
          align,
          { edgeWidth: titleEdge },
        );
      }
    });
  }
}

/** Price chip on scale only — LWC CustomPriceLinePriceAxisView + axisRenderer. */
class CustomPriceLinePriceAxisPaneView {
  /** @param {CustomPriceLinesPrimitive} source */
  constructor(source) {
    this._source = source;
  }

  zOrder() {
    return "top";
  }

  renderer() {
    return new CustomPriceLinePriceAxisPaneRenderer(this._source);
  }
}

class CustomPriceLinePriceAxisPaneRenderer {
  /** @param {CustomPriceLinesPrimitive} source */
  constructor(source) {
    this._source = source;
  }

  draw(target) {
    const ro = this._source.rendererOptions();
    if (!ro) return;

    const lines = this._source
      .layoutLines()
      .filter((row) => row.line.axisLabelVisible && row.labelText);
    if (!lines.length) return;

    const resolved = resolveAxisLabelCenters(this._source, lines, ro);
    const align = resolved[0]?.scaleId === "left" ? "left" : "right";
    const chart = this._source._chart;
    const scaleId = resolved[0]?.scaleId ?? "right";

    target.useMediaCoordinateSpace(({ mediaSize }) => {
      const scaleW = chart?.priceScale(scaleId)?.width?.() ?? mediaSize.width;
      const edgeWidth = Math.max(
        0,
        Math.min(mediaSize.width, scaleW) - ro.borderSize - ro.tickLength,
      );

      for (const row of resolved) {
        const chipH = axisLabelHeight(ro);
        const subtitle = row.line.axisSubtitleText;

        if (subtitle) {
          drawStackedPriceAxisLabel(target, {
            priceText: row.labelText,
            subtitleText: subtitle,
            coordinate: row.y,
            fixedCoordinate: row.centerY,
            background: row.line.axisLabelColor,
            textColor: row.line.axisLabelTextColor,
            rendererOptions: ro,
            align,
            edgeWidth,
          });
          continue;
        }

        drawPriceAxisLabel(
          target,
          {
            text: row.labelText,
            visible: true,
            tickVisible: false,
            moveTextToInvisibleTick: false,
            borderVisible: false,
            separatorVisible: false,
            color: row.line.axisLabelTextColor,
          },
          {
            coordinate: row.y,
            fixedCoordinate: row.centerY,
            background: row.line.axisLabelColor,
          },
          ro,
          align,
          { edgeWidth },
        );
      }
    });
  }
}

/** @param {CustomPriceLinesPrimitive} primitive @param {object[]} lines @param {ReturnType<typeof createPriceAxisRendererOptions>} ro */
function resolveAxisLabelCenters(primitive, lines, ro) {
  const ctx = primitive.context();
  const series = primitive._series;
  if (!series || ctx.noOverlappingLabels === false) {
    return lines.map((row) => ({ ...row, centerY: rowLabelCenterY(row) }));
  }

  const reserved = ctx.reservedAnchors ?? [];
  if (!reserved.length && lines.length < 2) {
    return lines.map((row) => ({ ...row, centerY: rowLabelCenterY(row) }));
  }

  const defs = lines.map((row) => ({
    id: row.id,
    price: row.line.price,
    color: row.line.axisLabelColor,
    text: row.labelText || row.line.title,
  }));
  const maxLabelHeight = Math.max(
    axisLabelHeight(ro),
    ...lines.map((row) => lineLabelHeight(ro, row.line)),
  );
  const placed = resolveStudyLabelPositions(series, defs, reserved, maxLabelHeight);
  const centerById = new Map(placed.map((p) => [String(p.id), p.centerY]));
  return lines.map((row) => ({
    ...row,
    centerY: centerById.get(row.id) ?? rowLabelCenterY(row),
  }));
}

/**
 * Attach custom price-line host (LWC CustomPriceLine equivalent via primitives).
 * @param {object} opts
 * @param {import("lightweight-charts").ISeriesApi} opts.series
 * @param {() => object} opts.getContext
 */
export function attachCustomPriceLineHost(opts) {
  const primitive = new CustomPriceLinesPrimitive();
  primitive.setContextProvider(opts.getContext);
  opts.series.attachPrimitive(primitive);

  /** @type {Map<string, CustomPriceLineHandle>} */
  const handles = new Map();

  /**
   * Drop-in for series.createPriceLine — rendered via primitives, not LWC internals.
   * @param {Partial<CustomPriceLineOptions> & Pick<CustomPriceLineOptions, "price">} options
   * @returns {CustomPriceLineHandle}
   */
  function createCustomPriceLine(options) {
    const id = options.id || `cpl-${handles.size + 1}-${Date.now()}`;
    const normalized = normalizeOptions({ ...options, id });
    primitive.upsertLine(id, normalized);

    const handle = {
      applyOptions(partial) {
        const next = normalizeOptions({ ...normalized, ...partial, id });
        Object.assign(normalized, next);
        primitive.upsertLine(id, normalized);
      },
      options() {
        return { ...normalized };
      },
      remove() {
        handles.delete(id);
        primitive.removeLine(id);
      },
    };
    handles.set(id, handle);
    return handle;
  }

  return {
    createCustomPriceLine,
    /** @deprecated use createCustomPriceLine */
    createPriceLine: createCustomPriceLine,
    requestRefresh: () => primitive.requestRefresh(),
    destroy: () => {
      for (const handle of handles.values()) handle.remove();
      handles.clear();
      try {
        opts.series.detachPrimitive(primitive);
      } catch {
        //
      }
    },
  };
}

/** @param {import("lightweight-charts").IChartApi} chart @param {boolean} [hasSubtitle] */
export function customPriceLineLabelHeight(chart, hasSubtitle = false) {
  const ro = createPriceAxisRendererOptions(chart);
  return stackedAxisLabelTotalHeight(ro, hasSubtitle);
}

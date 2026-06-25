import { PluginBase } from "../pluginBase.js";
import { resolveTimezone } from "../../chart/timezone/list.js";
import { chartDebug } from "../../debug/chart/index.js";
import { subscribeVisibleLogicalRangeCache } from "../viewportRefresh.js";

const RTH_OPEN = 9 * 60 + 30;
const RTH_CLOSE = 16 * 60;

/** @type {Map<string, Intl.DateTimeFormat>} */
const dateTimeFormatByTz = new Map();

/** @param {string} timeZone */
function dateTimeFormatForTz(timeZone) {
  let fmt = dateTimeFormatByTz.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    });
    dateTimeFormatByTz.set(timeZone, fmt);
  }
  return fmt;
}

/**
 * @param {number} unixSec
 * @param {string} timeZone
 */
function localMinutes(unixSec, timeZone) {
  const parts = dateTimeFormatForTz(timeZone).formatToParts(new Date(unixSec * 1000));
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  const isWeekend = weekday === "Sat" || weekday === "Sun";
  return { minutes: hour * 60 + minute, isWeekend };
}

/**
 * @param {number} unixSec
 * @param {string} timeZone
 * @param {string} [symbolType]
 */
export function isElectronicSession(unixSec, timeZone, symbolType) {
  if (symbolType === "crypto" || symbolType === "forex") return false;
  const { minutes, isWeekend } = localMinutes(unixSec, timeZone);
  if (isWeekend) return true;
  return minutes < RTH_OPEN || minutes >= RTH_CLOSE;
}

/** @typedef {import("lightweight-charts").Time} Time */
/** @typedef {(date: Time) => string} SessionHighlighter */

const TRANSPARENT = "rgba(0, 0, 0, 0)";

/**
 * @param {object} opts
 * @param {() => object} opts.getSettings
 * @param {() => object | null} opts.getSymbolInfo
 * @param {() => ReturnType<import("../../chart/time/timeAdapter.js").createTimeAdapter> | null} opts.getTimeAdapter
 * @returns {SessionHighlighter}
 */
export function createElectronicSessionHighlighter({ getSettings, getSymbolInfo, getTimeAdapter }) {
  return (chartTime) => {
    const settings = getSettings();
    if (settings.session !== "electronic") return TRANSPARENT;

    const symbolInfo = getSymbolInfo();
    const symbolType = symbolInfo?.type;
    if (symbolType === "crypto" || symbolType === "forex") return TRANSPARENT;

    const tz = resolveTimezone(settings.timezone, symbolInfo);
    const fill = settings.ethBackground ?? "rgba(41, 98, 255, 0.08)";
    const timeAdapter = getTimeAdapter();
    const raw = Number(chartTime);
    if (!Number.isFinite(raw)) return TRANSPARENT;

    const utc = timeAdapter?.time?.toUtc ? timeAdapter.time.toUtc(raw) : raw;
    return isElectronicSession(utc, tz, symbolType) ? fill : TRANSPARENT;
  };
}

/**
 * @typedef {object} SessionBackgroundSpan
 * @property {number} x1
 * @property {number} x2
 * @property {string} color
 */

/**
 * @typedef {object} SessionBackgroundViewData
 * @property {SessionBackgroundSpan[]} spans
 * @property {number} barWidth
 */

/** @implements {import("lightweight-charts").IPrimitivePaneRenderer} */
class SessionBackgroundPaneRenderer {
  /** @param {SessionBackgroundViewData} viewData */
  constructor(viewData) {
    this._viewData = viewData;
  }

  /** @param {import("fancy-canvas").CanvasRenderingTarget2D} target */
  draw(target) {
    const spans = this._viewData.spans;
    if (!spans.length) return;

    const barWidth = this._viewData.barWidth;

    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      const height = scope.bitmapSize.height;
      const hRatio = scope.horizontalPixelRatio;
      const halfWidth = (hRatio * barWidth) / 2;
      const bitmapW = scope.bitmapSize.width;

      for (const span of spans) {
        const color = span.color;
        if (!color || color === TRANSPARENT) continue;

        const x1 = Math.round(span.x1 * hRatio - halfWidth);
        const x2 = Math.round(span.x2 * hRatio + halfWidth);
        const left = Math.max(0, x1);
        const right = Math.min(bitmapW, x2);
        if (right <= left) continue;

        ctx.fillStyle = color;
        ctx.fillRect(left, 0, right - left, height);
      }
    });
  }
}

/** @implements {import("lightweight-charts").IPrimitivePaneView} */
class SessionBackgroundPaneView {
  /** @param {SessionBackgroundPrimitive} source */
  constructor(source) {
    this._source = source;
    /** @type {SessionBackgroundViewData} */
    this._data = { spans: [], barWidth: 6 };
  }

  update() {
    const chart = this._source.chart;
    const timeScale = chart.timeScale();
    const series = this._source.series;

    const seriesLen = series.data().length;
    if (!seriesLen) {
      this._data.spans = [];
      return;
    }

    const barSpacing = timeScale.options().barSpacing ?? 6;
    this._data.barWidth = barSpacing;

    const range = this._source._visibleRange;
    let startIdx = 0;
    let endIdx = seriesLen - 1;
    if (range) {
      startIdx = Math.max(0, Math.floor(range.from) - 1);
      endIdx = Math.min(seriesLen - 1, Math.ceil(range.to) + 1);
      if (startIdx > endIdx) {
        this._data.spans = [];
        return;
      }
    }

    const paneW = chart.paneSize?.().width ?? timeScale.width() ?? 0;
    const pad = barSpacing * 2;

    /** @type {SessionBackgroundSpan[]} */
    const spans = [];
    /** @type {string | null} */
    let runColor = null;
    let runFirstX = null;
    let runLastX = null;

    const flushRun = () => {
      if (runColor && runFirstX != null && runLastX != null) {
        spans.push({ x1: runFirstX, x2: runLastX, color: runColor });
      }
      runColor = null;
      runFirstX = null;
      runLastX = null;
    };

    for (let i = startIdx; i <= endIdx; i += 1) {
      const dp = series.dataByIndex(i);
      if (!dp?.time) continue;

      const color = this._source._colorForTime(dp.time);
      if (!color || color === TRANSPARENT) {
        flushRun();
        continue;
      }

      const x = timeScale.timeToCoordinate(dp.time);
      if (x == null || !Number.isFinite(x)) {
        flushRun();
        continue;
      }
      if (paneW > 0 && (x < -pad || x > paneW + pad)) {
        flushRun();
        continue;
      }

      if (color === runColor) {
        runLastX = x;
      } else {
        flushRun();
        runColor = color;
        runFirstX = x;
        runLastX = x;
      }
    }
    flushRun();

    this._data.spans = spans;
  }

  renderer() {
    return new SessionBackgroundPaneRenderer(this._data);
  }

  zOrder() {
    return "bottom";
  }
}

/**
 * Per-bar electronic session shading via ISeriesPrimitive + PluginBase.
 * Colors are resolved from live series indices (not a parallel cache) so history
 * prepend never desyncs shading from candles.
 * @extends {PluginBase}
 */
export class SessionBackgroundPrimitive extends PluginBase {
  /**
   * @param {SessionHighlighter} highlighter
   */
  constructor(highlighter) {
    super();
    /** @type {SessionHighlighter} */
    this._highlighter = highlighter;
    /** @type {Map<string, string>} */
    this._colorCache = new Map();
    this._paneViews = [new SessionBackgroundPaneView(this)];
    /** @type {{ from: number, to: number } | null} */
    this._visibleRange = null;
    /** @type {(() => void) | null} */
    this._unsubRange = null;
    this._seriesLen = 0;
  }

  /** @param {Time} time */
  _colorForTime(time) {
    const key = String(time);
    let color = this._colorCache.get(key);
    if (color === undefined) {
      color = this._highlighter(time);
      this._colorCache.set(key, color);
    }
    return color;
  }

  _clearColorCache() {
    this._colorCache.clear();
    chartDebug("session", "color cache cleared");
  }

  /** @param {SessionHighlighter} highlighter */
  setHighlighter(highlighter) {
    this._highlighter = highlighter;
    this._clearColorCache();
    if (this._series) this.requestUpdate();
  }

  /** @param {import("lightweight-charts").SeriesAttachedParameter} param */
  attached(param) {
    super.attached(param);
    this._unsubRange = subscribeVisibleLogicalRangeCache(
      this.chart.timeScale(),
      (range) => {
        this._visibleRange = range;
      },
    );
    this._seriesLen = this.series.data().length;
    this._clearColorCache();
  }

  detached() {
    this._unsubRange?.();
    this._unsubRange = null;
    super.detached();
    this._colorCache.clear();
    this._seriesLen = 0;
  }

  updateAllViews() {
    for (const view of this._paneViews) view.update();
  }

  paneViews() {
    return this._paneViews;
  }

  requestRefresh() {
    if (!this._series) return;
    this._clearColorCache();
    this.requestUpdate();
  }

  /** Reconcile after history prepend or other deferred refresh. */
  flushPendingRebuild() {
    if (!this._series) return;
    this._clearColorCache();
    this.requestUpdate();
  }

  /** @param {import("lightweight-charts").DataChangedScope} scope */
  dataUpdated(scope) {
    if (!this._series) return;

    const len = this.series.data().length;
    if (!len) {
      this._seriesLen = 0;
      this._clearColorCache();
      this.requestUpdate();
      return;
    }

    if (scope !== "update" || len !== this._seriesLen) {
      this._seriesLen = len;
      this._clearColorCache();
    }
    this.requestUpdate();
  }
}

import { chartXAt } from "../chart/timeScaleCoords.js";
import { resolveTimezone } from "../chart/timezones.js";

const RTH_OPEN = 9 * 60 + 30;
const RTH_CLOSE = 16 * 60;

/**
 * @param {number} unixSec
 * @param {string} timeZone
 */
function localMinutes(unixSec, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(new Date(unixSec * 1000));
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

export class SessionBackgroundPrimitive {
  constructor() {
    /** @type {any} */
    this._chart = null;
    /** @type {(() => void) | null} */
    this._requestUpdate = null;
    /** @type {() => object} */
    this._getSettings = () => ({});
    /** @type {() => object | null} */
    this._getSymbolInfo = () => null;
    /** @type {() => { bars: object[], barSec: number }} */
    this._getContext = () => ({ bars: [], barSec: 60 });
    this._paneView = new SessionBgPaneView(this);
    this._unsub = null;
  }

  /** @param {() => object} fn */
  setSettingsProvider(fn) {
    this._getSettings = fn;
  }

  /** @param {() => object | null} fn */
  setSymbolProvider(fn) {
    this._getSymbolInfo = fn;
  }

  /** @param {() => { bars: object[], barSec: number }} fn */
  setContextProvider(fn) {
    this._getContext = fn;
  }

  /** @param {import("lightweight-charts").SeriesAttachedParameter} param */
  attached(param) {
    this._chart = param.chart;
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
    this._requestUpdate = null;
  }

  updateAllViews() {}

  paneViews() {
    return [this._paneView];
  }

  requestRefresh() {
    this._requestUpdate?.();
  }

  drawData() {
    const settings = this._getSettings();
    const symbolInfo = this._getSymbolInfo();
    const { bars, barSec } = this._getContext();
    const chart = this._chart;
    if (!chart || settings.session !== "electronic" || !bars.length) {
      return { spans: [], fill: "transparent", timeToX: null };
    }

    const tz = resolveTimezone(settings.timezone, symbolInfo);
    const fill = settings.ethBackground ?? "rgba(41, 98, 255, 0.08)";
    const ts = chart.timeScale();
    const spans = [];
    let runStart = null;
    let runEnd = null;

    for (let i = 0; i < bars.length; i += 1) {
      const bar = bars[i];
      const next = bars[i + 1];
      const eth = isElectronicSession(bar.time, tz, symbolInfo?.type);
      if (eth) {
        if (runStart == null) runStart = bar.time;
        runEnd = next?.time ?? bar.time + barSec;
      } else if (runStart != null && runEnd != null) {
        spans.push({ from: runStart, to: runEnd });
        runStart = null;
        runEnd = null;
      }
    }
    if (runStart != null && runEnd != null) spans.push({ from: runStart, to: runEnd });

    return {
      spans,
      fill,
      timeToX: (t) => chartXAt(ts, bars, barSec, undefined, t),
    };
  }
}

class SessionBgPaneView {
  /** @param {SessionBackgroundPrimitive} source */
  constructor(source) {
    this._source = source;
  }

  zOrder() {
    return "bottom";
  }

  renderer() {
    return new SessionBgPaneRenderer(this._source);
  }
}

class SessionBgPaneRenderer {
  /** @param {SessionBackgroundPrimitive} source */
  constructor(source) {
    this._source = source;
  }

  draw(target) {
    const { spans, fill, timeToX } = this._source.drawData();
    if (!spans.length || !timeToX) return;

    target.useBitmapCoordinateSpace(({ context: ctx, bitmapSize }) => {
      ctx.fillStyle = fill;
      const h = bitmapSize.height;
      for (const span of spans) {
        const x1 = timeToX(span.from);
        const x2 = timeToX(span.to);
        if (x1 == null || x2 == null) continue;
        const left = Math.min(x1, x2);
        const width = Math.max(Math.abs(x2 - x1), 2);
        ctx.fillRect(left, 0, width, h);
      }
    });
  }
}

import { defineIndicator } from "../defineIndicator.js";
import { applyColorOpacity } from "../../ui/color/picker.js";
import { chartDebug } from "../../debug/chart/index.js";
import {
  alignUtcBarsByChartTime,
  pivotBarIndex,
  pivotHighAtSparse,
  pivotLowAtSparse,
} from "../math/pivots.js";
import { symbolTicker } from "../../app/symbol/ticker.js";

/** @param {object} style @param {string} key @param {string} fallback */
function styleColor(style, key, fallback) {
  const v = style[key];
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && v.color) return String(v.color);
  return fallback;
}

/** @param {object} style @param {string} key @param {string} fallback @param {number} [defaultOpacity] */
function styleColorWithOpacity(style, key, fallback, defaultOpacity = 80) {
  const opacityKey = `${key}Opacity`;
  const storedOpacity =
    style[opacityKey] !== undefined && style[opacityKey] !== null
      ? Number(style[opacityKey])
      : defaultOpacity;
  const raw = style[key];
  if (raw && typeof raw === "object" && raw.color) {
    return applyColorOpacity(String(raw.color), Number(raw.opacity ?? storedOpacity));
  }
  const hex = styleColor(style, key, fallback);
  return applyColorOpacity(hex, storedOpacity);
}

/** @param {object} inputs @param {string} primary */
export function resolveSmtCompareSymbol(inputs, primary) {
  if (inputs.autoCompare !== false) {
    return defaultCompareSymbol(primary);
  }
  const manual = String(inputs.compareSymbol ?? "").trim();
  return manual || "ES";
}

/** @param {string} primary */
function defaultCompareSymbol(primary) {
  const raw = String(primary ?? "");
  const colon = raw.indexOf(":");
  const prefix = colon >= 0 ? raw.slice(0, colon + 1) : "";
  const sym = (colon >= 0 ? raw.slice(colon + 1) : raw).toUpperCase().replace(/!$/, "");

  const pairs = {
    NQ: "ES1!",
    ES: "NQ1!",
    NQ1: "ES1!",
    ES1: "NQ1!",
    MES: "MNQ1!",
    MNQ: "MES1!",
    GC: "SI1!",
    SI: "GC1!",
    GC1: "SI1!",
    SI1: "GC1!",
    CL: "RB1!",
    RB: "CL1!",
    BTC: "ETH",
    ETH: "BTC",
  };
  return `${prefix}${pairs[sym] ?? "NQ1!"}`;
}

export const SmtIndicator = defineIndicator(class SmtIndicator {
  constructor() {}

  static id = "SMT@tv-basicstudies";
  static type = "smt";
  static title = "SMT Divergence";
  static shortTitle = "SMT";
  static overlayPrimitive = "lines";

  static graphicObjects = [
    { styleKey: "graphicLines", label: "Line", overlay: "lines" },
    { styleKey: "paneLabels", label: "Pane labels" },
  ];

  static inputs = [
    { id: "autoCompare", type: "bool", title: "Auto-detect compare symbol", defval: true, section: "Symbols" },
    {
      id: "compareSymbol",
      type: "symbol",
      title: "Compare symbol",
      defval: "ES",
      section: "Symbols",
      disabled: (inputs) => inputs.autoCompare !== false,
    },
    { id: "leftLen", type: "int", title: "Pivot left", defval: 1, section: "Pivots", inline: true },
    { id: "rightLen", type: "int", title: "Pivot right", defval: 1, section: "Pivots", inline: true },
    {
      id: "waitClose",
      type: "bool",
      title: "Wait for candle close",
      defval: true,
      section: "Detection",
    },
    { id: "showHigh", type: "bool", title: "Pivot high SMT", defval: true, section: "Detection" },
    { id: "showLow", type: "bool", title: "Pivot low SMT", defval: true, section: "Detection" },
    {
      type: "inlinePair",
      section: "Pivot high",
      left: {
        id: "highColor",
        type: "color",
        title: "Line",
        defval: { color: "#ff1100", opacity: 100 },
        store: "style",
      },
      right: {
        id: "highLabelPrefix",
        type: "text",
        title: "Label prefix",
        defval: "SMT + ",
        store: "style",
      },
    },
    {
      id: "highLabelBg",
      type: "color",
      title: "Label background",
      defval: { color: "#ff1100", opacity: 80 },
      section: "Pivot high",
      store: "style",
    },
    {
      type: "inlinePair",
      section: "Pivot low",
      left: {
        id: "lowColor",
        type: "color",
        title: "Line",
        defval: { color: "#089981", opacity: 100 },
        store: "style",
      },
      right: {
        id: "lowLabelPrefix",
        type: "text",
        title: "Label prefix",
        defval: "SMT - ",
        store: "style",
      },
    },
    {
      id: "lowLabelBg",
      type: "color",
      title: "Label background",
      defval: { color: "#089981", opacity: 80 },
      section: "Pivot low",
      store: "style",
    },
    { id: "lineWidth", type: "int", title: "Line width", defval: 2, section: "Pivot low", store: "style" },
  ];

  static mergeStyleDefaults(style) {
    return {
      ...style,
      graphicLines: style.graphicLines ?? true,
      paneLabels: style.paneLabels ?? true,
      highColor: style.highColor ?? "#ff1100",
      lowColor: style.lowColor ?? "#089981",
      highLabelPrefix: style.highLabelPrefix ?? "SMT + ",
      lowLabelPrefix: style.lowLabelPrefix ?? "SMT - ",
      lineWidth: style.lineWidth ?? 2,
    };
  }

  static legendParams(instance, ctx = {}) {
    const compare = resolveSmtCompareSymbol(instance.inputs, ctx.primarySymbol ?? "");
    const left = Math.max(1, Number(instance.inputs.leftLen) || 1);
    const right = Math.max(1, Number(instance.inputs.rightLen) || 1);
    return [symbolTicker(compare), String(left), String(right)];
  }

  /** @param {object} instance @param {object} ctx */
  static overlayRecomputeExtra(instance, ctx) {
    const compare = resolveSmtCompareSymbol(instance.inputs, ctx.primarySymbol ?? ctx.symbol);
    const cmp = ctx.getCompareBars?.(compare, ctx.chartResolution);
    const len = cmp?.utcBars?.length ?? 0;
    const tail = cmp?.utcBars?.at(-1)?.time ?? "";
    const style = instance.style ?? {};
    const colors = [
      styleColor(style, "highColor", ""),
      styleColor(style, "lowColor", ""),
      styleColorWithOpacity(style, "highLabelBg", "#ff1100", 80),
      styleColorWithOpacity(style, "lowLabelBg", "#089981", 80),
      style.highLabelBgOpacity,
      style.lowLabelBgOpacity,
      style.highLabelPrefix,
      style.lowLabelPrefix,
      style.lineWidth,
      style.paneLabels,
    ].join("|");
    return `${compare}|${len}|${tail}|${colors}`;
  }

  init() {
    if (this.style.graphicLines === false) {
      this.state.skip = true;
      this.state.loading = false;
      return;
    }

    const overlayCtx = this.overlayCtx ?? {};
    const compare = resolveSmtCompareSymbol(
      this.inputs,
      overlayCtx.primarySymbol ?? overlayCtx.symbol,
    );
    const cmp = overlayCtx.getCompareBars?.(compare, overlayCtx.chartResolution);
    if (!cmp?.utcBars?.length || cmp.utcBars.length !== cmp.chartBars?.length) {
      overlayCtx.requestCompareBars?.(compare, this.bars.length);
      this.state.skip = true;
      this.state.loading = true;
      return;
    }

    const left = Math.max(1, Number(this.inputs.leftLen) || 1);
    const right = Math.max(1, Number(this.inputs.rightLen) || 1);
    const aligned = alignUtcBarsByChartTime(this.chartBars, cmp.utcBars, cmp.chartBars);
    let covered = 0;
    for (const bar of aligned) {
      if (bar) covered += 1;
    }
    if (covered < this.bars.length) {
      overlayCtx.requestCompareBars?.(compare, this.bars.length);
    }
    if (covered < left + right + 1) {
      chartDebug("smt", "init skip: insufficient compare coverage", {
        compare,
        covered,
        need: this.bars.length,
        left,
        right,
      });
      this.state.skip = true;
      this.state.loading = true;
      return;
    }

    chartDebug("smt", "init ok", {
      compare,
      covered,
      bars: this.bars.length,
      left,
      right,
    });

    const style = this.style;
    this.state.skip = false;
    this.state.loading = false;
    this.state.compareUtc = aligned;
    this.state.left = left;
    this.state.right = right;
    this.state.waitClose = Boolean(this.inputs.waitClose);
    this.state.showHigh = this.inputs.showHigh !== false;
    this.state.showLow = this.inputs.showLow !== false;
    this.state.highColor = styleColor(style, "highColor", "#ff1100");
    this.state.lowColor = styleColor(style, "lowColor", "#089981");
    this.state.highLabelPrefix = style.highLabelPrefix ?? "SMT + ";
    this.state.lowLabelPrefix = style.lowLabelPrefix ?? "SMT - ";
    this.state.compareTicker = symbolTicker(compare);
    this.state.highLabelBg = styleColorWithOpacity(style, "highLabelBg", "#ff1100", 80);
    this.state.lowLabelBg = styleColorWithOpacity(style, "lowLabelBg", "#089981", 80);
    this.state.highLabelTextColor = "#ffffff";
    this.state.lowLabelTextColor = "#ffffff";
    this.state.width = Math.max(1, Number(style.lineWidth) || 2);
    this.state.showLabels = style.paneLabels !== false;
    this.state.lastPh = null;
    this.state.lastSymPh = null;
    this.state.lastPhBarIdx = null;
    this.state.lastPl = null;
    this.state.lastSymPl = null;
    this.state.lastPlBarIdx = null;
  }

  onBar() {
    if (this.state.skip) return;

    const {
      compareUtc,
      left,
      right,
      waitClose,
      showHigh,
      showLow,
      highColor,
      lowColor,
      highLabelPrefix,
      lowLabelPrefix,
      compareTicker,
      highLabelBg,
      lowLabelBg,
      highLabelTextColor,
      lowLabelTextColor,
      width,
      showLabels,
    } = this.state;

    const lastIdx = this.bars.length - 1;
    if (waitClose && this.index === lastIdx) return;

    const ph = this.math.pivotHigh(left, right);
    const symPh = pivotHighAtSparse(compareUtc, this.index, left, right);

    if (ph != null && symPh != null) {
      if (
        showHigh &&
        this.state.lastPh != null &&
        this.state.lastSymPh != null &&
        this.state.lastPhBarIdx != null &&
        (ph - this.state.lastPh) * (symPh - this.state.lastSymPh) < 0
      ) {
        const pivotIdx = pivotBarIndex(this.index, right);
        const timeEnd = this.chartBars[pivotIdx]?.time;
        const timeStart = this.chartBars[this.state.lastPhBarIdx]?.time;
        if (timeStart != null && timeEnd != null) {
          const midPrice = (ph + this.state.lastPh) / 2;
          const offset = ph * 0.0001;
          this.drawLine({
            timeStart,
            priceStart: this.state.lastPh,
            timeEnd,
            priceEnd: ph,
            color: highColor,
            width,
            kind: "high",
            ...(showLabels
              ? {
                  label: `${highLabelPrefix}${compareTicker}`,
                  labelTime: Math.round((timeStart + timeEnd) / 2),
                  labelPrice: midPrice + offset,
                  labelStyle: "down",
                  labelBg: highLabelBg,
                  labelTextColor: highLabelTextColor,
                }
              : {}),
          });
        }
      }
      this.state.lastPh = ph;
      this.state.lastSymPh = symPh;
      this.state.lastPhBarIdx = pivotBarIndex(this.index, right);
    } else if (ph != null && (this.state.lastPh == null || ph > this.state.lastPh)) {
      this.state.lastPh = ph;
      this.state.lastSymPh = null;
      this.state.lastPhBarIdx = pivotBarIndex(this.index, right);
    }

    const pl = this.math.pivotLow(left, right);
    const symPl = pivotLowAtSparse(compareUtc, this.index, left, right);

    if (pl != null && symPl != null) {
      if (
        showLow &&
        this.state.lastPl != null &&
        this.state.lastSymPl != null &&
        this.state.lastPlBarIdx != null &&
        (pl - this.state.lastPl) * (symPl - this.state.lastSymPl) < 0
      ) {
        const pivotIdx = pivotBarIndex(this.index, right);
        const timeEnd = this.chartBars[pivotIdx]?.time;
        const timeStart = this.chartBars[this.state.lastPlBarIdx]?.time;
        if (timeStart != null && timeEnd != null) {
          const midPrice = (pl + this.state.lastPl) / 2;
          const offset = pl * 0.0001;
          this.drawLine({
            timeStart,
            priceStart: this.state.lastPl,
            timeEnd,
            priceEnd: pl,
            color: lowColor,
            width,
            kind: "low",
            ...(showLabels
              ? {
                  label: `${lowLabelPrefix}${compareTicker}`,
                  labelTime: Math.round((timeStart + timeEnd) / 2),
                  labelPrice: midPrice - offset,
                  labelStyle: "up",
                  labelBg: lowLabelBg,
                  labelTextColor: lowLabelTextColor,
                }
              : {}),
          });
        }
      }
      this.state.lastPl = pl;
      this.state.lastSymPl = symPl;
      this.state.lastPlBarIdx = pivotBarIndex(this.index, right);
    } else if (pl != null && (this.state.lastPl == null || pl < this.state.lastPl)) {
      this.state.lastPl = pl;
      this.state.lastSymPl = null;
      this.state.lastPlBarIdx = pivotBarIndex(this.index, right);
    }
  }
});

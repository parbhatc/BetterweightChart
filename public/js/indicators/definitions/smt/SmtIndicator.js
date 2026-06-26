import { chartDebug } from "../../../debug/chart/index.js";
import {
  pivotBarIndex,
  pivotHighAtSparse,
  pivotLens,
  pivotLowAtSparse,
} from "../../math/pivots.js";
import { symbolTicker } from "../../../app/symbol/ticker.js";
import { BarScriptIndicator } from "../../BarScriptIndicator.js";
import {
  createBool,
  createColor,
  createInt,
  createText,
  inlinePair,
} from "../../builders.js";
import { compareSymbol } from "../../security/compareSymbol.js";
import { compareSymbolInputs, compareBarsRecomputeKey, ensureCompareAligned } from "../../security/compareBars.js";
import { pendingInit, readyInit } from "../../security/initWait.js";
import { styleColor, styleColorWithOpacity } from "../../styleColor.js";

class SmtIndicator extends BarScriptIndicator {

  constructor() {
    super("smt", "SMT", "SMT Divergence");
    this.setOverlayPrimitive("lines");
    this.setGraphicObjects([
      { styleKey: "graphicLines", label: "Line", overlay: "lines" },
      { styleKey: "paneLabels", label: "Pane labels" },
    ]);
    this.setInputs([
      ...compareSymbolInputs("Symbols"),
      createInt("leftLen", "Pivot left", 1, { section: "Pivots", inline: true }),
      createInt("rightLen", "Pivot right", 1, { section: "Pivots", inline: true }),
      createBool("waitClose", "Wait for candle close", true, { section: "Detection" }),
      createBool("showHigh", "Pivot high SMT", true, { section: "Detection" }),
      createBool("showLow", "Pivot low SMT", true, { section: "Detection" }),
      inlinePair(
        "Pivot high",
        createColor("highColor", "Line", { color: "#ff1100", opacity: 100 }, { store: "style" }),
        createText("highLabelPrefix", "Label prefix", "SMT + ", { store: "style" }),
      ),
      createColor("highLabelBg", "Label background", { color: "#ff1100", opacity: 80 }, {
        section: "Pivot high",
        store: "style",
      }),
      inlinePair(
        "Pivot low",
        createColor("lowColor", "Line", { color: "#089981", opacity: 100 }, { store: "style" }),
        createText("lowLabelPrefix", "Label prefix", "SMT - ", { store: "style" }),
      ),
      createColor("lowLabelBg", "Label background", { color: "#089981", opacity: 80 }, {
        section: "Pivot low",
        store: "style",
      }),
      createInt("lineWidth", "Line width", 2, { section: "Pivot low", store: "style" }),
    ]);
  }

  mergeStyleDefaults(style) {
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

  legendParams(instance, ctx = {}) {
    const compare = compareSymbol.resolve(instance.inputs, ctx.primarySymbol ?? "");
    const [left, right] = pivotLens(instance.inputs, "leftLen", "rightLen", 1);
    return [symbolTicker(compare), String(left), String(right)];
  }

  /** @param {import("../../types.js").IndicatorInstance} instance */
  needsLiveOverlayRefresh(instance) {
    const waitClose = instance.inputs?.waitClose;
    return waitClose === false;
  }

  /** @param {object} instance @param {object} ctx */
  overlayRecomputeExtra(instance, ctx) {
    const compareKey = compareBarsRecomputeKey(ctx, instance.inputs, { ohlc: true });
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
    return `${compareKey}|${colors}`;
  }

  /** @param {import("../../types.js").IndicatorInstance} instance @param {{ symbol?: string, resolution?: string, bars?: object[] }} pane */
  collectDataNeeds(instance, pane) {
    const sym = compareSymbol.resolve(instance.inputs, pane.symbol ?? "");
    const chartCount = Math.max(pane.bars?.length ?? 300, 300);
    return { compare: [{ symbol: sym, chartCountBack: chartCount }] };
  }

  init() {
    if (this.style.graphicLines === false) {
      this.state.skip = true;
      this.state.loading = false;
      return;
    }

    const overlayCtx = this.overlayCtx ?? {};
    const [left, right] = pivotLens(this.inputs, "leftLen", "rightLen", 1);
    const cmp = ensureCompareAligned(
      overlayCtx,
      this.inputs,
      this.chartBars,
      this.bars.length,
      left + right + 1,
      this.bars,
    );
    if (!cmp.ready) {
      if (cmp.covered != null) {
        chartDebug("smt", "init skip: insufficient compare coverage", {
          compare: cmp.compare,
          covered: cmp.covered,
          need: this.bars.length,
          left,
          right,
        });
      }
      pendingInit(this.state);
      return;
    }
    if (cmp.covered != null && cmp.covered < this.bars.length) {
      overlayCtx.requestCompareBars?.(cmp.compare, this.bars.length);
    }

    chartDebug("smt", "init ok", {
      compare: cmp.compare,
      covered: cmp.covered,
      bars: this.bars.length,
      left,
      right,
    });

    const style = this.style;
    readyInit(this.state);
    this.state.compareUtc = cmp.aligned;
    this.state.left = left;
    this.state.right = right;
    this.state.waitClose = this.getBool("waitClose", true);
    this.state.showHigh = this.getBool("showHigh", true);
    this.state.showLow = this.getBool("showLow", true);
    this.state.highColor = styleColor(style, "highColor", "#ff1100");
    this.state.lowColor = styleColor(style, "lowColor", "#089981");
    this.state.highLabelPrefix = style.highLabelPrefix ?? "SMT + ";
    this.state.lowLabelPrefix = style.lowLabelPrefix ?? "SMT - ";
    this.state.compareTicker = symbolTicker(cmp.compare);
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
    }
  }
}

BarScriptIndicator.define(SmtIndicator);

export default SmtIndicator;

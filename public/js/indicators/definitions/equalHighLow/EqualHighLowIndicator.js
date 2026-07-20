import { BarScriptIndicator } from "../../BarScriptIndicator.js";
import { createBool, createColor, createFloat, createInt, createText, inlinePair } from "../../builders.js";
import {
  pivotBarIndex,
  pivotHighStrictAt,
  pivotLens,
  pivotLowStrictAt,
  pricesEqualWithinTicks,
} from "../../math/pivots.js";
import { tickSizeFromSymbol } from "../../symbol.js";
import { styleColor } from "../../styleColor.js";
import { getSecuritySeries } from "../../security/htfAccess.js";

const HTF_ROWS = [
  { on: "show15m", tf: "15", label: "label15m", defaultLabel: "EQH/EQL - 15m" },
  { on: "show1h", tf: "60", label: "label1h", defaultLabel: "EQH/EQL - 1h" },
  { on: "show4h", tf: "240", label: "label4h", defaultLabel: "EQH/EQL - 4h" },
];

function formatLabel(template, type) {
  return String(template || "EQH/EQL").replaceAll("{type}", type).replaceAll("EQH/EQL", type);
}

function equalityType(state, a, b, high) {
  if (pricesEqualWithinTicks(a, b, state.tickSize, state.toleranceTicks)) {
    if (high ? state.showHigh : state.showLow) return high ? "EQH" : "EQL";
    return null;
  }
  if (Math.abs(a - b) <= state.relativePoints) {
    if (high ? state.showRelativeHigh : state.showRelativeLow) return high ? "REQH" : "REQL";
  }
  return null;
}

function renderEqualSeries(script, bars, chartBars, labelTemplate) {
  const { left, right, tickSize, toleranceTicks } = script.state;
  let lastHigh = null;
  let lastLow = null;
  for (let i = left + right; i < bars.length; i++) {
    if (script.state.waitClose && bars[i]?.isForming) continue;
    const idx = pivotBarIndex(i, right);
    const time = chartBars[idx]?.time ?? bars[idx]?.time;
    if (time == null) continue;
    const high = pivotHighStrictAt(bars, i, left, right);
    if (high != null) {
      const type = lastHigh ? equalityType(script.state, high, lastHigh.price, true) : null;
      if (type) {
        script.drawLine({ timeStart: lastHigh.time, priceStart: lastHigh.price, timeEnd: time, priceEnd: high, color: script.state.highColor, width: script.state.width, dash: [5, 3], label: formatLabel(labelTemplate, type), labelPlain: true, labelTextColor: script.state.highColor, labelStyle: "up" });
      }
      lastHigh = { time, price: high };
    }
    const low = pivotLowStrictAt(bars, i, left, right);
    if (low != null) {
      const type = lastLow ? equalityType(script.state, low, lastLow.price, false) : null;
      if (type) {
        script.drawLine({ timeStart: lastLow.time, priceStart: lastLow.price, timeEnd: time, priceEnd: low, color: script.state.lowColor, width: script.state.width, dash: [5, 3], label: formatLabel(labelTemplate, type), labelPlain: true, labelTextColor: script.state.lowColor, labelStyle: "down" });
      }
      lastLow = { time, price: low };
    }
  }
}

class EqualHighLowIndicator extends BarScriptIndicator {
  constructor() {
    super("equal_high_low", "EQH/EQL", "Equal Highs & Lows");
    this.setOverlayPrimitive("lines");
    this.setGraphicObjects([{ styleKey: "graphicLines", label: "EQH/EQL lines", overlay: "lines" }]);
    this.setInputs([
      createInt("leftLen", "Pivot left", 1, { section: "Pivots", inline: true }),
      createInt("rightLen", "Pivot right", 1, { section: "Pivots", inline: true }),
      createInt("toleranceTicks", "Equal tolerance (ticks)", 1, { section: "Detection" }),
      createBool("waitClose", "Wait for candle close", true, { section: "Detection" }),
      createBool("showHigh", "Show EQH", true, { section: "Detection" }),
      createBool("showLow", "Show EQL", true, { section: "Detection" }),
      createBool("showRelativeHigh", "Show REQH", false, { section: "Relative equal levels" }),
      createBool("showRelativeLow", "Show REQL", false, { section: "Relative equal levels" }),
      createFloat("relativePoints", "Maximum difference (points)", 1, { section: "Relative equal levels" }),
      createBool("showCurrent", "Current chart EQH/EQL", true, { section: "Timeframes" }),
      createText("currentLabel", "Current chart label", "EQH/EQL", { section: "Timeframes" }),
      createBool("show15m", "15m EQH/EQL", false, { section: "Timeframes" }),
      createText("label15m", "15m label", "EQH/EQL - 15m", { section: "Timeframes" }),
      createBool("show1h", "1h EQH/EQL", false, { section: "Timeframes" }),
      createText("label1h", "1h label", "EQH/EQL - 1h", { section: "Timeframes" }),
      createBool("show4h", "4h EQH/EQL", false, { section: "Timeframes" }),
      createText("label4h", "4h label", "EQH/EQL - 4h", { section: "Timeframes" }),
      inlinePair(
        "Style",
        createColor("highColor", "EQH", { color: "#f23645", opacity: 100 }, { store: "style" }),
        createColor("lowColor", "EQL", { color: "#089981", opacity: 100 }, { store: "style" }),
      ),
      createInt("lineWidth", "Line width", 1, { section: "Style", store: "style" }),
    ]);
  }

  mergeStyleDefaults(style) {
    return {
      ...style,
      graphicLines: style.graphicLines ?? true,
      highColor: style.highColor ?? "#f23645",
      lowColor: style.lowColor ?? "#089981",
      lineWidth: style.lineWidth ?? 1,
    };
  }

  legendParams(instance) {
    const [left, right] = pivotLens(instance.inputs, "leftLen", "rightLen", 1);
    return [`${left}/${right}`, `${Math.max(0, Number(instance.inputs.toleranceTicks ?? 1) || 0)}t`];
  }

  needsLiveOverlayRefresh(instance) {
    return instance.inputs?.waitClose === false;
  }

  collectDataNeeds(instance, pane) {
    const countBack = Math.max(pane.bars?.length ?? 300, 300);
    return {
      htf: HTF_ROWS
        .filter((row) => instance.inputs?.[row.on] === true)
        .map((row) => ({ symbol: pane.symbol ?? "", resolution: row.tf, countBack })),
    };
  }

  init() {
    const [left, right] = pivotLens(this.inputs, "leftLen", "rightLen", 1);
    this.state.left = left;
    this.state.right = right;
    this.state.toleranceTicks = Math.max(0, Number(this.inputs.toleranceTicks ?? 1) || 0);
    this.state.tickSize = tickSizeFromSymbol(this.symbolInfo);
    this.state.waitClose = this.getBool("waitClose", true);
    this.state.showHigh = this.getBool("showHigh", true);
    this.state.showLow = this.getBool("showLow", true);
    this.state.showRelativeHigh = this.getBool("showRelativeHigh", false);
    this.state.showRelativeLow = this.getBool("showRelativeLow", false);
    this.state.relativePoints = Math.max(0, Number(this.inputs.relativePoints ?? 1) || 0);
    this.state.showCurrent = this.getBool("showCurrent", true);
    this.state.labelCurrent = this.getString("currentLabel", "EQH/EQL");
    this.state.highColor = styleColor(this.style, "highColor", "#f23645");
    this.state.lowColor = styleColor(this.style, "lowColor", "#089981");
    this.state.width = Math.max(1, Number(this.style.lineWidth) || 1);
    this.state.lastHigh = null;
    this.state.lastLow = null;

    for (const row of HTF_ROWS) {
      if (this.inputs[row.on] !== true) continue;
      const series = getSecuritySeries(this.overlayCtx ?? {}, undefined, row.tf);
      renderEqualSeries(
        this,
        series?.utcBars ?? [],
        series?.chartBars ?? [],
        this.getString(row.label, row.defaultLabel),
      );
    }
  }

  onBar() {
    if (this.state.waitClose && this.index === this.bars.length - 1) return;
    const { left, right, tickSize, toleranceTicks } = this.state;
    const pivotIdx = pivotBarIndex(this.index, right);
    const pivotTime = this.chartBars[pivotIdx]?.time;
    if (pivotTime == null) return;

    const emit = (previous, price, label, color, labelStyle) => this.drawLine({
      timeStart: previous.time,
      priceStart: previous.price,
      timeEnd: pivotTime,
      priceEnd: price,
      color,
      width: this.state.width,
      dash: [5, 3],
      label,
      labelPlain: true,
      labelTextColor: color,
      labelStyle,
    });

    if (!this.state.showCurrent) return;

    const high = pivotHighStrictAt(this.bars, this.index, left, right);
    if (high != null) {
      const type = this.state.lastHigh ? equalityType(this.state, high, this.state.lastHigh.price, true) : null;
      if (type) emit(this.state.lastHigh, high, formatLabel(this.state.labelCurrent, type), this.state.highColor, "up");
      this.state.lastHigh = { time: pivotTime, price: high };
    }

    const low = pivotLowStrictAt(this.bars, this.index, left, right);
    if (low != null) {
      const type = this.state.lastLow ? equalityType(this.state, low, this.state.lastLow.price, false) : null;
      if (type) emit(this.state.lastLow, low, formatLabel(this.state.labelCurrent, type), this.state.lowColor, "down");
      this.state.lastLow = { time: pivotTime, price: low };
    }
  }
}

BarScriptIndicator.define(EqualHighLowIndicator);

export default EqualHighLowIndicator;

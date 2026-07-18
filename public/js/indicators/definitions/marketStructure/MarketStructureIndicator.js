import { BarScriptIndicator } from "../../BarScriptIndicator.js";
import { createBool, createColor, createInt } from "../../builders.js";
import { pivotLens } from "../../math/pivots.js";
import { styleColor, styleColorWithOpacity } from "../../styleColor.js";

const COLORS = {
  bullBos: "#089981",
  bearBos: "#f23645",
  bullMss: "#089981",
  bearMss: "#f23645",
  bullCisd: "#089981",
  bearCisd: "#f23645",
};

/** Draws confirmed swing breaks and candle-delivery shifts on the price pane. */
class MarketStructureIndicator extends BarScriptIndicator {

  constructor() {
    super("market_structure", "Market Structure", "Market Structure");
    this.setOverlayPrimitive("lines");
    this.setGraphicObjects([{ styleKey: "graphicLines", label: "Structure lines", overlay: "lines" }]);
    this.setInputs([
      createInt("leftLen", "Pivot left", 3, { section: "Pivots", inline: true }),
      createInt("rightLen", "Pivot right", 3, { section: "Pivots", inline: true }),
      createBool("waitClose", "Wait for candle close", true, { section: "Detection" }),
      createBool("showBos", "Show BOS", true, { section: "Detection" }),
      createBool("showMss", "Show MSS", true, { section: "Detection" }),
      // CISD is intentionally opt-in: unlike a confirmed swing break, it can
      // occur repeatedly during ordinary candle rotation and quickly clutters
      // a market-structure chart.
      createBool("showCisd", "Show CISD (early signal)", false, { section: "Detection" }),
      createColor("bullBosColor", "Bullish BOS", COLORS.bullBos, { section: "Colors", store: "style" }),
      createColor("bearBosColor", "Bearish BOS", COLORS.bearBos, { section: "Colors", store: "style" }),
      createColor("bullMssColor", "Bullish MSS", COLORS.bullMss, { section: "Colors", store: "style" }),
      createColor("bearMssColor", "Bearish MSS", COLORS.bearMss, { section: "Colors", store: "style" }),
      createColor("bullCisdColor", "Bullish CISD", COLORS.bullCisd, { section: "Colors", store: "style" }),
      createColor("bearCisdColor", "Bearish CISD", COLORS.bearCisd, { section: "Colors", store: "style" }),
      createInt("lineWidth", "Line width", 1, { section: "Colors", store: "style" }),
    ]);
  }

  mergeStyleDefaults(style) {
    return {
      ...style,
      graphicLines: style.graphicLines ?? true,
      lineWidth: style.lineWidth ?? 1,
      ...Object.fromEntries(Object.entries(COLORS).map(([key, color]) => [`${key}Color`, style[`${key}Color`] ?? color])),
    };
  }

  legendParams(instance) {
    const [left, right] = pivotLens(instance.inputs, "leftLen", "rightLen", 3);
    return [`${left}/${right}`];
  }

  needsLiveOverlayRefresh(instance) {
    return instance.inputs?.waitClose === false;
  }

  init() {
    const [left, right] = pivotLens(this.inputs, "leftLen", "rightLen", 3);
    const style = this.style;
    this.state.left = left;
    this.state.right = right;
    this.state.waitClose = this.getBool("waitClose", true);
    this.state.showBos = this.getBool("showBos", true);
    this.state.showMss = this.getBool("showMss", true);
    this.state.showCisd = this.getBool("showCisd", true);
    this.state.width = Math.max(1, Number(style.lineWidth) || 1);
    for (const [key, fallback] of Object.entries(COLORS)) {
      this.state[`${key}Color`] = styleColor(style, `${key}Color`, fallback);
      this.state[`${key}LabelBg`] = styleColorWithOpacity(style, `${key}Color`, fallback, 85);
    }
    this.state.bias = null;
    this.state.lastHigh = null;
    this.state.lastLow = null;
    this.state.lastBear = null;
    this.state.lastBull = null;
    this.state.prevClose = null;
    // `onBar` is invoked with the Pine-style runtime context, rather than the
    // indicator instance. Keep this helper on runtime state so it remains
    // available while still using the context's drawLine implementation.
    this.state.emit = (direction, type, origin) => {
      const key = `${direction}${type[0]}${type.slice(1).toLowerCase()}`;
      this.drawLine({
        timeStart: origin.time,
        priceStart: origin.price,
        timeEnd: this.chartBars[this.index]?.time,
        priceEnd: origin.price,
        color: this.state[`${key}Color`],
        width: this.state.width,
        dash: type === "CISD" ? [4, 3] : [],
        // The line color communicates direction; compact centered labels keep
        // overlapping structure events readable on dense charts.
        label: type === "MSS" ? "CHoCH" : type,
        labelPlain: true,
        labelTextColor: this.state[`${key}Color`],
        labelStyle: direction === "bull" ? "up" : "down",
      });
      // Match standard market-structure notation: horizontal level from the
      // swing, followed by a vertical leg at the candle that breaks it.
      if (type !== "CISD") {
        const breakTime = this.chartBars[this.index]?.time;
        if (breakTime != null) {
          this.drawLine({
            timeStart: breakTime,
            priceStart: origin.price,
            timeEnd: breakTime,
            priceEnd: this.bar.close,
            color: this.state[`${key}Color`],
            width: this.state.width,
          });
        }
      }
    };
  }

  onBar(bar) {
    const lastIndex = this.bars.length - 1;
    if (this.state.waitClose && this.index === lastIndex) return;

    const { left, right } = this.state;
    const high = this.math.pivotHigh(left, right);
    const low = this.math.pivotLow(left, right);
    const pivotIndex = this.index - right;
    const pivotTime = this.chartBars[pivotIndex]?.time;
    if (high != null && pivotTime != null) this.state.lastHigh = { time: pivotTime, price: high, broken: false };
    if (low != null && pivotTime != null) this.state.lastLow = { time: pivotTime, price: low, broken: false };

    // CISD is a close through the open of the most recent opposing delivery candle.
    // Requiring a cross prevents a label on every subsequent candle above/below it.
    const prevClose = this.state.prevClose;
    if (this.state.showCisd && prevClose != null) {
      if (this.state.lastBear && prevClose <= this.state.lastBear.price && bar.close > this.state.lastBear.price) {
        this.state.emit("bull", "CISD", this.state.lastBear);
      }
      if (this.state.lastBull && prevClose >= this.state.lastBull.price && bar.close < this.state.lastBull.price) {
        this.state.emit("bear", "CISD", this.state.lastBull);
      }
    }

    const breakLevel = (direction, level) => {
      if (!level || level.broken) return;
      const isMss = this.state.bias != null && this.state.bias !== direction;
      const type = isMss ? "MSS" : "BOS";
      if ((type === "BOS" && this.state.showBos) || (type === "MSS" && this.state.showMss)) {
        this.state.emit(direction, type, level);
      }
      level.broken = true;
      this.state.bias = direction;
    };
    if (bar.close > (this.state.lastHigh?.price ?? Infinity)) breakLevel("bull", this.state.lastHigh);
    if (bar.close < (this.state.lastLow?.price ?? -Infinity)) breakLevel("bear", this.state.lastLow);

    const chartTime = this.chartBars[this.index]?.time;
    if (chartTime != null) {
      if (bar.close < bar.open) this.state.lastBear = { time: chartTime, price: bar.open };
      if (bar.close > bar.open) this.state.lastBull = { time: chartTime, price: bar.open };
    }
    this.state.prevClose = bar.close;
  }
}

BarScriptIndicator.define(MarketStructureIndicator);

export default MarketStructureIndicator;

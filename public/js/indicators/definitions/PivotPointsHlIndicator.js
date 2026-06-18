import { defineIndicator } from "../defineIndicator.js";
import { pivotBarIndex, pivotHighAt, pivotLowAt } from "../math/pivots.js";

/** @param {number} price @param {object | null | undefined} symbolInfo */
function formatPivotPrice(price, symbolInfo) {
  const scale = symbolInfo?.pricescale ?? 100;
  const minmov = symbolInfo?.minmov ?? 1;
  const decimals = Math.max(2, Math.round(Math.log10(scale / minmov)));
  return Number(price).toFixed(decimals);
}

/**
 * Batch overlay labels (same rules as onBar).
 * @param {object[]} utcBars
 * @param {object[]} chartBars
 * @param {object} inputs
 * @param {object} style
 * @param {object | null} [symbolInfo]
 */
function computePivotLabels(utcBars, chartBars, inputs, style, symbolInfo = null) {
  const leftH = Math.max(1, Number(inputs.leftLenH) || 10);
  const rightH = Math.max(1, Number(inputs.rightLenH) || 10);
  const leftL = Math.max(1, Number(inputs.leftLenL) || 10);
  const rightL = Math.max(1, Number(inputs.rightLenL) || 10);

  /** @type {object[]} */
  const labels = [];

  for (let i = 0; i < utcBars.length; i++) {
    const ph = pivotHighAt(utcBars, i, leftH, rightH);
    if (ph != null) {
      const pivotIdx = pivotBarIndex(i, rightH);
      const chartTime = chartBars[pivotIdx]?.time;
      if (chartTime == null) continue;
      labels.push({
        time: chartTime,
        price: ph,
        kind: "high",
        text: formatPivotPrice(ph, symbolInfo),
        textColor: style.textColorH ?? "#131722",
        bgColor: style.labelColorH ?? "#ffffff",
      });
    }

    const pl = pivotLowAt(utcBars, i, leftL, rightL);
    if (pl != null) {
      const pivotIdx = pivotBarIndex(i, rightL);
      const chartTime = chartBars[pivotIdx]?.time;
      if (chartTime == null) continue;
      labels.push({
        time: chartTime,
        price: pl,
        kind: "low",
        text: formatPivotPrice(pl, symbolInfo),
        textColor: style.textColorL ?? "#131722",
        bgColor: style.labelColorL ?? "#ffffff",
      });
    }
  }

  return labels;
}

/**
 * Pine: Pivot Points High Low — one `onBar()` per candle, like the script.
 * @see docs/indicators.md
 */
export const PivotPointsHlIndicator = defineIndicator(class PivotPointsHlIndicator {
  constructor() {}

  static id = "Pivot Points High Low@tv-basicstudies";
  static type = "pivot_points_hl";
  static title = "Pivot Points High Low";
  static shortTitle = "Pivots HL";
  static overlayPrimitive = "labels";

  static graphicObjects = [{ styleKey: "paneLabels", label: "Pane labels", overlay: "labels" }];

  static inputs = [
    { id: "leftLenH", type: "int", title: "Pivot High", defval: 10, section: "LENGTH LEFT / RIGHT", inline: true },
    { id: "rightLenH", type: "int", title: "/", defval: 10, section: "LENGTH LEFT / RIGHT", inline: true },
    { id: "leftLenL", type: "int", title: "Pivot Low", defval: 10, section: "LENGTH LEFT / RIGHT", inline: true },
    { id: "rightLenL", type: "int", title: "/", defval: 10, section: "LENGTH LEFT / RIGHT", inline: true },
  ];

  static mergeStyleDefaults(style) {
    return {
      ...style,
      textColorH: style.textColorH ?? "#131722",
      labelColorH: style.labelColorH ?? "#ffffff",
      textColorL: style.textColorL ?? "#131722",
      labelColorL: style.labelColorL ?? "#ffffff",
    };
  }

  static legendParams(instance) {
    return [
      `${instance.inputs.leftLenH ?? 10}/${instance.inputs.rightLenH ?? 10}`,
      `${instance.inputs.leftLenL ?? 10}/${instance.inputs.rightLenL ?? 10}`,
    ];
  }

  /**
   * @param {object[]} utcBars
   * @param {object[]} chartBars
   * @param {object} inputs
   * @param {object} style
   * @param {object | null} [symbolInfo]
   */
  static computePivotLabels(utcBars, chartBars, inputs, style, symbolInfo = null) {
    return computePivotLabels(utcBars, chartBars, inputs, style, symbolInfo);
  }

  onBar() {
    const leftH = Math.max(1, Number(this.inputs.leftLenH) || 10);
    const rightH = Math.max(1, Number(this.inputs.rightLenH) || 10);
    const leftL = Math.max(1, Number(this.inputs.leftLenL) || 10);
    const rightL = Math.max(1, Number(this.inputs.rightLenL) || 10);

    const ph = this.math.pivotHigh(leftH, rightH);
    if (ph != null) {
      this.drawLabel({
        barIndex: this.index - rightH,
        price: ph,
        kind: "high",
        text: this.format.price(ph),
        textColor: this.style.textColorH ?? "#131722",
        bgColor: this.style.labelColorH ?? "#ffffff",
      });
    }

    const pl = this.math.pivotLow(leftL, rightL);
    if (pl != null) {
      this.drawLabel({
        barIndex: this.index - rightL,
        price: pl,
        kind: "low",
        text: this.format.price(pl),
        textColor: this.style.textColorL ?? "#131722",
        bgColor: this.style.labelColorL ?? "#ffffff",
      });
    }
  }
});

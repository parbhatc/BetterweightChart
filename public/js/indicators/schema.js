/** @typedef {import("./types.js").InputDef} InputDef */
/** @typedef {import("./types.js").PlotDef} PlotDef */
/** @typedef {import("./types.js").FillDef} FillDef */

/** @param {string} plotId */
export function plotStyleKeys(plotId) {
  return {
    visibleKey: `${plotId}Visible`,
    colorKey: `${plotId}Color`,
    widthKey: `${plotId}Width`,
    styleKey: `${plotId}Style`,
    priceLineKey: `${plotId}PriceLine`,
    plotTypeKey: `${plotId}PlotType`,
  };
}

/** @param {string} fillId */
export function fillStyleKeys(fillId) {
  return {
    visibleKey: `${fillId}Visible`,
    colorKey: `${fillId}Color`,
    opacityKey: `${fillId}Opacity`,
  };
}

/**
 * @param {Array<number | null>} upper
 * @param {Array<number | null>} lower
 * @param {{ time: number }[]} chartBars
 * @returns {{ time: number, upper: number, lower: number }[][]}
 */
export function buildBandFillSegments(upper, lower, chartBars) {
  /** @type {{ time: number, upper: number, lower: number }[][]} */
  const segments = [];
  /** @type {{ time: number, upper: number, lower: number }[]} */
  let points = [];
  for (let i = 0; i < chartBars.length; i++) {
    const u = upper[i];
    const l = lower[i];
    if (u == null || l == null || !Number.isFinite(u) || !Number.isFinite(l)) {
      if (points.length >= 2) segments.push(points);
      points = [];
      continue;
    }
    points.push({ time: chartBars[i].time, upper: u, lower: l });
  }
  if (points.length >= 2) segments.push(points);
  return segments;
}

/**
 * @param {PlotDef[]} plots
 * @param {FillDef[]} fills
 * @returns {object}
 */
export function defaultStyleFromSchema(plots, fills) {
  /** @type {Record<string, unknown>} */
  const style = {};
  for (const plot of plots) {
    const keys = plotStyleKeys(plot.id);
    style[keys.visibleKey] = plot.visible ?? true;
    style[keys.colorKey] = plot.color ?? "#2962ff";
    style[keys.widthKey] = plot.width ?? 1;
    style[keys.styleKey] = plot.lineStyle ?? 0;
    style[keys.priceLineKey] = plot.priceLine === true;
    style[keys.plotTypeKey] = "line";
  }
  for (const fill of fills) {
    const keys = fillStyleKeys(fill.id);
    style[keys.visibleKey] = fill.visible ?? true;
    style[keys.colorKey] = fill.color ?? "#4caf50";
    style[keys.opacityKey] = fill.opacity ?? 10;
  }
  return style;
}

/**
 * @param {InputDef[]} inputs
 * @returns {object}
 */
export function defaultInputsFromSchema(inputs) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const input of inputs) {
    out[input.id] = input.defval;
  }
  return out;
}

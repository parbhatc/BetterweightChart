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

/** @param {InputDef[]} inputs @returns {import("./types.js").InputFieldDef[]} */
export function flattenInputFields(inputs) {
  /** @type {import("./types.js").InputFieldDef[]} */
  const fields = [];
  for (const input of inputs) {
    if (input.type === "row") fields.push(...input.fields);
    else if (input.type === "inlinePair") fields.push(input.left, input.right);
    else if (input.type === "symbolSizeRules") continue;
    else if (input.type === "fvgTimeframes") continue;
    else if (input.type === "fvgExtendBoxes") continue;
    else if (input.type === "levelsLayers") continue;
    else if (input.type === "timeLevels") continue;
    else if (input.type === "sessionLevels") continue;
    else if (input.type === "newsLevels") continue;
    else fields.push(input);
  }
  return fields;
}

/**
 * @param {InputDef[]} inputs
 * @returns {object}
 */
export function defaultInputsFromSchema(inputs) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const input of inputs) {
    if (input.type === "row") {
      for (const field of input.fields) assignField(out, field);
    } else if (input.type === "inlinePair") {
      assignField(out, input.left);
      assignField(out, input.right);
    } else if (input.type === "symbolSizeRules") {
      out[input.id] = input.defval ?? [];
    } else if (input.type === "fvgTimeframes") {
      out[input.id] = input.defval ?? [];
    } else if (input.type === "fvgExtendBoxes") {
      out[input.id] = input.defval ?? {};
    } else if (input.type === "levelsLayers") {
      out[input.id] = input.defval ?? [];
    } else if (input.type === "timeLevels") {
      out[input.id] = input.defval ?? [];
    } else if (input.type === "sessionLevels") {
      out[input.id] = input.defval ?? [];
    } else if (input.type === "newsLevels") {
      out[input.id] = input.defval ?? [];
    } else {
      assignField(out, input);
    }
  }
  return out;
}

/**
 * @param {Record<string, unknown>} out
 * @param {import("./types.js").InputFieldDef} input
 */
function assignField(out, input) {
  out[input.id] = input.defval;
  if (input.type === "color") {
    const opacityKey = input.opacityKey ?? `${input.id}Opacity`;
    if (input.defval != null && typeof input.defval === "object") {
      out[input.id] = input.defval.color ?? "#2962ff";
      out[opacityKey] = input.defval.opacity ?? 10;
    } else if (out[opacityKey] === undefined) {
      out[opacityKey] = 10;
    }
  }
}

/**
 * @param {import("./types.js").InputFieldDef} field
 */
function shouldShowInputInStatusLine(field) {
  if (field.showInStatusLine === false) return false;
  if (field.type === "bool" || field.type === "color") {
    return field.showInStatusLine === true;
  }
  return true;
}

/**
 * @param {import("./types.js").InputFieldDef} field
 * @param {*} value
 */
export function formatInputStatusLineValue(field, value) {
  if (value == null || value === "" || value === "undefined") return null;

  switch (field.type) {
    case "bool":
      return value ? String(field.title || "true") : null;
    case "select": {
      const opt = field.options?.find((o) => o.id === value);
      return opt?.label ?? null;
    }
    case "timeframe":
      return value === "chart" ? null : String(value);
    case "source":
      return String(value);
    case "int":
    case "float": {
      const n = Number(value);
      if (!Number.isFinite(n)) return null;
      return Number.isInteger(n) ? n.toLocaleString() : String(n);
    }
    case "text":
    case "symbol":
      return String(value);
    case "color":
      return null;
    default:
      return String(value);
  }
}

/**
 * Build status-line chips from input schema (TradingView-style inputs in status line).
 * @param {InputDef[]} inputs
 * @param {import("./types.js").IndicatorInstance} instance
 * @returns {string[]}
 */
export function inputStatusLineParams(inputs, instance) {
  /** @type {string[]} */
  const params = [];
  for (const field of flattenInputFields(inputs)) {
    if (!shouldShowInputInStatusLine(field)) continue;
    const store = field.store === "style" ? instance.style : instance.inputs;
    const formatted = formatInputStatusLineValue(field, store[field.id]);
    if (formatted != null && formatted !== "" && formatted !== "undefined") params.push(formatted);
  }
  return params;
}

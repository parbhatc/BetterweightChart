import { defaultIndicatorVisibility } from "./visibility.js";
import { applyColorOpacity } from "../ui/color/picker.js";
import {
  plotStyleKeys,
  fillStyleKeys,
  buildBandFillSegments,
  defaultStyleFromSchema,
  defaultInputsFromSchema,
} from "./schema.js";

/** @typedef {import("./types.js").IndicatorInstance} IndicatorInstance */
/** @typedef {import("./types.js").PlotStyle} PlotStyle */
/** @typedef {import("./types.js").LegendMeta} LegendMeta */
/** @typedef {import("./types.js").ValueLabel} ValueLabel */
/** @typedef {import("./types.js").LineStyleKeys} LineStyleKeys */
/** @typedef {import("./types.js").InputDef} InputDef */
/** @typedef {import("./types.js").PlotDef} PlotDef */
/** @typedef {import("./types.js").FillDef} FillDef */

/**
 * Base class for chart indicators. Subclass with static metadata, plots, fills, and inputs.
 *
 * @example
 * export class SmaIndicator extends BaseIndicator {
 *   static id = "Moving Average@tv-basicstudies";
 *   static type = "sma";
 *   static title = "Moving Average";
 *   static shortTitle = "SMA";
 *   static primaryPlotKey = "sma";
 *
 *   static plots = [
 *     { id: "sma", title: "SMA", color: "#2196f3", priceLine: true },
 *   ];
 *
 *   static inputs = [
 *     { id: "length", type: "int", title: "Length", defval: 20 },
 *     { id: "source", type: "source", title: "Source", defval: "close" },
 *   ];
 *
 *   static compute(bars, instance) {
 *     return { sma: computeSma(bars, instance.inputs) };
 *   }
 *
 *   static legendParams(instance) {
 *     return [String(instance.inputs.length)];
 *   }
 * }
 */
export class BaseIndicator {
  /** @type {string} TradingView-style script id */
  static id = "";

  /** @type {string} Internal type slug */
  static type = "";

  /** @type {string} Library display name */
  static title = "";

  /** @type {string} Legend / settings short name */
  static shortTitle = "";

  /** @type {boolean} When false, hidden from the indicators library */
  static enabled = true;

  /** @type {string} Plot key used for legend color dot */
  static primaryPlotKey = "main";

  /** @type {PlotDef[]} Line plots drawn on chart */
  static plots = [];

  /** @type {FillDef[]} Band fills between two plots */
  static fills = [];

  /** @type {InputDef[]} Settings inputs tab schema */
  static inputs = [];

  /** @type {number | null} Separate chart pane index for overlay indicators (e.g. volume) */
  static studyPaneIndex = null;

  /** @type {number | null} Sort order among study panes (0 = first below main chart) */
  static studyPaneOrder = null;

  /** @type {string | null} Dedicated overlay price scale for volume-style histograms */
  static volumeScaleId = null;

  /** @type {number} Height in px when {@link studyPaneIndex} is used */
  static studyPaneHeight = 120;

  /** @returns {InputDef[]} */
  static inputSchema() {
    return this.inputs;
  }

  /** @param {string} plotKey @returns {PlotDef | null} */
  static getPlotDef(plotKey) {
    return this.plots.find((p) => p.id === plotKey) ?? null;
  }

  /** @param {object} inputValues @param {object} [style] */
  static activePlots(inputValues, style = {}) {
    return this.plots.filter((p) => !p.when || p.when(inputValues, style));
  }

  /** @param {object} inputValues */
  static activeFills(inputValues) {
    return this.fills.filter((f) => !f.when || f.when(inputValues));
  }

  /** @returns {object} */
  static defaultInputs() {
    if (this.inputs.length) return defaultInputsFromSchema(this.inputs);
    return {};
  }

  /** @returns {object} */
  static defaultStyle() {
    return {
      precision: "default",
      labelsOnScale: true,
      valuesInStatusLine: true,
      inputsInStatusLine: true,
      ...defaultStyleFromSchema(this.plots, this.fills),
    };
  }

  /** @returns {Record<string, boolean>} */
  static defaultVisibility() {
    return defaultIndicatorVisibility();
  }

  /**
   * @param {number} paneIndex
   * @returns {IndicatorInstance | null}
   */
  static createInstance(paneIndex) {
    if (!this.enabled || !this.id || !this.type) return null;
    return {
      instanceId: `${this.type}_${Math.random().toString(36).slice(2, 9)}`,
      defId: this.id,
      type: this.type,
      paneIndex,
      inputs: { ...this.defaultInputs() },
      style: { ...this.defaultStyle() },
      visibility: this.defaultVisibility(),
      hidden: false,
    };
  }

  /**
   * @param {object[]} _bars
   * @param {IndicatorInstance} _instance
   * @returns {Record<string, Array<number | null>>}
   */
  static compute(_bars, _instance) {
    throw new Error(`${this.name}.compute() is not implemented`);
  }

  /**
   * Status line params shown after the study title. Override in subclasses.
   * @param {IndicatorInstance} _instance
   * @returns {string[]}
   */
  static legendParams(_instance) {
    return [];
  }

  /**
   * @param {IndicatorInstance} instance
   * @returns {LegendMeta}
   */
  static legendMeta(instance) {
    const params =
      instance.style.inputsInStatusLine === false ? [] : this.legendParams(instance);
    return {
      shortTitle: this.shortTitle,
      title: this.title,
      params,
    };
  }

  /**
   * @param {IndicatorInstance} instance
   * @param {string} plotKey
   * @returns {PlotStyle}
   */
  static plotStyle(instance, plotKey) {
    const plot = this.getPlotDef(plotKey);
    if (!plot) return this.hiddenPlot();
    if (plot.type === "histogram") {
      const keys = plotStyleKeys(plot.id);
      return {
        visible: instance.style[keys.visibleKey] !== false,
        color: String(instance.style[keys.colorKey] ?? plot.color ?? "#26a69a"),
        width: 1,
        lineStyle: 0,
        priceLine: keys.priceLineKey ? instance.style[keys.priceLineKey] === true : false,
        title: "",
      };
    }
    return this.linePlotStyle(instance, plotKey, {
      ...plotStyleKeys(plot.id),
      label: plot.title,
    });
  }

  /**
   * @param {IndicatorInstance} instance
   * @returns {ValueLabel[]}
   */
  static valueLabels(instance) {
    return this.activePlots(instance.inputs, instance.style).map((p) => ({
      key: p.id,
      title: p.title,
    }));
  }

  /** @param {object} inputValues @param {object} [style] */
  static stylePlotRows(inputValues, style = {}) {
    /** @type {object[]} */
    const rows = [];
    for (const plot of this.activePlots(inputValues, style)) {
      const keys = plotStyleKeys(plot.id);
      rows.push({
        type: "line",
        plotKey: plot.id,
        label: plot.title,
        ...keys,
      });
    }
    for (const fill of this.activeFills(inputValues)) {
      const keys = fillStyleKeys(fill.id);
      rows.push({
        type: "fill",
        label: fill.title,
        ...keys,
      });
    }
    return rows;
  }

  /** @param {object} style @param {object} [inputValues] */
  static mergeStyleDefaults(style, inputValues = {}) {
    const defs = this.defaultStyle();
    for (const [key, val] of Object.entries(defs)) {
      if (style[key] === undefined) style[key] = val;
    }
    return style;
  }

  /**
   * @param {IndicatorInstance} instance
   * @param {{ time: number }[]} chartBars
   * @returns {{ color: string, segments: { time: number, upper: number, lower: number }[][] }[]}
   */
  static getBandFills(instance, chartBars) {
    if (instance.hidden || !instance.lastPlots) return [];
    /** @type {{ color: string, segments: { time: number, upper: number, lower: number }[][] }[]} */
    const out = [];
    for (const fill of this.activeFills(instance.inputs)) {
      const keys = fillStyleKeys(fill.id);
      if (instance.style[keys.visibleKey] === false) continue;
      const upper = instance.lastPlots[fill.upper];
      const lower = instance.lastPlots[fill.lower];
      if (!upper?.length || !lower?.length || upper.length !== chartBars.length) continue;
      const segments = buildBandFillSegments(upper, lower, chartBars);
      if (!segments.length) continue;
      out.push({
        color: applyColorOpacity(
          String(instance.style[keys.colorKey] ?? fill.color ?? "#4caf50"),
          Number(instance.style[keys.opacityKey]) || fill.opacity || 10,
        ),
        segments,
      });
    }
    return out;
  }

  /** @param {object} inputValues @param {object} style @param {string} changedKey */
  static handleInputChange(inputValues, style, changedKey) {
    void inputValues;
    void style;
    void changedKey;
    const input = this.inputs.find((i) => i.id === changedKey);
    if (input?.affectsStyle) {
      this.mergeStyleDefaults(style, inputValues);
    }
  }

  /** @returns {PlotStyle} */
  static hiddenPlot() {
    return { visible: false, color: "#787b86", width: 1, lineStyle: 0, title: "" };
  }

  /**
   * @param {IndicatorInstance} instance
   * @param {string} plotKey
   * @param {LineStyleKeys} keys
   * @returns {PlotStyle}
   */
  static linePlotStyle(instance, plotKey, keys) {
    void plotKey;
    return {
      visible: instance.style[keys.visibleKey] !== false,
      color: String(instance.style[keys.colorKey] ?? "#2962ff"),
      width: Number(instance.style[keys.widthKey ?? ""] ?? 1) || 1,
      lineStyle: Number(instance.style[keys.styleKey ?? ""] ?? 0) || 0,
      priceLine: keys.priceLineKey ? instance.style[keys.priceLineKey] === true : false,
      title: "",
    };
  }
}

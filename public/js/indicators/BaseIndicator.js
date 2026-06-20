import { defaultIndicatorVisibility } from "./visibility.js";
import { applyColorOpacity } from "../ui/color/picker.js";
import {
  plotStyleKeys,
  fillStyleKeys,
  buildBandFillSegments,
  defaultStyleFromSchema,
  defaultInputsFromSchema,
  inputStatusLineParams,
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
 * Base class for chart indicators. Subclass with a constructor that calls `super()`
 * and chainable `this.set*` methods for metadata, plots, fills, and inputs. Finish with
 * `BaseIndicator.define(MyIndicator)` at module bottom.
 *
 * @example
 * export class SmaIndicator extends BaseIndicator {
 *   constructor() {
 *     super("sma", "SMA", "Moving Average");
 *     this.setPrimaryPlot("sma")
 *       .setPlots([{ id: "sma", title: "SMA", color: "#2196f3", priceLine: true }])
 *       .setInputs([
 *         { id: "length", type: "int", title: "Length", defval: 20 },
 *         { id: "source", type: "source", title: "Source", defval: "close" },
 *       ]);
 *   }
 *
 *   legendParams(instance) {
 *     return [String(instance.inputs.length)];
 *   }
 *
 *   static compute(bars, instance) {
 *     return { sma: computeSma(bars, instance.inputs) };
 *   }
 * }
 * BaseIndicator.define(SmaIndicator);
 */

export class BaseIndicator {
  /**
   * Run the subclass constructor once to register metadata on the class.
   * Call at module bottom: `BaseIndicator.define(MyIndicator)`.
   *
   * @template {typeof BaseIndicator} T
   * @param {T} Cls
   * @returns {T}
   */
  static define(Cls) {
    if (!Cls._indicatorDefined) {
      Cls._definitionInstance = new Cls();
      Cls._indicatorDefined = true;
    }
    return Cls;
  }

  /** @param {string} name @returns {boolean} */
  static _hasInstanceHook(name) {
    const def = this._definitionInstance;
    if (!def) return false;
    const method = Object.getPrototypeOf(def)[name];
    return typeof method === "function" && method !== BaseIndicator.prototype[name];
  }

  /**
   * @param {string} [id] Registry key and instance id slug (e.g. `"ema"`)
   * @param {string} [shortTitle] Legend / status-line abbreviation
   * @param {string} [title] Full library display name (defaults to shortTitle)
   */
  constructor(id, shortTitle, title) {
    const Cls = /** @type {typeof BaseIndicator} */ (new.target);
    if (Cls === BaseIndicator) return;
    if (id != null) this.setId(id);
    if (shortTitle != null) this.setShortTitle(shortTitle);
    if (title != null) this.setTitle(title);
    else if (shortTitle != null) this.setTitle(shortTitle);
  }

  /** @param {string} id */
  setId(id) {
    this.constructor.id = id;
    return this;
  }

  /** @param {string} title */
  setTitle(title) {
    this.constructor.title = title;
    return this;
  }

  /** @param {string} shortTitle */
  setShortTitle(shortTitle) {
    this.constructor.shortTitle = shortTitle;
    return this;
  }

  /** @param {string} title @param {string} shortTitle */
  setDescription(title, shortTitle) {
    return this.setTitle(title).setShortTitle(shortTitle);
  }

  /** @param {string} plotKey */
  setPrimaryPlot(plotKey) {
    this.constructor.primaryPlot = plotKey;
    this.constructor.primaryPlotKey = plotKey;
    return this;
  }

  /** @param {PlotDef[]} plots */
  setPlots(plots) {
    this.constructor.plots = plots;
    return this;
  }

  /** @param {FillDef[]} fills */
  setFills(fills) {
    this.constructor.fills = fills;
    return this;
  }

  /** @param {InputDef[]} inputs */
  setInputs(inputs) {
    this.constructor.inputs = inputs;
    return this;
  }

  /** @param {boolean} enabled */
  setEnabled(enabled) {
    this.constructor.enabled = enabled;
    return this;
  }

  /** @param {number | null} order */
  setStudyPaneOrder(order) {
    this.constructor.studyPaneOrder = order;
    return this;
  }

  /** @param {number} height */
  setStudyPaneHeight(height) {
    this.constructor.studyPaneHeight = height;
    return this;
  }

  /** @param {{ min: number, max: number }} scale */
  setStudyPaneScale(scale) {
    this.constructor.studyPaneScale = scale;
    return this;
  }

  /** @param {string | null} scaleId */
  setVolumeScaleId(scaleId) {
    this.constructor.volumeScaleId = scaleId;
    return this;
  }

  /** @param {string | null} kind */
  setOverlayPrimitive(kind) {
    this.constructor.overlayPrimitive = kind;
    return this;
  }

  /** @param {import("./types.js").GraphicObjectDef[]} objects */
  setGraphicObjects(objects) {
    this.constructor.graphicObjects = objects;
    return this;
  }

  /**
   * Override for status-line params. Called via static {@link BaseIndicator.legendParams}.
   * @param {IndicatorInstance} instance
   * @param {{ primarySymbol?: string }} [ctx]
   * @returns {string[] | undefined}
   */
  legendParams(instance, ctx = {}) {
    void instance;
    void ctx;
  }

  /**
   * Extra style defaults after base merge. Called via static {@link BaseIndicator.mergeStyleDefaults}.
   * @param {object} style
   * @param {object} [inputValues]
   */
  mergeStyleDefaults(style, inputValues = {}) {
    void style;
    void inputValues;
  }

  /**
   * React to a settings input change. Called via static {@link BaseIndicator.handleInputChange}.
   * @param {object} inputValues
   * @param {object} style
   * @param {string} changedKey
   */
  handleInputChange(inputValues, style, changedKey) {
    void inputValues;
    void style;
    void changedKey;
  }

  /** @returns {object | undefined} */
  defaultStyle() {}

  /**
   * @param {object[]} _bars
   * @param {object} _inputs
   * @param {object} _style
   * @param {IndicatorInstance} [_instance]
   * @returns {Record<string, Array<number | null>> | undefined}
   */
  computeSeries(_bars, _inputs, _style, _instance) {}

  /** @param {string} _plotKey @param {number | null} _raw @returns {string | null | undefined} */
  formatPlotValue(_plotKey, _raw) {}

  /** @param {IndicatorInstance} _instance @returns {ValueLabel[] | undefined} */
  valueLabels(_instance) {}

  /**
   * @param {IndicatorInstance} _instance
   * @param {string} _plotKey
   * @returns {PlotStyle | undefined}
   */
  plotStyle(_instance, _plotKey) {}

  /** @param {object} _inputValues @param {object} [_style] @returns {object[] | undefined} */
  stylePlotRows(_inputValues, _style) {}

  /**
   * @param {IndicatorInstance} _instance
   * @param {{ time: number }[]} _chartBars
   * @returns {object[] | undefined}
   */
  getBandFills(_instance, _chartBars) {}

  /** @param {object} [_inputs] @param {string} [_chartResolution] @returns {InputDef[] | undefined} */
  inputSchema(_inputs, _chartResolution) {}

  /** @param {object} _inputs @param {string} [_chartResolution] @returns {number | undefined} */
  requiredChartBars(_inputs, _chartResolution) {}

  /**
   * Declare HTF / compare-symbol bars the boot loader should prefetch for this instance.
   * @param {IndicatorInstance} _instance
   * @param {{ symbol?: string, resolution?: string, bars?: object[] }} _pane
   * @returns {import("./security/indicatorDataNeeds.js").IndicatorDataNeeds}
   */
  collectDataNeeds(_instance, _pane) {
    return {};
  }

  /** @param {IndicatorInstance} instance @param {{ symbol?: string, resolution?: string, bars?: object[] }} pane */
  static collectDataNeeds(instance, pane) {
    if (this._hasInstanceHook("collectDataNeeds")) {
      return this._definitionInstance.collectDataNeeds(instance, pane) ?? {};
    }
    return {};
  }

  /** @param {IndicatorInstance} _instance @param {object} [_ctx] @returns {boolean | undefined} */
  overlayPending(_instance, _ctx) {}

  /** @param {IndicatorInstance} _instance @param {object} [_ctx] @returns {string | undefined} */
  overlayRecomputeExtra(_instance, _ctx) {}

  /**
   * @param {object[]} _utcBars
   * @param {object[]} _chartBars
   * @param {object} _inputs
   * @param {object} _style
   * @param {object} [_ctx]
   * @returns {object[] | undefined}
   */
  overlay(_utcBars, _chartBars, _inputs, _style, _ctx) {}

  /** @type {string} Registry key — used for lookup, defId, and instance ids */
  static id = "";

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

  /** @type {{ min: number, max: number } | null} Fixed Y range for study panes (e.g. RSI 0–100) */
  static studyPaneScale = null;

  /** @type {string | null} Canvas overlay primitive (`labels`, etc.) — no LWC series plots */
  static overlayPrimitive = null;

  /** @type {import("./types.js").GraphicObjectDef[]} Style-tab Graphic objects toggles */
  static graphicObjects = [];

  /**
   * Style keys that gate a given overlay primitive.
   * @param {string} overlayKind
   * @returns {string[]}
   */
  static graphicStyleKeysForOverlay(overlayKind) {
    const objs = this.graphicObjects;
    if (!objs.length) return [];
    return objs
      .filter((g) => !g.overlay || g.overlay === overlayKind)
      .map((g) => g.styleKey);
  }

  /**
   * @param {IndicatorInstance} instance
   * @param {string} overlayKind
   */
  static overlayGraphicsVisible(instance, overlayKind) {
    const keys = this.graphicStyleKeysForOverlay(overlayKind);
    if (!keys.length) return true;
    return keys.every((k) => instance.style[k] !== false);
  }

  /** @param {object} style */
  static mergeGraphicObjectDefaults(style) {
    for (const obj of this.graphicObjects) {
      if (style[obj.styleKey] === undefined) {
        style[obj.styleKey] = obj.default !== false;
      }
    }
    return style;
  }

  /** @returns {InputDef[]} */
  static inputSchema(inputs, chartResolution) {
    if (this._hasInstanceHook("inputSchema")) {
      return this._definitionInstance.inputSchema(inputs, chartResolution);
    }
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
    if (this._hasInstanceHook("defaultStyle")) {
      return this._definitionInstance.defaultStyle();
    }
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
    if (!this.enabled || !this.id) return null;
    return {
      instanceId: `${this.id}_${Math.random().toString(36).slice(2, 9)}`,
      defId: this.id,
      type: this.id,
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
   * Status line params shown after the study title. Delegates to instance hook when defined.
   * @param {IndicatorInstance} instance
   * @param {{ primarySymbol?: string }} [ctx]
   * @returns {string[]}
   */
  static legendParams(instance, ctx = {}) {
    if (this._hasInstanceHook("legendParams")) {
      return this._definitionInstance.legendParams(instance, ctx);
    }
    return inputStatusLineParams(this.inputs, instance);
  }

  /**
   * @param {IndicatorInstance} instance
   * @param {{ primarySymbol?: string }} [ctx]
   * @returns {LegendMeta}
   */
  static legendMeta(instance, ctx = {}) {
    const params =
      instance.style.inputsInStatusLine === false ? [] : this.legendParams(instance, ctx);
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
    if (this._hasInstanceHook("plotStyle")) {
      return this._definitionInstance.plotStyle(instance, plotKey);
    }
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
    if (this._hasInstanceHook("valueLabels")) {
      return this._definitionInstance.valueLabels(instance);
    }
    return this.activePlots(instance.inputs, instance.style).map((p) => ({
      key: p.id,
      title: p.title,
    }));
  }

  /** @param {object} inputValues @param {object} [style] */
  static stylePlotRows(inputValues, style = {}) {
    if (this._hasInstanceHook("stylePlotRows")) {
      return this._definitionInstance.stylePlotRows(inputValues, style);
    }
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
    this.mergeGraphicObjectDefaults(style);
    const defs = this.defaultStyle();
    for (const [key, val] of Object.entries(defs)) {
      if (style[key] === undefined) style[key] = val;
    }
    if (this._hasInstanceHook("mergeStyleDefaults")) {
      this._definitionInstance.mergeStyleDefaults(style, inputValues);
    }
    return style;
  }

  /**
   * @param {IndicatorInstance} instance
   * @param {{ time: number }[]} chartBars
   * @returns {{ color: string, segments: { time: number, upper: number, lower: number }[][] }[]}
   */
  static getBandFills(instance, chartBars) {
    if (this._hasInstanceHook("getBandFills")) {
      return this._definitionInstance.getBandFills(instance, chartBars);
    }
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

  /** @param {string} plotKey @param {number | null} raw @returns {string | null} */
  static formatPlotValue(plotKey, raw) {
    if (this._hasInstanceHook("formatPlotValue")) {
      return this._definitionInstance.formatPlotValue(plotKey, raw);
    }
    return null;
  }

  /** @param {object} inputValues @param {object} style @param {string} changedKey */
  static handleInputChange(inputValues, style, changedKey) {
    if (this._hasInstanceHook("handleInputChange")) {
      this._definitionInstance.handleInputChange(inputValues, style, changedKey);
    }
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

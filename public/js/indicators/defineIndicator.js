import { BaseIndicator } from "./BaseIndicator.js";
import { runBarScript } from "./pineRuntime.js";
import { inputStatusLineParams } from "./schema.js";

/** @typedef {import("./types.js").IndicatorInstance} IndicatorInstance */
/** @typedef {import("./types.js").PlotDef} PlotDef */
/** @typedef {import("./types.js").FillDef} FillDef */
/** @typedef {import("./types.js").InputDef} InputDef */
/** @typedef {import("./pineRuntime.js").BarScriptContext} BarScriptContext */

/**
 * Optional base marker for indicator definition classes.
 * @abstract
 */
export class IndicatorDefinition {}

/**
 * Pine-style indicator config — plain object or class with static metadata + methods.
 *
 * @typedef {object} IndicatorConfig
 * @property {string} id
 * @property {string} type
 * @property {string} title
 * @property {string} shortTitle
 * @property {boolean} [enabled]
 * @property {string} [primaryPlot]
 * @property {PlotDef[]} [plots]
 * @property {FillDef[]} [fills]
 * @property {InputDef[]} [inputs]
 * @property {import("./types.js").GraphicObjectDef[]} [graphicObjects]
 * @property {string | null} [overlayPrimitive]
 * @property {number | null} [studyPaneOrder]
 * @property {number | null} [studyPaneIndex]
 * @property {string | null} [volumeScaleId]
 * @property {number} [studyPaneHeight]
 * @property {() => void} [init]
 * @property {(this: BarScriptContext, bar: object, index: number) => void} [onBar]
 * @property {(bars: object[], inputs: object, style: object, instance: IndicatorInstance) => Record<string, Array<number | null>>} [compute]
 * @property {(utcBars: object[], chartBars: object[], inputs: object, style: object, ctx: object) => object[]} [overlay]
 * @property {(instance: IndicatorInstance) => string[]} [legendParams] Override auto status-line params; default derives from inputs with `showInStatusLine`
 * @property {(inputs: object, style: object) => object[]} [stylePlotRows]
 * @property {(style: object, inputs?: object) => object} [mergeStyleDefaults]
 * @property {(inputs: object, style: object, changedKey: string) => void} [onInputChange]
 * @property {() => object} [defaultStyle]
 * @property {{ min: number, max: number }} [studyPaneScale]
 * @property {(plotKey: string, raw: number | null) => string | null} [formatPlotValue]
 * @property {(instance: IndicatorInstance) => import("./types.js").ValueLabel[]} [valueLabels]
 * @property {(instance: IndicatorInstance, plotKey: string) => import("./types.js").PlotStyle} [plotStyle]
 * @property {(instance: IndicatorInstance, chartBars: object[]) => object[]} [getBandFills]
 */

const META_KEYS = [
  "id",
  "type",
  "title",
  "shortTitle",
  "enabled",
  "plots",
  "fills",
  "inputs",
  "overlayPrimitive",
  "graphicObjects",
  "studyPaneOrder",
  "studyPaneIndex",
  "volumeScaleId",
  "studyPaneHeight",
  "studyPaneScale",
];

const HOOK_KEYS = [
  "init",
  "compute",
  "overlay",
  "legendParams",
  "stylePlotRows",
  "mergeStyleDefaults",
  "defaultStyle",
  "onInputChange",
  "formatPlotValue",
  "valueLabels",
  "plotStyle",
  "getBandFills",
];

/**
 * @param {new (...args: unknown[]) => unknown} Cls
 * @returns {IndicatorConfig}
 */
function configFromClass(Cls) {
  /** @type {IndicatorConfig} */
  const config = {};
  for (const key of META_KEYS) {
    if (Cls[key] !== undefined) config[key] = Cls[key];
  }
  for (const key of HOOK_KEYS) {
    if (typeof Cls[key] === "function") {
      config[key] = Cls[key];
    }
  }
  const primary = Cls.primaryPlot ?? Cls.primaryPlotKey;
  if (primary != null) config.primaryPlot = primary;

  if (typeof Cls.prototype?.onBar === "function") {
    config.onBar = Cls.prototype.onBar;
  }
  if (typeof Cls.prototype?.init === "function") {
    config.init = Cls.prototype.init;
  }
  return config;
}

/**
 * @param {new (...args: unknown[]) => unknown} from
 * @param {typeof BaseIndicator} to
 */
function copyOwnStatics(from, to) {
  for (const key of Reflect.ownKeys(from)) {
    if (key === "prototype" || key === "name" || key === "length") continue;
    const desc = Object.getOwnPropertyDescriptor(from, key);
    if (desc) Object.defineProperty(to, key, desc);
  }
  for (const key of HOOK_KEYS) {
    if (typeof from[key] === "function") {
      to[key] = from[key];
    }
  }
}

/**
 * Define a chart indicator from a config object or a named class.
 *
 * @example
 * export const RsiIndicator = defineIndicator(class RsiIndicator {
 *   static id = "RSI@tv-basicstudies";
 *   static compute(bars, inputs, style) { ... }
 * });
 *
 * @param {IndicatorConfig | (new (...args: unknown[]) => unknown)} configOrClass
 */
export function defineIndicator(configOrClass) {
  const userClass = typeof configOrClass === "function" ? configOrClass : null;
  const config = userClass ? configFromClass(userClass) : configOrClass;

  const isGraphicOverlay = Boolean(
    config.overlayPrimitive && (config.onBar || config.overlay) && !config.compute,
  );
  const plots =
    config.plots ??
    (isGraphicOverlay ? [] : [{ id: "main", title: config.title, color: "#2962ff" }]);
  const primaryKey = config.primaryPlot ?? plots[0]?.id ?? "main";
  const plotIds = plots.map((p) => p.id);

  function runOnBar(utcBars, chartBars, instance, symbolInfo, collect) {
    return runBarScript({
      utcBars,
      chartBars,
      inputs: instance.inputs,
      style: instance.style,
      plotIds,
      symbolInfo,
      init: config.init,
      onBar: config.onBar,
      collect,
    });
  }

  class DefinedIndicator extends BaseIndicator {
    static id = config.id;
    static type = config.type;
    static title = config.title;
    static shortTitle = config.shortTitle;
    static enabled = config.enabled ?? true;
    static primaryPlotKey = primaryKey;
    static plots = plots;
    static fills = config.fills ?? [];
    static inputs = config.inputs ?? [];
    static overlayPrimitive = config.overlayPrimitive ?? null;
    static graphicObjects = config.graphicObjects ?? [];
    static studyPaneOrder = config.studyPaneOrder ?? null;
    static studyPaneIndex = config.studyPaneIndex ?? null;
    static volumeScaleId = config.volumeScaleId ?? null;
    static studyPaneHeight = config.studyPaneHeight ?? 120;

    /** @returns {object} */
    static defaultStyle() {
      const base = super.defaultStyle();
      const extra = config.defaultStyle?.() ?? {};
      if (isGraphicOverlay) return { ...base, valuesInStatusLine: false, ...extra };
      return { ...base, ...extra };
    }

    /** @param {IndicatorInstance} instance */
    static valueLabels(instance) {
      if (config.valueLabels) return config.valueLabels(instance);
      if (isGraphicOverlay) return [];
      return super.valueLabels(instance);
    }

    /** @param {IndicatorInstance} instance @param {string} plotKey */
    static plotStyle(instance, plotKey) {
      if (config.plotStyle) return config.plotStyle(instance, plotKey);
      return super.plotStyle(instance, plotKey);
    }

    /** @param {IndicatorInstance} instance @param {object[]} chartBars */
    static getBandFills(instance, chartBars) {
      if (config.getBandFills) return config.getBandFills(instance, chartBars);
      return super.getBandFills(instance, chartBars);
    }

    /** @param {object[]} bars @param {IndicatorInstance} instance */
    static compute(bars, instance) {
      if (config.onBar) {
        if (config.overlayPrimitive) return plotIds.length ? { [primaryKey]: [] } : {};
        return runOnBar(bars, bars, instance, null, "plots");
      }
      if (config.overlay && config.overlayPrimitive) return {};
      if (config.overlay) return { [primaryKey]: [] };
      if (!config.compute) return { [primaryKey]: [] };
      return config.compute(bars, instance.inputs, instance.style, instance);
    }

    /**
     * @param {object[]} utcBars
     * @param {object[]} chartBars
     * @param {IndicatorInstance} instance
     * @param {object} [ctx]
     */
    static computeOverlay(utcBars, chartBars, instance, ctx = {}) {
      if (config.onBar && config.overlayPrimitive) {
        return runOnBar(utcBars, chartBars, instance, ctx.symbolInfo ?? null, "labels");
      }
      const overlayFn = config.overlay ?? this.overlay;
      return overlayFn?.(utcBars, chartBars, instance.inputs, instance.style, ctx) ?? [];
    }

    /** @param {IndicatorInstance} instance */
    static legendParams(instance) {
      if (config.legendParams) return config.legendParams(instance);
      return inputStatusLineParams(this.inputs, instance);
    }

    /** @param {object} inputs @param {object} style */
    static stylePlotRows(inputs, style) {
      if (config.stylePlotRows) return config.stylePlotRows(inputs, style);
      return super.stylePlotRows(inputs, style);
    }

    /** @param {object} style @param {object} inputValues */
    static mergeStyleDefaults(style, inputValues = {}) {
      super.mergeStyleDefaults(style, inputValues);
      if (config.mergeStyleDefaults) return config.mergeStyleDefaults(style, inputValues);
      return style;
    }

    /** @param {object} inputValues @param {object} style @param {string} changedKey */
    static handleInputChange(inputValues, style, changedKey) {
      config.onInputChange?.(inputValues, style, changedKey);
      super.handleInputChange(inputValues, style, changedKey);
    }
  }

  if (config.studyPaneScale) {
    DefinedIndicator.studyPaneScale = config.studyPaneScale;
  }
  if (config.formatPlotValue) {
    DefinedIndicator.formatPlotValue = config.formatPlotValue;
  }

  if (userClass) {
    copyOwnStatics(userClass, DefinedIndicator);
    Object.defineProperty(DefinedIndicator, "name", {
      value: userClass.name,
      configurable: true,
    });
  }

  return DefinedIndicator;
}

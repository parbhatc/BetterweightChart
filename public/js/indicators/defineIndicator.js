import { BaseIndicator } from "./BaseIndicator.js";

/** @typedef {import("./types.js").IndicatorInstance} IndicatorInstance */
/** @typedef {import("./types.js").PlotDef} PlotDef */
/** @typedef {import("./types.js").FillDef} FillDef */
/** @typedef {import("./types.js").InputDef} InputDef */

/**
 * @typedef {object} IndicatorSchema
 * @property {string} id
 * @property {string} type
 * @property {string} title
 * @property {string} shortTitle
 * @property {boolean} [enabled]
 * @property {string} [primaryPlot]
 * @property {PlotDef[]} plots
 * @property {FillDef[]} [fills]
 * @property {InputDef[]} inputs
 * @property {(bars: object[], inputs: object, instance: IndicatorInstance) => Record<string, Array<number | null>>} compute
 * @property {(instance: IndicatorInstance) => string[]} [legendParams]
 * @property {(style: object, inputs: object) => void} [mergeStyleDefaults]
 * @property {(inputs: object, style: object, changedKey: string) => void} [onInputChange]
 */

export {
  plotStyleKeys,
  fillStyleKeys,
  buildBandFillSegments,
} from "./schema.js";

/**
 * Optional shorthand when you prefer a schema object over a class declaration.
 * For new indicators, prefer `class MyIndicator extends BaseIndicator`.
 *
 * @param {IndicatorSchema} schema
 */
export function defineIndicator(schema) {
  const {
    plots,
    fills = [],
    inputs,
    compute,
    legendParams,
    mergeStyleDefaults,
    onInputChange,
  } = schema;

  class DefinedIndicator extends BaseIndicator {
    static id = schema.id;
    static type = schema.type;
    static title = schema.title;
    static shortTitle = schema.shortTitle;
    static enabled = schema.enabled ?? true;
    static primaryPlotKey = schema.primaryPlot ?? plots[0]?.id ?? "main";
    static plots = plots;
    static fills = fills;
    static inputs = inputs;

    /** @param {object[]} bars @param {IndicatorInstance} instance */
    static compute(bars, instance) {
      return compute(bars, instance.inputs, instance);
    }

    /** @param {IndicatorInstance} instance */
    static legendParams(instance) {
      return legendParams?.(instance) ?? [];
    }

    /** @param {object} style @param {object} inputValues */
    static mergeStyleDefaults(style, inputValues = {}) {
      super.mergeStyleDefaults(style, inputValues);
      mergeStyleDefaults?.(style, inputValues);
      return style;
    }

    /** @param {object} inputValues @param {object} style @param {string} changedKey */
    static handleInputChange(inputValues, style, changedKey) {
      onInputChange?.(inputValues, style, changedKey);
      super.handleInputChange(inputValues, style, changedKey);
    }
  }

  return DefinedIndicator;
}

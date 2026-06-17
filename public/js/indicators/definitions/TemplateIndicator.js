/**
 * Copy this file to add a new indicator. Register it in catalog.js.
 */
import { BaseIndicator } from "../BaseIndicator.js";

/** @typedef {import("../types.js").IndicatorInstance} IndicatorInstance */

export class TemplateIndicator extends BaseIndicator {
  static id = "My Indicator@tv-basicstudies";
  static type = "my_indicator";
  static title = "My Indicator";
  static shortTitle = "MY";
  static enabled = false;
  static primaryPlotKey = "main";

  static plots = [
    { id: "main", title: "Main line", color: "#2962ff", priceLine: true },
  ];

  static inputs = [
    { id: "length", type: "int", title: "Length", defval: 14 },
    { id: "source", type: "source", title: "Source", defval: "close" },
  ];

  /** @param {object[]} bars @param {IndicatorInstance} instance */
  static compute(bars, instance) {
    void bars;
    void instance;
    return { main: [] };
  }

  /** @param {IndicatorInstance} instance */
  static legendParams(instance) {
    return [String(instance.inputs.length ?? 14)];
  }
}

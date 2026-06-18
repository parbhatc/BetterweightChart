/**
 * Copy this file, set enabled: true, add to definitions/index.js — reload.
 * @see docs/indicators.md
 */
import { defineIndicator } from "../defineIndicator.js";

export const TemplateIndicator = defineIndicator(class TemplateIndicator {
  constructor() {}

  static id = "My Indicator@tv-basicstudies";
  static type = "my_indicator";
  static title = "My Indicator";
  static shortTitle = "MY";
  static enabled = false;

  static inputs = [
    { id: "length", type: "int", title: "Length", defval: 14 },
    { id: "source", type: "source", title: "Source", defval: "close" },
  ];

  static plots = [{ id: "main", title: "Main line", color: "#2962ff", priceLine: true }];

  onBar(bar) {
    const src = this.math.source(bar, this.inputs.source);
    this.plot("main", src);
  }

  static legendParams(instance) {
    return [String(instance.inputs.length ?? 14)];
  }
});

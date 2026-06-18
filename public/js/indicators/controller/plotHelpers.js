import { LineStyle } from "lightweight-charts";
import { plotStyleKeys } from "../schema.js";

export const LINE_STYLES = [LineStyle.Solid, LineStyle.Dotted, LineStyle.Dashed, LineStyle.LargeDashed];

export const MAIN_SCALE_BOTTOM_DEFAULT = 0.12;
export const MAIN_SCALE_BOTTOM_WITH_VOLUME = 0.26;
export const VOLUME_OVERLAY_TOP_MARGIN = 0.78;
export const STUDY_PANE_SCALE_MARGINS = { top: 0.02, bottom: 0.02 };
export const OSCILLATOR_PANE_SCALE_MARGINS = { top: 0.04, bottom: 0.08 };

/** @param {typeof import("../BaseIndicator.js").BaseIndicator} Indicator @param {object} plotDef */
export function overlayVolumeScaleId(Indicator, plotDef) {
  return plotDef.priceScaleId ?? Indicator.volumeScaleId ?? "volume-overlay";
}

/** @param {typeof import("../BaseIndicator.js").BaseIndicator} Indicator @param {object} plotDef */
export function isVolumeOverlayPlot(Indicator, plotDef) {
  return Boolean(plotDef.overlay || (plotDef.type === "histogram" && Indicator.volumeScaleId));
}

/** @param {import("../types.js").IndicatorInstance} instance @param {string} plotKey @param {typeof import("../BaseIndicator.js").BaseIndicator} Indicator @param {object} plotDef */
export function resolvePlotType(instance, plotKey, Indicator, plotDef) {
  const keys = plotStyleKeys(plotKey);
  const stored = instance.style[keys.plotTypeKey];
  if (stored) return String(stored);
  if (plotDef.type === "histogram" && Indicator.volumeScaleId) return "columns";
  if (plotDef.type === "histogram") return "histogram";
  return "line";
}

/** @param {Record<string, Array<number | null>>} plots */
export function numericPlotKeys(plots) {
  return Object.keys(plots).filter((key) => {
    const arr = plots[key];
    if (!Array.isArray(arr) || !arr.length) return false;
    return arr.some((v) => v == null || typeof v === "number");
  });
}

/** @param {typeof import("../BaseIndicator.js").BaseIndicator} Indicator @param {string} key */
export function plotDefFor(Indicator, key) {
  return Indicator.getPlotDef?.(key) ?? Indicator.plots?.find((p) => p.id === key) ?? { type: "line" };
}

/** @param {typeof import("../BaseIndicator.js").BaseIndicator} Indicator @param {string[]} plotKeys */
export function plotRenderOrder(Indicator, plotKeys) {
  /** @type {string[]} */
  const bands = [];
  /** @type {string[]} */
  const lines = [];
  /** @type {string[]} */
  const other = [];
  for (const key of plotKeys) {
    const def = plotDefFor(Indicator, key);
    if (def.band) bands.push(key);
    else if (def.type === "histogram") other.push(key);
    else lines.push(key);
  }
  return [...bands, ...lines, ...other];
}

/** @param {typeof import("../BaseIndicator.js").BaseIndicator} Indicator @param {object} plotDef @param {import("../types.js").IndicatorInstance} instance */
export function seriesPaneIndex(Indicator, plotDef, instance) {
  if (plotDef.paneIndex != null) return plotDef.paneIndex;
  if (instance._lwcStudyPane != null) return instance._lwcStudyPane;
  return 0;
}

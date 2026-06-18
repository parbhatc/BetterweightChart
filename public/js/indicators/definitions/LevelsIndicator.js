import { defineIndicator } from "../defineIndicator.js";
import { resolutionSec } from "../../chart/resolutions.js";
import { normalizeResolutionId } from "../../chart/resolutionFormat.js";
import {
  DEFAULT_SESSION_LEVELS,
  DEFAULT_TIME_LEVELS,
  resolveSessionLevels,
  resolveTimeLevels,
} from "../ui/levelsLayersPanel.js";
import { levelsToOverlayLines, runLevelsEngine } from "../math/levelsEngine.js";
import {
  debugLevelsEngineResult,
  debugLevelsOverlayStart,
  debugLevelsPriceSanity,
  debugLevelsTimeMapping,
} from "../math/levelsDebug.js";

/** @param {object | null | undefined} symbolInfo */
function tickSizeFromSymbol(symbolInfo) {
  const scale = Number(symbolInfo?.pricescale) || 100;
  const minmov = Number(symbolInfo?.minmov) || 1;
  return minmov / scale;
}

/** @param {unknown} v @param {string} fallback */
function colorStr(v, fallback) {
  if (typeof v === "string" && v) return v;
  if (v && typeof v === "object" && v.color) return String(v.color);
  return fallback;
}

/** @param {object} inputs @param {string} [chartResolution] */
export function levelsEnabledHtfResolutions(inputs, chartResolution = "1") {
  const chartSec = resolutionSec(chartResolution ?? "1");
  /** @type {{ tfId: string, tfSec: number }[]} */
  const out = [];
  for (const row of resolveTimeLevels(inputs)) {
    if (!row.enabled) continue;
    const tfId = normalizeResolutionId(row.layer ?? "240");
    const tfSec = resolutionSec(tfId);
    if (!tfSec || tfSec <= chartSec) continue;
    out.push({ tfId, tfSec });
  }
  return out;
}

/** HTF bar count needed for maxBarsBack (not chart bars). */
export function levelsRequiredHtfBars(inputs) {
  return Math.max(10, Number(inputs.maxBarsBack) || 300);
}

/** True while any enabled HTF time layer is still missing bar data. */
export function levelsHtfPending(inputs, ctx = {}) {
  const chartResolution = ctx.chartResolution ?? "1";
  const htfs = levelsEnabledHtfResolutions(inputs, chartResolution);
  if (!htfs.length) return false;

  const need = levelsRequiredHtfBars(inputs);
  const symbol = ctx.primarySymbol ?? ctx.symbol;
  let pending = false;

  for (const { tfId } of htfs) {
    const hit =
      ctx.lookupSecurity?.(symbol, tfId, need) ??
      (() => {
        const series =
          ctx.getSecurityBars?.(symbol, tfId) ?? ctx.getBars?.(tfId) ?? ctx.getHtfBars?.(tfId);
        if (!series?.utcBars?.length) return null;
        return { ...series, sufficient: series.utcBars.length >= need };
      })();
    if (hit?.utcBars?.length && hit.sufficient) continue;
    ctx.requestSecurityBars?.(symbol, tfId, need);
    ctx.requestBars?.(tfId, need);
    ctx.requestHtfBars?.(tfId, need);
    pending = true;
  }
  return pending;
}

/** @param {object} inputs @param {string} [chartResolution] */
export function levelsRequiredChartBars(inputs, chartResolution) {
  const chartSec = resolutionSec(chartResolution ?? "1");
  const htfs = levelsEnabledHtfResolutions(inputs, chartResolution);
  if (htfs.length) return 0;
  return Math.max(10, Number(inputs.maxBarsBack) || 300);
}

export const LevelsIndicator = defineIndicator(class LevelsIndicator {
  constructor() {}

  static id = "LEVELS@tv-basicstudies";
  static type = "levels";
  static title = "Levels";
  static shortTitle = "Levels";

  static overlayPrimitive = "lines";
  static graphicObjects = [
    { styleKey: "graphicLines", label: "Lines", overlay: "lines" },
    { styleKey: "graphicLabels", label: "Labels" },
  ];

  static inputs = [
    {
      type: "timeLevels",
      id: "timeLevels",
      title: "Time levels",
      section: "Time levels",
      defval: DEFAULT_TIME_LEVELS,
    },
    {
      type: "sessionLevels",
      id: "sessionLevels",
      title: "Sessions",
      section: "Sessions",
      defval: DEFAULT_SESSION_LEVELS,
    },
    {
      id: "pivotLeftBars",
      type: "int",
      title: "Pivot left bars",
      defval: 1,
      min: 1,
      section: "Pivot",
      inline: true,
    },
    {
      id: "pivotRightBars",
      type: "int",
      title: "Pivot right bars",
      defval: 1,
      min: 1,
      section: "Pivot",
      inline: true,
    },
    {
      id: "maxBarsBack",
      type: "int",
      title: "Max bars back to find levels (HTF bars per layer)",
      defval: 300,
      min: 10,
      section: "Display limits",
    },
    {
      id: "maxUnswept",
      type: "int",
      title: "Max unswept levels",
      defval: 15,
      min: 1,
      section: "Display limits",
      inline: true,
    },
    {
      id: "maxSwept",
      type: "int",
      title: "Max swept levels",
      defval: 5,
      min: 0,
      section: "Display limits",
      inline: true,
    },
    {
      id: "maxSessions",
      type: "int",
      title: "Max session instances",
      defval: 3,
      min: 1,
      section: "Display limits",
    },
    {
      id: "mergeConfluence",
      type: "bool",
      title: "Merge confluence levels",
      defval: true,
      section: "Confluence",
    },
    {
      id: "confHiColor",
      type: "color",
      title: "Confluence high",
      defval: { color: "#9400d3", opacity: 100 },
      section: "Confluence",
      inline: true,
    },
    {
      id: "confLoColor",
      type: "color",
      title: "Confluence low",
      defval: { color: "#ffaa00", opacity: 100 },
      section: "Confluence",
      inline: true,
      disabled: (inputs) => inputs.mergeConfluence === false,
    },
  ];

  static mergeStyleDefaults(style) {
    return {
      ...style,
      graphicLines: style.graphicLines ?? true,
      graphicLabels: style.graphicLabels ?? true,
    };
  }

  /** Min chart-resolution bars when all enabled time levels are at or below chart resolution. */
  static requiredChartBars(inputs, chartResolution) {
    return levelsRequiredChartBars(inputs, chartResolution);
  }

  /** @param {import("../types.js").IndicatorInstance} instance @param {object} ctx */
  static overlayPending(instance, ctx) {
    return levelsHtfPending(instance.inputs, ctx);
  }

  /** @param {import("../types.js").IndicatorInstance} instance */
  static legendParams(instance) {
    const enabled = [
      ...resolveTimeLevels(instance.inputs).filter((r) => r.enabled),
      ...resolveSessionLevels(instance.inputs).filter((r) => r.enabled),
    ];
    if (!enabled.length) return [];
    return [enabled.map((r) => r.label).join(", ")];
  }

  /** @param {object} instance @param {object} ctx */
  static overlayRecomputeExtra(instance, ctx) {
    const time = JSON.stringify(resolveTimeLevels(instance.inputs));
    const sessions = JSON.stringify(resolveSessionLevels(instance.inputs));
    // Bar tail is already in overlayRecomputeKey — do not key on forming OHLC or the
    // full levels engine runs on every tick within the same 1m candle.
    const htfKey = levelsEnabledHtfResolutions(instance.inputs, ctx.chartResolution ?? "1")
      .map(({ tfId }) => {
        const hit =
          ctx.getSecurityBars?.(ctx.primarySymbol ?? ctx.symbol, tfId) ??
          ctx.getBars?.(tfId) ??
          ctx.getHtfBars?.(tfId);
        return `${tfId}:${hit?.utcBars?.length ?? 0}:${hit?.source ?? ""}`;
      })
      .join(",");
    return `${time}|${sessions}|${htfKey}|${instance.inputs.maxBarsBack}|${instance.inputs.pivotLeftBars}|${instance.inputs.pivotRightBars}|${instance.inputs.maxUnswept}|${instance.inputs.maxSwept}|${instance.inputs.mergeConfluence}|${instance.inputs.confHiColor}|${instance.inputs.confLoColor}|${instance.style.graphicLabels}`;
  }

  /**
   * @param {object[]} utcBars
   * @param {object[]} chartBars
   * @param {object} inputs
   * @param {object} style
   * @param {object} [ctx]
   */
  static overlay(utcBars, chartBars, inputs, style, ctx = {}) {
    if (style.graphicLines === false) return [];
    if (!utcBars?.length || utcBars.length !== chartBars?.length) return [];

    const anchorUnix = utcBars.at(-1)?.time;
    if (anchorUnix == null) return [];

    const tick = tickSizeFromSymbol(ctx.symbolInfo);
    const engineOpts = {
      timeLayers: resolveTimeLevels(inputs),
      sessionLayers: resolveSessionLevels(inputs),
      pivotLeftBars: inputs.pivotLeftBars,
      pivotRightBars: inputs.pivotRightBars,
      maxUnswept: inputs.maxUnswept,
      maxSwept: inputs.maxSwept,
      maxSessions: inputs.maxSessions,
      tickSize: tick,
      chartSec: ctx.barSec ?? 60,
      chartBars,
      symbol: ctx.primarySymbol ?? ctx.symbol,
      maxBarsBack: Math.max(10, Number(inputs.maxBarsBack) || 300),
      htfBarsNeeded: levelsRequiredHtfBars(inputs),
      getSecurityBars: ctx.getSecurityBars,
      getBars: ctx.getBars,
      getHtfBars: ctx.getHtfBars,
      requestSecurityBars: ctx.requestSecurityBars,
      requestBars: ctx.requestBars,
      requestHtfBars: ctx.requestHtfBars,
      showLabels: style.graphicLabels !== false,
      mergeConfluence: inputs.mergeConfluence !== false,
      confHiColor: colorStr(inputs.confHiColor, "#9400d3"),
      confLoColor: colorStr(inputs.confLoColor, "#ffaa00"),
    };

    debugLevelsOverlayStart(ctx, utcBars, chartBars, engineOpts);

    const { lines, htfState } = runLevelsEngine(utcBars, anchorUnix, engineOpts);
    debugLevelsEngineResult(utcBars, anchorUnix, engineOpts, lines, htfState);

    const overlay = levelsToOverlayLines(lines, utcBars, chartBars, style);
    debugLevelsTimeMapping(lines, overlay, utcBars, chartBars);
    debugLevelsPriceSanity(overlay, chartBars);

    return overlay;
  }
});

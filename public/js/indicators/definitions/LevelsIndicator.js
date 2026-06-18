import { defineIndicator } from "../defineIndicator.js";
import {
  DEFAULT_SESSION_LEVELS,
  DEFAULT_TIME_LEVELS,
  resolveSessionLevels,
  resolveTimeLevels,
} from "../ui/levelsLayersPanel.js";
import { levelsToOverlayLines, runLevelsEngine } from "../math/levelsEngine.js";

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
    const b = ctx.formingBar;
    const ohlc = b ? `${b.open}|${b.high}|${b.low}|${b.close}` : "";
    return `${time}|${sessions}|${instance.inputs.pivotLeftBars}|${instance.inputs.pivotRightBars}|${instance.inputs.maxUnswept}|${instance.inputs.maxSwept}|${instance.inputs.mergeConfluence}|${instance.inputs.confHiColor}|${instance.inputs.confLoColor}|${instance.style.graphicLabels}|${ohlc}`;
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
    const lines = runLevelsEngine(utcBars, anchorUnix, {
      timeLayers: resolveTimeLevels(inputs),
      sessionLayers: resolveSessionLevels(inputs),
      pivotLeftBars: inputs.pivotLeftBars,
      pivotRightBars: inputs.pivotRightBars,
      maxUnswept: inputs.maxUnswept,
      maxSwept: inputs.maxSwept,
      maxSessions: inputs.maxSessions,
      tickSize: tick,
      showLabels: style.graphicLabels !== false,
      mergeConfluence: inputs.mergeConfluence !== false,
      confHiColor: colorStr(inputs.confHiColor, "#9400d3"),
      confLoColor: colorStr(inputs.confLoColor, "#ffaa00"),
    });

    return levelsToOverlayLines(lines, utcBars, chartBars, style);
  }
});

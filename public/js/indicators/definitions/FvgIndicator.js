import { defineIndicator } from "../defineIndicator.js";
import { applyColorOpacity } from "../../ui/color/picker.js";
import { resolutionSec } from "../../chart/resolutions.js";
import { normalizeResolutionId, resolutionDisplayTitle } from "../../chart/resolutionFormat.js";
import { aggregateBars } from "../math/aggregate.js";
import { alignUtcBarsByChartTime } from "../math/pivots.js";
import { getHtfBars } from "../../app/bar/htfBarCache.js";
import { resolveSmtCompareSymbol } from "./SmtIndicator.js";
import { symbolTicker } from "../../app/symbol/ticker.js";
import {
  buildFvgBoxLabel,
  fvgZonePassesSizeFilter,
  resolveFvgSizeFilterLimits,
} from "../ui/symbolSizeRulesPanel.js";
import {
  DEFAULT_FVG_TIMEFRAMES,
  resolveFvgLayers,
  resolveFvgTimeframeRows,
} from "../ui/fvgTimeframesPanel.js";

const LABEL_DISTANCE_BARS = 10;

/** @param {string} color @param {number} opacity */
function rgba(color, opacity) {
  return applyColorOpacity(String(color ?? "#2962ff"), opacity);
}

/** @param {object[]} bars @param {number} i confirmation bar (third candle) @param {number} [tfSec] HTF period in seconds */
function fvgAtBar(bars, i, tfSec = 900) {
  if (i < 2 || i >= bars.length) return null;
  const b0 = bars[i - 2];
  const b1 = bars[i - 1];
  const b2 = bars[i];
  if (!b0 || !b1 || !b2) return null;
  if (b2.time - b1.time > tfSec) return null;
  if (b2.low > b0.high) {
    return { kind: "bull", top: b2.low, bottom: b0.high, barIndex: i - 2 };
  }
  if (b2.high < b0.low) {
    return { kind: "bear", top: b0.low, bottom: b2.high, barIndex: i - 2 };
  }
  return null;
}

/** @param {object} hit @param {object[]} series @param {number} confirmIndex */
function zoneFromFvgHit(hit, series, confirmIndex) {
  const startBar = series[hit.barIndex];
  const startTime = startBar?.chartTime;
  if (startTime == null) return null;
  return {
    kind: hit.kind,
    top: hit.top,
    bottom: hit.bottom,
    startTime,
    startIndex: hit.barIndex,
    confirmIndex,
  };
}

/** @param {object} zone @param {object} bar */
function isIfvgCloseInversion(zone, bar) {
  if (zone.kind === "bull") return bar.close < zone.bottom;
  return bar.close > zone.top;
}

/** Forming-bar only: close through gap before candle confirms (reverts if close recovers). */
function isPartialClose(zone, bar) {
  if (zone.kind === "bull") return bar.close < zone.bottom;
  return bar.close > zone.top;
}

/** @param {object} zone @param {object} bar @param {"close"|"wick"} fillType */
function isFvgFilled(zone, bar, fillType) {
  if (zone.kind === "bull") {
    return fillType === "wick" ? bar.low <= zone.bottom : bar.close <= zone.bottom;
  }
  return fillType === "wick" ? bar.high >= zone.top : bar.close >= zone.top;
}

/** @param {object[]} zones @param {number} max @param {(z: object) => number} timeOf */
function takeRecentZones(zones, max, timeOf) {
  if (max <= 0 || !zones.length) return [];
  if (zones.length <= max) return zones;
  return zones
    .slice()
    .sort((a, b) => timeOf(a) - timeOf(b))
    .slice(-max);
}

/** @param {object} zone @param {object[]} series */
function zoneConfirmTime(zone, series) {
  const bar = series[zone.confirmIndex];
  return bar?.confirmChartTime ?? bar?.chartTime ?? zone.startTime;
}

/** @param {object} zone @param {object[]} series */
function zoneInvertTime(zone, series) {
  const bar = series[zone.invertIndex];
  return bar?.confirmChartTime ?? bar?.chartTime ?? zone.invertTime ?? zone.startTime;
}

/** @returns {import("../types.js").InputDef[]} */
function buildInputs() {
  /** @type {import("../types.js").InputDef[]} */
  const inputs = [
    {
      type: "fvgTimeframes",
      id: "fvgTimeframes",
      section: "Timeframes",
      defval: DEFAULT_FVG_TIMEFRAMES,
    },
  ];

  inputs.push(
    { id: "hideLowerTf", type: "bool", title: "Hide FVGs lower than enabled timeframes", defval: true, section: "FVG settings" },
    { id: "showFvg", type: "bool", title: "Show FVG", defval: true, section: "FVG settings" },
    {
      id: "filledType",
      type: "select",
      title: "Filled FVG Type",
      defval: "close",
      section: "FVG settings",
      options: [
        { id: "close", label: "Close" },
        { id: "wick", label: "Wick" },
      ],
    },
    { id: "maxBarsBack", type: "int", title: "Max bars back to find FVGs (HTF bars per layer)", defval: 300, section: "FVG settings" },
    {
      id: "maxFvgZones",
      type: "int",
      title: "Max FVG zones to show",
      defval: 300,
      min: 0,
      section: "FVG settings",
      inline: true,
    },
    {
      id: "partialCloseColor",
      type: "color",
      title: "Partial close",
      defval: { color: "#ff9800", opacity: 20 },
      section: "FVG settings",
    },
    { id: "showLiveForming", type: "bool", title: "Show live forming FVG", defval: true, section: "Live Forming" },
    {
      type: "inlinePair",
      section: "Live Forming",
      header: "Forming FVG color",
      left: {
        id: "formingBullColor",
        type: "color",
        title: "Bullish",
        defval: { color: "#00bcd4", opacity: 25 },
      },
      right: {
        id: "formingBearColor",
        type: "color",
        title: "Bearish",
        defval: { color: "#ab47bc", opacity: 25 },
      },
    },
    {
      id: "requireCorrelatedFvg",
      type: "bool",
      title: "Require matching FVG on compare symbol",
      defval: false,
      section: "Correlated FVG",
    },
    {
      id: "correlatedFvgTf",
      type: "select",
      title: "Timeframe",
      defval: "all",
      section: "Correlated FVG",
      options: [{ id: "all", label: "All" }],
      disabled: (inputs) => inputs.requireCorrelatedFvg !== true,
      showInStatusLine: false,
    },
    {
      id: "autoCompare",
      type: "bool",
      title: "Auto-detect compare symbol",
      defval: true,
      section: "Correlated FVG",
      showInStatusLine: false,
    },
    {
      id: "compareSymbol",
      type: "symbol",
      title: "Compare symbol",
      defval: "ES",
      section: "Correlated FVG",
      disabled: (inputs) => inputs.autoCompare !== false,
      showInStatusLine: false,
    },
    {
      id: "sizeFilterOn",
      type: "bool",
      title: "Filter FVG by size",
      defval: false,
      section: "FVG Size Filter",
      showInStatusLine: false,
    },
    {
      id: "sizeFilterUnit",
      type: "select",
      title: "Unit",
      defval: "none",
      section: "FVG Size Filter",
      options: [
        { id: "none", label: "None" },
        { id: "ticks", label: "Ticks" },
        { id: "points", label: "Points" },
      ],
      disabled: (inputs) => inputs.sizeFilterOn !== true,
      showInStatusLine: false,
    },
    {
      type: "inlinePair",
      section: "FVG Size Filter",
      header: "Global min / max (0 = no limit)",
      left: {
        id: "sizeFilterMin",
        type: "float",
        title: "Min",
        defval: 0,
        disabled: (inputs) => inputs.sizeFilterOn !== true || inputs.sizeFilterUnit === "none",
        showInStatusLine: false,
      },
      right: {
        id: "sizeFilterMax",
        type: "float",
        title: "Max",
        defval: 0,
        disabled: (inputs) => inputs.sizeFilterOn !== true || inputs.sizeFilterUnit === "none",
        showInStatusLine: false,
      },
    },
    {
      type: "symbolSizeRules",
      id: "sizeFilterRules",
      title: "Per-symbol overrides",
      section: "FVG Size Filter",
      defval: [{ symbol: "NQ", min: 8, max: 20 }],
      disabled: (inputs) => inputs.sizeFilterOn !== true,
    },
    { id: "showIfvg", type: "bool", title: "Show IFVG (inversed FVG)", defval: true, section: "IFVG settings" },
    {
      id: "maxIfvgZones",
      type: "int",
      title: "Max IFVG zones to show",
      defval: 1,
      min: 0,
      section: "IFVG settings",
    },
    { id: "ifvgLabel", type: "text", title: "IFVG label", defval: "IFVG", section: "IFVG settings" },

    { id: "showLabels", type: "bool", title: "Show Labels", defval: true, section: "Label Settings" },
    {
      id: "showSizeOnLabel",
      type: "bool",
      title: "Show FVG size on label",
      defval: false,
      section: "Label Settings",
    },
    {
      id: "showFvgNameOnLabel",
      type: "bool",
      title: "Show FVG name on label",
      defval: true,
      section: "Label Settings",
      disabled: (inputs) => inputs.showLabels === false,
    },
    {
      id: "sizeLabelFormat",
      type: "select",
      title: "Size format",
      defval: "both",
      section: "Label Settings",
      options: [
        { id: "both", label: "Points / Ticks" },
        { id: "points", label: "Points" },
        { id: "ticks", label: "Ticks" },
      ],
      disabled: (inputs) => inputs.showSizeOnLabel !== true,
      showInStatusLine: false,
    },
  );

  inputs.push(
    { id: "deleteOnFill", type: "bool", title: "Delete Boxes after fill", defval: true, section: "Box Settings" },
    { id: "extendBoxes", type: "bool", title: "Extend Boxes", defval: false, section: "Box Settings" },
    { id: "boxLength", type: "int", title: "Length of Boxes", defval: 20, section: "Box Settings" },
    {
      type: "inlinePair",
      section: "Box Settings",
      header: "FVG Box Color",
      left: {
        id: "bullBoxColor",
        type: "color",
        title: "Bullish",
        defval: { color: "#00e676", opacity: 10 },
      },
      right: {
        id: "bearBoxColor",
        type: "color",
        title: "Bearish",
        defval: { color: "#f23645", opacity: 10 },
      },
    },
    {
      id: "borderStyle",
      type: "select",
      title: "Border style",
      defval: "solid",
      section: "Border Settings",
      options: [
        { id: "solid", label: "Solid" },
        { id: "dashed", label: "Dashed" },
        { id: "dotted", label: "Dotted" },
      ],
    },
    { id: "borderWidth", type: "int", title: "Border Width", defval: 1, section: "Border Settings" },
    {
      type: "inlinePair",
      section: "Border Settings",
      header: "FVG Border Colors",
      left: {
        id: "bullBorderColor",
        type: "color",
        title: "Bullish",
        defval: { color: "#00e676", opacity: 0 },
      },
      right: {
        id: "bearBorderColor",
        type: "color",
        title: "Bearish",
        defval: { color: "#f23645", opacity: 0 },
      },
    },
    {
      id: "ifvgBoxColor",
      type: "color",
      title: "IFVG",
      defval: { color: "#ffff00", opacity: 20 },
      section: "IFVG settings",
    },
  );

  return inputs;
}

/** @param {object} inputs @param {string} [chartResolution] @returns {{ tfId: string, tfSec: number }[]} */
export function fvgEnabledHtfResolutions(inputs, chartResolution) {
  const chartSec = resolutionSec(chartResolution ?? "1");
  let out = resolveFvgLayers(inputs, chartSec).filter((l) => l.tfSec > chartSec);
  if (inputs.hideLowerTf !== false && out.length) {
    const maxSec = Math.max(...out.map((l) => l.tfSec));
    out = out.filter((l) => l.tfSec === maxSec);
  }
  return out.map(({ tfId, tfSec }) => ({ tfId, tfSec }));
}

/** HTF bar count needed for maxBarsBack (not chart bars). */
export function fvgRequiredHtfBars(inputs) {
  return Math.max(10, Number(inputs.maxBarsBack) || 300);
}

/** @param {object} inputs @param {string} [chartResolution] */
export function fvgRequiredChartBars(inputs, chartResolution) {
  const chartSec = resolutionSec(chartResolution ?? "1");
  const htfs = fvgEnabledHtfResolutions(inputs, chartResolution);
  if (htfs.length) return 0;
  return Math.max(10, Number(inputs.maxBarsBack) || 300);
}

/** @param {import("../pineRuntime.js").BarScriptContext} script @param {{ tfSec: number, tfId: string, label: string }} layer */
function buildLayerSeries(script, layer) {
  const { chartSec, maxBack } = script.state.cfg;
  const overlayCtx = script.overlayCtx ?? {};

  if (layer.tfSec <= chartSec) {
    const series = script.bars.map((b, i) => ({
      ...b,
      sourceIndex: i,
      startSourceIndex: i,
      chartTime: script.chartBars[i]?.time ?? b.time,
      confirmChartTime: script.chartBars[i]?.time ?? b.time,
    }));
    return { series, startIdx: Math.max(2, series.length - maxBack) };
  }

  const htf =
    overlayCtx.getSecurityBars?.(undefined, layer.tfId) ??
    overlayCtx.getBars?.(layer.tfId) ??
    overlayCtx.getHtfBars?.(layer.tfId);
  if (htf?.utcBars?.length) {
    const series = htf.utcBars.map((b, i) => ({
      ...b,
      sourceIndex: i,
      startSourceIndex: i,
      chartTime: htf.chartBars[i]?.time ?? b.time,
      confirmChartTime: htf.chartBars[i]?.time ?? b.time,
    }));
    return { series, startIdx: Math.max(2, series.length - maxBack) };
  }

  overlayCtx.requestHtfBars?.(layer.tfId, maxBack);
  const series = aggregateBars(
    script.bars,
    layer.tfSec,
    chartSec,
    (_, i) => script.chartBars[i]?.time ?? script.bars[i].time,
  ).map((b) => ({
    ...b,
    chartTime: script.chartBars[b.startSourceIndex]?.time ?? b.time,
    confirmChartTime: script.chartBars[b.startSourceIndex]?.time ?? b.time,
  }));
  return { series, startIdx: Math.max(2, series.length - maxBack) };
}

/** @param {object} inputs */
export function fvgRequiresCorrelatedCompare(inputs) {
  return inputs.requireCorrelatedFvg === true;
}

/**
 * Compare-symbol series for the same FVG layer (aligned to primary chart times).
 * @param {(object | null)[]} alignedCompare
 * @param {object[]} chartBars
 * @param {{ tfSec: number, tfId: string, label: string }} layer
 * @param {number} chartSec
 * @param {number} maxBack
 * @param {string} compareSymbol
 */
function buildCompareLayerSeries(alignedCompare, chartBars, layer, chartSec, maxBack, compareSymbol) {
  if (layer.tfSec <= chartSec) {
    const series = alignedCompare.map((b, i) => {
      if (!b) return null;
      return {
        ...b,
        sourceIndex: i,
        startSourceIndex: i,
        chartTime: chartBars[i]?.time ?? b.time,
        confirmChartTime: chartBars[i]?.time ?? b.time,
      };
    });
    return { series, startIdx: Math.max(2, alignedCompare.length - maxBack) };
  }

  const htf = getHtfBars(compareSymbol, layer.tfId);
  if (htf?.utcBars?.length) {
    const series = htf.utcBars.map((b, i) => ({
      ...b,
      sourceIndex: i,
      startSourceIndex: i,
      chartTime: htf.chartBars[i]?.time ?? b.time,
      confirmChartTime: htf.chartBars[i]?.time ?? b.time,
    }));
    return { series, startIdx: Math.max(2, series.length - maxBack) };
  }

  /** @type {object[]} */
  const packed = [];
  /** @type {number[]} */
  const chartTimes = [];
  for (let i = 0; i < alignedCompare.length; i++) {
    const b = alignedCompare[i];
    if (!b) continue;
    packed.push(b);
    chartTimes.push(chartBars[i]?.time ?? b.time);
  }
  if (packed.length < 3) return { series: [], startIdx: 0 };

  const series = aggregateBars(packed, layer.tfSec, chartSec, (_, i) => chartTimes[i]).map((b) => ({
    ...b,
    chartTime: chartTimes[b.startSourceIndex] ?? b.time,
    confirmChartTime: chartTimes[b.sourceIndex] ?? b.time,
  }));
  return { series, startIdx: Math.max(2, series.length - maxBack) };
}

/** @param {object[]} compareSeries @param {number} confirmTime @param {number} tfSec */
function compareFvgKindAtConfirmTime(compareSeries, confirmTime, tfSec) {
  if (!compareSeries?.length || confirmTime == null) return null;
  let idx = -1;
  for (let i = 0; i < compareSeries.length; i++) {
    const bar = compareSeries[i];
    if (!bar) continue;
    const t = bar.confirmChartTime ?? bar.chartTime;
    if (t === confirmTime) {
      idx = i;
      break;
    }
  }
  if (idx < 2) return null;
  const hit = fvgAtBar(compareSeries, idx, tfSec);
  return hit?.kind ?? null;
}

/**
 * @param {object} inputs
 * @param {string} [chartResolution]
 * @returns {{ id: string, label: string }[]}
 */
export function fvgCorrelatedTfOptions(inputs, chartResolution = "1") {
  /** @type {{ id: string, label: string }[]} */
  const options = [
    { id: "all", label: "All" },
    { id: "chart", label: `Chart (${resolutionDisplayTitle(chartResolution)})` },
  ];
  const seen = new Set(["all", "chart"]);

  for (const row of resolveFvgTimeframeRows(inputs)) {
    if (!row.enabled) continue;
    const tfId = row.timeframe ?? "chart";
    if (tfId === "chart") continue;
    const key = normalizeResolutionId(tfId);
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({ id: key, label: resolutionDisplayTitle(tfId) });
  }
  return options;
}

/**
 * @param {string} sel
 * @param {{ tfSec: number, tfId: string }} layer
 * @param {number} chartSec
 */
function layerMatchesCorrelatedTfSel(sel, layer, chartSec) {
  if (sel === "chart") {
    return layer.tfId === "chart" || layer.tfSec === chartSec;
  }
  const normSel = normalizeResolutionId(sel);
  const normLayer = layer.tfId === "chart" ? "chart" : normalizeResolutionId(layer.tfId);
  if (normLayer === normSel) return true;
  const wantSec = resolutionSec(sel);
  return wantSec != null && layer.tfSec === wantSec;
}

/**
 * @param {import("../pineRuntime.js").BarScriptContext} script
 * @param {{ tfSec: number, tfId: string, label: string }} layer
 * @param {object[]} primarySeries
 * @param {object} zone
 */
function passesCorrelatedFilter(script, layer, primarySeries, zone) {
  if (!script.state.cfg.requireCorrelatedFvg) return true;
  const sel = script.state.cfg.correlatedFvgTf ?? "all";
  if (sel !== "all" && !layerMatchesCorrelatedTfSel(sel, layer, script.state.cfg.chartSec)) {
    return true;
  }
  const cmpSeries = script.state.compareSeriesByLayer?.get(layer.label);
  if (!cmpSeries?.length) return false;
  const confirmBar = primarySeries[zone.confirmIndex];
  const confirmTime = confirmBar?.confirmChartTime ?? confirmBar?.chartTime;
  const cmpKind = compareFvgKindAtConfirmTime(cmpSeries, confirmTime, layer.tfSec);
  return cmpKind != null && cmpKind === zone.kind;
}

/**
 * @param {import("../pineRuntime.js").BarScriptContext} script
 * @param {{ tfSec: number, tfId: string, label: string }} layer
 * @param {object[]} series
 * @param {object[]} active
 * @param {object[]} ifvgActive
 * @param {number} i
 * @param {number} lastBarIdx
 */
function processFvgBar(script, layer, series, active, ifvgActive, i, lastBarIdx) {
  const { deleteOnFill, fillType, showIfvg, showPartial } = script.state.cfg;
  const isFormingBar = i === lastBarIdx;

  for (let z = active.length - 1; z >= 0; z--) {
    const zone = active[z];
    if (showIfvg && !isFormingBar && isIfvgCloseInversion(zone, series[i])) {
      ifvgActive.push({
        ...zone,
        invertIndex: i,
        invertTime: series[i]?.chartTime ?? series[i]?.time,
      });
      active.splice(z, 1);
      continue;
    }
    if (isFormingBar && showPartial) {
      if (isPartialClose(zone, series[i])) {
        active[z] = { ...zone, partial: true };
        continue;
      }
      if (zone.partial) {
        active[z] = { ...zone, partial: false };
      }
    } else if (zone.partial) {
      active[z] = { ...zone, partial: false };
    }
    if (!isFvgFilled(zone, series[i], fillType)) continue;
    if (deleteOnFill) active.splice(z, 1);
    else active[z] = { ...zone, filled: true, fillIndex: i, partial: false };
  }

  const hit = fvgAtBar(series, i, layer.tfSec);
  if (!hit) return;
  if (isFormingBar) return;

  const zone = zoneFromFvgHit(hit, series, i);
  if (!zone) return;
  active.push(zone);
}

/** @param {import("../pineRuntime.js").BarScriptContext} script @param {{ tfSec: number, tfId: string, label: string }} layer @param {object[]} series @param {number} startIdx @param {number} barIdx */
function onBarLayer(script, layer, series, startIdx, barIdx) {
  if (barIdx < startIdx || barIdx >= series.length) return;
  const active = script.state.layerActive.get(layer.label) ?? [];
  const ifvgActive = script.state.layerIfvg.get(layer.label) ?? [];
  processFvgBar(script, layer, series, active, ifvgActive, barIdx, series.length - 1);
  script.state.layerActive.set(layer.label, active);
  script.state.layerIfvg.set(layer.label, ifvgActive);
}

/** @param {import("../pineRuntime.js").BarScriptContext} script @param {{ tfSec: number, tfId: string, label: string }} layer @param {object[]} series @param {number} startIdx */
function scanLayerSeries(script, layer, series, startIdx) {
  const active = [];
  const ifvgActive = [];
  const lastBarIdx = series.length - 1;
  for (let i = startIdx; i < series.length; i++) {
    processFvgBar(script, layer, series, active, ifvgActive, i, lastBarIdx);
  }
  script.state.layerActive.set(layer.label, active);
  script.state.layerIfvg.set(layer.label, ifvgActive);
}

/** @param {import("../pineRuntime.js").BarScriptContext} script @param {{ tfSec: number, tfId: string, label: string }} layer @param {object} zone @param {object[]} series @param {{ isIfvg?: boolean, layerLabel?: string }} opts */
function emitZoneBox(script, layer, series, zone, opts = {}) {
  const cfg = script.state.cfg;
  const isIfvg = opts.isIfvg === true;
  if (isIfvg && !cfg.showIfvg) return;
  if (!isIfvg && zone.forming && !cfg.showLiveForming) return;
  if (!isIfvg && !zone.forming && !cfg.showFvg) return;

  const confirmBar = series[zone.confirmIndex];
  const confirmTime = confirmBar?.confirmChartTime ?? confirmBar?.chartTime ?? zone.startTime;
  const invertTime = isIfvg ? zoneInvertTime(zone, series) : confirmTime;
  const anchorTime = isIfvg ? invertTime : confirmTime;
  const startTime = zone.startTime;
  const boxEndBase = anchorTime;
  const boxLenSec = cfg.boxLen * cfg.chartSec;
  let endTime = boxEndBase + boxLenSec;
  let extendRight = false;

  if (cfg.extendBoxes) {
    if (!isIfvg && zone.filled && zone.fillIndex != null) {
      endTime =
        series[zone.fillIndex]?.confirmChartTime ??
        series[zone.fillIndex]?.chartTime ??
        cfg.lastChartTime;
    } else {
      endTime = anchorTime;
      extendRight = true;
    }
  } else {
    endTime = boxEndBase + boxLenSec;
    if (!isIfvg && zone.filled && zone.fillIndex != null) {
      const fillTime =
        series[zone.fillIndex]?.confirmChartTime ?? series[zone.fillIndex]?.chartTime;
      if (fillTime != null) endTime = Math.min(endTime, fillTime);
    }
  }

  const isBull = zone.kind === "bull";
  let fillColor;
  let borderColor;
  let borderWidth;
  let label;
  let textColor;

  if (isIfvg) {
    fillColor = cfg.ifvgColor;
    borderColor = cfg.ifvgColor;
    borderWidth = cfg.ifvgColor ? cfg.borderWidth : 0;
    label = cfg.ifvgLabel;
    textColor = script.inputs.ifvgBoxColor ?? "#ffff00";
  } else if (zone.forming) {
    fillColor = isBull ? cfg.formingBullFill : cfg.formingBearFill;
    borderColor = fillColor;
    borderWidth = fillColor ? cfg.borderWidth : 0;
    label = opts.layerLabel ?? layer.label;
    textColor = isBull
      ? (script.inputs.formingBullColor ?? "#00bcd4")
      : (script.inputs.formingBearColor ?? "#ab47bc");
  } else if (zone.partial) {
    fillColor = cfg.partialFill;
    borderColor = cfg.partialFill;
    borderWidth = cfg.partialFill ? cfg.borderWidth : 0;
    label = opts.layerLabel ?? layer.label;
    textColor = script.inputs.partialCloseColor ?? "#ff9800";
  } else {
    fillColor = isBull ? cfg.bullFill : cfg.bearFill;
    borderColor = isBull ? cfg.bullBorder : cfg.bearBorder;
    borderWidth = borderColor ? cfg.borderWidth : 0;
    label = opts.layerLabel ?? layer.label;
    textColor = isBull
      ? (script.inputs.bullBorderColor ?? "#00e676")
      : (script.inputs.bearBorderColor ?? "#f23645");
  }

  const labelTime = extendRight ? startTime + LABEL_DISTANCE_BARS * cfg.chartSec : null;
  const symbolInfo = script.overlayCtx?.symbolInfo ?? null;

  if (!isIfvg) {
    const baseName = opts.layerLabel ?? layer.label;
    label = buildFvgBoxLabel(cfg, baseName, zone, symbolInfo);
  }

  const showLabel = cfg.showLabels && Boolean(label && String(label).trim());

  script.drawBox({
    timeStart: startTime,
    timeEnd: endTime,
    extendRight,
    labelTime,
    priceTop: zone.top,
    priceBottom: zone.bottom,
    fillColor,
    borderColor: borderColor ?? "transparent",
    borderWidth,
    borderDash: cfg.borderDash,
    label,
    showLabel,
    labelAlign: "center",
    textColor,
    isIfvg,
    isPartial: Boolean(zone.partial),
    isForming: Boolean(zone.forming),
  });
}

/** @param {import("../pineRuntime.js").BarScriptContext} script */
function emitAllBoxes(script) {
  const cfg = script.state.cfg;
  /** @type {{ layer: object, series: object[], zone: object, sortTime: number }[]} */
  const fvgCandidates = [];
  /** @type {{ layer: object, series: object[], zone: object, sortTime: number }[]} */
  const ifvgCandidates = [];

  const allLayers = [
    ...script.state.chartLayers.map((e) => ({ layer: e.layer, series: e.series })),
    ...(script.state.htfLayers ?? []),
  ];

  for (const { layer, series } of allLayers) {
    const active = script.state.layerActive.get(layer.label) ?? [];
    const ifvgActive = script.state.layerIfvg.get(layer.label) ?? [];
    const lastIdx = series.length - 1;
    for (const zone of active) {
      if (zone.filled) continue;
      if (zone.confirmIndex === lastIdx) continue;
      if (!passesCorrelatedFilter(script, layer, series, zone)) continue;
      if (!fvgZonePassesSizeFilter(zone, cfg.sizeFilterLimits, script.overlayCtx?.symbolInfo ?? null)) {
        continue;
      }
      fvgCandidates.push({
        layer,
        series,
        zone,
        sortTime: zoneConfirmTime(zone, series),
      });
    }
    if (cfg.showLiveForming && cfg.showFvg && series.length >= 3) {
      const hit = fvgAtBar(series, lastIdx, layer.tfSec);
      const formingZone = hit ? zoneFromFvgHit(hit, series, lastIdx) : null;
      if (formingZone) {
        formingZone.forming = true;
        if (passesCorrelatedFilter(script, layer, series, formingZone)) {
          if (
            fvgZonePassesSizeFilter(
              formingZone,
              cfg.sizeFilterLimits,
              script.overlayCtx?.symbolInfo ?? null,
            )
          ) {
            fvgCandidates.push({
              layer,
              series,
              zone: formingZone,
              sortTime: zoneConfirmTime(formingZone, series),
            });
          }
        }
      }
    }
    for (const zone of ifvgActive) {
      ifvgCandidates.push({
        layer,
        series,
        zone,
        sortTime: zoneInvertTime(zone, series),
      });
    }
  }

  const fvgZones = takeRecentZones(fvgCandidates, cfg.maxFvgZones, (z) => z.sortTime);
  const ifvgZones = takeRecentZones(ifvgCandidates, cfg.maxIfvgZones, (z) => z.sortTime);

  for (const item of fvgZones) {
    emitZoneBox(script, item.layer, item.series, item.zone, { layerLabel: item.layer.label });
  }
  for (const item of ifvgZones) {
    emitZoneBox(script, item.layer, item.series, item.zone, { isIfvg: true });
  }
}

export const FvgIndicator = defineIndicator(class FvgIndicator {
  constructor() {}

  static id = "FVG@tv-basicstudies";
  static type = "fvg";
  static title = "FVG";
  static shortTitle = "FVG";

  static overlayPrimitive = "boxes";
  static graphicObjects = [
    { styleKey: "graphicBoxes", label: "Boxes", overlay: "boxes" },
    { styleKey: "graphicLabels", label: "Labels", overlay: "labels" },
  ];

  static inputs = buildInputs();

  static mergeStyleDefaults(style) {
    const boxesVisible =
      style.graphicBoxes !== false &&
      style.graphicForming !== false &&
      style.graphicIfvg !== false;
    return {
      ...style,
      graphicBoxes: style.graphicBoxes ?? boxesVisible,
      graphicLabels: style.graphicLabels ?? true,
    };
  }

  /** @param {object} [inputs] @param {string} [chartResolution] */
  static inputSchema(inputs = {}, chartResolution = "1") {
    const options = fvgCorrelatedTfOptions(inputs, chartResolution);
    return buildInputs().map((item) =>
      item.id === "correlatedFvgTf" ? { ...item, options } : item,
    );
  }

  /** Min chart-resolution bars to satisfy maxBarsBack on the highest enabled HTF layer. */
  static requiredChartBars(inputs, chartResolution) {
    return fvgRequiredChartBars(inputs, chartResolution);
  }

  /** @param {import("../types.js").IndicatorInstance} instance @param {{ primarySymbol?: string, chartResolution?: string }} [ctx] */
  static legendParams(instance, ctx = {}) {
    const inputs = instance.inputs;
    /** @type {string[]} */
    const params = [];
    const enabled = resolveFvgTimeframeRows(inputs).filter((r) => r.enabled);
    if (enabled.length) params.push(enabled.map((r) => r.label).join(", "));
    if (inputs.requireCorrelatedFvg === true) {
      params.push(symbolTicker(resolveSmtCompareSymbol(inputs, ctx.primarySymbol ?? "")));
      const tf = inputs.correlatedFvgTf ?? "all";
      if (tf !== "all") {
        const opt = fvgCorrelatedTfOptions(inputs, ctx.chartResolution ?? "1").find((o) => o.id === tf);
        if (opt?.label) params.push(opt.label);
      }
    }
    return params;
  }

  /** @param {object} instance @param {{ formingBar?: object | null, primarySymbol?: string, symbol?: string, chartResolution?: string, getCompareBars?: Function }} ctx */
  static overlayRecomputeExtra(instance, ctx) {
    const b = ctx.formingBar;
    const ohlc = b ? `${b.open}|${b.high}|${b.low}|${b.close}` : "";
    let extra = ohlc;
    if (instance.inputs.sizeFilterOn === true) {
      extra += `|sf:${instance.inputs.sizeFilterUnit}|${instance.inputs.sizeFilterMin}|${instance.inputs.sizeFilterMax}|${JSON.stringify(instance.inputs.sizeFilterRules ?? [])}`;
    }
    extra += `|lbl:${instance.inputs.showLabels}|${instance.style?.graphicLabels}|${instance.inputs.showSizeOnLabel}|${instance.inputs.showFvgNameOnLabel}|${instance.inputs.sizeLabelFormat}`;
    if (instance.inputs.requireCorrelatedFvg !== true) return extra;
    const compare = resolveSmtCompareSymbol(instance.inputs, ctx.primarySymbol ?? ctx.symbol);
    const cmp = ctx.getCompareBars?.(compare, ctx.chartResolution);
    const tail = cmp?.utcBars?.at(-1);
    const cmpOhlc = tail ? `${tail.open}|${tail.high}|${tail.low}|${tail.close}` : "";
    const corrTf = instance.inputs.correlatedFvgTf ?? "all";
    return `${extra}|${compare}|${corrTf}|${cmp?.utcBars?.length ?? 0}|${cmpOhlc}`;
  }

  init() {
    const inputs = this.inputs;
    const style = this.style;
    const ctx = this.overlayCtx ?? {};

    if (
      (inputs.showFvg === false && inputs.showIfvg === false) ||
      style.graphicBoxes === false
    ) {
      this.state.skip = true;
      return;
    }

    const chartSec = ctx.barSec ?? resolutionSec(ctx.chartResolution ?? "1");
    const maxBack = Math.max(10, Number(inputs.maxBarsBack) || 300);
    const deleteOnFill = inputs.deleteOnFill !== false;
    const extendBoxes = Boolean(inputs.extendBoxes);
    const boxLen = Math.max(1, Number(inputs.boxLength) || 20);
    const fillType = inputs.filledType === "wick" ? "wick" : "close";
    const boxesVisible = style.graphicBoxes !== false;
    const showLabels = inputs.showLabels !== false && style.graphicLabels !== false;
    const showFvg = inputs.showFvg !== false && boxesVisible;
    const showLiveForming =
      inputs.showLiveForming !== false && boxesVisible && showFvg;
    const showIfvg = inputs.showIfvg !== false && boxesVisible;
    const maxFvgZones = Math.max(
      0,
      inputs.maxFvgZones != null && inputs.maxFvgZones !== ""
        ? Number(inputs.maxFvgZones)
        : 300,
    );
    const maxIfvgZones = Math.max(
      0,
      inputs.maxIfvgZones != null && inputs.maxIfvgZones !== ""
        ? Number(inputs.maxIfvgZones)
        : 1,
    );

    const borderStyle = String(inputs.borderStyle ?? "solid");
    const borderWidth = Math.max(1, Number(inputs.borderWidth) || 1);
    const borderDash =
      borderStyle === "dotted" ? [2, 2] : borderStyle === "dashed" ? [6, 4] : [];

    const bullFillOp = inputs.bullBoxOpacity !== undefined ? Number(inputs.bullBoxOpacity) : 10;
    const bearFillOp = inputs.bearBoxOpacity !== undefined ? Number(inputs.bearBoxOpacity) : 10;
    const bullBorderOp = inputs.bullBorderOpacity !== undefined ? Number(inputs.bullBorderOpacity) : 0;
    const bearBorderOp = inputs.bearBorderOpacity !== undefined ? Number(inputs.bearBorderOpacity) : 0;
    const ifvgOp = inputs.ifvgBoxOpacity !== undefined ? Number(inputs.ifvgBoxOpacity) : 20;
    const partialOp =
      inputs.partialCloseOpacity !== undefined ? Number(inputs.partialCloseOpacity) : 20;
    const formingBullOp =
      inputs.formingBullOpacity !== undefined ? Number(inputs.formingBullOpacity) : 25;
    const formingBearOp =
      inputs.formingBearOpacity !== undefined ? Number(inputs.formingBearOpacity) : 25;

    const lastChartTime = this.chartBars.at(-1)?.time;
    if (lastChartTime == null) {
      this.state.skip = true;
      return;
    }

    /** @type {{ tfSec: number, tfId: string, label: string }[]} */
    let layers = resolveFvgLayers(inputs, chartSec);
    if (!layers.length) {
      this.state.skip = true;
      return;
    }

    if (inputs.hideLowerTf !== false) {
      const maxSec = Math.max(...layers.map((l) => l.tfSec));
      layers = layers.filter((l) => l.tfSec === maxSec);
    }

    const requireCorrelatedFvg = inputs.requireCorrelatedFvg === true;
    /** @type {Map<string, object[]> | null} */
    let compareSeriesByLayer = null;

    if (requireCorrelatedFvg) {
      const compare = resolveSmtCompareSymbol(inputs, ctx.primarySymbol ?? ctx.symbol);
      const cmp = ctx.getCompareBars?.(compare, ctx.chartResolution);
      if (!cmp?.utcBars?.length || cmp.utcBars.length !== cmp.chartBars?.length) {
        ctx.requestCompareBars?.(compare, this.bars.length);
        this.state.skip = true;
        this.state.loading = true;
        return;
      }
      const aligned = alignUtcBarsByChartTime(this.chartBars, cmp.utcBars, cmp.chartBars);
      let covered = 0;
      for (const bar of aligned) {
        if (bar) covered += 1;
      }
      if (covered < Math.min(this.bars.length, 3)) {
        ctx.requestCompareBars?.(compare, this.bars.length);
        this.state.skip = true;
        this.state.loading = true;
        return;
      }
      compareSeriesByLayer = new Map();
      for (const layer of layers) {
        const built = buildCompareLayerSeries(
          aligned,
          this.chartBars,
          layer,
          chartSec,
          maxBack,
          compare,
        );
        compareSeriesByLayer.set(layer.label, built.series);
      }
      this.state.compareSymbol = compare;
      this.state.loading = false;
    } else {
      this.state.loading = false;
    }

    this.state.cfg = {
      chartSec,
      maxBack,
      deleteOnFill,
      extendBoxes,
      boxLen,
      fillType,
      showLabels,
      showSizeOnLabel: inputs.showSizeOnLabel === true,
      showFvgNameOnLabel: inputs.showFvgNameOnLabel !== false,
      sizeLabelFormat:
        inputs.sizeLabelFormat === "points" || inputs.sizeLabelFormat === "ticks"
          ? inputs.sizeLabelFormat
          : "both",
      showFvg,
      showLiveForming,
      showIfvg,
      showPartial: true,
      maxFvgZones,
      maxIfvgZones,
      ifvgLabel: String(inputs.ifvgLabel ?? "IFVG"),
      borderWidth,
      borderDash,
      bullFill: rgba(inputs.bullBoxColor ?? "#00e676", bullFillOp),
      bearFill: rgba(inputs.bearBoxColor ?? "#f23645", bearFillOp),
      bullBorder: bullBorderOp > 0 ? rgba(inputs.bullBorderColor ?? "#00e676", bullBorderOp) : null,
      bearBorder: bearBorderOp > 0 ? rgba(inputs.bearBorderColor ?? "#f23645", bearBorderOp) : null,
      ifvgColor: rgba(inputs.ifvgBoxColor ?? "#ffff00", ifvgOp),
      partialFill: rgba(inputs.partialCloseColor ?? "#ff9800", partialOp),
      formingBullFill: rgba(inputs.formingBullColor ?? "#00bcd4", formingBullOp),
      formingBearFill: rgba(inputs.formingBearColor ?? "#ab47bc", formingBearOp),
      requireCorrelatedFvg,
      correlatedFvgTf: String(inputs.correlatedFvgTf ?? "all"),
      chartSec,
      sizeFilterLimits: resolveFvgSizeFilterLimits(ctx.primarySymbol ?? ctx.symbol, inputs),
      lastChartTime,
    };
    this.state.compareSeriesByLayer = compareSeriesByLayer;
    this.state.chartLayers = [];
    this.state.htfLayers = [];
    this.state.layerActive = new Map();
    this.state.layerIfvg = new Map();

    for (const layer of layers) {
      const built = buildLayerSeries(this, layer);
      if (!built) continue;
      if (layer.tfSec <= chartSec) {
        this.state.chartLayers.push({ layer, ...built });
        this.state.layerActive.set(layer.label, []);
        this.state.layerIfvg.set(layer.label, []);
      } else {
        scanLayerSeries(this, layer, built.series, built.startIdx);
        this.state.htfLayers.push({ layer, series: built.series });
      }
    }
  }

  onBar() {
    if (this.state.skip) return;
    for (const entry of this.state.chartLayers) {
      onBarLayer(this, entry.layer, entry.series, entry.startIdx, this.index);
    }
    if (this.index !== this.bars.length - 1) return;
    emitAllBoxes(this);
  }
});

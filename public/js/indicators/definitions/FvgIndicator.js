import { defineIndicator } from "../defineIndicator.js";
import { applyColorOpacity } from "../../ui/color/picker.js";
import { resolutionSec } from "../../chart/resolutions.js";
import { aggregateBars } from "../math/aggregate.js";
import { chartDebug, isChartDebugEnabled } from "../../debug/chart/index.js";
import { resolveTimezone } from "../../chart/timezone/list.js";

const LABEL_DISTANCE_BARS = 10;

const TF_LAYER_DEFS = [
  { on: "tf1On", tf: "tf1", label: "tf1Label", title: "Timeframe #1", defTf: "chart", defLabel: "FVG", defaultOn: true },
  { on: "tf2On", tf: "tf2", label: "tf2Label", title: "Timeframe #2", defTf: "15", defLabel: "15m FVG" },
  { on: "tf3On", tf: "tf3", label: "tf3Label", title: "Timeframe #3", defTf: "60", defLabel: "1h FVG" },
  { on: "tf4On", tf: "tf4", label: "tf4Label", title: "Timeframe #4", defTf: "240", defLabel: "4h FVG" },
  { on: "tf5On", tf: "tf5", label: "tf5Label", title: "Timeframe #5", defTf: "D", defLabel: "D FVG" },
];

/** @param {number} chartSec chart-time (pseudo-UTC wall clock) */
function fmtChartTime(chartSec) {
  if (chartSec == null || !Number.isFinite(chartSec)) return "?";
  const d = new Date(chartSec * 1000);
  return d.toLocaleString("en-US", {
    timeZone: "UTC",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

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
  // TV-style: gap may fall between candles 1→2 (e.g. Fri close → Sun open) but never 2→3.
  if (b2.time - b1.time > tfSec) return null;
  if (b2.low > b0.high) {
    return { kind: "bull", top: b2.low, bottom: b0.high, barIndex: i - 2 };
  }
  if (b2.high < b0.low) {
    return { kind: "bear", top: b0.low, bottom: b2.high, barIndex: i - 2 };
  }
  return null;
}

/** @param {object} zone @param {object} bar @param {"close"|"wick"} fillType */
function isFvgFilled(zone, bar, fillType) {
  if (zone.kind === "bull") {
    return fillType === "wick" ? bar.low <= zone.bottom : bar.close <= zone.bottom;
  }
  return fillType === "wick" ? bar.high >= zone.top : bar.close >= zone.top;
}

/** @returns {import("../types.js").InputDef[]} */
function buildInputs() {
  /** @type {import("../types.js").InputDef[]} */
  const inputs = [];

  for (const row of TF_LAYER_DEFS) {
    inputs.push({
      type: "row",
      section: "Timeframes",
      fields: [
        { id: row.on, type: "bool", title: "", defval: row.defaultOn ?? false },
        { id: row.tf, type: "timeframe", title: row.title, defval: row.defTf },
      ],
    });
  }

  inputs.push(
    { id: "waitClose", type: "bool", title: "Wait for candle close to identify FVGs", defval: false, section: "FVG settings" },
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

    { id: "showLabels", type: "bool", title: "Show Labels", defval: true, section: "Label Settings" },
  );

  for (const row of TF_LAYER_DEFS) {
    inputs.push({
      id: row.label,
      type: "text",
      title: row.title,
      defval: row.defLabel,
      section: "Label Settings",
    });
  }

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
  );

  return inputs;
}

/** @param {object} inputs @param {string} [chartResolution] @returns {{ tfId: string, tfSec: number }[]} */
export function fvgEnabledHtfResolutions(inputs, chartResolution) {
  const chartSec = resolutionSec(chartResolution ?? "1");
  /** @type {{ tfId: string, tfSec: number }[]} */
  const out = [];
  for (const def of TF_LAYER_DEFS) {
    const enabled = def.defaultOn ? inputs[def.on] !== false : Boolean(inputs[def.on]);
    if (!enabled) continue;
    const tfId = inputs[def.tf] ?? def.defTf;
    const tfSec = tfId === "chart" ? chartSec : resolutionSec(tfId);
    if (tfSec > chartSec) out.push({ tfId, tfSec });
  }
  if (inputs.hideLowerTf !== false && out.length) {
    const maxSec = Math.max(...out.map((l) => l.tfSec));
    return out.filter((l) => l.tfSec === maxSec);
  }
  return out;
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

let _lastFvgDebugKey = "";

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
    return {
      ...style,
      graphicBoxes: style.graphicBoxes ?? true,
      graphicLabels: style.graphicLabels ?? true,
    };
  }

  /** Min chart-resolution bars to satisfy maxBarsBack on the highest enabled HTF layer. */
  static requiredChartBars(inputs, chartResolution) {
    return fvgRequiredChartBars(inputs, chartResolution);
  }

  static overlay(utcBars, chartBars, inputs, style, ctx = {}) {
    if (inputs.showFvg === false || style.graphicBoxes === false) return [];

    const chartSec = ctx.barSec ?? resolutionSec(ctx.chartResolution ?? "1");
    const maxBack = Math.max(10, Number(inputs.maxBarsBack) || 300);
    const waitClose = Boolean(inputs.waitClose);
    const deleteOnFill = inputs.deleteOnFill !== false;
    const extendBoxes = Boolean(inputs.extendBoxes);
    const boxLen = Math.max(1, Number(inputs.boxLength) || 20);
    const fillType = inputs.filledType === "wick" ? "wick" : "close";
    const showLabels = inputs.showLabels !== false && style.graphicLabels !== false;

    const borderStyle = String(inputs.borderStyle ?? "solid");
    const borderWidth = Math.max(1, Number(inputs.borderWidth) || 1);
    const borderDash =
      borderStyle === "dotted" ? [2, 2] : borderStyle === "dashed" ? [6, 4] : [];

    const bullFillOp = inputs.bullBoxOpacity !== undefined ? Number(inputs.bullBoxOpacity) : 10;
    const bearFillOp = inputs.bearBoxOpacity !== undefined ? Number(inputs.bearBoxOpacity) : 10;
    const bullBorderOp = inputs.bullBorderOpacity !== undefined ? Number(inputs.bullBorderOpacity) : 0;
    const bearBorderOp = inputs.bearBorderOpacity !== undefined ? Number(inputs.bearBorderOpacity) : 0;

    const bullFill = rgba(inputs.bullBoxColor ?? "#00e676", bullFillOp);
    const bearFill = rgba(inputs.bearBoxColor ?? "#f23645", bearFillOp);
    const bullBorder = bullBorderOp > 0 ? rgba(inputs.bullBorderColor ?? "#00e676", bullBorderOp) : null;
    const bearBorder = bearBorderOp > 0 ? rgba(inputs.bearBorderColor ?? "#f23645", bearBorderOp) : null;

    const lastChartTime = chartBars.at(-1)?.time;
    if (lastChartTime == null) return [];

    /** @type {{ tfSec: number, label: string }[]} */
    let layers = [];
    for (const def of TF_LAYER_DEFS) {
      const enabled = def.defaultOn ? inputs[def.on] !== false : Boolean(inputs[def.on]);
      if (!enabled) continue;
      const tfId = inputs[def.tf] ?? def.defTf;
      const tfSec = tfId === "chart" ? chartSec : resolutionSec(tfId);
      layers.push({ tfSec, tfId, label: String(inputs[def.label] ?? def.defLabel) });
    }
    if (!layers.length) return [];

    if (inputs.hideLowerTf !== false) {
      const maxSec = Math.max(...layers.map((l) => l.tfSec));
      layers = layers.filter((l) => l.tfSec === maxSec);
    }

    /** @type {object[]} */
    const boxes = [];
    /** @type {object[]} */
    const debugRows = [];
    /** @type {Record<string, { seriesLen: number, startIdx: number, maxBack: number }>} */
    const layerScan = {};

    for (const layer of layers) {
      let series;
      let seriesSource = "chart";

      if (layer.tfSec <= chartSec) {
        series = utcBars.map((b, i) => ({
          ...b,
          sourceIndex: i,
          startSourceIndex: i,
          chartTime: chartBars[i]?.time ?? b.time,
          confirmChartTime: chartBars[i]?.time ?? b.time,
        }));
      } else {
        const htf = ctx.getHtfBars?.(layer.tfId);
        if (htf?.utcBars?.length) {
          seriesSource = "datafeed";
          series = htf.utcBars.map((b, i) => ({
            ...b,
            sourceIndex: i,
            startSourceIndex: i,
            chartTime: htf.chartBars[i]?.time ?? b.time,
            confirmChartTime: htf.chartBars[i]?.time ?? b.time,
          }));
        } else {
          seriesSource = "aggregate";
          ctx.requestHtfBars?.(layer.tfId, maxBack);
          series = aggregateBars(
            utcBars,
            layer.tfSec,
            chartSec,
            (_, i) => chartBars[i]?.time ?? utcBars[i].time,
          ).map((b) => ({
            ...b,
            chartTime: chartBars[b.startSourceIndex]?.time ?? b.time,
            confirmChartTime: chartBars[b.startSourceIndex]?.time ?? b.time,
          }));
        }
      }

      const startIdx = Math.max(2, series.length - maxBack);
      layerScan[layer.label] = { seriesLen: series.length, startIdx, maxBack, seriesSource };
      const lastBarIdx = series.length - 1;
      /** @type {object[]} */
      const active = [];

      for (let i = startIdx; i < series.length; i++) {
        for (let z = active.length - 1; z >= 0; z--) {
          if (!isFvgFilled(active[z], series[i], fillType)) continue;
          if (deleteOnFill) active.splice(z, 1);
          else active[z] = { ...active[z], filled: true, fillIndex: i };
        }

        // waitClose: skip the forming (last) bar — confirm only after it closes
        if (waitClose && i === lastBarIdx) continue;

        const hit = fvgAtBar(series, i, layer.tfSec);
        if (!hit) continue;
        const startBar = series[hit.barIndex];
        const startTime = startBar?.chartTime;
        if (startTime == null) continue;
        active.push({
          kind: hit.kind,
          top: hit.top,
          bottom: hit.bottom,
          startTime,
          startIndex: hit.barIndex,
          confirmIndex: i,
        });
      }

      for (const zone of active) {
        if (zone.filled && deleteOnFill) continue;

        const startTime = zone.startTime;
        const confirmBar = series[zone.confirmIndex];
        const confirmTime = confirmBar?.confirmChartTime ?? confirmBar?.chartTime ?? startTime;
        // Wait for close: confirm after the 3rd candle closes, so box length starts at the next bar open.
        const boxEndBase = waitClose ? confirmTime + chartSec : confirmTime;
        // Box length is always in chart-resolution bars (TV-style MTF display).
        const boxLenSec = boxLen * chartSec;
        let endTime = boxEndBase + boxLenSec;
        let extendRight = false;

        if (extendBoxes) {
          if (zone.filled && zone.fillIndex != null) {
            endTime =
              series[zone.fillIndex]?.confirmChartTime ??
              series[zone.fillIndex]?.chartTime ??
              lastChartTime;
          } else {
            endTime = confirmTime;
            extendRight = true;
          }
        } else {
          endTime = boxEndBase + boxLenSec;
          if (zone.filled && zone.fillIndex != null) {
            const fillTime =
              series[zone.fillIndex]?.confirmChartTime ?? series[zone.fillIndex]?.chartTime;
            if (fillTime != null) endTime = Math.min(endTime, fillTime);
          }
        }

        const isBull = zone.kind === "bull";
        const borderColor = isBull ? bullBorder : bearBorder;
        const effectiveBorderWidth = borderColor ? borderWidth : 0;
        const labelDistBars = LABEL_DISTANCE_BARS;
        const labelTime = extendRight ? startTime + labelDistBars * chartSec : null;
        boxes.push({
          timeStart: startTime,
          timeEnd: endTime,
          extendRight,
          labelTime,
          priceTop: zone.top,
          priceBottom: zone.bottom,
          fillColor: isBull ? bullFill : bearFill,
          borderColor: borderColor ?? "transparent",
          borderWidth: effectiveBorderWidth,
          borderDash,
          label: layer.label,
          showLabel: showLabels,
          labelAlign: "center",
          textColor: isBull ? (inputs.bullBorderColor ?? "#00e676") : (inputs.bearBorderColor ?? "#f23645"),
        });

        debugRows.push({
          label: layer.label,
          kind: zone.kind,
          tfMin: layer.tfSec / 60,
          start: fmtChartTime(startTime),
          end: fmtChartTime(endTime),
          confirm: fmtChartTime(confirmTime),
          htfPatternOpen: fmtChartTime(series[zone.startIndex]?.time),
          htfConfirmOpen: fmtChartTime(series[zone.confirmIndex]?.time),
          startIndex: zone.startIndex,
          confirmIndex: zone.confirmIndex,
          boxLenBars: boxLen,
          extendBoxes,
          filled: Boolean(zone.filled),
          top: zone.top,
          bottom: zone.bottom,
        });
      }
    }

    if (debugRows.length && isChartDebugEnabled()) {
      const debugKey = JSON.stringify(debugRows);
      if (debugKey !== _lastFvgDebugKey) {
        _lastFvgDebugKey = debugKey;
        const tz = resolveTimezone("exchange", ctx.symbolInfo);
        const requiredChartBars = fvgRequiredChartBars(inputs, ctx.chartResolution ?? "1");
        const requiredHtfBars = fvgRequiredHtfBars(inputs);
        const bullCount = debugRows.filter((r) => r.kind === "bull").length;
        const bearCount = debugRows.filter((r) => r.kind === "bear").length;
        chartDebug("fvg", `${debugRows.length} boxes (${bullCount} bull, ${bearCount} bear)`, {
          chartResolution: ctx.chartResolution,
          chartSec,
          timezone: tz,
          boxLen,
          extendBoxes,
          maxBarsBack: maxBack,
          requiredHtfBars,
          requiredChartBars,
          loadedChartBars: utcBars.length,
          dataShortfall: requiredChartBars > 0 && utcBars.length < requiredChartBars,
          bars: {
            utc: utcBars.length,
            chart: chartBars.length,
            first: fmtChartTime(chartBars[0]?.time),
            last: fmtChartTime(lastChartTime),
          },
          layerScan,
          boxes: debugRows,
        });
        if (typeof window !== "undefined") {
          window.__BWC_FVG_DEBUG__ = {
            at: new Date().toISOString(),
            timezone: tz,
            maxBarsBack: maxBack,
            requiredChartBars,
            loadedChartBars: utcBars.length,
            bullCount,
            bearCount,
            bars: { utc: utcBars.length, chart: chartBars.length },
            layerScan,
            boxes: debugRows,
          };
        }
      }
    }

    return boxes;
  }
});

import { resolutionSec } from "/js/chart/resolutions.js";
import { normalizeResolutionId } from "/js/chart/resolutionFormat.js";
import { aggregateBars } from "/js/indicators/math/aggregate.js";
import { getHtfBars } from "/js/app/bar/htfBarCache.js";
import { getSecuritySeries, mapHtfBarsToSeries, requestSecuritySeries } from "/js/indicators/security/htfAccess.js";
import { pendingInit, readyInit } from "/js/indicators/security/initWait.js";
import { ensureCompareAligned } from "/js/indicators/security/compareBars.js";
import {
  buildFvgBoxLabel,
  fvgZonePassesSizeFilter,
  resolveFvgSizeFilterLimits,
} from "../ui/symbolSizeRulesPanel.js";
import { resolveFvgLayers } from "../ui/fvgTimeframesPanel.js";
import { mapUtcTimeToChartTime } from "/js/indicators/math/barTimeMap.js";
import { inputColorWithOpacity } from "/js/indicators/styleColor.js";
import {
  debugFvgDrawBox,
  debugFvgEmitResult,
  debugFvgInitOk,
  debugFvgInitPending,
  debugFvgInitSkip,
  debugFvgZoneEvent,
} from "./fvgDebug.js";

const LABEL_DISTANCE_BARS = 10;

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

/** @param {import("../../pineRuntime.js").BarScriptContext} script @param {object} bar @param {number} [sourceIndex] */
function barChartTime(script, bar, sourceIndex) {
  if (bar?.chartTime != null) return bar.chartTime;
  const idx = sourceIndex ?? bar?.startSourceIndex ?? bar?.sourceIndex;
  if (idx != null && script.chartBars[idx]?.time != null) return script.chartBars[idx].time;
  if (bar?.time != null && script.bars?.length && script.chartBars?.length) {
    return mapUtcTimeToChartTime(bar.time, script.bars, script.chartBars);
  }
  return bar?.time ?? null;
}

/** @param {object} hit @param {object[]} series @param {number} confirmIndex @param {import("../../pineRuntime.js").BarScriptContext} script */
function zoneFromFvgHit(hit, series, confirmIndex, script) {
  const startBar = series[hit.barIndex];
  const startTime = barChartTime(script, startBar, hit.barIndex);
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

/** @param {string} sel @param {{ tfSec: number, tfId: string }} layer @param {number} chartSec */
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

export class FvgEngine {
  /** @param {import("../../pineRuntime.js").BarScriptContext} script */
  constructor(script) {
    this.script = script;
  }

  /** @param {import("../../pineRuntime.js").BarScriptContext} script */
  init() {
    const inputs = this.script.inputs;
    const style = this.script.style;
    const ctx = this.script.overlayCtx ?? {};

    if (
      (inputs.showFvg === false && inputs.showIfvg === false) ||
      style.graphicBoxes === false
    ) {
      this.script.state.skip = true;
      debugFvgInitSkip("boxes disabled", {
        showFvg: inputs.showFvg,
        showIfvg: inputs.showIfvg,
        graphicBoxes: style.graphicBoxes,
      });
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

    const lastChartTime = this.script.chartBars.at(-1)?.time;
    if (lastChartTime == null) {
      this.script.state.skip = true;
      debugFvgInitSkip("no chart bars");
      return;
    }

    /** @type {{ tfSec: number, tfId: string, label: string }[]} */
    let layers = resolveFvgLayers(inputs, chartSec);
    if (!layers.length) {
      this.script.state.skip = true;
      debugFvgInitSkip("no enabled layers");
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
      const minCovered = Math.min(this.script.bars.length, 3);
      const cmp = ensureCompareAligned(ctx, inputs, this.script.chartBars, this.script.bars.length, minCovered);
      if (!cmp.ready) {
        pendingInit(this.script.state);
        debugFvgInitPending("compare not aligned", {
          compare: cmp.compare,
          covered: cmp.covered,
          need: minCovered,
        });
        return;
      }
      compareSeriesByLayer = new Map();
      for (const layer of layers) {
        const built = this.buildCompareLayerSeries(
          cmp.aligned,
          this.script.chartBars,
          layer,
          chartSec,
          maxBack,
          cmp.compare,
        );
        compareSeriesByLayer.set(layer.label, built.series);
      }
      this.script.state.compareSymbol = cmp.compare;
      readyInit(this.script.state);
    } else {
      readyInit(this.script.state);
    }

    this.script.state.cfg = {
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
      bullFill: inputColorWithOpacity(inputs.bullBoxColor, "#00e676", bullFillOp),
      bearFill: inputColorWithOpacity(inputs.bearBoxColor, "#f23645", bearFillOp),
      bullBorder: bullBorderOp > 0 ? inputColorWithOpacity(inputs.bullBorderColor, "#00e676", bullBorderOp) : null,
      bearBorder: bearBorderOp > 0 ? inputColorWithOpacity(inputs.bearBorderColor, "#f23645", bearBorderOp) : null,
      ifvgColor: inputColorWithOpacity(inputs.ifvgBoxColor, "#ffff00", ifvgOp),
      partialFill: inputColorWithOpacity(inputs.partialCloseColor, "#ff9800", partialOp),
      formingBullFill: inputColorWithOpacity(inputs.formingBullColor, "#00bcd4", formingBullOp),
      formingBearFill: inputColorWithOpacity(inputs.formingBearColor, "#ab47bc", formingBearOp),
      requireCorrelatedFvg,
      correlatedFvgTf: String(inputs.correlatedFvgTf ?? "all"),
      sizeFilterLimits: resolveFvgSizeFilterLimits(ctx.primarySymbol ?? ctx.symbol, inputs),
      lastChartTime,
    };
    this.script.state.compareSeriesByLayer = compareSeriesByLayer;
    this.script.state.chartLayers = [];
    this.script.state.htfLayers = [];
    this.script.state.layerActive = new Map();
    this.script.state.layerIfvg = new Map();

    for (const layer of layers) {
      const built = this.buildLayerSeries(layer);
      if (!built) continue;
      if (layer.tfSec <= chartSec) {
        this.script.state.chartLayers.push({ layer, ...built });
        this.script.state.layerActive.set(layer.label, []);
        this.script.state.layerIfvg.set(layer.label, []);
      } else {
        this.scanLayerSeries(layer, built.series, built.startIdx);
        this.script.state.htfLayers.push({ layer, series: built.series });
      }
    }

    debugFvgInitOk(this.script, layers, this.script.state.cfg);
  }

  /** @param {import("../../pineRuntime.js").BarScriptContext} script */
  onBar() {
    if (this.script.state.skip) return;
    for (const entry of this.script.state.chartLayers) {
      this.onBarLayer(entry.layer, entry.series, entry.startIdx, this.script.index);
    }
    if (this.script.index !== this.script.bars.length - 1) return;
    this.emitAllBoxes();
  }

  /** @param {import("../../pineRuntime.js").BarScriptContext} script @param {{ tfSec: number, tfId: string, label: string }} layer */
  buildLayerSeries(layer) {
    const { chartSec, maxBack } = this.script.state.cfg;
    const overlayCtx = this.script.overlayCtx ?? {};

    if (layer.tfSec <= chartSec) {
      const series = this.script.bars.map((b, i) => ({
        ...b,
        sourceIndex: i,
        startSourceIndex: i,
        chartTime: this.script.chartBars[i]?.time ?? b.time,
        confirmChartTime: this.script.chartBars[i]?.time ?? b.time,
      }));
      return { series, startIdx: Math.max(2, series.length - maxBack) };
    }

    const htf = getSecuritySeries(overlayCtx, undefined, layer.tfId);
    if (htf?.utcBars?.length) {
      const series = mapHtfBarsToSeries(htf);
      return { series, startIdx: Math.max(2, series.length - maxBack) };
    }

    requestSecuritySeries(overlayCtx, undefined, layer.tfId, maxBack);
    const series = aggregateBars(
      this.script.bars,
      layer.tfSec,
      chartSec,
      (_, i) => this.script.chartBars[i]?.time ?? this.script.bars[i].time,
    ).map((b) => ({
      ...b,
      chartTime: this.script.chartBars[b.startSourceIndex]?.time
        ?? mapUtcTimeToChartTime(b.time, this.script.bars, this.script.chartBars),
      confirmChartTime: this.script.chartBars[b.startSourceIndex]?.time
        ?? mapUtcTimeToChartTime(b.time, this.script.bars, this.script.chartBars),
    }));
    return { series, startIdx: Math.max(2, series.length - maxBack) };
  }

  /**
   * @param {(object | null)[]} alignedCompare
   * @param {object[]} chartBars
   * @param {{ tfSec: number, tfId: string, label: string }} layer
   * @param {number} chartSec
   * @param {number} maxBack
   * @param {string} compareSymbol
   */
  buildCompareLayerSeries(alignedCompare, chartBars, layer, chartSec, maxBack, compareSymbol) {
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
      const series = mapHtfBarsToSeries(htf);
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

  /**
   * @param {import("../../pineRuntime.js").BarScriptContext} script
   * @param {{ tfSec: number, tfId: string, label: string }} layer
   * @param {object[]} primarySeries
   * @param {object} zone
   */
  passesCorrelatedFilter(layer, primarySeries, zone) {
    if (!this.script.state.cfg.requireCorrelatedFvg) return true;
    const sel = this.script.state.cfg.correlatedFvgTf ?? "all";
    if (sel !== "all" && !layerMatchesCorrelatedTfSel(sel, layer, this.script.state.cfg.chartSec)) {
      return true;
    }
    const cmpSeries = this.script.state.compareSeriesByLayer?.get(layer.label);
    if (!cmpSeries?.length) return false;
    const confirmBar = primarySeries[zone.confirmIndex];
    const confirmTime = confirmBar?.confirmChartTime ?? confirmBar?.chartTime;
    const cmpKind = compareFvgKindAtConfirmTime(cmpSeries, confirmTime, layer.tfSec);
    return cmpKind != null && cmpKind === zone.kind;
  }

  /**
   * @param {import("../../pineRuntime.js").BarScriptContext} script
   * @param {{ tfSec: number, tfId: string, label: string }} layer
   * @param {object[]} series
   * @param {object[]} active
   * @param {object[]} ifvgActive
   * @param {number} i
   * @param {number} lastBarIdx
   */
  processFvgBar(layer, series, active, ifvgActive, i, lastBarIdx) {
    const { deleteOnFill, fillType, showIfvg, showPartial } = this.script.state.cfg;
    const isFormingBar = i === lastBarIdx;

    for (let z = active.length - 1; z >= 0; z--) {
      const zone = active[z];
      if (showIfvg && !isFormingBar && isIfvgCloseInversion(zone, series[i])) {
        const ifvgZone = {
          ...zone,
          invertIndex: i,
          invertTime: barChartTime(this.script, series[i], i) ?? series[i]?.time,
        };
        ifvgActive.push(ifvgZone);
        debugFvgZoneEvent(layer, ifvgZone, series, i, "ifvg");
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
      if (deleteOnFill) {
        debugFvgZoneEvent(layer, zone, series, i, "deleted");
        active.splice(z, 1);
      } else {
        const filledZone = { ...zone, filled: true, fillIndex: i, partial: false };
        active[z] = filledZone;
        debugFvgZoneEvent(layer, filledZone, series, i, "filled");
      }
    }

    const hit = fvgAtBar(series, i, layer.tfSec);
    if (!hit) return;
    if (isFormingBar) return;

    const zone = zoneFromFvgHit(hit, series, i, this.script);
    if (!zone) return;
    active.push(zone);
    debugFvgZoneEvent(layer, zone, series, i, "new");
  }

  /** @param {import("../../pineRuntime.js").BarScriptContext} script @param {{ tfSec: number, tfId: string, label: string }} layer @param {object[]} series @param {number} startIdx @param {number} barIdx */
  onBarLayer(layer, series, startIdx, barIdx) {
    if (barIdx < startIdx || barIdx >= series.length) return;
    const active = this.script.state.layerActive.get(layer.label) ?? [];
    const ifvgActive = this.script.state.layerIfvg.get(layer.label) ?? [];
    this.processFvgBar(layer, series, active, ifvgActive, barIdx, series.length - 1);
    this.script.state.layerActive.set(layer.label, active);
    this.script.state.layerIfvg.set(layer.label, ifvgActive);
  }

  /** @param {import("../../pineRuntime.js").BarScriptContext} script @param {{ tfSec: number, tfId: string, label: string }} layer @param {object[]} series @param {number} startIdx */
  scanLayerSeries(layer, series, startIdx) {
    const active = [];
    const ifvgActive = [];
    const lastBarIdx = series.length - 1;
    for (let i = startIdx; i < series.length; i++) {
      this.processFvgBar(layer, series, active, ifvgActive, i, lastBarIdx);
    }
    this.script.state.layerActive.set(layer.label, active);
    this.script.state.layerIfvg.set(layer.label, ifvgActive);
  }

  /** @param {import("../../pineRuntime.js").BarScriptContext} script @param {{ tfSec: number, tfId: string, label: string }} layer @param {object} zone @param {object[]} series @param {{ isIfvg?: boolean, layerLabel?: string }} opts */
  emitZoneBox(layer, series, zone, opts = {}) {
    const cfg = this.script.state.cfg;
    const isIfvg = opts.isIfvg === true;
    if (isIfvg && !cfg.showIfvg) return;
    if (!isIfvg && zone.forming && !cfg.showLiveForming) return;
    if (!isIfvg && !zone.forming && !cfg.showFvg) return;

    const confirmBar = series[zone.confirmIndex];
    const confirmTime =
      barChartTime(this.script, confirmBar, zone.confirmIndex) ?? zone.startTime;
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
          barChartTime(this.script, series[zone.fillIndex], zone.fillIndex) ??
          cfg.lastChartTime;
      } else {
        endTime = anchorTime;
        extendRight = true;
      }
    } else {
      endTime = boxEndBase + boxLenSec;
      if (!isIfvg && zone.filled && zone.fillIndex != null) {
        const fillTime = barChartTime(this.script, series[zone.fillIndex], zone.fillIndex);
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
      textColor = this.script.inputs.ifvgBoxColor ?? "#ffff00";
    } else if (zone.forming) {
      fillColor = isBull ? cfg.formingBullFill : cfg.formingBearFill;
      borderColor = fillColor;
      borderWidth = fillColor ? cfg.borderWidth : 0;
      label = opts.layerLabel ?? layer.label;
      textColor = isBull
        ? (this.script.inputs.formingBullColor ?? "#00bcd4")
        : (this.script.inputs.formingBearColor ?? "#ab47bc");
    } else if (zone.partial) {
      fillColor = cfg.partialFill;
      borderColor = cfg.partialFill;
      borderWidth = cfg.partialFill ? cfg.borderWidth : 0;
      label = opts.layerLabel ?? layer.label;
      textColor = this.script.inputs.partialCloseColor ?? "#ff9800";
    } else {
      fillColor = isBull ? cfg.bullFill : cfg.bearFill;
      borderColor = isBull ? cfg.bullBorder : cfg.bearBorder;
      borderWidth = borderColor ? cfg.borderWidth : 0;
      label = opts.layerLabel ?? layer.label;
      textColor = isBull
        ? (this.script.inputs.bullBorderColor ?? "#00e676")
        : (this.script.inputs.bearBorderColor ?? "#f23645");
    }

    const labelTime = extendRight ? startTime + LABEL_DISTANCE_BARS * cfg.chartSec : null;
    const symbolInfo = this.script.overlayCtx?.symbolInfo ?? null;

    if (!isIfvg) {
      const baseName = opts.layerLabel ?? layer.label;
      label = buildFvgBoxLabel(cfg, baseName, zone, symbolInfo);
    }

    const showLabel = cfg.showLabels && Boolean(label && String(label).trim());

    debugFvgDrawBox(layer, zone, series, label, showLabel);

    this.script.drawBox({
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

  /** @param {import("../../pineRuntime.js").BarScriptContext} script */
  emitAllBoxes() {
    const cfg = this.script.state.cfg;
    /** @type {{ layer: object, series: object[], zone: object, sortTime: number }[]} */
    const fvgCandidates = [];
    /** @type {{ layer: object, series: object[], zone: object, sortTime: number }[]} */
    const ifvgCandidates = [];
    const filtered = {
      filled: 0,
      unconfirmed: 0,
      correlated: 0,
      size: 0,
      formingCorrelated: 0,
      formingSize: 0,
      cappedFvg: 0,
      cappedIfvg: 0,
    };

    const allLayers = [
      ...this.script.state.chartLayers.map((e) => ({ layer: e.layer, series: e.series })),
      ...(this.script.state.htfLayers ?? []),
    ];

    for (const { layer, series } of allLayers) {
      const active = this.script.state.layerActive.get(layer.label) ?? [];
      const ifvgActive = this.script.state.layerIfvg.get(layer.label) ?? [];
      const lastIdx = series.length - 1;
      for (const zone of active) {
        if (zone.filled) {
          filtered.filled += 1;
          continue;
        }
        if (zone.confirmIndex === lastIdx) {
          filtered.unconfirmed += 1;
          continue;
        }
        if (!this.passesCorrelatedFilter(layer, series, zone)) {
          filtered.correlated += 1;
          continue;
        }
        if (!fvgZonePassesSizeFilter(zone, cfg.sizeFilterLimits, this.script.overlayCtx?.symbolInfo ?? null)) {
          filtered.size += 1;
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
        const formingZone = hit ? zoneFromFvgHit(hit, series, lastIdx, this.script) : null;
        if (formingZone) {
          formingZone.forming = true;
          if (!this.passesCorrelatedFilter(layer, series, formingZone)) {
            filtered.formingCorrelated += 1;
          } else if (
            !fvgZonePassesSizeFilter(
              formingZone,
              cfg.sizeFilterLimits,
              this.script.overlayCtx?.symbolInfo ?? null,
            )
          ) {
            filtered.formingSize += 1;
          } else {
            fvgCandidates.push({
              layer,
              series,
              zone: formingZone,
              sortTime: zoneConfirmTime(formingZone, series),
            });
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
    filtered.cappedFvg = Math.max(0, fvgCandidates.length - fvgZones.length);
    filtered.cappedIfvg = Math.max(0, ifvgCandidates.length - ifvgZones.length);

    debugFvgEmitResult({
      candidateFvg: fvgCandidates.length,
      candidateIfvg: ifvgCandidates.length,
      drawnFvg: fvgZones.length,
      drawnIfvg: ifvgZones.length,
      filtered,
      fvgZones,
      ifvgZones,
      cfg,
    });

    for (const item of fvgZones) {
      this.emitZoneBox(item.layer, item.series, item.zone, { layerLabel: item.layer.label });
    }
    for (const item of ifvgZones) {
      this.emitZoneBox(item.layer, item.series, item.zone, { isIfvg: true });
    }
  }
}


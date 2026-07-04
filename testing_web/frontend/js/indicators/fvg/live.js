import { getSecuritySeries, mapHtfBarsToSeries } from "/js/indicators/security/htfAccess.js";
import { ensureCompareAligned } from "/js/indicators/security/compareBars.js";
import { overlayGeometryEqual } from "/js/indicators/overlayCache.js";
import { formingBoxesSignature } from "./detect.js";
import { emitAllBoxes } from "./emit.js";
import {
  buildCompareLayerSeries,
  chartBarPoint,
  patchFormingHtfBarFromChart,
  refreshHtfLayersForLive,
  scanLayerSeries,
} from "./layers.js";
import { captureFvgSnapshot, restoreFvgSnapshot } from "./snapshot.js";
import { onBarLayer } from "./zones.js";

/** @param {object} script */
export function refreshCompareSeriesForLive(script) {
  const cfg = script.state.cfg;
  if (!cfg?.requireCorrelatedFvg) return true;

  const ctx = script.overlayCtx ?? {};
  const inputs = script.inputs;
  const minCovered = Math.min(script.bars.length, 3);
  const cmp = ensureCompareAligned(ctx, inputs, script.chartBars, script.bars.length, minCovered);
  if (!cmp.ready) return false;

  const chartSec = cfg.chartSec;
  const maxBack = cfg.maxBack ?? 300;
  const layersByLabel = new Map();
  for (const entry of script.state.chartLayers ?? []) layersByLabel.set(entry.layer.label, entry.layer);
  for (const entry of script.state.htfLayers ?? []) layersByLabel.set(entry.layer.label, entry.layer);

  const compareSeriesByLayer = new Map();
  for (const layer of layersByLabel.values()) {
    const built = buildCompareLayerSeries(
      cmp.aligned,
      script.chartBars,
      layer,
      chartSec,
      maxBack,
      cmp.compare,
    );
    compareSeriesByLayer.set(layer.label, built.series);
  }
  script.state.compareSeriesByLayer = compareSeriesByLayer;
  script.state.compareSymbol = cmp.compare;
  return true;
}

/** @param {object} script @param {object[]} previousBoxes @param {boolean} [silent] */
export function finishIncrementalEmit(script, previousBoxes, silent = true) {
  script.boxes.length = 0;
  emitAllBoxes(script, { silent });
  const boxes = [...script.boxes];
  const nextSnapshot = captureFvgSnapshot(script);
  nextSnapshot.barLen = script.bars.length;

  const prevForming = formingBoxesSignature(previousBoxes);
  const nextForming = formingBoxesSignature(boxes);
  if (prevForming !== nextForming) return { boxes, snapshot: nextSnapshot };
  if (boxes.some((b) => b.isForming)) return { boxes, snapshot: nextSnapshot };
  if (previousBoxes.length && overlayGeometryEqual(previousBoxes, boxes)) {
    return { boxes: previousBoxes, snapshot: nextSnapshot };
  }
  return { boxes, snapshot: nextSnapshot };
}

/** @param {object} script @param {object} snapshot @param {object[]} [previousBoxes] */
export function runLiveTick(script, snapshot, previousBoxes = []) {
  if (snapshot.skip || !snapshot.cfg) return { boxes: [], snapshot };

  restoreFvgSnapshot(script, snapshot);
  const maxBack = snapshot.cfg.maxBack ?? 300;
  script.state.chartLayers = snapshot.chartLayers.map((entry) => {
    const series =
      script.bars.length > 0
        ? script.bars.map((ub, i) => chartBarPoint(script, ub, script.chartBars[i], i))
        : entry.series.map((bar) => (bar ? { ...bar } : bar));
    return { layer: entry.layer, series, startIdx: Math.max(2, series.length - maxBack) };
  });

  if (snapshot.cfg?.requireCorrelatedFvg && !refreshCompareSeriesForLive(script)) return null;

  const lastChartTime = script.chartBars.at(-1)?.time;
  if (lastChartTime != null && script.state.cfg) script.state.cfg.lastChartTime = lastChartTime;

  for (const entry of script.state.chartLayers) {
    const lastIdx = entry.series.length - 1;
    if (lastIdx >= entry.startIdx) onBarLayer(script, entry.layer, entry.series, entry.startIdx, lastIdx);
  }
  refreshHtfLayersForLive(script, snapshot, "tick");
  return finishIncrementalEmit(script, previousBoxes);
}

/** @param {object} script @param {object} snapshot @param {object[]} [previousBoxes] */
export function runAppendBar(script, snapshot, previousBoxes = []) {
  if (snapshot.skip || !snapshot.cfg) return { boxes: [], snapshot };

  const newLen = script.bars.length;
  if (newLen < 2 || newLen !== snapshot.barLen + 1) return null;

  restoreFvgSnapshot(script, snapshot);
  const maxBack = snapshot.cfg.maxBack ?? 300;
  const lastChartTime = script.chartBars.at(-1)?.time;
  if (lastChartTime != null && script.state.cfg) script.state.cfg.lastChartTime = lastChartTime;

  script.state.chartLayers = snapshot.chartLayers.map((entry) => {
    const prevLen = entry.series.length;
    const series = entry.series.map((bar) => (bar ? { ...bar } : bar));
    for (let i = prevLen; i < newLen; i++) {
      const ub = script.bars[i];
      const cb = script.chartBars[i];
      if (ub) series.push(chartBarPoint(script, ub, cb, i));
    }
    const confirmIdx = newLen - 2;
    if (confirmIdx >= 0 && confirmIdx < series.length) {
      const ub = script.bars[confirmIdx];
      const cb = script.chartBars[confirmIdx];
      if (ub) series[confirmIdx] = chartBarPoint(script, ub, cb, confirmIdx);
    }
    return { layer: entry.layer, series, startIdx: Math.max(2, series.length - maxBack) };
  });

  if (snapshot.cfg?.requireCorrelatedFvg && !refreshCompareSeriesForLive(script)) return null;

  for (const entry of script.state.chartLayers) {
    const lastIdx = entry.series.length - 1;
    const confirmIdx = lastIdx - 1;
    if (confirmIdx >= entry.startIdx) onBarLayer(script, entry.layer, entry.series, entry.startIdx, confirmIdx);
    if (lastIdx >= entry.startIdx) onBarLayer(script, entry.layer, entry.series, entry.startIdx, lastIdx);
  }
  refreshHtfLayersForLive(script, snapshot, "append");

  const result = finishIncrementalEmit(script, previousBoxes);
  if (result) result.snapshot.barLen = newLen;
  return result;
}

/** @param {object} script @param {object} snapshot @param {object[]} [previousBoxes] */
export function runHtfRefresh(script, snapshot, previousBoxes = []) {
  if (snapshot.skip || !snapshot.cfg) return { boxes: [], snapshot };

  if (snapshot.barLen != null && snapshot.barLen !== script.bars.length) return null;
  restoreFvgSnapshot(script, snapshot);
  const maxBack = snapshot.cfg.maxBack ?? 300;
  const lastChartTime = script.chartBars.at(-1)?.time;
  if (lastChartTime != null && script.state.cfg) script.state.cfg.lastChartTime = lastChartTime;

  script.state.chartLayers = snapshot.chartLayers.map((entry) => {
    const series = entry.series.map((bar, i) => {
      if (!bar) return bar;
      const ub = script.bars[i];
      const cb = script.chartBars[i];
      return ub ? chartBarPoint(script, ub, cb, i) : { ...bar };
    });
    return { layer: entry.layer, series, startIdx: Math.max(2, series.length - maxBack) };
  });

  if (snapshot.cfg?.requireCorrelatedFvg && !refreshCompareSeriesForLive(script)) return null;

  if (script.overlayCtx?.isReplayLocked?.()) {
    refreshHtfLayersForLive(script, snapshot, "tick");
    return finishIncrementalEmit(script, previousBoxes);
  }

  const newHtfLayers = [];
  for (const entry of snapshot.htfLayers ?? []) {
    const { layer } = entry;
    const htf = getSecuritySeries(script.overlayCtx ?? {}, undefined, layer.tfId);
    if (!htf?.utcBars?.length) {
      newHtfLayers.push({ layer, series: entry.series.map((bar) => (bar ? { ...bar } : bar)) });
      continue;
    }
    const chartSec = snapshot.cfg?.chartSec ?? 60;
    let series = mapHtfBarsToSeries(htf);
    if (layer.tfSec > chartSec) {
      series = patchFormingHtfBarFromChart(script, series, layer, chartSec);
    }
    const startIdx = Math.max(2, series.length - maxBack);
    scanLayerSeries(script, layer, series, startIdx);
    newHtfLayers.push({ layer, series });
  }
  script.state.htfLayers = newHtfLayers;
  return finishIncrementalEmit(script, previousBoxes);
}

import { getHtfBars } from "/js/app/bar/htfBarCache.js";
import { aggregateBars } from "/js/indicators/math/aggregate.js";
import { mapUtcTimeToChartTime } from "/js/indicators/math/barTimeMap.js";
import {
  getSecuritySeries,
  mapHtfBarsToSeries,
  requestSecuritySeries,
  sliceSeriesToAnchor,
} from "/js/indicators/security/htfAccess.js";
import { aggregateReplayFormingBar } from "/js/replay/formingBar.js";
import { fvgAtBar } from "./detect.js";
import { onBarLayer, scanLayerSeries } from "./zones.js";

/** @param {object} script @param {object} ub @param {object} cb @param {number} i */
export function chartBarPoint(script, ub, cb, i) {
  return {
    ...ub,
    sourceIndex: i,
    startSourceIndex: i,
    chartTime: cb?.time ?? ub.time,
    confirmChartTime: cb?.time ?? ub.time,
  };
}

/** @param {object} script @param {{ tfSec: number, tfId: string, label: string }} layer */
export function buildLayerSeries(script, layer) {
  const { chartSec, maxBack } = script.state.cfg;
  const overlayCtx = script.overlayCtx ?? {};
  const replayLocked = overlayCtx.isReplayLocked?.() ?? false;

  if (layer.tfSec <= chartSec) {
    const series = script.bars.map((b, i) => chartBarPoint(script, b, script.chartBars[i], i));
    return { series, startIdx: Math.max(2, series.length - maxBack) };
  }

  if (!replayLocked) {
    const htf = getSecuritySeries(overlayCtx, undefined, layer.tfId);
    if (htf?.utcBars?.length) {
      // The store keeps the forming HTF bucket with its FINAL OHLC (append-only,
      // cursor-blind) — during replay that leaks future highs/lows into detection
      // and draws FVGs that don't exist yet. Rebuild the forming bar from the
      // chart bars actually loaded up to the cursor, same as refreshHtfLayersForLive.
      const series = patchFormingHtfBarFromChart(script, mapHtfBarsToSeries(htf), layer, chartSec);
      return { series, startIdx: Math.max(2, series.length - maxBack) };
    }
    requestSecuritySeries(overlayCtx, undefined, layer.tfId, maxBack);
  }

  const series = aggregateBars(
    script.bars,
    layer.tfSec,
    chartSec,
    (_, i) => script.chartBars[i]?.time ?? script.bars[i].time,
  ).map((b) => ({
    ...b,
    chartTime:
      script.chartBars[b.startSourceIndex]?.time
      ?? mapUtcTimeToChartTime(b.time, script.bars, script.chartBars),
    confirmChartTime:
      script.chartBars[b.startSourceIndex]?.time
      ?? mapUtcTimeToChartTime(b.time, script.bars, script.chartBars),
  }));
  return { series, startIdx: Math.max(2, series.length - maxBack) };
}

/** @param {(object | null)[]} alignedCompare @param {object[]} chartBars @param {{ tfSec: number, tfId: string, label: string }} layer @param {number} chartSec @param {number} maxBack @param {string} compareSymbol */
export function buildCompareLayerSeries(alignedCompare, chartBars, layer, chartSec, maxBack, compareSymbol) {
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

  // Cap the raw compare store at the replay position — it is append-only and
  // cursor-blind; the last non-null aligned bar is the newest bar we may see.
  let lastAlignedUtc = null;
  for (let i = alignedCompare.length - 1; i >= 0; i--) {
    if (alignedCompare[i]?.time != null) {
      lastAlignedUtc = alignedCompare[i].time;
      break;
    }
  }
  const htf = sliceSeriesToAnchor(getHtfBars(compareSymbol, layer.tfId), lastAlignedUtc);
  if (htf?.utcBars?.length) {
    const series = mapHtfBarsToSeries(htf);
    return { series, startIdx: Math.max(2, series.length - maxBack) };
  }

  const packed = [];
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

/** @param {object} script @param {object[]} series @param {{ tfSec: number }} layer @param {number} chartSec */
export function patchFormingHtfBarFromChart(script, series, layer, chartSec) {
  if (!series?.length || !script.bars?.length || layer.tfSec <= chartSec) return series;
  const lastIdx = series.length - 1;
  const htfOpen = series[lastIdx]?.time;
  const chartTail = script.bars.at(-1)?.time;
  if (htfOpen == null || chartTail == null) return series;
  if (chartTail >= htfOpen + layer.tfSec) return series;

  const agg = aggregateReplayFormingBar(script.bars, htfOpen, chartTail);
  if (!agg) return series;

  const out = series.map((bar) => (bar ? { ...bar } : bar));
  const prev = out[lastIdx];
  const startIdx = prev.startSourceIndex ?? prev.sourceIndex ?? lastIdx;
  const confirmIdx = prev.sourceIndex ?? lastIdx;
  out[lastIdx] = {
    ...prev,
    open: agg.open,
    high: agg.high,
    low: agg.low,
    close: agg.close,
    volume: agg.volume,
    time: htfOpen,
    chartTime: prev.chartTime ?? script.chartBars[startIdx]?.time ?? agg.time,
    confirmChartTime: prev.confirmChartTime ?? script.chartBars[confirmIdx]?.time ?? agg.time,
    sourceIndex: confirmIdx,
    startSourceIndex: startIdx,
  };
  return out;
}

/** @param {object} script @param {{ tfSec: number }} layer @param {object[]} series @param {number} lastIdx */
export function formingSeriesForLayer(script, layer, series, lastIdx) {
  const chartSec = script.state.cfg?.chartSec;
  if (chartSec == null || layer.tfSec > chartSec || lastIdx < 0 || series.length !== script.bars.length) {
    return series;
  }
  const ub = script.bars[lastIdx];
  if (!ub) return series;
  const out = series.slice();
  out[lastIdx] = chartBarPoint(script, ub, script.chartBars[lastIdx], lastIdx);
  return out;
}

/** @param {object} script @param {object} snapshot @param {"tick" | "append"} mode */
export function refreshHtfLayersForLive(script, snapshot, mode = "tick") {
  const htfEntries = snapshot.htfLayers;
  if (!htfEntries?.length) return;

  const chartSec = snapshot.cfg?.chartSec ?? script.state.cfg?.chartSec;
  const maxBack = snapshot.cfg?.maxBack ?? 300;
  if (!chartSec) return;

  const overlayCtx = script.overlayCtx ?? {};
  const newHtfLayers = [];
  for (const entry of htfEntries) {
    const { layer } = entry;
    if (layer.tfSec <= chartSec) {
      newHtfLayers.push({
        layer: entry.layer,
        series: entry.series.map((bar) => (bar ? { ...bar } : bar)),
      });
      continue;
    }

    let series;
    const htf = getSecuritySeries(overlayCtx, undefined, layer.tfId);
    if (htf?.utcBars?.length) {
      series = patchFormingHtfBarFromChart(script, mapHtfBarsToSeries(htf), layer, chartSec);
    } else {
      series = aggregateBars(
        script.bars,
        layer.tfSec,
        chartSec,
        (_, i) => script.chartBars[i]?.time ?? script.bars[i].time,
      ).map((b) => ({
        ...b,
        chartTime:
          script.chartBars[b.startSourceIndex]?.time
          ?? mapUtcTimeToChartTime(b.time, script.bars, script.chartBars),
        confirmChartTime:
          script.chartBars[b.startSourceIndex]?.time
          ?? mapUtcTimeToChartTime(b.time, script.bars, script.chartBars),
      }));
    }

    const startIdx = Math.max(2, series.length - maxBack);
    const lastIdx = series.length - 1;
    if (lastIdx >= startIdx) {
      if (mode === "append" && lastIdx >= 1) {
        const confirmIdx = lastIdx - 1;
        if (confirmIdx >= startIdx) onBarLayer(script, layer, series, startIdx, confirmIdx);
      }
      onBarLayer(script, layer, series, startIdx, lastIdx);
    }
    newHtfLayers.push({ layer, series });
  }
  script.state.htfLayers = newHtfLayers;
}

export { scanLayerSeries, fvgAtBar };

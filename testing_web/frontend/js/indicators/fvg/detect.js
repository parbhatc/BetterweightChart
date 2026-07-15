import { resolutionSec } from "/js/chart/resolutions.js";
import { normalizeResolutionId } from "/js/chart/resolutionFormat.js";
import { mapUtcTimeToChartTime } from "/js/indicators/math/barTimeMap.js";

/** @param {object[]} bars @param {number} i confirmation bar (third candle) @param {number} [tfSec] */
export function fvgAtBar(bars, i, tfSec = 900) {
  if (i < 2 || i >= bars.length) return null;
  const b0 = bars[i - 2];
  const b1 = bars[i - 1];
  const b2 = bars[i];
  if (!b0 || !b1 || !b2) return null;
  if (b2.time - b1.time > tfSec) return null;
  // Same adjacency guard on the first pair — a session/weekend gap between b0
  // and b1 (e.g. Friday close → Sunday open) is an opening gap, not a 3-bar FVG.
  if (b1.time - b0.time > tfSec) return null;
  if (b2.low > b0.high) {
    return { kind: "bull", top: b2.low, bottom: b0.high, barIndex: i - 2 };
  }
  if (b2.high < b0.low) {
    return { kind: "bear", top: b0.low, bottom: b2.high, barIndex: i - 2 };
  }
  return null;
}

/** @param {object} script @param {object} bar @param {number} [sourceIndex] */
export function barChartTime(script, bar, sourceIndex) {
  if (bar?.chartTime != null) return bar.chartTime;
  const idx = sourceIndex ?? bar?.startSourceIndex ?? bar?.sourceIndex;
  if (idx != null && script.chartBars[idx]?.time != null) return script.chartBars[idx].time;
  if (bar?.time != null && script.bars?.length && script.chartBars?.length) {
    return mapUtcTimeToChartTime(bar.time, script.bars, script.chartBars);
  }
  return bar?.time ?? null;
}

/** @param {object} hit @param {object[]} series @param {number} confirmIndex @param {object} script */
export function zoneFromFvgHit(hit, series, confirmIndex, script) {
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
export function isIfvgCloseInversion(zone, bar) {
  if (zone.kind === "bull") return bar.close < zone.bottom;
  return bar.close > zone.top;
}

export function isPartialClose(zone, bar) {
  if (zone.kind === "bull") return bar.close < zone.bottom;
  return bar.close > zone.top;
}

/** @param {object} zone @param {object} bar @param {"close"|"wick"} fillType */
export function isFvgFilled(zone, bar, fillType) {
  if (zone.kind === "bull") {
    return fillType === "wick" ? bar.low <= zone.bottom : bar.close <= zone.bottom;
  }
  return fillType === "wick" ? bar.high >= zone.top : bar.close >= zone.top;
}

/** @param {object[]} zones @param {number} max @param {(z: object) => number} timeOf */
export function takeRecentZones(zones, max, timeOf) {
  if (max <= 0 || !zones.length) return [];
  if (zones.length <= max) return zones;
  return zones
    .slice()
    .sort((a, b) => timeOf(a) - timeOf(b))
    .slice(-max);
}

/** @param {object} zone @param {object[]} series */
export function zoneConfirmTime(zone, series) {
  const bar = series[zone.confirmIndex];
  return bar?.confirmChartTime ?? bar?.chartTime ?? zone.startTime;
}

/** @param {object} zone @param {object[]} series */
export function zoneInvertTime(zone, series) {
  const bar = series[zone.invertIndex];
  return bar?.confirmChartTime ?? bar?.chartTime ?? zone.invertTime ?? zone.startTime;
}

/** @param {object[]} compareSeries @param {number} confirmTime @param {number} tfSec */
export function compareFvgKindAtConfirmTime(compareSeries, confirmTime, tfSec) {
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
export function layerMatchesCorrelatedTfSel(sel, layer, chartSec) {
  if (sel === "chart") {
    return layer.tfId === "chart" || layer.tfSec === chartSec;
  }
  const normSel = normalizeResolutionId(sel);
  const normLayer = layer.tfId === "chart" ? "chart" : normalizeResolutionId(layer.tfId);
  if (normLayer === normSel) return true;
  const wantSec = resolutionSec(sel);
  return wantSec != null && layer.tfSec === wantSec;
}

/** @param {object[]} boxes */
export function formingBoxesSignature(boxes) {
  return (
    boxes
      .filter((b) => b.isForming)
      .map((b) => `${b.timeStart}|${b.timeEnd}|${b.priceTop}|${b.priceBottom}|${b.fillColor ?? ""}`)
      .join(";") || "none"
  );
}

import {
  chartDebug,
  chartDebugThrottle,
  isChartDebugEnabled,
} from "/js/debug/chart/index.js";
import { mapUtcTimeToChartTime } from "/js/indicators/math/barTimeMap.js";

let lastOverlaySig = "";
let lastEngineSig = "";
let lastTimeMapSig = "";
let lastPriceWarnSig = "";

/** @param {unknown} sec */
function fmtUnix(sec) {
  if (sec == null || !Number.isFinite(Number(sec))) return String(sec);
  try {
    return `${Number(sec)} (${new Date(Number(sec) * 1000).toISOString()})`;
  } catch {
    return String(sec);
  }
}

/** @param {object[]} bars */
function barSpan(bars) {
  if (!bars?.length) return null;
  const barSec = bars.length >= 2 ? bars[1].time - bars[0].time : null;
  return {
    count: bars.length,
    barSec,
    firstUtc: bars[0].time,
    lastUtc: bars.at(-1).time,
    firstChart: bars[0].chartTime ?? bars[0].time,
    lastChart: bars.at(-1)?.chartTime ?? bars.at(-1)?.time,
  };
}

/**
 * @param {object} ctx
 * @param {object[]} utcBars
 * @param {object[]} chartBars
 * @param {object} opts
 */
export function debugLevelsOverlayStart(ctx, utcBars, chartBars, opts) {
  if (!isChartDebugEnabled()) return;
  const overlaySig = [
    ctx.chartResolution ?? "",
    ctx.barSec ?? "",
    opts.tickSize ?? "",
    utcBars?.length ?? 0,
    utcBars?.at?.(-1)?.time ?? "",
    chartBars?.length ?? 0,
    chartBars?.at?.(-1)?.time ?? "",
    (opts.timeLayers ?? []).filter((r) => r.enabled).map((r) => r.label).join(","),
    (opts.sessionLayers ?? []).filter((r) => r.enabled).map((r) => r.label).join(","),
  ].join("|");
  if (overlaySig === lastOverlaySig) return;
  lastOverlaySig = overlaySig;
  chartDebugThrottle(
    "levels",
    "overlay-input",
    "overlay compute",
    {
      chartResolution: ctx.chartResolution ?? null,
      barSec: ctx.barSec ?? null,
      tickSize: opts.tickSize,
      utcSpan: barSpan(utcBars),
      chartSpan: barSpan(chartBars),
      utcChartAligned: utcBars.length === chartBars.length,
      timeMismatch:
        utcBars.length === chartBars.length
          ? utcBars.reduce((n, b, i) => n + (b.time !== chartBars[i]?.time ? 1 : 0), 0)
          : null,
      timeMismatchNote:
        "Expected when chart uses ET display times — mapping uses aligned utc/chart arrays",
      timeLayers: opts.timeLayers?.filter((r) => r.enabled).map((r) => r.label) ?? [],
      sessionLayers: opts.sessionLayers?.filter((r) => r.enabled).map((r) => r.label) ?? [],
    },
    2000,
  );
}

/**
 * @param {object[]} bars
 * @param {number} anchorUnix
 * @param {object} opts
 * @param {object[]} lines
 * @param {Record<string, { agg: object[] }>} htfState
 */
export function debugLevelsEngineResult(bars, anchorUnix, opts, lines, htfState) {
  if (!isChartDebugEnabled()) return;
  const activeCount = lines.filter((l) => !l.swept).length;
  const sweptCount = lines.filter((l) => l.swept).length;
  const lineSig = lines
    .slice(0, 20)
    .map((l) => `${l.label}:${l.kind}:${l.price}:${l.swept ? 1 : 0}:${l.startTime}:${l.endTime}`)
    .join(";");
  const engineSig = [
    anchorUnix ?? "",
    bars?.length ?? 0,
    lines.length,
    activeCount,
    sweptCount,
    lineSig,
  ].join("|");
  if (engineSig === lastEngineSig) return;
  lastEngineSig = engineSig;

  /** @type {Record<string, { aggBars: number, lastAgg?: object, source?: string }>} */
  const htfSummary = {};
  for (const [slot, state] of Object.entries(htfState ?? {})) {
    const agg = state.agg ?? [];
    htfSummary[slot] = {
      aggBars: agg.length,
      source: state.source,
      lastAgg: agg.at(-1)
        ? {
            time: fmtUnix(agg.at(-1).time),
            o: agg.at(-1).open,
            h: agg.at(-1).high,
            l: agg.at(-1).low,
            c: agg.at(-1).close,
          }
        : null,
    };
  }

  chartDebugThrottle(
    "levels",
    "engine-result",
    "engine lines",
    {
      anchor: fmtUnix(anchorUnix),
      inputBars: barSpan(bars),
      lineCount: lines.length,
      active: activeCount,
      swept: sweptCount,
      htf: htfSummary,
      lines: lines.map((l) => ({
        label: l.label,
        kind: l.kind,
        price: l.price,
        startUtc: fmtUnix(l.startTime),
        endUtc: fmtUnix(l.endTime),
        swept: l.swept,
        sweepUtc: l.sweepTime != null ? fmtUnix(l.sweepTime) : null,
      })),
    },
    2000,
  );
}

/**
 * @param {object[]} rawLines engine output before chart map
 * @param {object[]} overlayLines mapped overlay primitives
 * @param {object[]} utcBars
 * @param {object[]} chartBars
 */
export function debugLevelsTimeMapping(rawLines, overlayLines, utcBars, chartBars) {
  if (!isChartDebugEnabled()) return;

  /** @type {object[]} */
  const mappingIssues = [];
  /** @type {object[]} */
  const bracketed = [];

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    const ov = overlayLines[i];
    if (!raw || !ov) continue;

    const startChart = raw.startChartTime ?? mapUtcTimeToChartTime(raw.startTime, utcBars, chartBars);
    const endUtc = raw.sweepTime ?? raw.endTime ?? raw.startTime;
    const endChart =
      raw.sweepChartTime ??
      raw.endChartTime ??
      mapUtcTimeToChartTime(endUtc, utcBars, chartBars);

    const startOk = ov.timeStart === startChart;
    const endOk = ov.timeEnd === endChart;

    if (!startOk || !endOk) {
      mappingIssues.push({
        label: raw.label,
        startUtc: raw.startTime,
        startChart,
        ovStartChart: ov.timeStart,
        endUtc,
        endChart,
        ovEndChart: ov.timeEnd,
        startOk,
        endOk,
      });
    }

    bracketed.push({
      label: raw.label,
      startUtc: raw.startTime,
      endUtc: raw.endTime,
      startChart: ov.timeStart,
      endChart: ov.timeEnd,
      mappedStart: startChart,
      mappedEnd: endChart,
    });
  }

  const timeMapSig = [
    rawLines.length,
    overlayLines.length,
    mappingIssues.length,
    rawLines[0]?.startTime ?? "",
    rawLines.at?.(-1)?.endTime ?? "",
    overlayLines[0]?.timeStart ?? "",
    overlayLines.at?.(-1)?.timeEnd ?? "",
  ].join("|");
  if (timeMapSig === lastTimeMapSig) return;
  lastTimeMapSig = timeMapSig;

  if (mappingIssues.length) {
    chartDebugThrottle(
      "levels",
      "time-bracket",
      "chart time mapping mismatch",
      {
        count: mappingIssues.length,
        samples: mappingIssues.slice(0, 6),
      },
      3000,
    );
  }

  chartDebugThrottle(
    "levels",
    "time-map",
    "utc → chart mapping",
    {
      rawLines: rawLines.length,
      mappingIssues: mappingIssues.length,
      sample: bracketed.slice(0, 6),
    },
    2000,
  );
}

/**
 * @param {object[]} overlayLines
 * @param {object[]} chartBars
 */
export function debugLevelsPriceSanity(overlayLines, chartBars) {
  if (!isChartDebugEnabled() || !chartBars?.length || !overlayLines?.length) return;

  /** @type {object[]} */
  const suspicious = [];

  for (const line of overlayLines) {
    const t0 = line.timeStart;
    const t1 = line.timeEnd ?? t0;
    const price = line.priceStart;
    if (t0 == null || price == null) continue;

    const label = String(line.label ?? "");
    if (/\b(4H|1H|15m|10m|5m)\b/.test(label) && !label.startsWith("Asia") && !label.startsWith("London")) {
      continue;
    }

    let lo = 0;
    let hi = chartBars.length - 1;
    let i0 = -1;
    let i1 = -1;
    for (let i = 0; i < chartBars.length; i++) {
      const t = chartBars[i].time;
      if (i0 < 0 && t >= t0) i0 = Math.max(0, i - 1);
      if (t <= t1) i1 = i;
    }
    if (i0 < 0) i0 = 0;
    if (i1 < 0) i1 = chartBars.length - 1;

    let segmentHigh = -Infinity;
    let segmentLow = Infinity;
    for (let i = i0; i <= i1; i++) {
      const b = chartBars[i];
      if (!b) continue;
      segmentHigh = Math.max(segmentHigh, b.high);
      segmentLow = Math.min(segmentLow, b.low);
    }

    const kind = line.kind;
    const tol = 0.5;
    const touches =
      kind === "high"
        ? price <= segmentHigh + tol
        : kind === "low"
          ? price >= segmentLow - tol
          : price >= segmentLow - tol && price <= segmentHigh + tol;

    if (!touches) {
      suspicious.push({
        label: line.label,
        kind,
        price,
        segmentHigh,
        segmentLow,
        startChart: t0,
        endChart: t1,
        barIdx: [i0, i1],
      });
    }
  }

  if (suspicious.length) {
    const warnSig = `${suspicious.length}|${suspicious
      .slice(0, 5)
      .map((s) => `${s.label}:${s.kind}:${s.price}:${s.startChart}:${s.endChart}`)
      .join(";")}`;
    if (warnSig === lastPriceWarnSig) return;
    lastPriceWarnSig = warnSig;
    chartDebug("levels", "price sanity WARN — level price outside segment H/L", {
      count: suspicious.length,
      samples: suspicious.slice(0, 10),
    });
  }
}

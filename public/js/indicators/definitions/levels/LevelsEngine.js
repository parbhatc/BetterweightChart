import { normalizeResolutionId, resolutionDisplayTitle } from "../../../chart/resolutionFormat.js";
import { resolutionSec } from "../../../chart/resolutions.js";
import { mapUtcTimeToChartTime } from "../../math/barTimeMap.js";
import { getSecuritySeries, requestSecuritySeries } from "../../security/htfAccess.js";
import {
  resolveSessionLevels,
  resolveTimeLevels,
} from "../../ui/levelsLayersPanel.js";
import {
  debugLevelsEngineResult,
  debugLevelsOverlayStart,
  debugLevelsPriceSanity,
  debugLevelsTimeMapping,
} from "../../math/levelsDebug.js";
import { tickSizeFromSymbol } from "../../symbol.js";
import { inputColorStr } from "../../styleColor.js";
import { levelsHtfStyles } from "./htfStyles.js";
import { levelsSessionDefs } from "./sessionDefs.js";

const ET_ZONE = "America/New_York";

/** @typedef {{ enabled: boolean, label: string, layer: string }} LevelLayerRow */
/** @typedef {{ price: number; startTime: number; endTime: number; bornTime?: number; startChartTime?: number; endChartTime?: number; sweepChartTime?: number; label: string; color: string; lineWidth: number; kind: "high"|"low"; swept: boolean; sweepTime?: number; showLabel?: boolean; sessionBorn?: number; _drop?: boolean }} LiqLine */

const etFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: ET_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** @param {number} unixSec */
function etParts(unixSec) {
  /** @type {{ y: number, m: number, d: number, h: number, min: number, ymd: string, hm: string, mod: number }} */
  const out = { y: 0, m: 0, d: 0, h: 0, min: 0, ymd: "", hm: "", mod: 0 };
  for (const part of etFmt.formatToParts(new Date(unixSec * 1000))) {
    if (part.type === "year") out.y = Number(part.value);
    if (part.type === "month") out.m = Number(part.value);
    if (part.type === "day") out.d = Number(part.value);
    if (part.type === "hour") out.h = Number(part.value === "24" ? 0 : part.value);
    if (part.type === "minute") out.min = Number(part.value);
  }
  out.ymd = `${String(out.y).padStart(4, "0")}-${String(out.m).padStart(2, "0")}-${String(out.d).padStart(2, "0")}`;
  out.hm = `${String(out.h).padStart(2, "0")}:${String(out.min).padStart(2, "0")}`;
  out.mod = out.h * 60 + out.min;
  return out;
}

/**
 * @param {{ startH: number; startM: number; endH: number; endM: number; crossesMidnight: boolean }} cfg
 * @param {number} unix
 */
function inSession(unix, cfg) {
  const { mod } = etParts(unix);
  const start = cfg.startH * 60 + cfg.startM;
  const end = cfg.endH * 60 + cfg.endM;
  if (cfg.crossesMidnight) return mod >= start || mod < end;
  return mod >= start && mod < end;
}

/** @returns {{ active: LiqLine[]; swept: LiqLine[] }} */
function createMatrix() {
  return { active: [], swept: [] };
}

/** @param {LiqLine} lvl @param {number} utc @param {number} [chartTime] */
function markSwept(lvl, utc, chartTime) {
  lvl.swept = true;
  lvl.sweepTime = utc;
  lvl.endTime = utc;
  if (chartTime != null) {
    lvl.sweepChartTime = chartTime;
    lvl.endChartTime = chartTime;
  }
}

/**
 * @param {{ active: LiqLine[]; swept: LiqLine[] }} matrix
 * @param {LiqLine} level
 * @param {number} maxUnswept
 * @param {number} proximity
 */
function birthLevel(matrix, level, maxUnswept, proximity) {
  const last = matrix.active[matrix.active.length - 1];
  if (last && Math.abs(last.price - level.price) <= proximity) return null;
  matrix.active.push({ ...level, swept: false });
  while (matrix.active.length > maxUnswept) matrix.active.shift();
  return matrix.active[matrix.active.length - 1];
}

/** @param {LiqLine} lvl */
function levelBornTime(lvl) {
  return lvl.bornTime ?? lvl.endTime ?? lvl.startTime;
}

/** @param {object} bar @param {"high"|"low"} kind @param {number} price */
function barSweepsLevel(bar, kind, price) {
  return kind === "high" ? bar.high > price : bar.low < price;
}

/**
 * HTF pivots confirm late — only sweep bars after the level is born (HTF close), not pivot open.
 * @param {{ active: LiqLine[]; swept: LiqLine[] }} matrix
 * @param {LiqLine | null} lvl
 * @param {object[]} bars
 * @param {object[]} chartBars
 * @param {number} toBarIndex
 * @param {number} maxSwept
 */
function retroactiveSweep(matrix, lvl, bars, chartBars, toBarIndex, maxSwept) {
  if (!lvl || lvl.swept || toBarIndex < 0) return;
  const born = levelBornTime(lvl);
  const fromIdx = firstBarIndexAtOrAfter(bars, born + 1);
  for (let j = fromIdx; j <= toBarIndex; j++) {
    const b = bars[j];
    if (!b || b.time <= born) continue;
    const chartTime = chartBars[j]?.time ?? b.time;
    if (!barSweepsLevel(b, lvl.kind, lvl.price)) continue;
    markSwept(lvl, b.time, chartTime);
    const idx = matrix.active.indexOf(lvl);
    if (idx >= 0) {
      const moved = matrix.active.splice(idx, 1)[0];
      matrix.swept.push(moved);
      while (maxSwept > 0 && matrix.swept.length > maxSwept) matrix.swept.shift();
    }
    return;
  }
}

/**
 * @param {{ active: LiqLine[]; swept: LiqLine[] }} matrix
 * @param {object} bar
 * @param {number} chartTime
 * @param {"high"|"low"} kind
 * @param {number} maxSwept
 */
function sweepMatrix(matrix, bar, chartTime, kind, maxSwept) {
  for (let i = matrix.active.length - 1; i >= 0; i--) {
    const lvl = matrix.active[i];
    if (lvl.kind !== kind) continue;
    if (bar.time <= levelBornTime(lvl)) continue;
    if (!barSweepsLevel(bar, kind, lvl.price)) continue;
    markSwept(lvl, bar.time, chartTime);
    const moved = matrix.active.splice(i, 1)[0];
    matrix.swept.push(moved);
    while (maxSwept > 0 && matrix.swept.length > maxSwept) matrix.swept.shift();
  }
}

/** @param {{ active: LiqLine[]; swept: LiqLine[] }} matrix @param {number} utc @param {number} chartTime */
function extendMatrix(matrix, utc, chartTime) {
  for (const lvl of matrix.active) {
    lvl.endTime = utc;
    lvl.endChartTime = chartTime;
  }
}

/** @param {number} bucketOpen @param {number} tfSec */
function htfBucketCompleteAt(bucketOpen, tfSec) {
  return bucketOpen + tfSec - 60;
}

/**
 * @param {object[]} agg
 * @param {number} idx
 * @param {{ h: number[]; l: number[]; t: number[] }} hist
 * @param {{ active: LiqLine[]; swept: LiqLine[] }} matrixH
 * @param {{ active: LiqLine[]; swept: LiqLine[] }} matrixL
 * @param {{ label: string; hiColor: string; loColor: string }} cfg
 * @param {number} endTime UTC bar time when HTF bucket confirmed
 * @param {number} endChartTime chart display time for extension
 * @param {number} maxUnswept
 * @param {number} proximity
 * @param {boolean} showLabels
 * @param {number} pivotLeft
 * @param {number} pivotRight
 * @param {(number | undefined)[]} chartTimes parallel chart times for agg bars
 * @param {object[]} bars chart UTC bars
 * @param {object[]} chartBars aligned chart bars
 * @param {number} barIndex current bar index in chart walk
 * @param {number} maxSwept
 */
function onHtfBarClose(
  agg,
  idx,
  hist,
  matrixH,
  matrixL,
  cfg,
  endTime,
  endChartTime,
  maxUnswept,
  proximity,
  showLabels,
  pivotLeft,
  pivotRight,
  chartTimes,
  bars,
  chartBars,
  barIndex,
  maxSwept,
) {
  const c = agg[idx];
  hist.h.push(c.high);
  hist.l.push(c.low);
  hist.t.push(c.time);
  const window = pivotLeft + pivotRight + 1;
  while (hist.h.length > window) {
    hist.h.shift();
    hist.l.shift();
    hist.t.shift();
  }
  if (hist.h.length < window) return;

  const p = pivotLeft;
  const pivotAggIdx = idx - pivotRight;
  const startChartTime =
    pivotAggIdx >= 0 ? chartTimes[pivotAggIdx] : chartTimes[idx];
  let isHigh = true;
  let isLow = true;
  for (let j = 0; j < window; j++) {
    if (j === p) continue;
    if (hist.h[j] >= hist.h[p]) isHigh = false;
    if (hist.l[j] <= hist.l[p]) isLow = false;
  }

  if (isHigh) {
    const born = birthLevel(
      matrixH,
      {
        price: hist.h[p],
        startTime: hist.t[p],
        startChartTime,
        bornTime: endTime,
        endTime,
        endChartTime,
        label: `${cfg.label} High`,
        color: cfg.hiColor,
        lineWidth: 2,
        kind: "high",
        swept: false,
        showLabel: showLabels,
      },
      maxUnswept,
      proximity,
    );
    retroactiveSweep(matrixH, born, bars, chartBars, barIndex, maxSwept);
  }
  if (isLow) {
    const born = birthLevel(
      matrixL,
      {
        price: hist.l[p],
        startTime: hist.t[p],
        startChartTime,
        bornTime: endTime,
        endTime,
        endChartTime,
        label: `${cfg.label} Low`,
        color: cfg.loColor,
        lineWidth: 2,
        kind: "low",
        swept: false,
        showLabel: showLabels,
      },
      maxUnswept,
      proximity,
    );
    retroactiveSweep(matrixL, born, bars, chartBars, barIndex, maxSwept);
  }
}

const SESSION_TAG_ORDER = ["Asia", "London", "New York AM", "New York Lunch", "New York PM"];
const TF_TAG_ORDER = ["4H", "1H", "15m", "10m", "5m"];

/** @param {string} label */
function parseLevelTags(label) {
  const base = label.split(" (")[0].replace(/\s+(High|Low)$/i, "").trim();
  return base.split(/\s*(?:&|\+)\s*/).map((s) => s.trim()).filter(Boolean);
}

/** @param {Set<string>} tags @param {"High"|"Low"} side */
function formatMergedTags(tags, side) {
  const ordered = [...tags].sort((a, b) => {
    const ai = SESSION_TAG_ORDER.indexOf(a);
    const bi = SESSION_TAG_ORDER.indexOf(b);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    const ti = TF_TAG_ORDER.indexOf(a);
    const tj = TF_TAG_ORDER.indexOf(b);
    return (ti >= 0 ? ti : 99) - (tj >= 0 ? tj : 99) || a.localeCompare(b);
  });
  return `${ordered.join(" & ")} ${side}`;
}

/** @param {LiqLine[]} lines @param {number} proximity @param {string} confHi @param {string} confLo */
function applyClusterConfluence(lines, proximity, confHi, confLo) {
  const n = lines.length;
  const parent = Array.from({ length: n }, (_, i) => i);

  function find(i) {
    let r = i;
    while (parent[r] !== r) {
      parent[r] = parent[parent[r]];
      r = parent[r];
    }
    return r;
  }
  function unite(a, b) {
    parent[find(a)] = find(b);
  }

  for (let i = 0; i < n; i++) {
    if (lines[i]._drop) continue;
    for (let j = i + 1; j < n; j++) {
      if (lines[j]._drop) continue;
      if (lines[i].kind !== lines[j].kind) continue;
      if (Math.abs(lines[i].price - lines[j].price) <= proximity) unite(i, j);
    }
  }

  /** @type {Map<number, LiqLine[]>} */
  const groups = new Map();
  for (let i = 0; i < n; i++) {
    if (lines[i]._drop) continue;
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(lines[i]);
  }

  for (const group of groups.values()) {
    if (group.length <= 1) continue;
    const tags = new Set();
    for (const l of group) {
      for (const t of parseLevelTags(l.label)) tags.add(t);
    }
    const side = group[0].kind === "high" ? "High" : "Low";
    const confColor = group[0].kind === "high" ? confHi : confLo;
    let survivor = group.find((l) => !l.swept) ?? group[0];
    for (const l of group) {
      if (l.endTime > survivor.endTime) {
        survivor.endTime = l.endTime;
        survivor.endChartTime = l.endChartTime;
      }
      if (l.startTime < survivor.startTime) {
        survivor.startTime = l.startTime;
        survivor.startChartTime = l.startChartTime;
      }
    }
    survivor.label = formatMergedTags(tags, side);
    survivor.color = confColor;
    survivor.lineWidth = 3;
    if (group.every((l) => l.swept)) {
      const times = group.map((l) => l.sweepTime ?? l.endTime).filter((t) => t != null);
      const chartTimes = group.map((l) => l.sweepChartTime ?? l.endChartTime).filter((t) => t != null);
      if (times.length) {
        survivor.swept = true;
        survivor.sweepTime = Math.max(...times);
        survivor.endTime = survivor.sweepTime;
        if (chartTimes.length) {
          survivor.sweepChartTime = Math.max(...chartTimes);
          survivor.endChartTime = survivor.sweepChartTime;
        }
      }
    } else {
      survivor.swept = false;
      survivor.sweepTime = undefined;
      survivor.sweepChartTime = undefined;
    }
    for (const l of group) {
      if (l !== survivor) l._drop = true;
    }
  }
  return lines.filter((l) => !l._drop);
}

/**
 * @param {LevelLayerRow[]} timeRows
 * @param {import("../../ui/levelsLayersPanel.js").SessionLevelRow[]} sessionRows
 * @param {{ htfStyles?: Record<string, { tag?: string; hi: string; lo: string }>; sessionDefs?: Record<string, { label: string; startH: number; startM: number; endH: number; endM: number; crossesMidnight: boolean; color: string }> }} [palette]
 */
export function buildLevelsEngineConfig(timeRows, sessionRows, palette = {}) {
  const htfStyles = palette.htfStyles ?? {};
  const sessionDefs = palette.sessionDefs ?? {};
  /** @type {{ slot: string; label: string; tfSec: number; hiColor: string; loColor: string }[]} */
  const htf = [];
  /** @type {{ label: string; color: string; startH: number; startM: number; endH: number; endM: number; crossesMidnight: boolean }[]} */
  const sessions = [];
  const seenHtf = new Set();
  const seenSession = new Set();

  for (const row of timeRows ?? []) {
    if (!row.enabled) continue;
    const layer = String(row.layer ?? "").trim();
    const label = String(row.label ?? "").trim();
    if (!layer || !label) continue;

    const tfId = normalizeResolutionId(layer);
    const tfSec = resolutionSec(tfId);
    if (!tfSec || seenHtf.has(tfId)) continue;
    seenHtf.add(tfId);
    const style = htfStyles[tfId] ?? levelsHtfStyles.resolve(tfId);
    htf.push({
      slot: `htf_${tfId}`,
      tfId,
      label: label || style.tag,
      tfSec,
      hiColor: style.hi,
      loColor: style.lo,
    });
  }

  for (const row of sessionRows ?? []) {
    if (!row.enabled) continue;
    const label = String(row.label ?? "").trim();
    if (!label) continue;
    const sid = String(row.sessionId ?? "asia").trim();
    if (seenSession.has(label)) continue;
    seenSession.add(label);
    const cfg = sessionConfigFromRow(row, sessionDefs);
    if (!cfg) continue;
    sessions.push({ ...cfg, label });
  }
  return { htf, sessions };
}

/** @param {{ sessionId?: string, startTime?: string, endTime?: string, label?: string }} row @param {Record<string, { label: string; startH: number; startM: number; endH: number; endM: number; crossesMidnight: boolean; color: string }>} [sessionDefs] */
export function sessionConfigFromRow(row, sessionDefs = {}) {
  const sid = resolveSessionIdFromRow(row, sessionDefs);
  const def = sessionDefs[sid];
  const start = parseHm(row.startTime) ?? (def ? { h: def.startH, min: def.startM } : null);
  const end = parseHm(row.endTime) ?? (def ? { h: def.endH, min: def.endM } : null);
  if (!start || !end) return null;
  const startMod = start.h * 60 + start.min;
  const endMod = end.h * 60 + end.min;
  return {
    label: row.label || def?.label || "Session",
    startH: start.h,
    startM: start.min,
    endH: end.h,
    endM: end.min,
    crossesMidnight: endMod <= startMod,
    color: def?.color ?? "#00ffcc",
  };
}

/** @param {{ sessionId?: string, label?: string }} row @param {Record<string, { label: string }>} [sessionDefs] */
function resolveSessionIdFromRow(row, sessionDefs = {}) {
  const sid = String(row.sessionId ?? "").trim();
  if (sid && sessionDefs[sid]) return sid;
  const label = String(row.label ?? "").trim();
  for (const [id, def] of Object.entries(sessionDefs)) {
    if (def.label === label) return id;
  }
  return sid || "asia";
}

/** @param {unknown} raw */
function parseHm(raw) {
  const m = String(raw ?? "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return { h, min };
}

/**
 * Resolve HTF OHLC series — native datafeed bars when available (same as FVG).
 * @param {object} cfg
 * @param {object[]} chartUtcBars 1m (or chart) UTC bars
 * @param {object[]} chartBars aligned chart times
 * @param {object} opts
 */
function resolveHtfAggSeries(cfg, chartUtcBars, chartBars, opts) {
  const chartSec = Math.max(60, Number(opts.chartSec) || 60);
  const maxBack = Math.max(10, Number(opts.maxBarsBack) || 300);
  const pivotLeft = Math.max(1, Number(opts.pivotLeftBars) || 1);
  const pivotRight = Math.max(1, Number(opts.pivotRightBars) || 1);
  const visStart = chartUtcBars[0]?.time;
  /** @param {object[]} series @param {(number | undefined)[]} times */
  const trimToWindow = (series, times) => {
    let agg = series.length > maxBack ? series.slice(-maxBack) : series;
    let chartTimes =
      times.length > maxBack ? times.slice(-maxBack) : times;
    if (visStart != null) {
      const buf = (pivotLeft + pivotRight) * cfg.tfSec;
      const cut = agg.findIndex((b) => b.time + cfg.tfSec >= visStart - buf);
      if (cut > 0) {
        agg = agg.slice(cut);
        chartTimes = chartTimes.slice(cut);
      }
    }
    return { agg, chartTimes };
  };

  if (cfg.tfSec <= chartSec) {
    const chartTimes = chartBars.map((b) => b.time);
    const { agg, chartTimes: times } = trimToWindow(chartUtcBars, chartTimes);
    return { agg, chartTimes: times, source: "chart" };
  }

  const htf = getSecuritySeries(opts, opts.symbol, cfg.tfId);
  if (htf?.utcBars?.length) {
    const offset = Math.max(0, htf.utcBars.length - maxBack);
    const sliceStart = htf.utcBars.length > maxBack ? offset : 0;
    const series = htf.utcBars.slice(sliceStart);
    const times = series.map((_, i) => htf.chartBars[sliceStart + i]?.time);
    const { agg, chartTimes } = trimToWindow(series, times);
    return { agg, chartTimes, source: "htf" };
  }

  requestSecuritySeries(opts, opts.symbol, cfg.tfId, opts.htfBarsNeeded ?? maxBack);
  return { agg: [], chartTimes: [], source: "pending" };
}

/** @param {object[]} bars @param {number} t */
function firstBarIndexAtOrAfter(bars, t) {
  let lo = 0;
  let hi = bars.length - 1;
  let out = bars.length;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].time >= t) {
      out = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return out;
}

/**
 * @param {object[]} bars — UTC OHLC bars (chart resolution, usually 1m)
 * @param {number} anchorUnix
 * @param {object} opts
 * @returns {{ lines: LiqLine[], htfState: Record<string, { agg: object[], ptr: number }> }}
 */
export function runLevelsEngine(bars, anchorUnix, opts) {
  if (!bars.length || anchorUnix == null) return { lines: [], htfState: {} };

  let endIdx = -1;
  let lo = 0;
  let hi = bars.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].time <= anchorUnix) {
      endIdx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (endIdx < 19) return { lines: [], htfState: {} };

  const pivotLeft = Math.max(1, Number(opts.pivotLeftBars) || 1);
  const pivotRight = Math.max(1, Number(opts.pivotRightBars) || 1);
  const maxBarsBack = Math.max(10, Number(opts.maxBarsBack) || 300);
  const maxUnswept = Math.max(1, Number(opts.maxUnswept) || 15);
  const maxSwept = Math.max(0, Number(opts.maxSwept) || 5);
  const maxSessions = Math.max(1, Number(opts.maxSessions) || 3);
  const proximity = (Number(opts.tickSize) || 0.25) * 6;
  const showLabels = opts.showLabels !== false;
  const confHi = String(opts.confHiColor ?? "#9400d3");
  const confLo = String(opts.confLoColor ?? "#ffaa00");
  const mergeConfluence = opts.mergeConfluence !== false;

  const { htf, sessions } = buildLevelsEngineConfig(opts.timeLayers ?? [], opts.sessionLayers ?? [], {
    htfStyles: opts.htfStyles,
    sessionDefs: opts.sessionDefs,
  });

  /** @type {Record<string, { h: number[]; l: number[]; t: number[] }>} */
  const hists = {};
  /** @type {Record<string, { active: LiqLine[]; swept: LiqLine[] }>} */
  const matrices = {};
  /** @type {Record<string, { agg: object[]; chartTimes: (number | undefined)[]; ptr: number; source: string }>} */
  const htfState = {};

  for (const cfg of htf) {
    hists[cfg.slot] = { h: [], l: [], t: [] };
    matrices[`${cfg.slot}H`] = createMatrix();
    matrices[`${cfg.slot}L`] = createMatrix();
    const { agg, chartTimes, source } = resolveHtfAggSeries(
      cfg,
      bars,
      opts.chartBars ?? bars,
      { ...opts, pivotLeftBars: pivotLeft, pivotRightBars: pivotRight },
    );
    htfState[cfg.slot] = { agg, chartTimes, ptr: 1, source };
  }

  /** @type {LiqLine[]} */
  const sessionLines = [];
  /** @type {Record<string, { active: boolean; hi?: LiqLine; lo?: LiqLine; born?: number }>} */
  const sessState = {};
  /** @type {Record<string, number[]>} */
  const sessBornTimes = {};
  for (const cfg of sessions) {
    sessState[cfg.label] = { active: false };
    sessBornTimes[cfg.label] = [];
  }

  let startIdx = 19;
  for (const cfg of htf) {
    const first = htfState[cfg.slot]?.agg?.[0]?.time;
    if (first == null) continue;
    const pivotBuf = (pivotLeft + pivotRight) * cfg.tfSec;
    startIdx = Math.max(startIdx, firstBarIndexAtOrAfter(bars, first - pivotBuf));
  }
  if (sessions.length) {
    startIdx = Math.max(startIdx, Math.max(19, endIdx - maxBarsBack + 1));
  }
  if (startIdx > endIdx) return { lines: [], htfState };

  const chartBars = opts.chartBars ?? bars;

  for (let i = startIdx; i <= endIdx; i++) {
    const bar = bars[i];
    const chartTime = chartBars[i]?.time ?? bar.time;

    for (const cfg of htf) {
      const state = htfState[cfg.slot];
      if (!state.agg.length) continue;
      const tfSec = cfg.tfSec;
      let { ptr } = state;
      const { agg, chartTimes } = state;
      while (ptr <= agg.length) {
        const closeIdx = ptr - 1;
        if (closeIdx < 0) {
          ptr = 1;
          continue;
        }
        if (closeIdx >= agg.length) break;
        if (bar.time < htfBucketCompleteAt(agg[closeIdx].time, tfSec)) break;
        onHtfBarClose(
          agg,
          closeIdx,
          hists[cfg.slot],
          matrices[`${cfg.slot}H`],
          matrices[`${cfg.slot}L`],
          cfg,
          bar.time,
          chartTime,
          maxUnswept,
          proximity,
          showLabels,
          pivotLeft,
          pivotRight,
          chartTimes,
          bars,
          chartBars,
          i,
          maxSwept,
        );
        ptr += 1;
      }
      state.ptr = ptr;
    }

    for (const key of Object.keys(matrices)) {
      const m = matrices[key];
      sweepMatrix(m, bar, chartTime, key.endsWith("H") ? "high" : "low", maxSwept);
      extendMatrix(m, bar.time, chartTime);
    }

    for (const cfg of sessions) {
      const st = sessState[cfg.label];
      const nowIn = inSession(bar.time, cfg);
      if (nowIn && !st.active) {
        const born = bar.time;
        const bornList = sessBornTimes[cfg.label];
        bornList.push(born);
        while (bornList.length > maxSessions) {
          const dropBorn = bornList.shift();
          for (let k = sessionLines.length - 1; k >= 0; k--) {
            if (sessionLines[k].sessionBorn === dropBorn && sessionLines[k].label.startsWith(cfg.label)) {
              sessionLines.splice(k, 1);
            }
          }
        }
        st.active = true;
        st.born = born;
        st.hi = {
          price: bar.high,
          startTime: bar.time,
          startChartTime: chartTime,
          bornTime: bar.time,
          endTime: bar.time,
          endChartTime: chartTime,
          label: `${cfg.label} High`,
          color: cfg.color,
          lineWidth: 2,
          kind: "high",
          swept: false,
          sessionBorn: born,
          showLabel: showLabels,
        };
        st.lo = {
          price: bar.low,
          startTime: bar.time,
          startChartTime: chartTime,
          bornTime: bar.time,
          endTime: bar.time,
          endChartTime: chartTime,
          label: `${cfg.label} Low`,
          color: cfg.color,
          lineWidth: 2,
          kind: "low",
          swept: false,
          sessionBorn: born,
          showLabel: showLabels,
        };
        sessionLines.push(st.hi, st.lo);
      } else if (nowIn && st.active && st.hi && st.lo) {
        if (bar.high >= st.hi.price) {
          st.hi.price = bar.high;
          st.hi.startTime = bar.time;
          st.hi.startChartTime = chartTime;
        }
        if (bar.low <= st.lo.price) {
          st.lo.price = bar.low;
          st.lo.startTime = bar.time;
          st.lo.startChartTime = chartTime;
        }
      } else if (!nowIn && st.active) {
        st.active = false;
      }
    }

    for (const sl of sessionLines) {
      if (sl.swept) continue;
      const cfg = sessions.find((c) => sl.label.startsWith(c.label));
      const inOwnSession = cfg ? inSession(bar.time, cfg) : false;
      if (!inOwnSession && bar.time > levelBornTime(sl)) {
        if (barSweepsLevel(bar, sl.kind, sl.price)) {
          markSwept(sl, bar.time, chartTime);
          continue;
        }
      }
      sl.endTime = bar.time;
      sl.endChartTime = chartTime;
    }
  }

  for (const m of Object.values(matrices)) {
    for (const lvl of [...m.active]) {
      retroactiveSweep(m, lvl, bars, chartBars, endIdx, maxSwept);
    }
  }

  /** @type {LiqLine[]} */
  let out = [];
  for (const m of Object.values(matrices)) {
    out.push(...m.active, ...m.swept);
  }
  out.push(...sessionLines.filter((l) => !l._drop));

  if (mergeConfluence) {
    out = applyClusterConfluence(out, proximity, confHi, confLo);
  }

  const visStart = bars[0].time;
  const visEnd = bars[endIdx].time;
  out = out.filter(
    (l) => (l.endTime ?? l.startTime) >= visStart && l.startTime <= visEnd,
  );

  for (const lvl of out) {
    if (lvl.swept && lvl.sweepTime != null) {
      lvl.endTime = lvl.sweepTime;
      if (lvl.sweepChartTime != null) lvl.endChartTime = lvl.sweepChartTime;
    }
    if (!showLabels || lvl.showLabel === false) {
      lvl.label = "";
    } else if (lvl.label && !lvl.label.includes("(")) {
      lvl.label = `${lvl.label} (${Number(lvl.price).toFixed(2)})`;
    }
  }

  return { lines: out, htfState };
}

/**
 * @param {LiqLine[]} lines
 * @param {object[]} utcBars
 * @param {object[]} chartBars
 * @param {object} style
 */
export function levelsToOverlayLines(lines, utcBars, chartBars, style) {
  const showLabels = style.graphicLabels !== false;

  const mapTime = (utc, chartTime) =>
    chartTime ?? mapUtcTimeToChartTime(utc, utcBars, chartBars);

  return lines.map((lvl) => ({
    timeStart: mapTime(lvl.startTime, lvl.startChartTime),
    timeEnd: mapTime(
      lvl.endTime ?? lvl.startTime,
      lvl.endChartTime ?? lvl.sweepChartTime ?? lvl.startChartTime,
    ),
    priceStart: lvl.price,
    priceEnd: lvl.price,
    color: lvl.color,
    width: lvl.lineWidth ?? 2,
    swept: Boolean(lvl.swept),
    dash: lvl.swept ? [2, 3] : [],
    label: showLabels && lvl.label ? lvl.label : "",
    labelTextColor: lvl.color,
    labelAnchor: "right",
    kind: lvl.kind,
  }));
}

export class LevelsEngine {
  /**
   * @param {LevelsHtfStyles} [htfStyles]
   * @param {LevelsSessionDefs} [sessionDefs]
   */
  constructor(htfStyles = levelsHtfStyles, sessionDefs = levelsSessionDefs) {
    this.htfStyles = htfStyles;
    this.sessionDefs = sessionDefs;
  }

  /**
   * @param {object[]} bars
   * @param {number} anchorUnix
   * @param {object} opts
   */
  run(bars, anchorUnix, opts) {
    return runLevelsEngine(bars, anchorUnix, {
      ...opts,
      htfStyles: opts.htfStyles ?? this.htfStyles.all(),
      sessionDefs: opts.sessionDefs ?? this.sessionDefs.all(),
    });
  }

  /**
   * @param {LiqLine[]} lines
   * @param {object[]} utcBars
   * @param {object[]} chartBars
   * @param {object} style
   */
  toOverlayLines(lines, utcBars, chartBars, style) {
    return levelsToOverlayLines(lines, utcBars, chartBars, style);
  }

  /**
   * @param {object[]} utcBars
   * @param {object[]} chartBars
   * @param {object} inputs
   * @param {object} style
   * @param {object} [ctx]
   * @param {import("./htf.js").LevelsHtf} [levelsHtf]
   */
  computeOverlay(utcBars, chartBars, inputs, style, ctx = {}, levelsHtf) {
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
      htfBarsNeeded: levelsHtf?.requiredHtfBars(inputs) ?? Math.max(10, Number(inputs.maxBarsBack) || 300),
      getSecurityBars: ctx.getSecurityBars,
      getBars: ctx.getBars,
      getHtfBars: ctx.getHtfBars,
      requestSecurityBars: ctx.requestSecurityBars,
      requestBars: ctx.requestBars,
      requestHtfBars: ctx.requestHtfBars,
      showLabels: style.graphicLabels !== false,
      mergeConfluence: inputs.mergeConfluence !== false,
      confHiColor: inputColorStr(inputs.confHiColor, "#9400d3"),
      confLoColor: inputColorStr(inputs.confLoColor, "#ffaa00"),
      htfStyles: this.htfStyles.all(),
      sessionDefs: this.sessionDefs.all(),
    };

    debugLevelsOverlayStart(ctx, utcBars, chartBars, engineOpts);

    const { lines, htfState } = this.run(utcBars, anchorUnix, engineOpts);
    debugLevelsEngineResult(utcBars, anchorUnix, engineOpts, lines, htfState);

    const overlay = this.toOverlayLines(lines, utcBars, chartBars, style);
    debugLevelsTimeMapping(lines, overlay, utcBars, chartBars);
    debugLevelsPriceSanity(overlay, chartBars);

    return overlay;
  }
}

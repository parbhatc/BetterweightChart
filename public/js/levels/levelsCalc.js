import { Aggregate } from "../utils/aggregate.js";
import { isConfluenceFresh, filterFreshConfluences } from "../confluence/confluenceFresh.js";
import { ET_ZONE, TF_MAP } from "../core/constants.js";
import { releaseNewsTimeHm } from "../confluence/ppiNews.js";
import {
  pivotLineVisible,
  buildHtfConfigFromSettings,
  sessionConfigsFromSettings,
  defaultPivotLevelsSettings,
} from "./pivotLevelsSettings.js";

/** @typedef {{ price: number; startTime: number; endTime: number; label: string; color: string; lineWidth: number; kind: "high"|"low"; swept: boolean; sweepTime?: number; confluence?: boolean; sessionBorn?: number; showLabel?: boolean; _drop?: boolean }} LiqLine */
/** @typedef {{ label: string; price: number; time: number; kind: "high"|"low"; bias: string; color: string }} HtfSweepEvent */

/** ET wall time for release anchor candle (1m H/L) — from calendar or fallback. */
function releaseCandleTimeHm(opts) {
  if (opts?.releaseCandleHm) return opts.releaseCandleHm;
  if (opts?.calendarEvents?.length) return releaseNewsTimeHm(opts.calendarEvents);
  return releaseNewsTimeHm([]);
}
const PPI_COLOR = "#ff8c00";
const CPI_COLOR = "#6366f1";
const NFP_COLOR = "#22c55e";
const GDP_COLOR = "#ec4899";

/** @param {"ppi"|"cpi"|"nfp"|"gdp"|null|undefined} kind */
function releaseMetaFromKind(kind) {
  switch (kind) {
    case "cpi":
      return { prefix: "CPI", color: CPI_COLOR };
    case "nfp":
      return { prefix: "NFP", color: NFP_COLOR };
    case "gdp":
      return { prefix: "GDP", color: GDP_COLOR };
    case "ppi":
    default:
      return { prefix: "PPI", color: PPI_COLOR };
  }
}

/**
 * @param {{ time: number }[]} bars sorted asc
 * @param {number} anchorUnix
 * @returns {number} last index with bar.time <= anchorUnix, or -1
 */
function indexBarsThroughAnchorFn(bars, anchorUnix) {
  if (!bars.length || anchorUnix == null) return -1;
  let lo = 0;
  let hi = bars.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].time <= anchorUnix) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

/**
 * @param {{ time: number }[]} bars sorted asc
 * @param {number} anchorUnix
 */
function sliceBarsThroughAnchorFn(bars, anchorUnix) {
  const best = indexBarsThroughAnchorFn(bars, anchorUnix);
  return best < 0 ? [] : bars.slice(0, best + 1);
}

/**
 * @param {number} unix
 * @param {{ startH: number; startM: number; endH: number; endM: number; crossesMidnight: boolean }} cfg
 */
function inSession(unix, cfg) {
  const DT = globalThis.luxon?.DateTime;
  if (!DT) return false;
  const d = DT.fromSeconds(unix, { zone: ET_ZONE });
  if (!d.isValid) return false;
  const mod = d.hour * 60 + d.minute;
  const start = cfg.startH * 60 + cfg.startM;
  const end = cfg.endH * 60 + cfg.endM;
  if (cfg.crossesMidnight) return mod >= start || mod < end;
  return mod >= start && mod < end;
}

/** @param {number} unix */
function barEtParts(unix) {
  const DT = globalThis.luxon?.DateTime;
  if (!DT) return null;
  const d = DT.fromSeconds(unix, { zone: ET_ZONE });
  if (!d.isValid) return null;
  return { ymd: d.toFormat("yyyy-MM-dd"), hm: d.toFormat("HH:mm") };
}

/** @param {LiqLine[]} lines @param {{ high: number; low: number; time: number }} bar @param {HtfSweepEvent[]} [events] */
function sweepReleaseLines(lines, bar, events) {
  for (const lvl of lines) {
    if (lvl.swept) continue;
    if (bar.time <= lvl.startTime) continue;
    const hit = lvl.kind === "high" ? bar.high >= lvl.price : bar.low <= lvl.price;
    if (!hit) continue;
    markSwept(lvl, bar.time);
    recordHtfSweep(lvl, bar.time, events);
  }
}

/** @param {LiqLine[]} lines @param {number} t */
function extendReleaseLines(lines, t) {
  for (const lvl of lines) {
    if (!lvl.swept) lvl.endTime = t;
  }
}

/** @returns {{ active: LiqLine[]; swept: LiqLine[] }} */
function createMatrix() {
  return { active: /** @type {LiqLine[]} */ ([]), swept: /** @type {LiqLine[]} */ ([]) };
}

/**
 * @param {{ active: LiqLine[]; swept: LiqLine[] }} matrix
 * @param {LiqLine} level
 * @param {number} maxUnswept
 * @param {number} proximity
 */
function birthLevel(matrix, level, maxUnswept, proximity) {
  const last = matrix.active[matrix.active.length - 1];
  if (last && Math.abs(last.price - level.price) <= proximity) return;
  matrix.active.push({ ...level, swept: false });
  while (matrix.active.length > maxUnswept) matrix.active.shift();
}

/** @param {LiqLine} lvl @param {number} t */
function markSwept(lvl, t) {
  lvl.swept = true;
  lvl.sweepTime = t;
  lvl.endTime = t;
}

/**
 * @param {{ active: LiqLine[]; swept: LiqLine[] }} matrix
 * @param {{ high: number; low: number; time: number }} bar
 * @param {"high"|"low"} kind
 * @param {number} maxSwept
 * @param {HtfSweepEvent[]} [events]
 */
function sweepMatrix(matrix, bar, kind, maxSwept, events) {
  for (let i = matrix.active.length - 1; i >= 0; i--) {
    const lvl = matrix.active[i];
    if (lvl.kind !== kind) continue;
    if (bar.time <= lvl.startTime) continue;
    const hit = kind === "high" ? bar.high >= lvl.price : bar.low <= lvl.price;
    if (!hit) continue;
    markSwept(lvl, bar.time);
    recordHtfSweep(lvl, bar.time, events);
    const moved = matrix.active.splice(i, 1)[0];
    matrix.swept.push(moved);
    while (maxSwept > 0 && matrix.swept.length > maxSwept) matrix.swept.shift();
  }
}

/** @param {{ active: LiqLine[]; swept: LiqLine[] }} matrix @param {number} t */
function extendMatrix(matrix, t) {
  for (const lvl of matrix.active) lvl.endTime = t;
}

/**
 * @param {any[]} agg
 * @param {number} idx
 * @param {{ h: number[]; l: number[]; t: number[] }} hist
 * @param {{ active: LiqLine[]; swept: LiqLine[] }} matrixH
 * @param {{ active: LiqLine[]; swept: LiqLine[] }} matrixL
 * @param {{ label: string; hiColor: string; loColor: string }} cfg
 * @param {number} endTime
 * @param {number} maxUnswept
 * @param {number} proximity
 * @param {boolean} showLabels
 */
function onHtfBarClose(
  agg,
  idx,
  hist,
  matrixH,
  matrixL,
  cfg,
  endTime,
  maxUnswept,
  proximity,
  showLabels,
  pivotLeft,
  pivotRight,
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
  let isHigh = true;
  let isLow = true;
  for (let j = 0; j < window; j++) {
    if (j === p) continue;
    if (hist.h[j] >= hist.h[p]) isHigh = false;
    if (hist.l[j] <= hist.l[p]) isLow = false;
  }

  if (isHigh) {
    birthLevel(
      matrixH,
      {
        price: hist.h[p],
        startTime: hist.t[p],
        endTime,
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
  }
  if (isLow) {
    birthLevel(
      matrixL,
      {
        price: hist.l[p],
        startTime: hist.t[p],
        endTime,
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

/**
 * Merge all levels at the same price (session + HTF) into one confluence label.
 * @param {LiqLine[]} lines
 * @param {number} proximity
 * @param {string} confHi
 * @param {string} confLo
 */
function applyClusterConfluence(lines, proximity, confHi, confLo) {
  const n = lines.length;
  /** @type {number[]} */
  const parent = Array.from({ length: n }, (_, i) => i);

  /** @param {number} i */
  function find(i) {
    let r = i;
    while (parent[r] !== r) {
      parent[r] = parent[parent[r]];
      r = parent[r];
    }
    return r;
  }

  /** @param {number} a @param {number} b */
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

    /** @type {Set<string>} */
    const tags = new Set();
    for (const l of group) {
      for (const t of parseLevelTags(l.label)) tags.add(t);
    }
    const side = group[0].kind === "high" ? "High" : "Low";
    const confColor = group[0].kind === "high" ? confHi : confLo;

    let survivor = group[0];
    for (const l of group) {
      if (l.endTime > survivor.endTime) survivor = l;
    }

    survivor.label = formatMergedTags(tags, side);
    survivor.color = confColor;
    survivor.lineWidth = 3;
    survivor.confluence = true;

    if (group.every((l) => l.swept)) {
      const times = group.map((l) => l.sweepTime ?? l.endTime).filter((t) => t != null);
      if (times.length) {
        survivor.swept = true;
        survivor.sweepTime = Math.max(...times);
        survivor.endTime = survivor.sweepTime;
      }
    } else if (group.some((l) => l.swept && l.sweepTime != null)) {
      const sweptOnes = group.filter((l) => l.swept && l.sweepTime != null);
      const times = sweptOnes.map((l) => l.sweepTime ?? 0);
      survivor.swept = true;
      survivor.sweepTime = Math.max(...times);
      survivor.endTime = survivor.sweepTime;
    }

    for (const l of group) {
      if (l !== survivor) l._drop = true;
    }
  }

  return lines.filter((l) => !l._drop);
}

/** Unix of the last 1m bar in an HTF bucket (bucket is complete once bar.time reaches this). */
function htfBucketCompleteAt(bucketOpen, tfSec) {
  return bucketOpen + tfSec - 60;
}

/**
 * Close finished HTF candles and birth pivot levels before sweeps run on the same 1m bar.
 */
function advanceHtfBarCloses(cfg, state, barTime, hists, matrices, maxUnswept, proximity, showLabels, pivotLeft, pivotRight) {
  const { agg } = state;
  let { ptr } = state;
  const tfSec = TF_MAP[cfg.key] ?? 60;

  while (ptr <= agg.length) {
    const closeIdx = ptr - 1;
    if (closeIdx < 0) {
      ptr = 1;
      continue;
    }
    if (closeIdx >= agg.length) break;
    if (barTime < htfBucketCompleteAt(agg[closeIdx].time, tfSec)) break;

    onHtfBarClose(
      agg,
      closeIdx,
      hists[cfg.slot],
      matrices[`${cfg.slot}H`],
      matrices[`${cfg.slot}L`],
      cfg,
      barTime,
      maxUnswept,
      proximity,
      showLabels,
      pivotLeft,
      pivotRight,
    );
    ptr += 1;
  }
  state.ptr = ptr;
}

/** @param {string} label */
function sweepLabelPlain(label) {
  return String(label || "")
    .replace(/\s*\([0-9.]+\)\s*$/, "")
    .trim();
}

const HTF_SWEEP_TF_TAGS = ["4H", "1H", "15m"];
const HTF_SWEEP_SESSION_TAGS = ["Asia", "London"];

/** @param {string} label — 15m/1H/4H, Asia, London, PPI, CPI, NFP, or GDP (not 5m/10m) */
function isHtfSweepLabel(label) {
  const plain = sweepLabelPlain(label);
  if (/\b(PPI|CPI|NFP|GDP)\b/i.test(plain)) return true;
  if (HTF_SWEEP_TF_TAGS.some((tf) => plain.includes(tf))) return true;
  return HTF_SWEEP_SESSION_TAGS.some((tag) => plain.includes(tag));
}

/** @param {"high"|"low"} kind */
function biasFromSweepKind(kind) {
  return kind === "low" ? "Bullish" : "Bearish";
}

/** @param {"high"|"low"} kind */
function biasHintFromKind(kind) {
  return kind === "low" ? "Sell-side liquidity swept below" : "Buy-side liquidity swept above";
}

/** @param {LiqLine} lvl @param {number} t @param {HtfSweepEvent[] | undefined} events */
function recordHtfSweep(lvl, t, events) {
  if (!events || !lvl.label || !isHtfSweepLabel(lvl.label)) return;
  const kind = lvl.kind;
  events.push({
    label: sweepLabelPlain(lvl.label) || (kind === "low" ? "Low" : "High"),
    price: lvl.price,
    time: t,
    kind,
    bias: biasFromSweepKind(kind),
    color: lvl.color || (kind === "low" ? "#e046ff" : "#ffed4a"),
  });
}

/**
 * Same-side sweeps in the active bias regime (since the last opposite sweep).
 * @param {Array<{ kind: "high"|"low" }>} sweeps chronological
 */
function sweepsInCurrentBiasRegime(sweeps) {
  if (!sweeps.length) return [];
  const activeKind = sweeps[sweeps.length - 1].kind;
  /** @type {typeof sweeps} */
  const out = [];
  for (let i = sweeps.length - 1; i >= 0; i--) {
    if (sweeps[i].kind !== activeKind) break;
    out.unshift(sweeps[i]);
  }
  return out;
}

const HTF_SWEEP_TAG_ORDER = ["4H", "1H", "15m", "Asia", "London", "PPI", "CPI", "NFP", "GDP"];

/**
 * Merge HTF sweeps on the same 1m bar, price, and side into one row (e.g. "1H, 15m, London Low").
 * @param {HtfSweepEvent[]} sweeps chronological
 */
function combineConcurrentHtfSweeps(sweeps) {
  if (!sweeps.length) return [];

  /** @type {Map<string, { time: number; price: number; kind: "high"|"low"; bias: string; color: string; tags: Set<string> }>} */
  const groups = new Map();

  for (const sw of sweeps) {
    const key = `${sw.time}:${Number(sw.price).toFixed(2)}:${sw.kind}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        time: sw.time,
        price: sw.price,
        kind: sw.kind,
        bias: sw.bias,
        color: sw.color,
        tags: new Set(),
      };
      groups.set(key, g);
    }
    for (const tag of parseLevelTags(sw.label)) g.tags.add(tag);
  }

  return [...groups.values()]
    .sort((a, b) => a.time - b.time)
    .map((g) => {
      const side = g.kind === "low" ? "Low" : "High";
      const ordered = [...g.tags].sort((a, b) => {
        const ai = HTF_SWEEP_TAG_ORDER.indexOf(a);
        const bi = HTF_SWEEP_TAG_ORDER.indexOf(b);
        return (ai >= 0 ? ai : 99) - (bi >= 0 ? bi : 99) || a.localeCompare(b);
      });
      return {
        label: `${ordered.join(", ")} ${side}`,
        price: g.price,
        time: g.time,
        kind: g.kind,
        bias: g.bias,
        color: g.color,
      };
    });
}

/**
 * @param {{ time: number; high: number; low: number; close: number }[]} bars1m
 * @param {number} anchorUnix
 * @param {import("./pivotLevelsSettings.js").PivotLevelsSettings} [opts]
 * @returns {{ lines: LiqLine[]; htfSweepEvents: HtfSweepEvent[] }}
 */
class LiquidityEngineRunner {
  constructor() {
    /** @type {{ rawRef: object | null; cacheKey: string; endIdx: number; state: ReturnType<typeof createLiquidityEngineState> | null }} */
    this._stepCache = { rawRef: null, cacheKey: "", endIdx: -1, state: null };
  }

  resetStepCache() {
    this._stepCache = { rawRef: null, cacheKey: "", endIdx: -1, state: null };
  }

  run(bars1m, anchorUnix, opts = {}) {
    return runLiquidityEngineImpl(bars1m, anchorUnix, opts, this._stepCache);
  }
}

const defaultLiquidityEngine = new LiquidityEngineRunner();

function resetLiquidityEngineStepCacheFn() {
  defaultLiquidityEngine.resetStepCache();
}

/** @param {Record<string, unknown>} opts */
function liquidityEngineCacheKey(opts) {
  const pivot = { ...defaultPivotLevelsSettings(), ...opts };
  return [
    pivot.enabled === false ? "0" : "1",
    opts.releaseKind ?? (opts.includePpi === true ? "ppi" : ""),
    opts.tickSize ?? 0.25,
    pivot.maxUnswept ?? 15,
    pivot.maxSwept ?? 5,
    pivot.maxSessions ?? 3,
    pivot.showLabels !== false && pivot.showSessionLabels !== false ? "1" : "0",
  ].join("|");
}

/**
 * @param {{ time: number; open: number; high: number; low: number; close: number; volume?: number }[]} bars1m
 * @param {number} anchorUnix
 * @param {Record<string, unknown>} opts
 */
function createLiquidityEngineState(bars1m, anchorUnix, opts) {
  const pivot = { ...defaultPivotLevelsSettings(), ...opts };
  const maxUnswept = pivot.maxUnswept ?? 15;
  const maxSwept = pivot.maxSwept ?? 5;
  const maxSessions = pivot.maxSessions ?? 3;
  const proximity = (opts.tickSize ?? 0.25) * 6;
  const releaseKind =
    opts.releaseKind ?? (opts.includePpi === true ? "ppi" : null);
  const showLabels = pivot.showLabels !== false && pivot.showSessionLabels !== false;
  const anchorDay = barEtParts(anchorUnix)?.ymd ?? null;
  const { prefix: releasePrefix, color: releaseColor } = releaseMetaFromKind(releaseKind);

  const htfConfig = buildHtfConfigFromSettings(pivot);
  const sessionConfig = sessionConfigsFromSettings(pivot);

  /** @type {Record<string, { h: number[]; l: number[]; t: number[] }>} */
  const hists = {};
  /** @type {Record<string, { active: LiqLine[]; swept: LiqLine[] }>} */
  const matrices = {};
  /** @type {Record<string, { agg: any[]; ptr: number }>} */
  const htfState = {};

  for (const cfg of htfConfig) {
    hists[cfg.slot] = { h: [], l: [], t: [] };
    matrices[`${cfg.slot}H`] = createMatrix();
    matrices[`${cfg.slot}L`] = createMatrix();
    htfState[cfg.slot] = { agg: Aggregate.candles(bars1m, cfg.key), ptr: 1 };
  }

  /** @type {LiqLine[]} */
  const sessionLines = [];
  /** @type {Record<string, { active: boolean; hi?: LiqLine; lo?: LiqLine; born?: number }>} */
  const sessState = {};
  /** @type {Record<string, number[]>} */
  const sessBornTimes = {};
  for (const cfg of sessionConfig) {
    sessState[cfg.label] = { active: false };
    sessBornTimes[cfg.label] = [];
  }

  return {
    pivot,
    pivotLeft: pivot.pivotLeftBars ?? 1,
    pivotRight: pivot.pivotRightBars ?? 1,
    maxUnswept,
    maxSwept,
    maxSessions,
    proximity,
    releaseKind,
    showLabels,
    anchorDay,
    releasePrefix,
    releaseColor,
    htfConfig,
    sessionConfig,
    htfSweepEvents: /** @type {HtfSweepEvent[]} */ ([]),
    releaseLines: /** @type {LiqLine[]} */ ([]),
    releaseBorn: false,
    liqOpts: {
      releaseCandleHm: opts.releaseCandleHm,
      calendarEvents: opts.calendarEvents,
    },
    hists,
    matrices,
    htfState,
    sessionLines,
    sessState,
    sessBornTimes,
  };
}

/** @param {ReturnType<typeof createLiquidityEngineState>} state @param {{ high: number; low: number; time: number }} bar */
function processLiquidityEngineBar(state, bar) {
  const {
    htfConfig,
    sessionConfig,
    htfState,
    hists,
    matrices,
    maxUnswept,
    maxSwept,
    maxSessions,
    proximity,
    showLabels,
    pivotLeft,
    pivotRight,
    releaseKind,
    anchorDay,
    releasePrefix,
    releaseColor,
    htfSweepEvents,
    releaseLines,
    sessionLines,
    sessState,
    sessBornTimes,
  } = state;

  for (const cfg of htfConfig) {
    advanceHtfBarCloses(
      cfg,
      htfState[cfg.slot],
      bar.time,
      hists,
      matrices,
      maxUnswept,
      proximity,
      showLabels,
      pivotLeft,
      pivotRight,
    );
  }

  for (const key of Object.keys(matrices)) {
    const m = matrices[key];
    sweepMatrix(m, bar, key.endsWith("H") ? "high" : "low", maxSwept, htfSweepEvents);
    extendMatrix(m, bar.time);
  }

  for (const cfg of sessionConfig) {
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
        endTime: bar.time,
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
        endTime: bar.time,
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
      }
      if (bar.low <= st.lo.price) {
        st.lo.price = bar.low;
        st.lo.startTime = bar.time;
      }
    } else if (!nowIn && st.active) {
      st.active = false;
    }
  }

  for (const sl of sessionLines) {
    if (sl.swept) continue;

    const cfg = sessionConfig.find((c) => sl.label.startsWith(c.label));
    const inOwnSession = cfg ? inSession(bar.time, cfg) : false;

    if (!inOwnSession && bar.time > sl.startTime) {
      const hit = sl.kind === "high" ? bar.high >= sl.price : bar.low <= sl.price;
      if (hit) {
        markSwept(sl, bar.time);
        recordHtfSweep(sl, bar.time, htfSweepEvents);
        continue;
      }
    }

    sl.endTime = bar.time;
  }

  if (releaseKind && !state.releaseBorn && anchorDay) {
    const parts = barEtParts(bar.time);
    if (parts?.ymd === anchorDay && parts.hm === releaseCandleTimeHm(state.liqOpts)) {
      state.releaseBorn = true;
      releaseLines.push(
        {
          price: bar.high,
          startTime: bar.time,
          endTime: bar.time,
          label: `${releasePrefix} High`,
          color: releaseColor,
          lineWidth: 2,
          kind: "high",
          swept: false,
          showLabel: showLabels,
        },
        {
          price: bar.low,
          startTime: bar.time,
          endTime: bar.time,
          label: `${releasePrefix} Low`,
          color: releaseColor,
          lineWidth: 2,
          kind: "low",
          swept: false,
          showLabel: showLabels,
        },
      );
    }
  }
  if (releaseLines.length) {
    sweepReleaseLines(releaseLines, bar, htfSweepEvents);
    extendReleaseLines(releaseLines, bar.time);
  }
}

/** @param {ReturnType<typeof createLiquidityEngineState>} state */
function finalizeLiquidityEngine(state) {
  const { pivot, proximity, htfSweepEvents, matrices, sessionLines, releaseLines } = state;

  /** @type {LiqLine[]} */
  let htfOut = [];
  for (const m of Object.values(matrices)) {
    htfOut.push(...m.active, ...m.swept);
  }

  /** @type {LiqLine[]} */
  let out = [...htfOut, ...sessionLines.filter((l) => !l._drop), ...releaseLines];
  out = applyClusterConfluence(out, proximity, pivot.confHiColor, pivot.confLoColor);

  for (const lvl of out) {
    if (lvl.swept && lvl.sweepTime != null) lvl.endTime = lvl.sweepTime;
  }

  out = out.filter((lvl) => pivotLineVisible(lvl.label, pivot));

  for (const lvl of out) {
    if (pivot.showLabels !== false && lvl.showLabel !== false && !lvl.label.includes("(")) {
      lvl.label = `${lvl.label} (${Number(lvl.price).toFixed(2)})`;
    } else if (pivot.showLabels === false || lvl.showLabel === false) {
      lvl.label = "";
    }
  }

  return { lines: out, htfSweepEvents };
}

/**
 * Walk 1m bars through replay anchor and build liquidity lines + HTF sweep events.
 * Forward replay steps reuse engine state (one new 1m bar per step).
 * @param {{ time: number; open: number; high: number; low: number; close: number; volume?: number }[]} bars1m full session — anchor caps visible bars
 * @param {number} anchorUnix
 * @param {Record<string, unknown>} [opts]
 */
function runLiquidityEngineImpl(bars1m, anchorUnix, opts, liqEngineStepCache) {
  const pivot = { ...defaultPivotLevelsSettings(), ...opts };
  if (pivot.enabled === false) return { lines: [], htfSweepEvents: [] };

  const cacheKey = liquidityEngineCacheKey(opts);
  const endIdx = indexBarsThroughAnchorFn(bars1m, anchorUnix);
  if (endIdx < 19) return { lines: [], htfSweepEvents: [] };

  const canStep =
    liqEngineStepCache.rawRef === bars1m &&
    liqEngineStepCache.cacheKey === cacheKey &&
    liqEngineStepCache.state != null &&
    endIdx >= liqEngineStepCache.endIdx;

  if (canStep && endIdx === liqEngineStepCache.endIdx) {
    return finalizeLiquidityEngine(liqEngineStepCache.state);
  }

  if (canStep && endIdx > liqEngineStepCache.endIdx) {
    for (let i = liqEngineStepCache.endIdx + 1; i <= endIdx; i++) {
      processLiquidityEngineBar(liqEngineStepCache.state, bars1m[i]);
    }
    liqEngineStepCache.endIdx = endIdx;
    return finalizeLiquidityEngine(liqEngineStepCache.state);
  }

  const state = createLiquidityEngineState(bars1m, anchorUnix, opts);
  for (let i = 0; i <= endIdx; i++) {
    processLiquidityEngineBar(state, bars1m[i]);
  }
  liqEngineStepCache.rawRef = bars1m;
  liqEngineStepCache.cacheKey = cacheKey;
  liqEngineStepCache.endIdx = endIdx;
  liqEngineStepCache.state = state;
  return finalizeLiquidityEngine(state);
}

/**
 * Bias + HTF liquidity sweeps through replay anchor (15m/1H/4H, Asia, London, PPI, CPI, NFP, GDP).
 * High sweep → bearish · low sweep → bullish.
 * @param {HtfSweepEvent[]} events
 * @param {number | null | undefined} [anchorUnix] replay tip
 * @param {{ skipFreshness?: boolean; freshMaxSec?: number | null }} [options]
 */
function replayContextFromSweepsFn(events, anchorUnix, options) {
  const allHtfSweeps = [...(events || [])].sort((a, b) => a.time - b.time);
  const skipFreshness = Boolean(options?.skipFreshness);
  const freshMaxSec = skipFreshness ? null : (options?.freshMaxSec ?? null);
  const skipHtfFresh = freshMaxSec == null;

  if (!allHtfSweeps.length) {
    return {
      bias: "—",
      biasHint: "No HTF liquidity swept yet at replay tip",
      recentSweep: null,
      htfSweeps: [],
      htfSweepDone: false,
    };
  }

  const latest = allHtfSweeps[allHtfSweeps.length - 1];

  if (!skipHtfFresh && anchorUnix != null && !isConfluenceFresh(latest.time, anchorUnix, freshMaxSec)) {
    return {
      bias: "—",
      biasHint: "Last HTF sweep >1h ago — waiting for new sweep",
      recentSweep: null,
      htfSweeps: [],
      htfSweepDone: false,
    };
  }

  const regimeSweeps = sweepsInCurrentBiasRegime(allHtfSweeps);
  const freshRegime = skipHtfFresh
    ? regimeSweeps
    : filterFreshConfluences(regimeSweeps, anchorUnix, freshMaxSec);
  const htfSweeps = combineConcurrentHtfSweeps(freshRegime);

  if (!htfSweeps.length) {
    return {
      bias: "—",
      biasHint: "No HTF sweep within the last hour",
      recentSweep: null,
      htfSweeps: [],
      htfSweepDone: false,
    };
  }

  return {
    bias: latest.bias,
    biasHint: biasHintFromKind(latest.kind),
    recentSweep: latest,
    htfSweeps,
    htfSweepDone: true,
  };
}

export class LevelsCalc {
  static indexBarsThroughAnchor = indexBarsThroughAnchorFn;
  static sliceBarsThroughAnchor = sliceBarsThroughAnchorFn;
  static replayContextFromSweeps = replayContextFromSweepsFn;
}

export { LiquidityEngineRunner };

export const indexBarsThroughAnchor = (...a) => LevelsCalc.indexBarsThroughAnchor(...a);
export const sliceBarsThroughAnchor = (...a) => LevelsCalc.sliceBarsThroughAnchor(...a);
export const resetLiquidityEngineStepCache = () => defaultLiquidityEngine.resetStepCache();
export const runLiquidityEngine = (...a) => defaultLiquidityEngine.run(...a);
export const replayContextFromSweeps = (...a) => LevelsCalc.replayContextFromSweeps(...a);

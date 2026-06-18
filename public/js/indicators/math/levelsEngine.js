import { normalizeResolutionId, resolutionDisplayTitle } from "../../chart/resolutionFormat.js";
import { resolutionSec } from "../../chart/resolutions.js";

const ET_ZONE = "America/New_York";

/** @typedef {{ enabled: boolean, label: string, layer: string }} LevelLayerRow */
/** @typedef {{ price: number; startTime: number; endTime: number; label: string; color: string; lineWidth: number; kind: "high"|"low"; swept: boolean; sweepTime?: number; showLabel?: boolean; sessionBorn?: number; _drop?: boolean }} LiqLine */

const HTF_STYLE = {
  "240": { tag: "4H", hi: "#007fff", lo: "#ff7644" },
  "60": { tag: "1H", hi: "#00ffcc", lo: "#ff4d4d" },
  "15": { tag: "15m", hi: "#ffed4a", lo: "#e046ff" },
  "5": { tag: "5m", hi: "#ffed4a", lo: "#e046ff" },
  "10": { tag: "10m", hi: "#ffed4a", lo: "#e046ff" },
};

/** @type {Record<string, { label: string; startH: number; startM: number; endH: number; endM: number; crossesMidnight: boolean; color: string }>} */
export const SESSION_DEFS = {
  asia: { label: "Asia", startH: 20, startM: 0, endH: 0, endM: 0, crossesMidnight: true, color: "#00ffcc" },
  london: { label: "London", startH: 2, startM: 0, endH: 5, endM: 0, crossesMidnight: false, color: "#9400d3" },
  ny_am: { label: "New York AM", startH: 9, startM: 30, endH: 11, endM: 0, crossesMidnight: false, color: "#ff007f" },
  ny_lunch: { label: "New York Lunch", startH: 12, startM: 0, endH: 13, endM: 0, crossesMidnight: false, color: "#ffaa00" },
  ny_pm: { label: "New York PM", startH: 13, startM: 30, endH: 16, endM: 0, crossesMidnight: false, color: "#007fff" },
};

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
    if (part.type === "hour") out.h = Number(part.value);
    if (part.type === "minute") out.min = Number(part.value);
  }
  out.ymd = `${String(out.y).padStart(4, "0")}-${String(out.m).padStart(2, "0")}-${String(out.d).padStart(2, "0")}`;
  out.hm = `${String(out.h).padStart(2, "0")}:${String(out.min).padStart(2, "0")}`;
  out.mod = out.h * 60 + out.min;
  return out;
}

/** @param {number} unixSec @param {number} intervalSec */
function bucketTimeEt(unixSec, intervalSec) {
  if (intervalSec >= 86400) {
    const { y, m, d } = etParts(unixSec);
    return Date.UTC(y, m - 1, d) / 1000;
  }
  const { y, m, d, h, min } = etParts(unixSec);
  const dayStart = Date.UTC(y, m - 1, d) / 1000;
  const minuteOfDay = h * 60 + min;
  const stepMin = intervalSec / 60;
  const bucketMinute = Math.floor(minuteOfDay / stepMin) * stepMin;
  return dayStart + Math.floor(bucketMinute / 60) * 3600 + (bucketMinute % 60) * 60;
}

/**
 * @param {object[]} bars
 * @param {number} tfSec
 */
function aggregateCandlesEt(bars, tfSec) {
  if (!bars.length || tfSec <= 60) return bars.map((b, i) => ({ ...b, sourceIndex: i }));
  /** @type {Map<number, object>} */
  const grouped = new Map();
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const t = bucketTimeEt(b.time, tfSec);
    let g = grouped.get(t);
    if (!g) {
      g = { time: t, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? 0 };
      grouped.set(t, g);
    } else {
      g.high = Math.max(g.high, b.high);
      g.low = Math.min(g.low, b.low);
      g.close = b.close;
      g.volume = (g.volume ?? 0) + (b.volume ?? 0);
    }
  }
  return [...grouped.values()].sort((a, b) => a.time - b.time);
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

/** @param {LiqLine} lvl @param {number} t */
function markSwept(lvl, t) {
  lvl.swept = true;
  lvl.sweepTime = t;
  lvl.endTime = t;
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

/**
 * @param {{ active: LiqLine[]; swept: LiqLine[] }} matrix
 * @param {object} bar
 * @param {"high"|"low"} kind
 * @param {number} maxSwept
 */
function sweepMatrix(matrix, bar, kind, maxSwept) {
  for (let i = matrix.active.length - 1; i >= 0; i--) {
    const lvl = matrix.active[i];
    if (lvl.kind !== kind) continue;
    if (bar.time <= lvl.startTime) continue;
    const hit = kind === "high" ? bar.high >= lvl.price : bar.low <= lvl.price;
    if (!hit) continue;
    markSwept(lvl, bar.time);
    const moved = matrix.active.splice(i, 1)[0];
    matrix.swept.push(moved);
    while (maxSwept > 0 && matrix.swept.length > maxSwept) matrix.swept.shift();
  }
}

/** @param {{ active: LiqLine[]; swept: LiqLine[] }} matrix @param {number} t */
function extendMatrix(matrix, t) {
  for (const lvl of matrix.active) lvl.endTime = t;
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
 * @param {number} endTime
 * @param {number} maxUnswept
 * @param {number} proximity
 * @param {boolean} showLabels
 * @param {number} pivotLeft
 * @param {number} pivotRight
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
    let survivor = group[0];
    for (const l of group) {
      if (l.endTime > survivor.endTime) survivor = l;
    }
    survivor.label = formatMergedTags(tags, side);
    survivor.color = confColor;
    survivor.lineWidth = 3;
    if (group.every((l) => l.swept)) {
      const times = group.map((l) => l.sweepTime ?? l.endTime).filter((t) => t != null);
      if (times.length) {
        survivor.swept = true;
        survivor.sweepTime = Math.max(...times);
        survivor.endTime = survivor.sweepTime;
      }
    } else if (group.some((l) => l.swept && l.sweepTime != null)) {
      const sweptOnes = group.filter((l) => l.swept && l.sweepTime != null);
      survivor.swept = true;
      survivor.sweepTime = Math.max(...sweptOnes.map((l) => l.sweepTime ?? 0));
      survivor.endTime = survivor.sweepTime;
    }
    for (const l of group) {
      if (l !== survivor) l._drop = true;
    }
  }
  return lines.filter((l) => !l._drop);
}

/**
 * @param {LevelLayerRow[]} timeRows
 * @param {import("../ui/levelsLayersPanel.js").SessionLevelRow[]} sessionRows
 * @returns {{ htf: { slot: string; label: string; tfSec: number; hiColor: string; loColor: string }[]; sessions: { label: string; color: string; startH: number; startM: number; endH: number; endM: number; crossesMidnight: boolean }[] }}
 */
export function buildLevelsEngineConfig(timeRows, sessionRows) {
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
    const style = HTF_STYLE[tfId] ?? { tag: resolutionDisplayTitle(tfId), hi: "#007fff", lo: "#ff7644" };
    htf.push({
      slot: `htf_${tfId}`,
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
    const cfg = sessionConfigFromRow(row);
    if (!cfg) continue;
    sessions.push({ ...cfg, label });
  }
  return { htf, sessions };
}

/** @param {{ sessionId?: string, startTime?: string, endTime?: string, label?: string }} row */
export function sessionConfigFromRow(row) {
  const sid = String(row.sessionId ?? "asia").trim();
  const def = SESSION_DEFS[sid];
  if (!def) return null;
  const start = parseHm(row.startTime) ?? { h: def.startH, min: def.startM };
  const end = parseHm(row.endTime) ?? { h: def.endH, min: def.endM };
  const startMod = start.h * 60 + start.min;
  const endMod = end.h * 60 + end.min;
  return {
    label: row.label || def.label,
    startH: start.h,
    startM: start.min,
    endH: end.h,
    endM: end.min,
    crossesMidnight: endMod <= startMod,
    color: def.color,
  };
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
 * @param {object[]} bars — UTC OHLC bars (finest available)
 * @param {number} anchorUnix
 * @param {object} opts
 * @returns {LiqLine[]}
 */
export function runLevelsEngine(bars, anchorUnix, opts) {
  if (!bars.length || anchorUnix == null) return [];

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
  if (endIdx < 19) return [];

  const pivotLeft = Math.max(1, Number(opts.pivotLeftBars) || 1);
  const pivotRight = Math.max(1, Number(opts.pivotRightBars) || 1);
  const maxUnswept = Math.max(1, Number(opts.maxUnswept) || 15);
  const maxSwept = Math.max(0, Number(opts.maxSwept) || 5);
  const maxSessions = Math.max(1, Number(opts.maxSessions) || 3);
  const proximity = (Number(opts.tickSize) || 0.25) * 6;
  const showLabels = opts.showLabels !== false;
  const confHi = String(opts.confHiColor ?? "#9400d3");
  const confLo = String(opts.confLoColor ?? "#ffaa00");
  const mergeConfluence = opts.mergeConfluence !== false;

  const { htf, sessions } = buildLevelsEngineConfig(opts.timeLayers ?? [], opts.sessionLayers ?? []);

  /** @type {Record<string, { h: number[]; l: number[]; t: number[] }>} */
  const hists = {};
  /** @type {Record<string, { active: LiqLine[]; swept: LiqLine[] }>} */
  const matrices = {};
  /** @type {Record<string, { agg: object[]; ptr: number }>} */
  const htfState = {};

  for (const cfg of htf) {
    hists[cfg.slot] = { h: [], l: [], t: [] };
    matrices[`${cfg.slot}H`] = createMatrix();
    matrices[`${cfg.slot}L`] = createMatrix();
    htfState[cfg.slot] = { agg: aggregateCandlesEt(bars, cfg.tfSec), ptr: 1 };
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

  for (let i = 0; i <= endIdx; i++) {
    const bar = bars[i];

    for (const cfg of htf) {
      const state = htfState[cfg.slot];
      const tfSec = cfg.tfSec;
      let { ptr } = state;
      const { agg } = state;
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

    for (const key of Object.keys(matrices)) {
      const m = matrices[key];
      sweepMatrix(m, bar, key.endsWith("H") ? "high" : "low", maxSwept);
      extendMatrix(m, bar.time);
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
      const cfg = sessions.find((c) => sl.label.startsWith(c.label));
      const inOwnSession = cfg ? inSession(bar.time, cfg) : false;
      if (!inOwnSession && bar.time > sl.startTime) {
        const hit = sl.kind === "high" ? bar.high >= sl.price : bar.low <= sl.price;
        if (hit) {
          markSwept(sl, bar.time);
          continue;
        }
      }
      sl.endTime = bar.time;
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

  for (const lvl of out) {
    if (lvl.swept && lvl.sweepTime != null) lvl.endTime = lvl.sweepTime;
    if (!showLabels || lvl.showLabel === false) {
      lvl.label = "";
    } else if (lvl.label && !lvl.label.includes("(")) {
      lvl.label = `${lvl.label} (${Number(lvl.price).toFixed(2)})`;
    }
  }

  return out;
}

/**
 * @param {LiqLine[]} lines
 * @param {object[]} utcBars
 * @param {object[]} chartBars
 * @param {object} style
 */
export function levelsToOverlayLines(lines, utcBars, chartBars, style) {
  const showLabels = style.graphicLabels !== false;
  const utcToChart = new Map();
  for (let i = 0; i < utcBars.length; i++) {
    const ct = chartBars[i]?.time;
    if (ct != null) utcToChart.set(utcBars[i].time, ct);
  }

  const mapTime = (utc) => {
    const hit = utcToChart.get(utc);
    return hit != null ? hit : utc;
  };

  return lines.map((lvl) => ({
    timeStart: mapTime(lvl.startTime),
    timeEnd: mapTime(lvl.endTime ?? lvl.startTime),
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

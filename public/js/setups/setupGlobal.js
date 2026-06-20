import settingsJson from "../../data/settings.json" with { type: "json" };

import { parseDurationSpec, resolveDurationSpecSec } from "./setupIfvg.js";

import {

  mergeCompanionFvgFilter,
  mergeGapSizeFilter,
  mergeIfvgQualifyFilter,
  normalizeCompanionFvgFilter,
  normalizeGapSizeFilter,
  normalizeIfvgQualifyFilter,
} from "./setupFilters.js";



/**

 * @typedef {{ start: string; end: string }} TradingWindowSlot

 * @typedef {{ type: "time" | "candles"; value: number }} DurationSpec

 * @typedef {import("./setupFilters.js").GapSizeFilter} GapSizeFilter

 * @typedef {import("./setupFilters.js").IfvgQualifyFilter} IfvgQualifyFilter

 * @typedef {object} SetupEntrySettings

 * @property {boolean} enabled

 * @property {IfvgQualifyFilter} [ifvgQualify]

 * @property {GapSizeFilter} [ifvgGapSize1m]

 * @property {GapSizeFilter} [fvgTapGapSize]

 * @typedef {object} SetupSettings

 * @property {{ enabled: boolean; times: TradingWindowSlot[]; start: string; end: string; release_start_after: DurationSpec | null }} trading_window

 * @property {{ enabled: boolean }} release_htf_gate

 * @property {IfvgQualifyFilter} ifvgQualify

 * @property {GapSizeFilter} ifvgGapSize1m

 * @property {GapSizeFilter} fvgTapGapSize

 * @property {Record<string, SetupEntrySettings>} setups

 * @property {{ symbol: string; date: string; open: string }} session
 * @property {{ user: string; password: string; systemName: string; gatewayName: string }} rithmic
 * @property {{ enabled: boolean; webhooks: Record<string, { enabled: boolean; url: string }> }} discord

 */



const DEFAULT_IFVG_QUALIFY = { enabled: true, maxFormationCandles: 7 };

const DEFAULT_IFVG_GAP = { enabled: true, minTicks: 20, maxTicks: 160 };

const DEFAULT_FVG_TAP_GAP = { enabled: true, minTicks: 4, maxTicks: 100 };
const DEFAULT_IFVG_COMPANION_FVG = { enabled: false };



/** @param {string} hm */

function normalizeHm(hm) {

  const [h, m = "0"] = String(hm).trim().split(":");

  const hh = Number(h);

  const mm = Number(m);

  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return "09:30";

  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;

}



/** @param {object} tw */

function normalizeTradingTimes(tw) {

  if (Array.isArray(tw.times) && tw.times.length) {

    return tw.times.map((slot) => ({

      start: normalizeHm(slot.start ?? "09:30"),

      end: normalizeHm(slot.end ?? "11:00"),

    }));

  }

  return [{ start: normalizeHm(tw.start ?? "09:30"), end: normalizeHm(tw.end ?? "11:00") }];

}



/** @param {unknown} raw @param {GapSizeFilter} defaults */

function readGapSize(raw, defaults) {

  return normalizeGapSizeFilter(raw, defaults);

}



/** @param {unknown} raw @param {IfvgQualifyFilter} defaults */

function readIfvgQualify(raw, defaults) {

  return normalizeIfvgQualifyFilter(raw, defaults);

}



/** @param {Record<string, unknown> | undefined} entry @param {IfvgQualifyFilter} globalQualify @param {GapSizeFilter} globalIfvgGap @param {import("./setupFilters.js").CompanionFvgFilter} globalCompanionFvg @param {GapSizeFilter} globalFvgTapGap */

function normalizeSetupEntry(entry, globalQualify, globalIfvgGap, globalCompanionFvg, globalFvgTapGap) {

  const e = entry ?? {};

  const ifvgBlock = e.ifvg && typeof e.ifvg === "object" ? /** @type {Record<string, unknown>} */ (e.ifvg) : {};

  const fvgTapBlock =

    e.fvgTap && typeof e.fvgTap === "object" ? /** @type {Record<string, unknown>} */ (e.fvgTap) : {};



  /** @type {SetupEntrySettings} */

  const out = { enabled: e.enabled !== false };



  const qualifyRaw = ifvgBlock.qualify;

  if (qualifyRaw && typeof qualifyRaw === "object") {

    out.ifvgQualify = mergeIfvgQualifyFilter(globalQualify, /** @type {Partial<IfvgQualifyFilter>} */ (qualifyRaw));

  }

  const gap1mRaw = ifvgBlock.gapSize1m;

  if (gap1mRaw && typeof gap1mRaw === "object") {

    out.ifvgGapSize1m = mergeGapSizeFilter(globalIfvgGap, /** @type {Partial<GapSizeFilter>} */ (gap1mRaw));

  }

  const companionRaw = ifvgBlock.companionFvg;
  if (companionRaw && typeof companionRaw === "object") {
    out.ifvgCompanionFvg = mergeCompanionFvgFilter(
      globalCompanionFvg,
      /** @type {Partial<import("./setupFilters.js").CompanionFvgFilter>} */ (companionRaw),
    );
  }

  const tapGapRaw = fvgTapBlock.gapSize;

  if (tapGapRaw && typeof tapGapRaw === "object") {

    out.fvgTapGapSize = mergeGapSizeFilter(globalFvgTapGap, /** @type {Partial<GapSizeFilter>} */ (tapGapRaw));

  }

  return out;

}



/** @param {typeof settingsJson} raw */

function normalizeSettings(raw) {

  const tw = raw.trading_window ?? {};

  const gate = raw.release_htf_gate ?? {};

  const session = raw.session ?? {};

  const setupsRaw = raw.setups ?? {};

  const ifvgRaw = raw.ifvg ?? {};

  const fvgTapRaw = raw.fvgTap ?? {};

  const releaseAfter =

    parseDurationSpec(tw.release_start_after) ?? ({ type: "candles", value: 1 });

  const times = normalizeTradingTimes(tw);



  const ifvgQualify = readIfvgQualify(ifvgRaw.qualify, DEFAULT_IFVG_QUALIFY);

  const ifvgGapSize1m = readGapSize(ifvgRaw.gapSize1m, DEFAULT_IFVG_GAP);
  const ifvgCompanionFvg = normalizeCompanionFvgFilter(ifvgRaw.companionFvg, DEFAULT_IFVG_COMPANION_FVG);

  const fvgTapGapSize = readGapSize(fvgTapRaw.gapSize, DEFAULT_FVG_TAP_GAP);



  /** @type {Record<string, SetupEntrySettings>} */

  const setups = {};

  for (const [id, entry] of Object.entries(setupsRaw)) {

    setups[id] = normalizeSetupEntry(

      /** @type {Record<string, unknown>} */ (entry),

      ifvgQualify,
      ifvgGapSize1m,
      ifvgCompanionFvg,
      fvgTapGapSize,
    );

  }



  return {

    trading_window: {

      enabled: tw.enabled !== false,

      times,

      start: times[0].start,

      end: times[times.length - 1].end,

      release_start_after: releaseAfter,

    },

    release_htf_gate: {

      enabled: gate.enabled !== false,

    },

    ifvgQualify,
    ifvgGapSize1m,
    ifvgCompanionFvg,
    fvgTapGapSize,
    setups,

    session: {

      symbol: String(session.symbol ?? "NQ").toUpperCase(),

      date: String(session.date ?? "2026-06-11"),

      open: String(session.open ?? "08:29"),

    },

    rithmic: normalizeRithmic(raw.rithmic),

    discord: normalizeDiscord(raw.discord),

  };

}



/** @param {unknown} raw */

function normalizeRithmic(raw) {

  const r = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};

  return {

    user: String(r.user ?? ""),

    password: String(r.password ?? ""),

    systemName: String(r.systemName ?? "LucidTrading"),

    gatewayName: String(r.gatewayName ?? "Chicago Area"),

  };

}



/** @param {unknown} raw */

function normalizeDiscord(raw) {

  const d = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};

  const hooksRaw = d.webhooks && typeof d.webhooks === "object" ? /** @type {Record<string, unknown>} */ (d.webhooks) : {};

  /** @type {Record<string, { enabled: boolean; url: string }>} */

  const webhooks = {};

  for (const id of ["1", "2", "3", "recap"]) {

    const entry = hooksRaw[id];

    const e = entry && typeof entry === "object" ? /** @type {Record<string, unknown>} */ (entry) : {};

    webhooks[id] = {

      enabled: e.enabled !== false,

      url: String(e.url ?? ""),

    };

  }

  return {

    enabled: d.enabled !== false,

    webhooks,

  };

}



/** @param {unknown} target @param {unknown} patch */

function deepMerge(target, patch) {

  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return patch ?? target;

  const out = { ...(target && typeof target === "object" && !Array.isArray(target) ? target : {}) };

  for (const [k, v] of Object.entries(/** @type {Record<string, unknown>} */ (patch))) {

    if (v && typeof v === "object" && !Array.isArray(v)) {

      out[k] = deepMerge(out[k], v);

    } else if (v === null) {

      delete out[k];

    } else if (v !== undefined) {

      out[k] = v;

    }

  }

  return out;

}



/** @type {typeof settingsJson} */

let rawSettings = structuredClone(settingsJson);



/** @type {SetupSettings} */

let config = normalizeSettings(rawSettings);



/** @returns {SetupSettings} */

export function getSetupGlobal() {

  return config;

}



/** @returns {typeof settingsJson} */

export function getSettingsRaw() {

  return rawSettings;

}



/** @param {object} partial — deep-merged into live settings */

export function applySetupSettings(partial) {

  rawSettings = /** @type {typeof settingsJson} */ (deepMerge(rawSettings, partial));

  const next = normalizeSettings(rawSettings);

  Object.assign(config, next);

  return config;

}



/** @deprecated alias */

export const getSetupSettings = getSetupGlobal;



export function tradingWindowEnabled() {

  return config.trading_window.enabled;

}



export function tradingWindowStartHm() {

  return config.trading_window.start;

}



export function tradingWindowEndHm() {

  return config.trading_window.end;

}



/** @returns {TradingWindowSlot[]} */

export function tradingWindowTimes() {

  return config.trading_window.times;

}



/** Seconds after release candle before trading window opens (1m candles by default). */

export function releaseStartAfterSec() {

  return resolveDurationSpecSec(config.trading_window.release_start_after, "1m") ?? 60;

}



export function releaseHtfGateEnabled() {

  if (!config.trading_window.enabled) return false;

  return config.release_htf_gate.enabled;

}



/** @param {number | string} setupId Defaults to enabled when omitted from settings. */

export function setupEnabled(setupId) {

  const entry = config.setups[String(setupId)];

  if (!entry) return true;

  return entry.enabled !== false;

}



/** @param {number | string | null | undefined} [setupId] */
export function ifvgQualifyForSetup(setupId) {
  const global = config.ifvgQualify;
  if (setupId == null) return global;
  const entry = rawSettings.setups?.[String(setupId)];
  const partial = entry?.ifvg?.qualify;
  if (!partial || typeof partial !== "object") return global;
  return mergeIfvgQualifyFilter(global, /** @type {Partial<IfvgQualifyFilter>} */ (partial));
}

/** @param {number | string | null | undefined} [setupId] */
export function ifvgGapSizeFilterForSetup(setupId) {
  const global = config.ifvgGapSize1m;
  if (setupId == null) return global;
  const entry = rawSettings.setups?.[String(setupId)];
  const partial = entry?.ifvg?.gapSize1m;
  if (!partial || typeof partial !== "object") return global;
  return mergeGapSizeFilter(global, /** @type {Partial<GapSizeFilter>} */ (partial));
}

/** @param {number | string | null | undefined} [setupId] */
export function fvgTapGapSizeFilterForSetup(setupId) {
  const global = config.fvgTapGapSize;
  if (setupId == null) return global;
  const entry = rawSettings.setups?.[String(setupId)];
  const partial = entry?.fvgTap?.gapSize;
  if (!partial || typeof partial !== "object") return global;
  return mergeGapSizeFilter(global, /** @type {Partial<GapSizeFilter>} */ (partial));
}

/** @param {number | string | null | undefined} [setupId] */
export function ifvgCompanionFvgForSetup(setupId) {
  const global = config.ifvgCompanionFvg;
  if (setupId == null) return global;
  const entry = rawSettings.setups?.[String(setupId)];
  const partial = entry?.ifvg?.companionFvg;
  if (!partial || typeof partial !== "object") return global;
  return mergeCompanionFvgFilter(global, /** @type {Partial<import("./setupFilters.js").CompanionFvgFilter>} */ (partial));
}



export function defaultSessionSymbol() {

  return config.session.symbol;

}



export function defaultSessionDay() {

  return config.session.date;

}



export function defaultSessionOpenHm() {

  return config.session.open;

}



export function rithmicSettings() {

  return config.rithmic;

}



export function discordAlertsEnabled() {

  return config.discord.enabled;

}



/** @param {number | string} setupId */

export function discordWebhookForSetup(setupId) {

  const entry = config.discord.webhooks[String(setupId)];

  if (!entry || !config.discord.enabled || entry.enabled === false) return null;

  const url = String(entry.url ?? "").trim();

  return url || null;

}



export {

  DEFAULT_IFVG_QUALIFY,

  DEFAULT_IFVG_GAP,

  DEFAULT_IFVG_COMPANION_FVG,

  DEFAULT_FVG_TAP_GAP,

};



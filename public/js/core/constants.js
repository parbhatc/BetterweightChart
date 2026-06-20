import { defaultSessionDay, defaultSessionOpenHm, defaultSessionSymbol } from "../setups/setupGlobal.js";

/** Default how many bars to show width-wise — avoids fitContent zoom-out */
export class Constants {
  static DEFAULT_VISIBLE_BARS = 96;
  static REPLAY_CHART_END_PAD = 3;
  static CHART_FUTURE_WHITESPACE_MIN = 180;
  static CHART_FUTURE_WHITESPACE_MARGIN = 64;
  static CHART_FUTURE_WHITESPACE_CHUNK = 180;
  static CHART_FUTURE_WHITESPACE_MAX = 2880;
  static MIN_1M_CHUNK = 150;
  static MAX_1M_CHUNK = 20000;
  static ONE_M_BUFFER = 1.22;
  static FVG_EXTEND_BARS = 14;
  static FVG_MAX_ZONES = 100;
  static LOAD_EDGE_BARS = 24;
  static MAX_CHAIN = 24;
  static ET_ZONE = "America/New_York";
  static DEFAULT_SYMBOL = defaultSessionSymbol();
  static SYMBOL_STORAGE_KEY = "ifvg-replay-symbol-v1";
  static SESSION_DAY_STORAGE_KEY = "ifvg-replay-session-day-v1";
  static DEFAULT_SESSION_DAY = defaultSessionDay();
  static DEFAULT_SESSION_OPEN_HM = defaultSessionOpenHm();
  static SETUP1_IFVG_MAX_AFTER_TAP_SEC = 35 * 60;
  static INDICATOR_SETTINGS_KEY = "ifvg-replay-indicator-settings-v1";
  static TIMEFRAME_STORAGE_KEY = "ifvg-replay-timeframe-v1";
  static TIMEFRAME_FAVORITES_KEY = "ifvg-replay-timeframe-favorites-v1";
  static VIEWPORT_STORAGE_KEY = "ifvg-replay-viewport-v3";
  static REPLAY_DOCK_POS_KEY = "ifvg-replay-dock-pos-v1";
  static SESSION_OPEN_PREF_KEY = "ifvg-replay-session-open-et-hm-v1";
  static LEGACY_LATEST_1M_LIMIT = 20000;
  static THEME_STORAGE_KEY = "ifvg-replay-theme";

  /** @type {Record<string, number>} */
  static TF_MAP = {
    "1m": 60,
    "2m": 120,
    "3m": 180,
    "4m": 240,
    "5m": 300,
    "10m": 600,
    "15m": 900,
    "1h": 3600,
    "4h": 14400,
    "1d": 86400,
  };

  /** @type {{ light: import("./constants.js").ChartThemeColors; dark: import("./constants.js").ChartThemeColors }} */
  static CHART_THEMES = {
    light: {
      bg: "#fafbfc",
      text: "#1a2332",
      grid: "rgba(26, 35, 50, 0.08)",
      up: "#0d9488",
      down: "#e11d48",
    },
    dark: {
      bg: "#131722",
      text: "#d1d4dc",
      grid: "rgba(255, 255, 255, 0.06)",
      up: "#089981",
      down: "#f23645",
    },
  };

  static defaultSessionOpenParts() {
    const [hour, minute] = Constants.DEFAULT_SESSION_OPEN_HM.split(":").map(Number);
    return { hour, minute };
  }

  /** @param {"light" | "dark"} mode */
  static getChartTheme(mode) {
    return Constants.CHART_THEMES[mode] ?? Constants.CHART_THEMES.light;
  }
}

/** @typedef {{ bg: string; text: string; grid: string; up: string; down: string }} ChartThemeColors */

export const DEFAULT_VISIBLE_BARS = Constants.DEFAULT_VISIBLE_BARS;
export const REPLAY_CHART_END_PAD = Constants.REPLAY_CHART_END_PAD;
export const CHART_FUTURE_WHITESPACE_MIN = Constants.CHART_FUTURE_WHITESPACE_MIN;
export const CHART_FUTURE_WHITESPACE_MARGIN = Constants.CHART_FUTURE_WHITESPACE_MARGIN;
export const CHART_FUTURE_WHITESPACE_CHUNK = Constants.CHART_FUTURE_WHITESPACE_CHUNK;
export const CHART_FUTURE_WHITESPACE_MAX = Constants.CHART_FUTURE_WHITESPACE_MAX;
export const MIN_1M_CHUNK = Constants.MIN_1M_CHUNK;
export const MAX_1M_CHUNK = Constants.MAX_1M_CHUNK;
export const ONE_M_BUFFER = Constants.ONE_M_BUFFER;
export const FVG_EXTEND_BARS = Constants.FVG_EXTEND_BARS;
export const FVG_MAX_ZONES = Constants.FVG_MAX_ZONES;
export const LOAD_EDGE_BARS = Constants.LOAD_EDGE_BARS;
export const MAX_CHAIN = Constants.MAX_CHAIN;
export const ET_ZONE = Constants.ET_ZONE;
export const DEFAULT_SYMBOL = Constants.DEFAULT_SYMBOL;
export const SYMBOL_STORAGE_KEY = Constants.SYMBOL_STORAGE_KEY;
export const SESSION_DAY_STORAGE_KEY = Constants.SESSION_DAY_STORAGE_KEY;
export const DEFAULT_SESSION_DAY = Constants.DEFAULT_SESSION_DAY;
export const DEFAULT_SESSION_OPEN_HM = Constants.DEFAULT_SESSION_OPEN_HM;
export const SETUP1_IFVG_MAX_AFTER_TAP_SEC = Constants.SETUP1_IFVG_MAX_AFTER_TAP_SEC;
export const INDICATOR_SETTINGS_KEY = Constants.INDICATOR_SETTINGS_KEY;
export const TIMEFRAME_STORAGE_KEY = Constants.TIMEFRAME_STORAGE_KEY;
export const TIMEFRAME_FAVORITES_KEY = Constants.TIMEFRAME_FAVORITES_KEY;
export const VIEWPORT_STORAGE_KEY = Constants.VIEWPORT_STORAGE_KEY;
export const REPLAY_DOCK_POS_KEY = Constants.REPLAY_DOCK_POS_KEY;
export const SESSION_OPEN_PREF_KEY = Constants.SESSION_OPEN_PREF_KEY;
export const LEGACY_LATEST_1M_LIMIT = Constants.LEGACY_LATEST_1M_LIMIT;
export const TF_MAP = Constants.TF_MAP;
export const CHART_THEMES = Constants.CHART_THEMES;
export const THEME_STORAGE_KEY = Constants.THEME_STORAGE_KEY;
export const defaultSessionOpenParts = () => Constants.defaultSessionOpenParts();
export const getChartTheme = (mode) => Constants.getChartTheme(mode);

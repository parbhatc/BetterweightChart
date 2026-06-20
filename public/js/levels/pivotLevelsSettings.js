const PL_KEY = "ifvg-replay-pivot-levels-v2";

/** @typedef {import("./settingsSchema.js").PivotLevelsSettings} PivotLevelsSettings */

export class PivotLevelsSettingsStore {
  /** @returns {PivotLevelsSettings} */
  static defaults() {
    return {
      enabled: true,
      pivotLeftBars: 1,
      pivotRightBars: 1,
      showHtf1: true,
      htf1Tf: "4h",
      htf1HiColor: "#007fff",
      htf1LoColor: "#ff7644",
      showHtf2: true,
      htf2Tf: "1h",
      htf2HiColor: "#00ffcc",
      htf2LoColor: "#ff4d4d",
      showHtf3: true,
      htf3Tf: "15m",
      htf3HiColor: "#ffed4a",
      htf3LoColor: "#e046ff",
      maxUnswept: 15,
      maxSwept: 5,
      showLines: true,
      showLabels: true,
      confHiColor: "#9400d3",
      confLoColor: "#ffaa00",
      enableSessions: true,
      showAsia: true,
      showLondon: true,
      showNyAm: false,
      showNyLunch: false,
      showNyPm: false,
      showSessionLabels: true,
      maxSessions: 3,
      showPpi: true,
    };
  }

  /** @returns {PivotLevelsSettings} */
  static load() {
    try {
      const raw = localStorage.getItem(PL_KEY);
      if (!raw) return PivotLevelsSettingsStore.defaults();
      const s = JSON.parse(raw);
      const d = PivotLevelsSettingsStore.defaults();
      return {
        ...d,
        ...s,
        enabled: s.enabled !== false,
        showHtf1: s.showHtf1 !== false,
        showHtf2: s.showHtf2 !== false,
        showHtf3: s.showHtf3 !== false,
        showLines: s.showLines !== false,
        showLabels: s.showLabels !== false,
        enableSessions: s.enableSessions !== false,
        showAsia: s.showAsia !== false,
        showLondon: s.showLondon !== false,
        showNyAm: s.showNyAm === true,
        showNyLunch: s.showNyLunch === true,
        showNyPm: s.showNyPm === true,
        showSessionLabels: s.showSessionLabels !== false,
        showPpi: s.showPpi !== false,
        pivotLeftBars: PivotLevelsSettingsStore.clampInt(s.pivotLeftBars, 1, 10, d.pivotLeftBars),
        pivotRightBars: PivotLevelsSettingsStore.clampInt(s.pivotRightBars, 1, 10, d.pivotRightBars),
        maxUnswept: PivotLevelsSettingsStore.clampInt(s.maxUnswept, 1, 50, d.maxUnswept),
        maxSwept: PivotLevelsSettingsStore.clampInt(s.maxSwept, 0, 20, d.maxSwept),
        maxSessions: PivotLevelsSettingsStore.clampInt(s.maxSessions, 1, 10, d.maxSessions),
        htf1Tf: PivotLevelsSettingsStore.validTf(s.htf1Tf, d.htf1Tf),
        htf2Tf: PivotLevelsSettingsStore.validTf(s.htf2Tf, d.htf2Tf),
        htf3Tf: PivotLevelsSettingsStore.validTf(s.htf3Tf, d.htf3Tf),
      };
    } catch {
      return PivotLevelsSettingsStore.defaults();
    }
  }

  /** @param {PivotLevelsSettings} s */
  static save(s) {
    try {
      localStorage.setItem(PL_KEY, JSON.stringify(s));
    } catch {
      //
    }
  }

  /** @param {unknown} v @param {number} lo @param {number} hi @param {number} fallback */
  static clampInt(v, lo, hi, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(hi, Math.max(lo, Math.round(n)));
  }

  /** @param {unknown} tf @param {string} fallback */
  static validTf(tf, fallback) {
    const t = String(tf || fallback);
    return ["15m", "1h", "4h", "5m", "10m"].includes(t) ? t : fallback;
  }

  /** @param {string} tf */
  static htfLabelFromTf(tf) {
    if (tf === "4h") return "4H";
    if (tf === "1h") return "1H";
    if (tf === "15m") return "15m";
    return tf;
  }

  /** @param {PivotLevelsSettings} pivot */
  static buildHtfConfigFromSettings(pivot) {
    /** @type {{ key: string; label: string; hiColor: string; loColor: string; slot: string }[]} */
    const out = [];
    if (pivot.showHtf1) {
      out.push({
        key: pivot.htf1Tf,
        label: PivotLevelsSettingsStore.htfLabelFromTf(pivot.htf1Tf),
        hiColor: pivot.htf1HiColor,
        loColor: pivot.htf1LoColor,
        slot: "htf1",
      });
    }
    if (pivot.showHtf2) {
      out.push({
        key: pivot.htf2Tf,
        label: PivotLevelsSettingsStore.htfLabelFromTf(pivot.htf2Tf),
        hiColor: pivot.htf2HiColor,
        loColor: pivot.htf2LoColor,
        slot: "htf2",
      });
    }
    if (pivot.showHtf3) {
      out.push({
        key: pivot.htf3Tf,
        label: PivotLevelsSettingsStore.htfLabelFromTf(pivot.htf3Tf),
        hiColor: pivot.htf3HiColor,
        loColor: pivot.htf3LoColor,
        slot: "htf3",
      });
    }
    return out;
  }

  /** @param {string} label @param {PivotLevelsSettings} opts */
  static pivotLineVisible(label, opts) {
    if (opts.enabled === false) return false;
    if (!opts.showLines) return false;
    const base = label.split(" (")[0];
    if (!base) return false;

    if (base.startsWith("PPI") || base.includes("PPI")) return opts.showPpi !== false;
    if (base.startsWith("CPI") || base.includes("CPI")) return opts.showPpi !== false;
    if (base.startsWith("NFP") || base.includes("NFP")) return opts.showPpi !== false;
    if (base.startsWith("GDP") || base.includes("GDP")) return opts.showPpi !== false;

    let sessionMatch = false;
    let htfMatch = false;

    if (opts.enableSessions !== false) {
      if (base.includes("Asia")) sessionMatch = opts.showAsia !== false;
      if (base.includes("London")) sessionMatch = sessionMatch || opts.showLondon !== false;
      if (base.includes("New York AM")) sessionMatch = sessionMatch || opts.showNyAm === true;
      if (base.includes("New York Lunch")) sessionMatch = sessionMatch || opts.showNyLunch === true;
      if (base.includes("New York PM")) sessionMatch = sessionMatch || opts.showNyPm === true;
    }

    for (const cfg of PivotLevelsSettingsStore.buildHtfConfigFromSettings(opts)) {
      if (base.includes(cfg.label)) htfMatch = true;
    }

    return sessionMatch || htfMatch;
  }

  /** @param {PivotLevelsSettings} pivot */
  static sessionConfigsFromSettings(pivot) {
    /** @type {{ label: string; startH: number; startM: number; endH: number; endM: number; crossesMidnight: boolean; color: string; enabled: boolean }[]} */
    const all = [
      { label: "Asia", startH: 20, startM: 0, endH: 0, endM: 0, crossesMidnight: true, color: "#00ffcc", enabled: pivot.showAsia !== false },
      { label: "London", startH: 2, startM: 0, endH: 5, endM: 0, crossesMidnight: false, color: "#9400d3", enabled: pivot.showLondon !== false },
      { label: "New York AM", startH: 9, startM: 30, endH: 11, endM: 0, crossesMidnight: false, color: "#ff007f", enabled: pivot.showNyAm === true },
      { label: "New York Lunch", startH: 12, startM: 0, endH: 13, endM: 0, crossesMidnight: false, color: "#ffaa00", enabled: pivot.showNyLunch === true },
      { label: "New York PM", startH: 13, startM: 30, endH: 16, endM: 0, crossesMidnight: false, color: "#007fff", enabled: pivot.showNyPm === true },
    ];
    if (pivot.enableSessions === false) return [];
    return all.filter((c) => c.enabled);
  }
}

export const defaultPivotLevelsSettings = () => PivotLevelsSettingsStore.defaults();
export const loadPivotLevelsSettings = () => PivotLevelsSettingsStore.load();
export const savePivotLevelsSettings = (s) => PivotLevelsSettingsStore.save(s);
export const htfLabelFromTf = (tf) => PivotLevelsSettingsStore.htfLabelFromTf(tf);
export const buildHtfConfigFromSettings = (pivot) => PivotLevelsSettingsStore.buildHtfConfigFromSettings(pivot);
export const pivotLineVisible = (label, opts) => PivotLevelsSettingsStore.pivotLineVisible(label, opts);
export const sessionConfigsFromSettings = (pivot) => PivotLevelsSettingsStore.sessionConfigsFromSettings(pivot);

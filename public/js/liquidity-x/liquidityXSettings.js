const LX_KEY = "ifvg-replay-liquidity-x-v2";

/** @typedef {import("./settingsSchema.js").LiquidityXSettings} LiquidityXSettings */

export class LiquidityXSettingsStore {
  static defaults() {
    return {
      enabled: true,
      localFvg: true,
      htfFvg: true,
      liveFvg: false,
      smt: true,
      eqhl: false,
      autoDeleteFvg: true,
      htfTf: "15m",
      htfBoxLabel: "15m FVG",
      extendBars: 50,
      maxIfvg: 0,
      ifvgFillColor: "#ffff00",
      smtPivotLeft: 1,
      smtPivotRight: 1,
      eqhlLookback: 200,
      eqhlAutoRemove: false,
      useCorrelation: true,
    };
  }

  load() {
    try {
      const raw = localStorage.getItem(LX_KEY);
      if (!raw) return LiquidityXSettingsStore.defaults();
      const s = JSON.parse(raw);
      const d = LiquidityXSettingsStore.defaults();
      return {
        ...d,
        ...s,
        enabled: s.enabled !== false,
        localFvg: s.localFvg !== false,
        htfFvg: s.htfFvg !== false,
        liveFvg: s.liveFvg === true,
        smt: s.smt !== false,
        eqhl: s.eqhl === true,
        autoDeleteFvg: s.autoDeleteFvg !== false,
        useCorrelation: s.useCorrelation !== false,
        eqhlAutoRemove: s.eqhlAutoRemove === true,
        htfTf: ["15m", "1h", "5m", "10m"].includes(s.htfTf) ? s.htfTf : d.htfTf,
        extendBars: LiquidityXSettingsStore.clampInt(s.extendBars, 0, 200, d.extendBars),
        maxIfvg: LiquidityXSettingsStore.clampInt(s.maxIfvg, 0, 20, d.maxIfvg),
        ifvgFillColor:
          typeof s.ifvgFillColor === "string" && /^#[0-9a-fA-F]{6}$/.test(s.ifvgFillColor)
            ? s.ifvgFillColor
            : d.ifvgFillColor,
        smtPivotLeft: LiquidityXSettingsStore.clampInt(s.smtPivotLeft, 1, 10, d.smtPivotLeft),
        smtPivotRight: LiquidityXSettingsStore.clampInt(s.smtPivotRight, 1, 10, d.smtPivotRight),
        eqhlLookback: LiquidityXSettingsStore.clampInt(s.eqhlLookback, 1, 500, d.eqhlLookback),
      };
    } catch {
      return LiquidityXSettingsStore.defaults();
    }
  }

  /** @param {LiquidityXSettings} s */
  save(s) {
    try {
      localStorage.setItem(LX_KEY, JSON.stringify(s));
    } catch {
      //
    }
  }

  /** @param {string} hex @param {number} alpha */
  static hexToRgba(hex, alpha) {
    const h = hex.replace("#", "");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /** @param {{ ifvgFillColor?: string }} s */
  static ifvgStyleFromSettings(s) {
    const hex = s.ifvgFillColor ?? "#ffff00";
    return {
      fill: LiquidityXSettingsStore.hexToRgba(hex, 0.25),
      border: LiquidityXSettingsStore.hexToRgba(hex, 0.25),
      label: LiquidityXSettingsStore.hexToRgba(hex, 1),
    };
  }

  /** @param {unknown} v @param {number} lo @param {number} hi @param {number} fallback */
  static clampInt(v, lo, hi, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(hi, Math.max(lo, Math.round(n)));
  }
}

const defaultStore = new LiquidityXSettingsStore();

export const defaultLiquidityXSettings = () => LiquidityXSettingsStore.defaults();
export const loadLiquidityXSettings = () => defaultStore.load();
export const saveLiquidityXSettings = (s) => defaultStore.save(s);
export const ifvgStyleFromSettings = (s) => LiquidityXSettingsStore.ifvgStyleFromSettings(s);

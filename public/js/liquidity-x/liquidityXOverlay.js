import { runLiquidityXEngine, smtCompanionSymbol } from "./liquidityXEngine.js";
import { LiquidityXPrimitive } from "./liquidityXPrimitive.js";
import { fetchEtDay } from "../core/api.js";
import { TF_MAP } from "../core/constants.js";
import { ifvgStyleFromSettings } from "./liquidityXSettings.js";

/**
 * @param {object} opts
 * @param {any} opts.series
 * @param {() => { time: number; open: number; high: number; low: number; close: number }[]} opts.getRaw1m
 * @param {() => string} opts.getTf
 * @param {() => string} opts.getSymbol
 * @param {() => string} opts.getDayYmd
 * @param {() => import("./liquidityXUi.js").LiquidityXSettings} opts.getSettings
 * @param {() => void} [opts.onCompBarsLoaded]
 */
export class LiquidityXOverlay {
  constructor(opts) {
    const { series, getRaw1m, getTf, getSymbol, getDayYmd, getSettings, onCompBarsLoaded } = opts;
    this.getRaw1m = getRaw1m;
    this.getTf = getTf;
    this.getSymbol = getSymbol;
    this.getDayYmd = getDayYmd;
    this.getSettings = getSettings;
    this.onCompBarsLoaded = onCompBarsLoaded;

    this.primitive = new LiquidityXPrimitive();
    if (typeof series?.attachPrimitive === "function") {
      series.attachPrimitive(this.primitive);
    }

    this.dataKey = "";
    /** @type {number | null} */
    this.anchorUnix = null;
    /** @type {number | null} */
    this.pendingAnchor = null;
    this.drawRaf = 0;
    /** @type {{ time: number; high: number; low: number; close: number }[]} */
    this.compRaw1m = [];
    /** @type {string} */
    this.compLoadKey = "";
    /** @type {Promise<void> | null} */
    this._compLoadPromise = null;
  }

  async ensureCompBars() {
    const day = this.getDayYmd();
    const sym = this.getSymbol();
    const comp = smtCompanionSymbol(sym);
    const key = `${day}|${comp}`;
    if (!day) return;
    if (this._compLoadPromise) return this._compLoadPromise;
    if (key === this.compLoadKey && this.compRaw1m.length) return;

    this.compLoadKey = key;
    this._compLoadPromise = (async () => {
      try {
        const j = await fetchEtDay(day, comp);
        this.compRaw1m = j.bars || [];
      } catch {
        this.compRaw1m = [];
      } finally {
        this._compLoadPromise = null;
      }
      this.dataKey = "";
      this.refreshDraw();
      this.onCompBarsLoaded?.();
    })();

    return this._compLoadPromise;
  }

  clear() {
    if (this.drawRaf) {
      cancelAnimationFrame(this.drawRaf);
      this.drawRaf = 0;
    }
    this.dataKey = "";
    this.anchorUnix = null;
    this.pendingAnchor = null;
    this.compRaw1m = [];
    this.compLoadKey = "";
    this._compLoadPromise = null;
    this.primitive.setData({ boxes: [], lines: [] });
  }

  refreshDraw() {
    if (this.anchorUnix == null) {
      this.primitive.setData({ boxes: [], lines: [] });
      return;
    }
    const raw1m = this.getRaw1m();
    if (!raw1m?.length) {
      this.primitive.setData({ boxes: [], lines: [] });
      return;
    }

    const s = this.getSettings();
    if (!s.enabled) {
      this.primitive.setData({ boxes: [], lines: [] });
      return;
    }
    const key = [
      this.anchorUnix,
      raw1m.length,
      this.getTf(),
      this.compRaw1m.length,
      s.enabled,
      s.localFvg,
      s.htfFvg,
      s.liveFvg,
      s.autoDeleteFvg,
      s.smt,
      s.eqhl,
      s.eqhlAutoRemove,
      s.eqhlLookback,
      s.htfTf,
      s.extendBars,
      s.maxIfvg,
      s.ifvgFillColor,
      s.smtPivotLeft,
      s.smtPivotRight,
    ].join("|");
    if (key === this.dataKey) return;
    this.dataKey = key;

    const engineOpts = {
      localFvg: s.localFvg,
      htfFvg: s.htfFvg,
      liveFvg: s.liveFvg,
      smt: s.smt,
      eqhl: s.eqhl,
      htfTf: s.htfTf ?? "15m",
      extendBars: s.extendBars ?? 50,
      maxIfvg: s.maxIfvg ?? 0,
      ifvgCol: ifvgStyleFromSettings(s),
      autoDelete: s.autoDeleteFvg !== false,
      htfBoxLabel: s.htfBoxLabel ?? "15m FVG",
      pivotLeft: s.smtPivotLeft ?? 1,
      pivotRight: s.smtPivotRight ?? 1,
      eqLookback: s.eqhlLookback ?? 200,
      compLabel: smtCompanionSymbol(this.getSymbol()),
    };

    const out = runLiquidityXEngine(raw1m, this.anchorUnix, this.getTf(), this.compRaw1m, engineOpts);
    this.primitive.setData({ ...out, tfSec: TF_MAP[this.getTf()] ?? 60 });
  }

  flushDraw() {
    if (this.drawRaf) {
      cancelAnimationFrame(this.drawRaf);
      this.drawRaf = 0;
    }
    this.anchorUnix = this.pendingAnchor;
    this.pendingAnchor = null;
    if (this.anchorUnix == null) {
      this.clear();
      return;
    }
    this.ensureCompBars();
    this.refreshDraw();
  }

  /** @param {number | null | undefined} unix */
  syncToBar(unix) {
    this.pendingAnchor = unix ?? null;
    if (this.pendingAnchor == null) {
      this.flushDraw();
      return;
    }
    if (this.drawRaf) cancelAnimationFrame(this.drawRaf);
    this.drawRaf = requestAnimationFrame(() => {
      this.drawRaf = 0;
      this.flushDraw();
    });
  }

  /** Replay dock — flush LX/SMT through `unix` before setup history resolves. */
  syncToBarNow(unix) {
    this.pendingAnchor = unix ?? null;
    if (this.drawRaf) {
      cancelAnimationFrame(this.drawRaf);
      this.drawRaf = 0;
    }
    this.flushDraw();
  }

  scheduleRefresh() {
    this.dataKey = "";
    this.pendingAnchor = this.anchorUnix;
    this.flushDraw();
  }

  onSessionLoad() {
    this.compLoadKey = "";
    this.compRaw1m = [];
    this.dataKey = "";
    this.ensureCompBars();
    this.refreshDraw();
  }

  getCompRaw1m() {
    return this.compRaw1m;
  }
}

export function createLiquidityXOverlay(opts) {
  return new LiquidityXOverlay(opts);
}

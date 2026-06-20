import {
  CrtLinesPrimitive,
  CRT_HIGH_COLOR,
  CRT_LOW_COLOR,
  SWEEP_HIGH_COLOR,
  SWEEP_LOW_COLOR,
} from "./crtLinesPrimitive.js";
import { SetupRegistry } from "./registry/setupRegistry.js";

/**
 * @param {{ time: number; high: number; low: number }} bar
 * @param {number} anchorUnix
 * @param {{ label: string; color: string; dashed?: boolean }} style
 * @returns {import("./crtLinesPrimitive.js").CrtLine | null}
 */
function levelLine(bar, anchorUnix, kind, style) {
  if (!bar || anchorUnix == null) return null;
  return {
    price: kind === "high" ? bar.high : bar.low,
    startTime: bar.time,
    endTime: anchorUnix,
    label: style.label,
    color: style.color,
    lineWidth: 2,
    kind,
    swept: false,
    dashed: style.dashed,
  };
}

/**
 * @param {{ time: number; high: number; low: number } | null} lastBar
 * @param {{ time: number; high: number; low: number } | null} sweepBar
 * @param {number} anchorUnix
 * @returns {import("./crtLinesPrimitive.js").CrtLine[]}
 */
function buildCrtLines(lastBar, sweepBar, anchorUnix) {
  if (!lastBar || anchorUnix == null) return [];
  /** @type {import("./crtLinesPrimitive.js").CrtLine[]} */
  const lines = [];
  const hi = levelLine(lastBar, anchorUnix, "high", { label: "CRT High", color: CRT_HIGH_COLOR });
  const lo = levelLine(lastBar, anchorUnix, "low", { label: "CRT Low", color: CRT_LOW_COLOR });
  if (hi) lines.push(hi);
  if (lo) lines.push(lo);

  if (sweepBar) {
    const sweepHi = levelLine(sweepBar, anchorUnix, "high", {
      label: "Sweep High",
      color: SWEEP_HIGH_COLOR,
      dashed: true,
    });
    const sweepLo = levelLine(sweepBar, anchorUnix, "low", {
      label: "Sweep Low",
      color: SWEEP_LOW_COLOR,
      dashed: true,
    });
    if (sweepHi) lines.push(sweepHi);
    if (sweepLo) lines.push(sweepLo);
  }
  return lines;
}

/**
 * CRT + sweep horizontal lines for Setup #3.
 * @param {{
 *   series: { attachPrimitive?: Function };
 *   getRaw1m: () => { time: number; high: number; low: number; close: number }[];
 *   getDisplayed: () => { time: number }[];
 *   getDayYmd: () => string | undefined;
 *   getTf: () => string;
 *   getSetupTradingWindow?: () => import("./setupTradingWindow.js").SetupTradingWindowSettings;
 * }} opts
 */
export class CrtLinesOverlay {
  constructor(opts) {
    this.getRaw1m = opts.getRaw1m;
    this.getDisplayed = opts.getDisplayed;
    this.getDayYmd = opts.getDayYmd;
    this.getTf = opts.getTf;
    this.getSetupTradingWindow = opts.getSetupTradingWindow;

    this.primitive = new CrtLinesPrimitive();
    this.primitive.setCoordHelpers(this.getDisplayed, this.getTf);
    if (typeof opts.series?.attachPrimitive === "function") {
      opts.series.attachPrimitive(this.primitive);
    }

    this.dataKey = "";
    /** @type {number | null} */
    this.anchorUnix = null;
    /** @type {number | null} */
    this.pendingAnchor = null;
    this.drawRaf = 0;
  }

  clear() {
    if (this.drawRaf) {
      cancelAnimationFrame(this.drawRaf);
      this.drawRaf = 0;
    }
    this.dataKey = "";
    this.anchorUnix = null;
    this.pendingAnchor = null;
    this.primitive.setLines([]);
  }

  /** @param {import("./crtLinesPrimitive.js").CrtLine[]} lines */
  applyLines(lines) {
    this.primitive.setCoordHelpers(this.getDisplayed, this.getTf);
    this.primitive.setLines(lines);
  }

  refreshDraw() {
    const anchorUnix = this.anchorUnix;
    const raw1m = this.getRaw1m();
    const dayYmd = this.getDayYmd?.();
    const setup3 = SetupRegistry.get(3);
    if (!setup3 || anchorUnix == null || !raw1m?.length || !dayYmd) {
      this.applyLines([]);
      return;
    }

    const key = `${anchorUnix}|${raw1m.length}|${raw1m[0]?.time ?? 0}|${dayYmd}`;
    if (key === this.dataKey) return;
    this.dataKey = key;

    const ctx = {
      getRaw1m: () => raw1m,
      getAnchorUnix: () => anchorUnix,
      getDayYmd: () => dayYmd,
      getTf: this.getTf,
      getSetupTradingWindow: this.getSetupTradingWindow,
    };
    const opts = setup3.opts(ctx);
    const completed = setup3.history.through(opts, anchorUnix, dayYmd);
    const live = setup3.live(opts, completed);

    if (live.complete && live.completedAt != null && anchorUnix >= live.completedAt) {
      this.applyLines([]);
      return;
    }
    if (!live.lastBar) {
      this.applyLines([]);
      return;
    }

    this.applyLines(buildCrtLines(live.lastBar, live.sweepBar ?? null, anchorUnix));
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
}

/** @param {ConstructorParameters<typeof CrtLinesOverlay>[0]} opts */
export function createCrtLinesOverlay(opts) {
  return new CrtLinesOverlay(opts);
}

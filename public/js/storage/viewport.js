import { VIEWPORT_STORAGE_KEY } from "../core/constants.js";
import { SymbolStorage } from "../storage/symbol.js";

/** @typedef {{
 *   logicalFrom: number,
 *   logicalTo: number,
 *   fromTime?: number,
 *   toTime?: number,
 *   displayedCount?: number,
 *   barSpacing?: number,
 *   rightOffset?: number,
 *   replayTipTime?: number | null,
 *   replayActive?: boolean,
 *   sessionDayYmd?: string,
 * }} SavedViewport */

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const VIEWPORT_STORAGE_KEY_V2 = "ifvg-replay-viewport-v2";

export class ViewportStorage {
  /**
   * One viewport per symbol + timeframe (not per session day).
   * @param {string} symbol
   * @param {string} tf
   */
  static storageKey(symbol, tf) {
    return `${SymbolStorage.normalize(symbol)}|${tf}`;
  }

  /** @deprecated Legacy per-day key — used only for one-time migration. */
  static legacyStorageKey(symbol, dayYmd, tf) {
    return `${SymbolStorage.normalize(symbol)}|${dayYmd}|${tf}`;
  }

  /**
   * @param {unknown} v
   * @returns {v is SavedViewport}
   */
  static isSavedViewport(v) {
    if (!v || typeof v !== "object") return false;
    const o = /** @type {SavedViewport} */ (v);
    return typeof o.logicalFrom === "number" && typeof o.logicalTo === "number";
  }

  /**
   * Collapse v2 `symbol|day|tf` rows into one `symbol|tf` entry (latest replay tip wins).
   * @param {Record<string, unknown>} v2
   */
  migrateV2Viewports(v2) {
    /** @type {Record<string, { vp: SavedViewport; day: string; tip: number }>} */
    const best = {};
    for (const [k, raw] of Object.entries(v2)) {
      const parts = k.split("|");
      if (parts.length !== 3) continue;
      const [sym, day, tf] = parts;
      if (!YMD_RE.test(day)) continue;
      const vp = this.normalizeLoadedViewport(raw);
      if (!vp) continue;
      const key = ViewportStorage.storageKey(sym, tf);
      const tip = vp.replayTipTime ?? 0;
      const hit = best[key];
      if (!hit || tip >= hit.tip) {
        best[key] = { vp: { ...vp, sessionDayYmd: day }, day, tip };
      }
    }
    /** @type {Record<string, SavedViewport>} */
    const out = {};
    for (const [key, { vp }] of Object.entries(best)) {
      out[key] = vp;
    }
    return out;
  }

  readAllViewports() {
    try {
      let raw = localStorage.getItem(VIEWPORT_STORAGE_KEY);
      if (!raw) {
        const v2raw = localStorage.getItem(VIEWPORT_STORAGE_KEY_V2);
        if (v2raw) {
          const v2 = JSON.parse(v2raw);
          const migrated =
            v2 && typeof v2 === "object"
              ? this.migrateV2Viewports(/** @type {Record<string, unknown>} */ (v2))
              : {};
          localStorage.setItem(VIEWPORT_STORAGE_KEY, JSON.stringify(migrated));
          return migrated;
        }
        return {};
      }
      const all = JSON.parse(raw);
      return all && typeof all === "object" ? all : {};
    } catch {
      return {};
    }
  }

  /**
   * @param {unknown} v
   * @returns {SavedViewport | null}
   */
  normalizeLoadedViewport(v) {
    if (ViewportStorage.isSavedViewport(v)) return v;
    if (v && typeof v.fromTime === "number" && typeof v.toTime === "number") {
      return {
        logicalFrom: 0,
        logicalTo: 0,
        fromTime: v.fromTime,
        toTime: v.toTime,
        barSpacing: v.barSpacing,
        rightOffset: v.rightOffset,
        replayTipTime: v.replayTipTime,
        replayActive: v.replayActive,
        sessionDayYmd: v.sessionDayYmd,
        _legacy: true,
      };
    }
    return null;
  }

  /**
   * @param {string} symbol
   * @param {string} tf
   * @param {string} [dayYmd] — prefer this day's legacy entry when migrating
   */
  load(symbol, tf, dayYmd) {
    const sym = SymbolStorage.normalize(symbol);
    const key = ViewportStorage.storageKey(sym, tf);
    const all = this.readAllViewports();

    const direct = this.normalizeLoadedViewport(all[key]);
    if (direct) return direct;

    if (dayYmd) {
      const legacyKey = ViewportStorage.legacyStorageKey(sym, dayYmd, tf);
      const legacy = this.normalizeLoadedViewport(all[legacyKey]);
      if (legacy) return legacy;
    }

    const suffix = `|${tf}`;
    const prefix = `${sym}|`;
    /** @type {SavedViewport | null} */
    let fallback = null;
    for (const [k, raw] of Object.entries(all)) {
      if (!k.startsWith(prefix) || !k.endsWith(suffix)) continue;
      const mid = k.slice(prefix.length, -suffix.length);
      if (!YMD_RE.test(mid)) continue;
      const vp = this.normalizeLoadedViewport(raw);
      if (vp) fallback = vp;
    }
    return fallback;
  }

  /**
   * @param {string} symbol
   * @param {string} tf
   * @param {SavedViewport} vp
   * @param {string} [dayYmd]
   */
  save(symbol, tf, vp, dayYmd) {
    try {
      const sym = SymbolStorage.normalize(symbol);
      const key = ViewportStorage.storageKey(sym, tf);
      const all = this.readAllViewports();
      const payload = dayYmd ? { ...vp, sessionDayYmd: dayYmd } : vp;
      all[key] = payload;

      const suffix = `|${tf}`;
      const prefix = `${sym}|`;
      for (const k of Object.keys(all)) {
        if (k === key) continue;
        if (!k.startsWith(prefix) || !k.endsWith(suffix)) continue;
        const mid = k.slice(prefix.length, -suffix.length);
        if (YMD_RE.test(mid)) delete all[k];
      }

      localStorage.setItem(VIEWPORT_STORAGE_KEY, JSON.stringify(all));
    } catch {
      //
    }
  }
}

const defaultViewportStorage = new ViewportStorage();

export const viewportStorageKey = (...a) => ViewportStorage.storageKey(...a);
export const legacyViewportStorageKey = (...a) => ViewportStorage.legacyStorageKey(...a);
export const isSavedViewport = (...a) => ViewportStorage.isSavedViewport(...a);
export const loadViewport = (...a) => defaultViewportStorage.load(...a);
export const saveViewport = (...a) => defaultViewportStorage.save(...a);

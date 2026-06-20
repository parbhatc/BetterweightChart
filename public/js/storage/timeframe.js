import { TIMEFRAME_STORAGE_KEY, TF_MAP } from "../core/constants.js";

export class Timeframe {
  static valid = new Set(Object.keys(TF_MAP));

  /** @param {HTMLSelectElement | null} tfSel */
  static load(tfSel) {
    if (!tfSel) return;
    try {
      const raw = localStorage.getItem(TIMEFRAME_STORAGE_KEY);
      if (typeof raw !== "string" || !Timeframe.valid.has(raw)) return;
      tfSel.value = raw;
    } catch {
      //
    }
  }

  /** @param {HTMLSelectElement | null} tfSel */
  static save(tfSel) {
    if (!tfSel) return;
    try {
      if (!Timeframe.valid.has(tfSel.value)) return;
      localStorage.setItem(TIMEFRAME_STORAGE_KEY, tfSel.value);
    } catch {
      //
    }
  }
}

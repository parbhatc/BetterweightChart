import { SYMBOL_STORAGE_KEY, DEFAULT_SYMBOL } from "../core/constants.js";

export class SymbolStorage {
  /** @param {string} sym */
  static normalize(sym) {
    const s = String(sym || DEFAULT_SYMBOL).trim().toUpperCase();
    return /^[A-Z0-9]{1,8}$/.test(s) ? s : DEFAULT_SYMBOL;
  }

  static load() {
    try {
      const raw = localStorage.getItem(SYMBOL_STORAGE_KEY);
      if (raw) return SymbolStorage.normalize(raw);
    } catch {
      //
    }
    return DEFAULT_SYMBOL;
  }

  /** @param {string} sym */
  static save(sym) {
    try {
      localStorage.setItem(SYMBOL_STORAGE_KEY, SymbolStorage.normalize(sym));
    } catch {
      //
    }
  }
}

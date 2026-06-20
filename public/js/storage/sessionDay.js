import { DEFAULT_SESSION_DAY, SESSION_DAY_STORAGE_KEY } from "../core/constants.js";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export class SessionDay {
  /** @param {string} ymd */
  static normalize(ymd) {
    const s = String(ymd || "").trim();
    return YMD_RE.test(s) ? s : DEFAULT_SESSION_DAY;
  }

  static load() {
    try {
      const raw = localStorage.getItem(SESSION_DAY_STORAGE_KEY);
      if (raw && YMD_RE.test(raw.trim())) return raw.trim();
    } catch {
      //
    }
    return null;
  }

  /** @param {string} ymd */
  static save(ymd) {
    try {
      localStorage.setItem(SESSION_DAY_STORAGE_KEY, SessionDay.normalize(ymd));
    } catch {
      //
    }
  }

  /** Persisted day, then input value, then default. @param {string | undefined} inputYmd */
  static bootstrap(inputYmd) {
    const stored = SessionDay.load();
    if (stored) return stored;
    const trimmed = String(inputYmd || "").trim();
    if (YMD_RE.test(trimmed)) return trimmed;
    return DEFAULT_SESSION_DAY;
  }
}

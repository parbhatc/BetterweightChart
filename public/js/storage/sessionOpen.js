import { SESSION_OPEN_PREF_KEY, ET_ZONE, DEFAULT_SESSION_OPEN_HM } from "../core/constants.js";

export class SessionOpen {
  static load() {
    try {
      const raw = localStorage.getItem(SESSION_OPEN_PREF_KEY);
      if (!raw) return null;
      const o = JSON.parse(raw);
      const hm = o && typeof o.hm === "string" ? o.hm.trim() : "";
      if (/^([01]\d|2[0-3]):[0-5]\d$/.test(hm)) return hm;
    } catch {
      //
    }
    return null;
  }

  static save(hm) {
    try {
      if (!hm) {
        localStorage.removeItem(SESSION_OPEN_PREF_KEY);
        return;
      }
      localStorage.setItem(SESSION_OPEN_PREF_KEY, JSON.stringify({ hm }));
    } catch {
      //
    }
  }

  static hmToUnix(ymd, hm) {
    const DT = typeof globalThis.luxon !== "undefined" ? globalThis.luxon.DateTime : null;
    if (!DT || !ymd || !hm) return null;
    const [y, mo, d] = ymd.split("-").map(Number);
    const [hh, mm] = hm.split(":").map(Number);
    if (![y, mo, d, hh, mm].every((n) => Number.isFinite(n))) return null;
    const dt = DT.fromObject(
      { year: y, month: mo, day: d, hour: hh, minute: mm, second: 0 },
      { zone: ET_ZONE },
    );
    if (!dt.isValid) return null;
    return Math.floor(dt.toSeconds());
  }

  static hmFromUnix(t) {
    const DT = typeof globalThis.luxon !== "undefined" ? globalThis.luxon.DateTime : null;
    if (t == null || !DT) return DEFAULT_SESSION_OPEN_HM;
    const d = DT.fromSeconds(t, { zone: ET_ZONE });
    if (!d.isValid) return DEFAULT_SESSION_OPEN_HM;
    return d.toFormat("HH:mm");
  }
}

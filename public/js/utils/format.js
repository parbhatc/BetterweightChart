import { ET_ZONE } from "../core/constants.js";

export class Format {
  static toDate(t) {
    if (typeof t === "number") return new Date(t * 1000);
    if (t && typeof t === "object" && "year" in t) {
      return new Date(t.year, t.month - 1, t.day);
    }
    return new Date();
  }

  static time12h(d) {
    return d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  /** @param {number} unix ET wall time, e.g. `6/11/26 5:55am` */
  static etMdYy(unix) {
    const DT = globalThis.luxon?.DateTime;
    if (DT) {
      const d = DT.fromSeconds(unix, { zone: ET_ZONE });
      if (d.isValid) return d.toFormat("M/d/yy h:mma").toLowerCase();
    }
    return Format.time12h(Format.toDate(unix));
  }

  /** @param {number | null | undefined} unix @param {string | undefined} sessionYmd */
  static setupHistory(unix, sessionYmd) {
    if (unix == null || !Number.isFinite(unix)) return "—";
    const DT = globalThis.luxon?.DateTime;
    if (DT) {
      const d = DT.fromSeconds(unix, { zone: ET_ZONE });
      if (d.isValid) {
        if (sessionYmd && d.toISODate() === sessionYmd) {
          return d.toFormat("h:mma").toLowerCase();
        }
        return d.toFormat("M/d/yy h:mma").toLowerCase();
      }
    }
    return Format.time12h(Format.toDate(unix));
  }

  /** @param {number} unix @param {string | undefined} sessionYmd */
  static isSessionDay(unix, sessionYmd) {
    const DT = globalThis.luxon?.DateTime;
    if (!DT || !sessionYmd || !Number.isFinite(unix)) return true;
    const d = DT.fromSeconds(unix, { zone: ET_ZONE });
    return d.isValid && d.toISODate() === sessionYmd;
  }

  /** @param {string | undefined} dayYmd */
  static dayBounds(dayYmd) {
    const DT = globalThis.luxon?.DateTime;
    if (!DT || !dayYmd) return { start: -Infinity, end: Infinity };
    const startDt = DT.fromISO(dayYmd, { zone: ET_ZONE }).startOf("day");
    if (!startDt.isValid) return { start: -Infinity, end: Infinity };
    return {
      start: startDt.toSeconds(),
      end: startDt.plus({ days: 1 }).toSeconds(),
    };
  }

  static dateTime12h(d, includeWeekday) {
    const datePart = d.toLocaleDateString(undefined, {
      month: "2-digit",
      day: "2-digit",
      year: "2-digit",
    });
    const wk = includeWeekday ? `${d.toLocaleDateString(undefined, { weekday: "short" })} ` : "";
    return `${wk}${datePart} ${Format.time12h(d)}`;
  }

  /** @param {string} ymd */
  static shiftDay(ymd, deltaDays) {
    const DT = typeof globalThis.luxon !== "undefined" ? globalThis.luxon.DateTime : null;
    if (DT) {
      const d = DT.fromISO(ymd, { zone: ET_ZONE });
      if (!d.isValid) return ymd;
      return d.plus({ days: deltaDays }).toISODate();
    }
    const [y, m, day] = ymd.split("-").map(Number);
    const u = Date.UTC(y, m - 1, day + deltaDays);
    return new Date(u).toISOString().slice(0, 10);
  }

  static etFromBar(bar) {
    if (!bar) return "—";
    const d = new Date(bar.time * 1000);
    return d.toLocaleString("en-US", {
      timeZone: ET_ZONE,
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  static ohlc(symbol, bar, prev) {
    const fmt = (n) => Number(n).toFixed(2);
    let delta = "";
    if (prev) {
      const diff = bar.close - prev.close;
      const pct = (diff / prev.close) * 100;
      const sign = diff >= 0 ? "+" : "";
      const dir = diff >= 0 ? "up" : "down";
      delta = `<span class="ohlc-inline__delta ohlc-inline__delta--${dir}">${sign}${diff.toFixed(2)} (${sign}${pct.toFixed(2)}%)</span>`;
    }
    const pair = (lbl, val) =>
      `<span class="ohlc-inline__pair"><span class="ohlc-inline__lbl">${lbl}</span>${val}</span>`;
    return `<div class="ohlc-inline" role="group" aria-label="${symbol} OHLC">${pair("O", fmt(bar.open))}${pair("H", fmt(bar.high))}${pair("L", fmt(bar.low))}${pair("C", fmt(bar.close))}${delta}</div>`;
  }

  static toUnix(t) {
    if (typeof t === "number") return t;
    if (t && typeof t === "object" && "year" in t) {
      return Math.floor(new Date(t.year, t.month - 1, t.day).getTime() / 1000);
    }
    return 0;
  }
}

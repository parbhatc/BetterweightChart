import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ET_ZONE = "America/New_York";

const etMonthFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: ET_ZONE,
  year: "numeric",
  month: "long",
});

/** @param {number} unixSec @returns {{ year: string, month: string }} */
function etYearMonth(unixSec) {
  const parts = etMonthFmt.formatToParts(new Date(unixSec * 1000));
  return {
    year: parts.find((p) => p.type === "year")?.value ?? "2026",
    month: parts.find((p) => p.type === "month")?.value ?? "January",
  };
}

/** @param {string} csvRoot */
export function createCsvBarStore(csvRoot) {
  return new CsvBarStore(csvRoot);
}

export class CsvBarStore {
  /** @param {string} csvRoot */
  constructor(csvRoot) {
    this.csvRoot = csvRoot;
  }

  /** Symbol folders under `data/csv` (e.g. NQ, ES). */
  listSymbols() {
    if (!fs.existsSync(this.csvRoot)) return [];
    /** @type {string[]} */
    const out = [];
    for (const name of fs.readdirSync(this.csvRoot)) {
      const p = path.join(this.csvRoot, name);
      try {
        if (fs.statSync(p).isDirectory()) out.push(name.toUpperCase());
      } catch {
        //
      }
    }
    out.sort();
    return out;
  }

  /** @param {string} line */
  parseLine(line) {
    const parts = line.split(",");
    if (parts.length < 5) return null;
    const time = Number(parts[0]);
    const open = Number(parts[1]);
    const high = Number(parts[2]);
    const low = Number(parts[3]);
    const close = Number(parts[4]);
    const volume = parts.length > 5 ? Number(parts[5]) : 0;
    if (!Number.isFinite(time) || time <= 0) return null;
    if (![open, high, low, close].every(Number.isFinite)) return null;
    return {
      time,
      open,
      high,
      low,
      close,
      volume: Number.isFinite(volume) ? volume : 0,
    };
  }

  /** @param {string} line */
  splitBarRecords(line) {
    const trimmed = line.trim();
    if (!trimmed) return [];
    const chunks = trimmed.split(/(?=\d{10},)/).filter(Boolean);
    return chunks.length ? chunks : [trimmed];
  }

  /** @param {string} fp */
  readFileBars(fp) {
    if (!fs.existsSync(fp)) return [];
    /** @type {object[]} */
    const out = [];
    for (const line of fs.readFileSync(fp, "utf8").split(/\r?\n/)) {
      for (const chunk of this.splitBarRecords(line)) {
        const bar = this.parseLine(chunk);
        if (bar) out.push(bar);
      }
    }
    return out;
  }

  /** @param {string} symbol @param {string} year @param {string} month */
  monthFilePathParts(symbol, year, month) {
    return path.join(this.csvRoot, symbol.toUpperCase(), year, "1m", `${month}.csv`);
  }

  /** @param {number} unix */
  monthFilePath(symbol, unix) {
    const { year, month } = etYearMonth(unix);
    return this.monthFilePathParts(symbol, year, month);
  }

  /** @param {number} t0 @param {number} t1 @returns {{ year: string, month: string }[]} */
  monthsInRangeEt(t0, t1) {
    /** @type {{ year: string, month: string }[]} */
    const out = [];
    const seen = new Set();
    let cursor = t0;
    while (cursor <= t1) {
      const ym = etYearMonth(cursor);
      const key = `${ym.year}|${ym.month}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(ym);
      }
      cursor += 86400 * 28;
    }
    const endYm = etYearMonth(t1);
    const endKey = `${endYm.year}|${endYm.month}`;
    if (!seen.has(endKey)) out.push(endYm);
    return out;
  }

  /** @param {string} symbol @param {number} t0 @param {number} t1 */
  loadBarsInRange(symbol, t0, t1) {
    const sym = symbol.toUpperCase();
    /** @type {object[]} */
    const out = [];

    for (const { year, month } of this.monthsInRangeEt(t0, t1)) {
      const fp = this.monthFilePathParts(sym, year, month);
      for (const bar of this.readFileBars(fp)) {
        if (bar.time >= t0 && bar.time < t1) out.push(bar);
      }
    }

    out.sort((a, b) => a.time - b.time);
    return this.mergeDedupe(out);
  }

  /** @param {object[]} sorted */
  mergeDedupe(sorted) {
    /** @type {object[]} */
    const out = [];
    let lastT = null;
    for (const bar of sorted) {
      if (bar.time === lastT) out[out.length - 1] = bar;
      else {
        out.push(bar);
        lastT = bar.time;
      }
    }
    return out;
  }
}

export const CSV_ROOT = path.join(__dirname, "..", "..", "data", "csv");

/** @param {string} tvSymbol */
export function csvSymbolFromTv(tvSymbol) {
  const raw = String(tvSymbol ?? "").toUpperCase();
  if (raw.includes("NQ")) return "NQ";
  if (raw.includes("ES")) return "ES";
  const tail = raw.split(":").pop() ?? raw;
  const base = tail.replace(/[^A-Z0-9]/g, "");
  if (base.startsWith("NQ")) return "NQ";
  if (base.startsWith("ES")) return "ES";
  if (["NQ", "ES"].includes(base)) return base;
  return null;
}

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scrapeForexFactoryMonth } from "./ff-calendar-scrape.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..", "..", "..");

const MONTH_NAMES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DAY_MS = 24 * 60 * 60 * 1000;

/** @type {Map<string, Promise<void>>} */
const scrapeInFlight = new Map();

/**
 * @param {{ repoRoot?: string }} [roots]
 */
export function getNewsDirs(roots = {}) {
  const repoRoot = roots.repoRoot ?? REPO_ROOT;
  const dirs = [
    path.join(repoRoot, "data", "news"),
    path.join(repoRoot, "..", "testrealstrat", "data", "news"),
  ];
  if (process.env.NEWS_DIR) dirs.unshift(process.env.NEWS_DIR);
  return [...new Set(dirs.map((d) => path.normalize(d)))];
}

/** @param {string} dayYmd `YYYY-MM-DD` */
export function monthFileName(dayYmd) {
  const [, m] = dayYmd.split("-").map(Number);
  return MONTH_NAMES[m - 1] || "jan";
}

/**
 * @param {string} dayYmd
 * @param {{ repoRoot?: string }} [roots]
 * @returns {{ path: string, data: object } | null}
 */
export function loadMonthFile(dayYmd, roots) {
  const [y] = dayYmd.split("-");
  const file = `${monthFileName(dayYmd)}.json`;
  for (const root of getNewsDirs(roots)) {
    const fp = path.join(root, y, file);
    try {
      if (!fs.existsSync(fp)) continue;
      const data = JSON.parse(fs.readFileSync(fp, "utf8"));
      return { path: fp, data };
    } catch (e) {
      console.warn("[ff-calendar] read failed:", fp, e.message || e);
    }
  }
  return null;
}

/** @param {{ scrapeIfMissing?: boolean }} [opts] */
export function shouldAutoScrape(opts = {}) {
  if (process.env.FF_SCRAPE === "0") return false;
  if (opts.scrapeIfMissing === false) return false;
  return true;
}

export function monthRefreshMs() {
  const days = Number(process.env.FF_REFRESH_DAYS) || 1;
  return Math.max(1, days) * DAY_MS;
}

/**
 * @param {{ repoRoot?: string }} roots
 */
export function newsSaveRoot(roots) {
  return path.join(roots.repoRoot ?? REPO_ROOT, "data", "news");
}

/** @param {string} dayYmd @param {{ repoRoot?: string }} roots @param {{ scrapeIfMissing?: boolean }} [opts] */
export function needsMonthScrape(dayYmd, roots, opts) {
  if (!shouldAutoScrape(opts)) return false;
  const loaded = loadMonthFile(dayYmd, roots);
  if (!loaded) return true;
  const lastUpdated = loaded.data?.lastUpdated;
  if (!lastUpdated) return true;
  const ageMs = Date.now() - new Date(lastUpdated).getTime();
  return ageMs >= monthRefreshMs();
}

/**
 * @param {string} dayYmd
 * @param {{ repoRoot?: string }} roots
 * @param {string} saveRoot
 * @param {{ scrapeIfMissing?: boolean }} [opts]
 */
export async function ensureMonthFile(dayYmd, roots, saveRoot, opts) {
  const loaded = loadMonthFile(dayYmd, roots);
  if (loaded && !needsMonthScrape(dayYmd, roots, opts)) return loaded;
  if (!shouldAutoScrape(opts)) return loaded;

  const [y, m] = dayYmd.split("-").map(Number);
  const key = `${y}-${String(m).padStart(2, "0")}`;
  let flight = scrapeInFlight.get(key);
  if (!flight) {
    flight = (async () => {
      try {
        const reason = loaded ? `${key} stale (>${Number(process.env.FF_REFRESH_DAYS) || 1}d)` : `${key} missing`;
        console.log(`[ff-calendar] ${reason} — scraping Forex Factory month…`);
        await scrapeForexFactoryMonth(y, m, saveRoot);
      } finally {
        scrapeInFlight.delete(key);
      }
    })();
    scrapeInFlight.set(key, flight);
  }
  try {
    await flight;
  } catch (e) {
    console.warn("[ff-calendar] scrape failed:", e.message || e);
    return loaded ?? loadMonthFile(dayYmd, roots);
  }
  return loadMonthFile(dayYmd, roots) ?? loaded;
}

/** `8:30am` → `08:30` ET */
export function parseFfTimeEt(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (!s || /all day|tentative|^day \d|^\d+$/.test(s)) return null;
  const m = s.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2];
  if (m[3] === "pm" && h !== 12) h += 12;
  if (m[3] === "am" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${min}`;
}

/** @param {object} ev */
export function formatEvent(ev) {
  const impactRaw = String(ev.impact || "low").toLowerCase();
  const impact =
    impactRaw === "high" ? "High" : impactRaw === "medium" ? "Medium" : impactRaw === "holiday" ? "Holiday" : "Low";
  const timeLabel = ev.timeLabel || ev.time || "—";
  return {
    id: ev.id || null,
    title: ev.event || ev.name || "Unknown",
    country: ev.currency || ev.country || "N/A",
    impact,
    hmEt: parseFfTimeEt(timeLabel),
    timeLabel,
    forecast: ev.forecast || null,
    previous: ev.previous || null,
    actual: ev.actual || null,
    url: ev.url || null,
  };
}

/** @param {string} hm */
function hmToMinutes(hm) {
  const p = String(hm).split(":");
  if (p.length < 2) return null;
  return Number(p[0]) * 60 + Number(p[1]);
}

/**
 * @param {object} opts
 * @param {string} opts.dayYmd
 * @param {string} [opts.currencies]
 * @param {string} [opts.impact]
 * @param {string} [opts.types] comma-separated event type ids (ppi, cpi, fomc)
 * @param {string} [opts.repoRoot]
 * @param {boolean} [opts.scrapeIfMissing]
 */
export async function fetchForexFactoryDay(opts) {
  const dayYmd = opts.dayYmd;
  const roots = { repoRoot: opts.repoRoot ?? REPO_ROOT };
  const currencySet = new Set(
    String(opts.currencies || "USD")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean),
  );
  const impactFilter = String(opts.impact || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const typeFilter = String(opts.types || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  let loaded = loadMonthFile(dayYmd, roots);
  let source = loaded ? "cache" : null;

  if (needsMonthScrape(dayYmd, roots, opts)) {
    const saveRoot = newsSaveRoot(roots);
    const refreshed = await ensureMonthFile(dayYmd, roots, saveRoot, opts);
    if (refreshed) {
      loaded = refreshed;
      source = source === "cache" ? "cache" : "forexfactory-scrape";
    }
  }

  if (!loaded) {
    return {
      day: dayYmd,
      source: "none",
      timeZone: "America/New_York",
      events: [],
      error: shouldAutoScrape(opts)
        ? "No news file — auto-scrape failed (is puppeteer installed? run: npm install puppeteer)"
        : "No news file — add data/news/{year}/{month}.json or unset FF_SCRAPE=0",
    };
  }

  const { path: filePath, data } = loaded;
  /** @type {any[]} */
  let raw = [];
  if (data.events && typeof data.events === "object" && !Array.isArray(data.events)) {
    raw = data.events[dayYmd] || [];
  } else if (Array.isArray(data.events)) {
    raw = data.events.filter((e) => e.date === dayYmd);
  }

  const out = [];
  for (const ev of raw) {
    const country = String(ev.currency || ev.country || "").toUpperCase();
    if (currencySet.size && !currencySet.has(country) && country !== "ALL") continue;
    const impact = String(ev.impact || "low").toLowerCase();
    if (impactFilter.length && !impactFilter.includes(impact)) continue;
    const formatted = formatEvent(ev);
    if (typeFilter.length && !eventMatchesTypes(formatted.title, typeFilter)) continue;
    out.push(formatted);
  }

  out.sort((a, b) => {
    const am = a.hmEt ? hmToMinutes(a.hmEt) : 9999;
    const bm = b.hmEt ? hmToMinutes(b.hmEt) : 9999;
    if (am !== bm) return am - bm;
    return a.title.localeCompare(b.title);
  });

  return {
    day: dayYmd,
    source: source || "forexfactory",
    timeZone: "America/New_York",
    file: filePath,
    events: out,
  };
}

/** @param {string} title @param {string[]} types */
export function eventMatchesTypes(title, types) {
  const t = String(title ?? "").trim().toLowerCase();
  for (const type of types) {
    if (type === "ppi" && (/^core ppi m\/m$/.test(t) || /^ppi m\/m$/.test(t))) return true;
    if (type === "cpi" && (/^core cpi m\/m$/.test(t) || /^cpi m\/m$/.test(t))) return true;
    if (
      type === "fomc" &&
      /^fomc (statement|press conference|economic projections|meeting minutes)$/.test(t)
    ) {
      return true;
    }
    if (type && t.includes(type)) return true;
  }
  return false;
}

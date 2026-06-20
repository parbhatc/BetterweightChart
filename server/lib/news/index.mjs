import { fetchForexFactoryDay } from "./ff-calendar.mjs";

export const NEWS_SOURCES = [
  { id: "forexfactory", label: "ForexFactory" },
];

export const DEFAULT_NEWS_TYPES = [
  { id: "ppi", label: "PPI" },
  { id: "cpi", label: "CPI" },
  { id: "fomc", label: "FOMC" },
];

export function newsConfig() {
  return {
    sources: NEWS_SOURCES,
    default_source: "forexfactory",
    default_types: ["ppi", "cpi", "fomc"],
    default_currencies: "USD",
    time_zone: "America/New_York",
    endpoints: {
      config: "/news/config",
      calendar: "/news/calendar?day=YYYY-MM-DD&source=forexfactory&currencies=USD&types=ppi,cpi,fomc",
    },
  };
}

/**
 * @param {URLSearchParams} sp
 */
export async function newsCalendar(sp) {
  const day = sp.get("day") || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return { error: "day=YYYY-MM-DD required", events: [] };
  }

  const source = (sp.get("source") || "forexfactory").toLowerCase();
  if (source !== "forexfactory") {
    return { error: `Unknown news source: ${source}`, day, events: [] };
  }

  return fetchForexFactoryDay({
    dayYmd: day,
    currencies: sp.get("currencies") || "USD",
    impact: sp.get("impact") || "",
    types: sp.get("types") || "",
    scrapeIfMissing: sp.get("scrape") !== "0",
  });
}

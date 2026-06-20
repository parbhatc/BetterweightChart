/**
 * HTTP news calendar client — mirrors the datafeed client pattern.
 */

/**
 * @param {string} [baseUrl]
 */
export function createNewsClient(baseUrl = "/news") {
  const root = baseUrl.replace(/\/$/, "");
  /** @type {Promise<import("./types.js").NewsConfig> | null} */
  let readyPromise = null;

  async function getJson(path) {
    const res = await fetch(`${root}${path}`);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `HTTP ${res.status}`);
    }
    return res.json();
  }

  return {
    /** @returns {Promise<import("./types.js").NewsConfig>} */
    onReady() {
      if (!readyPromise) readyPromise = getJson("/config");
      return readyPromise;
    },

    /**
     * @param {string} dayYmd `YYYY-MM-DD`
     * @param {{ source?: string, currencies?: string, types?: string[], impact?: string, scrape?: boolean }} [opts]
     * @returns {Promise<import("./types.js").NewsCalendarResponse>}
     */
    async fetchCalendar(dayYmd, opts = {}) {
      const q = new URLSearchParams({ day: dayYmd });
      if (opts.source) q.set("source", opts.source);
      if (opts.currencies) q.set("currencies", opts.currencies);
      if (opts.types?.length) q.set("types", opts.types.join(","));
      if (opts.impact) q.set("impact", opts.impact);
      if (opts.scrape === false) q.set("scrape", "0");

      const res = await fetch(`${root}/calendar?${q}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          day: dayYmd,
          source: opts.source ?? "forexfactory",
          timeZone: "America/New_York",
          events: [],
          error: data.error || res.statusText,
        };
      }
      return data;
    },
  };
}

export { createNewsClient as createNewsFeed };

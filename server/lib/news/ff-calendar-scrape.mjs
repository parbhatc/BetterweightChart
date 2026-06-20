/**
 * ForexFactory calendar scrape (same approach as NexusSyncPro EconomicNewsController).
 * Requires: npm install puppeteer
 */

import fs from "node:fs";
import path from "node:path";

const MONTH_NAMES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export class FfCalendarScraper {
  /**
   * @param {number} year
   * @param {number} month 1-12
   * @param {string} saveRoot directory for data/news/{year}/{month}.json
   */
  static async scrapeForexFactoryMonth(year, month, saveRoot) {
    let puppeteer;
    try {
      puppeteer = (await import("puppeteer")).default;
    } catch {
      throw new Error("puppeteer not installed — run: npm install puppeteer");
    }

    const monthName = MONTH_NAMES[month - 1];
    const url = `https://www.forexfactory.com/calendar?month=${monthName}1.${year}`;

    console.log(`[ff-calendar] Scraping ${url}`);

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
      );
      await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
      await new Promise((r) => setTimeout(r, 5000));

      const calendarData = await page.evaluate(() => {
        if (window.calendarComponentStates && window.calendarComponentStates[1]) {
          return window.calendarComponentStates[1];
        }
        return null;
      });

      if (!calendarData?.days) {
        throw new Error("calendarComponentStates not found on page");
      }

      /** @type {object[]} */
      const allEvents = [];
      for (let dayIndex = 0; dayIndex < calendarData.days.length; dayIndex++) {
        const day = calendarData.days[dayIndex];
        if (!day.events?.length) continue;

        let normalizedDate = null;
        if (day.dateline != null) {
          const ts = typeof day.dateline === "number" ? day.dateline : parseInt(day.dateline, 10);
          if (!Number.isNaN(ts) && ts > 0) {
            const dateObj = new Date(ts * 1000);
            const formatter = new Intl.DateTimeFormat("en-US", {
              timeZone: "America/New_York",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            });
            const parts = formatter.formatToParts(dateObj);
            normalizedDate = `${parts.find((p) => p.type === "year").value}-${parts.find((p) => p.type === "month").value}-${parts.find((p) => p.type === "day").value}`;
          }
        }
        if (!normalizedDate) {
          const estimatedDay = dayIndex + 1;
          normalizedDate = `${year}-${String(month).padStart(2, "0")}-${String(estimatedDay).padStart(2, "0")}`;
        }

        for (const event of day.events) {
          allEvents.push(FfCalendarScraper.formatRawEvent(event, normalizedDate, year, month));
        }
      }

      const eventsByDate = {};
      for (const ev of allEvents) {
        if (!ev.date) continue;
        if (!eventsByDate[ev.date]) eventsByDate[ev.date] = [];
        eventsByDate[ev.date].push(ev);
      }

      const outDir = path.join(saveRoot, String(year));
      fs.mkdirSync(outDir, { recursive: true });
      const outPath = path.join(outDir, `${monthName}.json`);
      const payload = { events: eventsByDate, lastUpdated: new Date().toISOString() };
      fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
      console.log(`[ff-calendar] Saved ${allEvents.length} events → ${outPath}`);
      return payload;
    } finally {
      await browser.close();
    }
  }

  static formatRawEvent(event, date, year, month) {
    let impact = "low";
    if (event.impactName === "high" || event.impactName === "red") impact = "high";
    else if (event.impactName === "medium" || event.impactName === "orange") impact = "medium";

    const name = event.name || event.prefencedName || "Unknown Event";
    return {
      id: `${year}-${String(month).padStart(2, "0")}-${event.id || Date.now()}-${name.slice(0, 20)}`
        .replace(/[^a-zA-Z0-9-]/g, "-")
        .toLowerCase(),
      date,
      time: event.timeLabel || event.time || "All Day",
      timeLabel: event.timeLabel || event.time || null,
      currency: event.currency || "N/A",
      event: name,
      impact,
      forecast: event.forecast || null,
      previous: event.previous || null,
      actual: event.actual || null,
    };
  }
}

export const scrapeForexFactoryMonth = FfCalendarScraper.scrapeForexFactoryMonth;

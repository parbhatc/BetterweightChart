import { fetchTradingViewBars } from "../server/lib/tradingview/client.mjs";
import { aggregateBars } from "../public/js/indicators/math/aggregate.js";
import { shiftBarsToChartTime } from "../public/js/chart/timezone/chartTime.js";

function chicagoUnixSec(y, m, d, hour, minute = 0) {
  const target = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const base = Date.UTC(y, m - 1, d, 12, 0, 0) / 1000;
  for (let t = base - 36 * 3600; t <= base + 36 * 3600; t += 60) {
    const parts = Object.fromEntries(fmt.formatToParts(new Date(t * 1000)).map((p) => [p.type, p.value]));
    const got = `${parts.year}-${parts.month}-${parts.day} ${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}`;
    if (got === target) return t;
  }
  throw new Error(`Could not resolve ${target}`);
}

function fmtChicago(unixSec) {
  return new Date(unixSec * 1000).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function fvgAtBar(bars, i, tfSec = 900) {
  if (i < 2 || i >= bars.length) return null;
  const b0 = bars[i - 2];
  const b1 = bars[i - 1];
  const b2 = bars[i];
  if (b1.time - b0.time > tfSec || b2.time - b1.time > tfSec) return null;
  if (b2.low > b0.high) return { kind: "bull", barIndex: i - 2 };
  if (b2.high < b0.low) return { kind: "bear", barIndex: i - 2 };
  return null;
}

function listFvgs(bars, tfSec, dayStart, dayEnd) {
  for (let i = 2; i < bars.length; i++) {
    const confirm = bars[i];
    if (confirm.time < dayStart || confirm.time > dayEnd) continue;
    const hit = fvgAtBar(bars, i, tfSec);
    if (!hit) continue;
    console.log(
      `  ${hit.kind} start=${fmtChicago(bars[hit.barIndex].time)} confirm=${fmtChicago(confirm.time)}`,
    );
  }
}

const to = chicagoUnixSec(2026, 6, 17, 19, 0);
const dayStart = chicagoUnixSec(2026, 6, 17, 15, 0);
const dayEnd = chicagoUnixSec(2026, 6, 17, 19, 0);

console.log("=== Native 15m 6/17 afternoon ===");
const { bars: htf } = await fetchTradingViewBars("CME_MINI:NQ1!", "15", 900, { to });
listFvgs(htf, 900, dayStart, dayEnd);

console.log("\n=== Aggregated 1m→15m 6/17 afternoon ===");
const { bars: utc1m } = await fetchTradingViewBars("CME_MINI:NQ1!", "1", 2500, { to });
const chart1m = shiftBarsToChartTime(utc1m, "America/Chicago");
const agg = aggregateBars(utc1m, 900, 60, (_, i) => chart1m[i].time);
listFvgs(agg, 900, dayStart, dayEnd);

console.log("\n=== Native 15m 6/12 afternoon ===");
const to12 = chicagoUnixSec(2026, 6, 12, 17, 0);
const start12 = chicagoUnixSec(2026, 6, 12, 15, 0);
const end12 = chicagoUnixSec(2026, 6, 12, 18, 0);
const { bars: htf12 } = await fetchTradingViewBars("CME_MINI:NQ1!", "15", 1500, { to: to12 });
listFvgs(htf12, 900, start12, end12);

console.log("\n=== Aggregated 1m→15m 6/12 afternoon ===");
const { bars: utc1m12 } = await fetchTradingViewBars("CME_MINI:NQ1!", "1", 3000, { to: to12 });
const chart1m12 = shiftBarsToChartTime(utc1m12, "America/Chicago");
const agg12 = aggregateBars(utc1m12, 900, 60, (_, i) => chart1m12[i].time);
console.log("last agg bar", fmtChicago(agg12.at(-1).time));
listFvgs(agg12, 900, start12, end12);

for (const { h, min } of [
  { h: 16, min: 30 },
  { h: 16, min: 45 },
  { h: 15, min: 30 },
  { h: 15, min: 45 },
]) {
  const t = chicagoUnixSec(2026, 6, 12, h, min);
  const bucket = Math.floor(t / 900) * 900;
  const idx = agg12.findIndex((b) => b.time === bucket);
  if (idx >= 0) {
    const hit = fvgAtBar(agg12, idx, 900);
    console.log(`bucket ${fmtChicago(bucket)} idx=${idx} fvgConfirm=${hit?.kind ?? "none"}`);
  } else {
    console.log(`bucket ${fmtChicago(bucket)} NOT FOUND`);
  }
}

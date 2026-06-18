/**
 * Verify TV-style FVG gap rule against 6/12–6/14 weekend pattern.
 */
import { fetchTradingViewBars } from "../server/lib/tradingview/client.mjs";

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

function fmt(unixSec, tz = "America/New_York") {
  return new Date(unixSec * 1000).toLocaleString("en-US", {
    timeZone: tz,
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
  if (b2.time - b1.time > tfSec) return null;
  if (b2.low > b0.high) return { kind: "bull", barIndex: i - 2, top: b2.low, bottom: b0.high };
  if (b2.high < b0.low) return { kind: "bear", barIndex: i - 2, top: b0.low, bottom: b2.high };
  return null;
}

const { bars } = await fetchTradingViewBars("CME_MINI:NQ1!", "15", 1500, {
  to: chicagoUnixSec(2026, 6, 15, 0, 0),
});

console.log("Bars", bars.length, fmt(bars[0].time), "→", fmt(bars.at(-1).time));

const weekend = [];
const morning = [];
for (let i = 2; i < bars.length; i++) {
  const hit = fvgAtBar(bars, i, 900);
  if (!hit) continue;
  const start = bars[hit.barIndex];
  const confirm = bars[i];
  const row = {
    kind: hit.kind,
    startET: fmt(start.time),
    confirmET: fmt(confirm.time),
    startCT: fmt(start.time, "America/Chicago"),
    confirmCT: fmt(confirm.time, "America/Chicago"),
    bottom: hit.bottom,
    top: hit.top,
    g21: bars[i - 1].time - start.time,
    g32: confirm.time - bars[i - 1].time,
  };
  if (start.time >= chicagoUnixSec(2026, 6, 12, 0, 0) && confirm.time <= chicagoUnixSec(2026, 6, 15, 0, 0)) {
    if (start.time >= chicagoUnixSec(2026, 6, 12, 8, 0) && confirm.time <= chicagoUnixSec(2026, 6, 12, 11, 0)) {
      morning.push(row);
    } else {
      weekend.push(row);
    }
  }
}

console.log("\n=== 6/12 morning (expect 9:45–10:15 ET) ===");
for (const r of morning) {
  console.log(`${r.kind} start=${r.startET} confirm=${r.confirmET} zone ${r.bottom}–${r.top}`);
}

console.log("\n=== 6/12 Fri → 6/14 Sun FVGs ===");
for (const r of weekend) {
  console.log(
    `${r.kind} start=${r.startET} (${r.startCT}) confirm=${r.confirmET} (${r.confirmCT}) g21=${r.g21}s g32=${r.g32}s zone ${r.bottom}–${r.top}`,
  );
}

const has430 = weekend.some((r) => r.startET.includes("4:30 PM") && r.startET.includes("6/12"));
const has445 = weekend.some((r) => r.startET.includes("4:45 PM") && r.startET.includes("6/12"));
const has615 = weekend.some((r) => r.confirmET.includes("6:15 PM") && r.confirmET.includes("6/14"));
console.log("\n4:30 PM 6/12 start (should be false):", has430);
console.log("4:45 PM 6/12 start (should be true):", has445);
console.log("6:15 PM 6/14 confirm (should be true):", has615);

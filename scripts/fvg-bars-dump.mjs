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

function printWindow(bars, y, m, d, hours) {
  console.log(`\n--- ${m}/${d}/${y} ---`);
  for (const { h, min } of hours) {
    const bucket = Math.floor(chicagoUnixSec(y, m, d, h, min) / 900) * 900;
    const b = bars.find((x) => x.time === bucket);
    if (b) console.log(fmtChicago(b.time), "O", b.open, "H", b.high, "L", b.low, "C", b.close);
    else console.log(fmtChicago(bucket), "MISSING");
  }
}

const { bars: b17 } = await fetchTradingViewBars("CME_MINI:NQ1!", "15", 900, {
  to: chicagoUnixSec(2026, 6, 17, 19, 0),
});
const { bars: b14 } = await fetchTradingViewBars("CME_MINI:NQ1!", "15", 900, {
  to: chicagoUnixSec(2026, 6, 15, 0, 0),
});
const { bars: b12 } = await fetchTradingViewBars("CME_MINI:NQ1!", "15", 1500, {
  to: chicagoUnixSec(2026, 6, 12, 17, 0),
});

const times = [
  { h: 16, min: 15 },
  { h: 16, min: 30 },
  { h: 16, min: 45 },
  { h: 17, min: 0 },
  { h: 17, min: 45 },
  { h: 18, min: 0 },
  { h: 18, min: 15 },
  { h: 18, min: 30 },
];

printWindow(b12, 2026, 6, 12, times);
printWindow(b14, 2026, 6, 14, times);
printWindow(b17, 2026, 6, 17, times);

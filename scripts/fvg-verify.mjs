/**
 * Fetch 15m bars via TV WS and check FVG at specific Chicago wall times.
 * Usage: node scripts/fvg-verify.mjs
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
  throw new Error(`Could not resolve Chicago time ${target}`);
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
  const g1 = b1.time - b0.time;
  const g2 = b2.time - b1.time;
  if (g1 > tfSec || g2 > tfSec) return null;
  if (b2.low > b0.high) {
    return { kind: "bull", top: b2.low, bottom: b0.high, barIndex: i - 2, g1, g2 };
  }
  if (b2.high < b0.low) {
    return { kind: "bear", top: b0.low, bottom: b2.high, barIndex: i - 2, g1, g2 };
  }
  return null;
}

function gapSec(bars, i) {
  if (i < 1) return 0;
  return bars[i].time - bars[i - 1].time;
}

const TARGETS = [
  { label: "6/12 4:30pm — should NOT be FVG", y: 2026, m: 6, d: 12, h: 16, min: 30, expect: false },
  { label: "6/12 4:45pm — should BE FVG", y: 2026, m: 6, d: 12, h: 16, min: 45, expect: true },
  { label: "6/14 6:00pm — should NOT be FVG", y: 2026, m: 6, d: 14, h: 18, min: 0, expect: false },
  { label: "6/14 6:15pm — should BE FVG", y: 2026, m: 6, d: 14, h: 18, min: 15, expect: true },
];

const FETCHES = [
  { label: "6/12 afternoon", to: chicagoUnixSec(2026, 6, 12, 17, 0), countBack: 1500 },
  { label: "6/14 evening", to: chicagoUnixSec(2026, 6, 15, 0, 0), countBack: 900 },
  { label: "6/17 afternoon (reference)", to: chicagoUnixSec(2026, 6, 17, 19, 0), countBack: 900 },
];

function findBarAtOpen(bars, unixSec) {
  const bucket = Math.floor(unixSec / 900) * 900;
  const idx = bars.findIndex((b) => b.time === bucket);
  return { bucket, idx };
}

function runChecks(bars, tfSec = 900) {
  console.log("\n--- Bars around targets ---");
  for (const t of TARGETS) {
    const open = chicagoUnixSec(t.y, t.m, t.d, t.h, t.min);
    const { bucket, idx } = findBarAtOpen(bars, open);
    console.log(`\n${t.label}`);
    console.log("  bucket:", fmtChicago(bucket));
    if (idx < 0) {
      console.log("  BAR NOT FOUND");
      continue;
    }
    for (let j = Math.max(0, idx - 2); j <= Math.min(bars.length - 1, idx + 1); j++) {
      const b = bars[j];
      const hit = fvgAtBar(bars, j, tfSec);
      console.log(
        `  [${j}] ${fmtChicago(b.time)} O=${b.open} H=${b.high} L=${b.low} C=${b.close} gap=${gapSec(bars, j)}s${hit ? ` FVG@${j} ${hit.kind}` : ""}${j === idx ? " <-- target" : ""}`,
      );
    }
    const hit = fvgAtBar(bars, idx, tfSec);
    const ok = Boolean(hit) === t.expect;
    console.log(`  confirm FVG at target bar: ${hit ? hit.kind : "none"} — ${ok ? "OK" : "MISMATCH"}`);
  }

  console.log("\n--- All FVGs (with gap filter) ---");
  for (let i = 2; i < bars.length; i++) {
    const hit = fvgAtBar(bars, i, tfSec);
    if (!hit) continue;
    const start = bars[hit.barIndex];
    const confirm = bars[i];
    console.log(
      `  ${hit.kind} start=${fmtChicago(start.time)} confirm=${fmtChicago(confirm.time)} g1=${hit.g1} g2=${hit.g2}`,
    );
  }
}

for (const fetch of FETCHES) {
  console.log(`\n========== ${fetch.label} ==========`);
  console.log("Fetching to", fmtChicago(fetch.to));
  const { bars } = await fetchTradingViewBars("CME_MINI:NQ1!", "15", fetch.countBack, { to: fetch.to });
  console.log("Got", bars.length, "bars,", fmtChicago(bars[0]?.time), "→", fmtChicago(bars.at(-1)?.time));
  runChecks(bars);
}

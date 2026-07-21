import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

import { rollingMeanStdDev } from "../public/js/indicators/math/rolling.js";
import { computeVolumeProfile } from "../public/js/indicators/math/volumeProfile.js";
import { defineIndicator } from "../public/js/indicators/defineIndicator.js";
import BollingerBandsIndicator from "../public/js/indicators/definitions/bollingerBands/BollingerBandsIndicator.js";
import VwapIndicator from "../public/js/indicators/definitions/vwap/VwapIndicator.js";
import RsiIndicator from "../public/js/indicators/definitions/rsi/RsiIndicator.js";
import MacdIndicator from "../public/js/indicators/definitions/macd/MacdIndicator.js";
import VolumeIndicator from "../public/js/indicators/definitions/volume/VolumeIndicator.js";
import VolumeProfileIndicator from "../public/js/indicators/definitions/volumeProfile/VolumeProfileIndicator.js";
import FixedRangeVolumeProfileIndicator from "../public/js/indicators/definitions/volumeProfile/FixedRangeVolumeProfileIndicator.js";
import EmaIndicator from "../public/js/indicators/definitions/ema/EMAIndicator.js";
import PivotPointsHlIndicator from "../public/js/indicators/definitions/pivot/PivotPointsHlIndicator.js";

const bar = (time, open, high, low, close, volume = 1) => ({ time, open, high, low, close, volume });

function indicatorDefaults(Indicator) {
  const fields = (Indicator.inputs ?? []).flatMap((input) => {
    if (Array.isArray(input.fields)) return input.fields;
    if (input.left || input.right) return [input.left, input.right].filter(Boolean);
    return [input];
  });
  return Object.fromEntries(
    fields.filter((field) => field?.id).map((field) => [field.id, field.defval]),
  );
}

test("TradingView-compatible indicators retain their audited default inputs", () => {
  assert.deepEqual(indicatorDefaults(EmaIndicator), {
    length: 9,
    source: "close",
    offset: 0,
    smoothingType: "none",
    smoothingLength: 14,
    bbStdDev: 2,
    timeframe: "chart",
    waitForClose: true,
  });
  assert.deepEqual(indicatorDefaults(VolumeIndicator), {
    maLength: 20,
    colorBasedOnPrevClose: false,
  });
  assert.deepEqual(indicatorDefaults(RsiIndicator), {
    length: 14,
    source: "close",
    smoothingType: "sma",
    smoothingLength: 14,
    bbStdDev: 2,
    timeframe: "chart",
    waitForClose: true,
  });
  assert.deepEqual(indicatorDefaults(MacdIndicator), {
    source: "close",
    fastLength: 12,
    slowLength: 26,
    signalLength: 9,
    oscillatorMaType: "ema",
    signalMaType: "ema",
    timeframe: "chart",
    waitForClose: true,
  });
  assert.deepEqual(indicatorDefaults(BollingerBandsIndicator), {
    length: 20,
    basisMaType: "sma",
    source: "close",
    stdDev: 2,
    offset: 0,
    timeframe: "chart",
    waitForClose: true,
  });
  assert.deepEqual(indicatorDefaults(PivotPointsHlIndicator), {
    leftLenH: 10,
    rightLenH: 10,
    leftLenL: 10,
    rightLenL: 10,
  });
  assert.deepEqual(indicatorDefaults(VwapIndicator), {
    hideOnDailyOrAbove: true,
    anchor: "session",
    source: "hlc3",
    offset: 0,
    bandsMode: "standard_deviation",
    band1Enabled: true,
    band1Multiplier: 1,
    band2Enabled: false,
    band2Multiplier: 2,
    band3Enabled: false,
    band3Multiplier: 3,
    timeframe: "chart",
    waitForClose: true,
  });
  assert.deepEqual(indicatorDefaults(VolumeProfileIndicator), {
    numberOfBars: 150,
    rowSize: 24,
    valueAreaPercent: 70,
    width: 2,
    showPoc: true,
    upColor: { color: "#26a69a", opacity: 75 },
    downColor: { color: "#ec407a", opacity: 75 },
    valueAreaUpColor: { color: "#00bcd4", opacity: 90 },
    valueAreaDownColor: { color: "#f06292", opacity: 90 },
    pocColor: { color: "#f23645", opacity: 100 },
  });
});

test("VWAP requests enough chart history to include the exchange session open", () => {
  assert.equal(VwapIndicator.requiredChartBars({ anchor: "session" }, "1"), 1440);
  assert.equal(VwapIndicator.requiredChartBars({ anchor: "session" }, "5"), 288);
  assert.equal(
    VwapIndicator.requiredChartBars({ anchor: "session", hideOnDailyOrAbove: true }, "1D"),
    0,
  );
  assert.equal(VwapIndicator.requiredChartBars({ anchor: "week" }, "1"), 4000);
});

test("rolling moments match population statistics without allocating windows", () => {
  const result = rollingMeanStdDev([1, 2, 3, 4], 3);
  assert.deepEqual(result.mean, [null, null, 2, 3]);
  assert.ok(Math.abs(result.stdDev[2] - Math.sqrt(2 / 3)) < 1e-12);
  assert.equal(result.stdDev[0], null);
  assert.deepEqual(rollingMeanStdDev([], 20), { mean: [], stdDev: [] });
});

test("Bollinger Bands use configurable basis, population deviation, and offset", () => {
  const bars = [1, 2, 3, 4].map((close, i) => bar(i * 60, close, close, close, close, 10));
  const instance = BollingerBandsIndicator.createInstance(0);
  instance.inputs = { ...instance.inputs, length: 3, stdDev: 2, offset: 1 };
  const plots = BollingerBandsIndicator.compute(bars, instance);
  assert.equal(plots.basis[2], null);
  assert.equal(plots.basis[3], 2);
  assert.ok(Math.abs(plots.upper[3] - (2 + 2 * Math.sqrt(2 / 3))) < 1e-12);
  assert.ok(Math.abs(plots.lower[3] - (2 - 2 * Math.sqrt(2 / 3))) < 1e-12);
});

test("EMA uses a complete warm-up and supports negative display offsets", () => {
  const bars = [1, 2, 3, 4, 5, 6].map((close, i) => bar(i * 60, close, close, close, close, 10));
  const instance = EmaIndicator.createInstance(0);
  instance.inputs = { ...instance.inputs, length: 3, offset: -1, smoothingType: "none" };
  const plots = EmaIndicator.compute(bars, instance);
  assert.deepEqual(plots.ema, [null, 2, 3, 4, 5, null]);
});

test("VWAP resets at anchors, weights by volume, exposes bands, and hides on daily", () => {
  const day1 = Date.UTC(2026, 0, 2) / 1000;
  const day2 = day1 + 86400;
  const bars = [
    bar(day1 + 60, 1, 1, 1, 1, 1),
    bar(day1 + 120, 3, 3, 3, 3, 3),
    bar(day2 + 60, 5, 5, 5, 5, 2),
  ];
  const instance = VwapIndicator.createInstance(0);
  instance._chartResolution = "1";
  const plots = VwapIndicator.compute(bars, instance);
  assert.deepEqual(plots.vwap, [1, 2.5, 5]);
  assert.ok(plots.upper1[1] > plots.vwap[1]);
  assert.ok(plots.lower1[1] < plots.vwap[1]);

  instance._chartResolution = "1D";
  assert.deepEqual(VwapIndicator.compute(bars, instance).vwap, [null, null, null]);
});

test("VWAP session anchor follows the exchange session instead of UTC midnight", () => {
  const instance = VwapIndicator.createInstance(0);
  instance._chartResolution = "1";
  instance._symbolInfo = { timezone: "America/Chicago", session: "1700-1600" };
  const bars = [
    // 17:01 CT starts the overnight CME session.
    bar(Date.UTC(2026, 6, 20, 22, 1) / 1000, 10, 10, 10, 10, 1),
    // Midnight UTC must not reset that same exchange session.
    bar(Date.UTC(2026, 6, 21, 0, 1) / 1000, 20, 20, 20, 20, 1),
    // The next 17:00 CT opening starts a fresh session.
    bar(Date.UTC(2026, 6, 21, 22, 1) / 1000, 40, 40, 40, 40, 1),
  ];

  const plots = VwapIndicator.compute(bars, instance);
  assert.deepEqual(plots.vwap, [10, 15, 40]);
  assert.equal(instance.style.vwapColor, "#2962ff");
});

test("RSI matches Wilder edge behavior and supports TradingView smoothing bands", () => {
  const bars = Array.from({ length: 20 }, (_, i) => bar(i * 60, 10, 10, 10, 10, 1));
  const instance = RsiIndicator.createInstance(0);
  instance.inputs = { ...instance.inputs, smoothingType: "sma_bb", smoothingLength: 3, bbStdDev: 2 };
  const plots = RsiIndicator.compute(bars, instance);
  assert.equal(plots.rsi[14], 50);
  assert.equal(plots.smoothed[16], 50);
  assert.equal(plots.smoothingUpper[16], 50);
  assert.equal(plots.smoothingLower[16], 50);
  assert.equal(plots.upper[0], 70);
  assert.equal(plots.lower[0], 30);
});

test("MACD inputs match TradingView MA choices and Volume handles candle directions", () => {
  const macdTypes = MacdIndicator.inputs.find((input) => input.id === "oscillatorMaType").options;
  assert.deepEqual(macdTypes.map((item) => item.id), ["ema", "sma"]);

  const instance = VolumeIndicator.createInstance(0);
  const plots = VolumeIndicator.compute([
    bar(0, 1, 2, 1, 2, 10),
    bar(60, 2, 2, 1, 1, 20),
  ], instance);
  assert.deepEqual(plots.vol, [10, 20]);
  assert.notEqual(plots.volColors[0], plots.volColors[1]);
});

test("volume profile preserves volume, identifies POC/value area, and handles empty bars", () => {
  assert.deepEqual(computeVolumeProfile([]).rows, []);
  const bars = [
    bar(0, 10, 12, 10, 12, 100),
    bar(60, 12, 13, 11, 11, 50),
    bar(120, 11, 11, 11, 11, 25),
  ];
  const profile = computeVolumeProfile(bars, { rows: 8, tickSize: 0.25, valueAreaPercent: 70 });
  const allocated = profile.rows.reduce((sum, row) => sum + row.totalVolume, 0);
  assert.ok(Math.abs(allocated - 175) < 1e-8);
  assert.ok(profile.pocIndex >= 0);
  assert.equal(profile.rows[profile.pocIndex].inValueArea, true);
  assert.ok(profile.valueAreaLowIndex <= profile.pocIndex);
  assert.ok(profile.valueAreaHighIndex >= profile.pocIndex);
});

test("profiles stay bounded and fast on an extreme data set", () => {
  const bars = Array.from({ length: 50_000 }, (_, i) => {
    const close = 100 + Math.sin(i / 50) * 5;
    return bar(i * 60, close - 0.2, close + 0.8, close - 0.8, close, 100 + (i % 100));
  });
  const started = performance.now();
  const profile = computeVolumeProfile(bars, { rows: 100, tickSize: 0.01, valueAreaPercent: 70 });
  const elapsed = performance.now() - started;
  assert.ok(profile.rows.length <= 110);
  assert.ok(elapsed < 750, `50k-bar profile took ${elapsed.toFixed(1)}ms`);
});

test("profile library entries expose fixed placement and cached lookback overlays", () => {
  assert.equal(FixedRangeVolumeProfileIndicator.placementTool, "fixed-range-volume-profile");
  assert.equal(FixedRangeVolumeProfileIndicator.createInstance(0), null);

  const bars = Array.from({ length: 200 }, (_, i) => bar(i * 60, 100, 101, 99, i % 2 ? 99.5 : 100.5, 10));
  const instance = VolumeProfileIndicator.createInstance(0);
  const boxes = VolumeProfileIndicator.computeOverlay(bars, bars, instance, {
    symbolInfo: { minmov: 1, pricescale: 100 },
  });
  assert.ok(boxes.length > 1);
  // Tick alignment can create a few more rows than requested, as TradingView
  // documents for Number Of Rows mode.
  assert.ok(boxes.length <= 2 * Number(instance.inputs.rowSize) + 8);
  assert.ok(boxes.some((box) => box.fillColor.includes("242, 54, 69") || box.fillColor === "#f23645"));
});

test("minimal indicator API infers stable metadata", () => {
  const Indicator = defineIndicator({
    title: "Fast Test Average",
    compute(bars) { return { main: bars.map((item) => item.close) }; },
  });
  assert.equal(Indicator.id, "fast_test_average");
  assert.equal(Indicator.type, "fast_test_average");
  assert.equal(Indicator.shortTitle, "Fast Test Average");
  const instance = Indicator.createInstance(0);
  assert.deepEqual(Indicator.compute([bar(0, 1, 1, 1, 2)], instance).main, [2]);
});

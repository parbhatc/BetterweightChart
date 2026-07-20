import test from "node:test";
import assert from "node:assert/strict";

import {
  hasIntradaySessionBreak,
  pivotHighAt,
  pivotHighStrictAt,
  pivotLowStrictAt,
  pricesEqualWithinTicks,
} from "../public/js/indicators/math/pivots.js";
import { isStrictSmtDivergence } from "../public/js/indicators/definitions/smt/divergence.js";

const bar = (time) => ({ time });

test("SMT does not pair intraday pivots across the weekend reopen", () => {
  const friday = Date.UTC(2026, 6, 17, 20, 57) / 1000;
  const sunday = Date.UTC(2026, 6, 19, 22, 1) / 1000;
  const bars = [bar(friday - 60), bar(friday), bar(sunday), bar(sunday + 60)];

  assert.equal(hasIntradaySessionBreak(bars, 1, 2), true);
});

test("SMT still pairs pivots across ordinary intraday bars", () => {
  const start = Date.UTC(2026, 6, 17, 14, 0) / 1000;
  const bars = Array.from({ length: 12 }, (_, i) => bar(start + i * 60));

  assert.equal(hasIntradaySessionBreak(bars, 2, 10), false);
});

test("daily SMT is not reset by normal skipped weekend dates", () => {
  const thursday = Date.UTC(2026, 6, 16) / 1000;
  const friday = Date.UTC(2026, 6, 17) / 1000;
  const monday = Date.UTC(2026, 6, 20) / 1000;
  const tuesday = Date.UTC(2026, 6, 21) / 1000;
  const bars = [bar(thursday), bar(friday), bar(monday), bar(tuesday)];

  assert.equal(hasIntradaySessionBreak(bars, 1, 2), false);
});

test("strict EQ pivots require the middle candle to exceed both neighbors", () => {
  const bars = [
    { high: 10, low: 6 },
    { high: 12, low: 4 },
    { high: 11, low: 5 },
  ];
  assert.equal(pivotHighStrictAt(bars, 2, 1, 1), 12);
  assert.equal(pivotLowStrictAt(bars, 2, 1, 1), 4);

  assert.equal(pivotHighStrictAt([{ high: 12 }, { high: 12 }, { high: 11 }], 2, 1, 1), null);
  assert.equal(pivotLowStrictAt([{ low: 4 }, { low: 4 }, { low: 5 }], 2, 1, 1), null);
});

test("SMT accepts the rightmost candle of an equal-high plateau", () => {
  const es = [{ high: 7538.5 }, { high: 7538.5 }, { high: 7537 }];
  assert.equal(pivotHighAt(es, 2, 1, 1), 7538.5);
});

test("EQH/EQL respects the configured tick tolerance", () => {
  assert.equal(pricesEqualWithinTicks(100, 100.25, 0.25, 1), true);
  assert.equal(pricesEqualWithinTicks(100, 100.5, 0.25, 1), false);
  assert.equal(pricesEqualWithinTicks(100, 100, 0.25, 0), true);
});

test("SMT matches Pine's strict opposite-direction product check", () => {
  assert.equal(isStrictSmtDivergence(99, 100, 201, 200), true);
  assert.equal(isStrictSmtDivergence(101, 100, 199, 200), true);
  assert.equal(isStrictSmtDivergence(100, 100, 199, 200), false);
  assert.equal(isStrictSmtDivergence(101, 100, 200, 200), false);
  assert.equal(isStrictSmtDivergence(99, 100, 199, 200), false);
});

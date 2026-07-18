import test from "node:test";
import assert from "node:assert/strict";

import { Aggregate } from "../public/js/utils/aggregate.js";
import { CompletedAgg } from "../public/js/utils/completedAgg.js";
import { BarsIndex } from "../public/js/utils/barsIndex.js";
import { aggregateBars, tailBars } from "../server/lib/csv/aggregate.mjs";

const bar = (time, open, high, low, close, volume = 0) => ({ time, open, high, low, close, volume });

test("Aggregate.candles produces chronological OHLCV from unordered source bars", () => {
  const result = Aggregate.candles(
    [
      bar(240, 4, 8, 3, 7, 4),
      bar(60, 2, 4, 1, 3, 2),
      bar(0, 1, 3, 0, 2, 1),
      bar(180, 3, 6, 2, 4, 3),
      bar(120, 2.5, 5, 1.5, 3.5, 1),
    ],
    "5m",
  );

  assert.deepEqual(result, [bar(0, 1, 8, 0, 7, 11)]);
  assert.deepEqual(Aggregate.candles(null, "5m"), []);
});

test("Aggregate.truncatedBar uses chronological endpoints without allocating a sorted copy", () => {
  const full = bar(0, 1, 8, 0, 7, 11);
  const result = Aggregate.truncatedBar(
    [bar(180, 3, 6, 2, 4, 3), bar(0, 1, 3, 0, 2, 1), bar(60, 2, 8, 1, 7, 4)],
    full,
    "5m",
    60,
  );

  assert.deepEqual(result, bar(0, 1, 8, 0, 7, 5));
  assert.strictEqual(Aggregate.truncatedBar([], full, "5m", 60), full);
});

test("CompletedAgg omits incomplete buckets and is correct for unordered bars", () => {
  const result = CompletedAgg.completed(
    [
      bar(240, 4, 7, 3, 6, 1),
      bar(0, 1, 3, 0, 2, 1),
      bar(60, 2, 4, 1, 3, 1),
      bar(180, 3, 6, 2, 4, 1),
      bar(120, 2.5, 5, 1.5, 3.5, 1),
      bar(300, 8, 9, 7, 8.5, 1),
    ],
    300,
  );

  assert.deepEqual(result, [bar(0, 1, 7, 0, 6, 5)]);
  assert.deepEqual(CompletedAgg.completed(null, 300), []);
  assert.deepEqual([...CompletedAgg.bucketMap(null, 300)], []);
});

test("BarsIndex tolerates empty inputs and locates replay tips", () => {
  const bars = [{ time: 60 }, { time: 120 }, { time: 180 }];
  assert.equal(BarsIndex.normalizeTip(null, 120), null);
  assert.equal(BarsIndex.aggThroughTip(bars, 119), 0);
  assert.equal(BarsIndex.aggThroughTip(bars, 180), 2);
  assert.equal(BarsIndex.current1mOpen(null, bars, 1, "1m"), null);
});

test("server aggregation and tail handling cover standard and empty paths", () => {
  const source = [bar(0, 1, 2, 0, 1.5, 1), bar(60, 1.5, 3, 1, 2.5, 2)];
  assert.deepEqual(aggregateBars(source, 120), [bar(0, 1, 3, 0, 2.5, 3)]);
  assert.deepEqual(tailBars(source, 1), [source[1]]);
  assert.deepEqual(tailBars(source, 0), source);
});

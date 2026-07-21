import assert from "node:assert/strict";
import test from "node:test";

import {
  fallbackTradingViewSearch,
  fallbackTradingViewSymbolInfo,
} from "../server/lib/tradingview/datafeed.mjs";

test("TradingView fallback search returns matching continuous futures", () => {
  const results = fallbackTradingViewSearch("NQ", 10);
  assert.deepEqual(results.map((row) => row.symbol), [
    "CME_MINI:NQ1!",
    "CME_MINI:MNQ1!",
  ]);
});

test("TradingView fallback metadata normalizes short symbols", () => {
  const info = fallbackTradingViewSymbolInfo("NQ");
  assert.equal(info.ticker, "CME_MINI:NQ1!");
  assert.equal(info.description, "E-mini Nasdaq-100 Futures");
  assert.equal(info.type, "futures");
  assert.equal(info.data_status, "delayed");
  assert.ok(info.supported_resolutions.includes("1"));
});

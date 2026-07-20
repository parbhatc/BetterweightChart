import test from "node:test";
import assert from "node:assert/strict";

import { buildNewsTimeScaleMarkers, newsImpactKind } from "../public/js/news/markers.js";
import { buildDemoNewsMarker } from "../public/js/news/demoMarkers.js";

test("news markers group simultaneous events and map ET releases to chart time", () => {
  const releaseUtc = Date.UTC(2026, 5, 11, 12, 30) / 1000; // 08:30 ET (EDT)
  // Custom/static feeds may return bars out of order; marker lookup must still
  // choose the exact release bar instead of relying on input ordering.
  const bars = [{ time: releaseUtc + 60 }, { time: releaseUtc - 60 }, { time: releaseUtc }];
  const markers = buildNewsTimeScaleMarkers({
    bars,
    timeAdapter: { time: { toChart: (utc) => utc + 3600 } },
    newsByDay: {
      "2026-06-11": {
        events: [
          { id: "a", title: "Core CPI m/m", hmEt: "08:30", timeLabel: "8:30am", impact: "High", country: "USD" },
          { id: "b", title: "CPI m/m", hmEt: "08:30", timeLabel: "8:30am", impact: "High", country: "USD" },
        ],
      },
    },
    settings: { enabled: true, displayCurrencies: [], displayImpacts: [] },
  });

  assert.equal(markers.length, 1);
  assert.equal(markers[0].events.length, 2);
  assert.equal(markers[0].time, releaseUtc + 3600);
  assert.equal(markers[0].label, "⚡");
});

test("news marker filters and impact normalization handle empty and selected paths", () => {
  const releaseUtc = Date.UTC(2026, 5, 11, 12, 30) / 1000;
  const common = {
    bars: [{ time: releaseUtc }],
    timeAdapter: null,
    newsByDay: {
      "2026-06-11": {
        events: [{ title: "Jobless Claims", hmEt: "08:30", impact: "Medium", country: "USD" }],
      },
    },
  };
  assert.equal(newsImpactKind("moderate"), "medium");
  assert.deepEqual(buildNewsTimeScaleMarkers({ ...common, settings: { enabled: false } }), []);
  assert.deepEqual(
    buildNewsTimeScaleMarkers({
      ...common,
      settings: { enabled: true, displayCurrencies: ["EUR"], displayImpacts: [] },
    }),
    [],
  );
});

test("demo news marker follows the final chart day and includes popup values", () => {
  const finalUtc = Date.UTC(2026, 6, 19, 18, 30) / 1000;
  const demo = buildDemoNewsMarker([
    { time: finalUtc - 86400 },
    { time: finalUtc - 60 },
    { time: finalUtc },
  ]);

  assert.equal(demo?.day, "2026-07-19");
  assert.equal(demo?.event.impact, "High");
  assert.equal(demo?.event.currency, "USD");
  assert.equal(demo?.event.actual, "3.2%");
});

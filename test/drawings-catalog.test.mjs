import test from "node:test";
import assert from "node:assert/strict";

import { FORECAST_FLYOUT_SECTIONS } from "../public/js/drawings/catalog/tools.js";
import { pointCountForTool } from "../public/js/drawings/registry/tools.js";
import { responsiveAxisMinimums } from "../public/js/chart/view/responsiveAxes.js";

const labels = (sections) => sections.flatMap((section) => section.tools);

test("volume-profile indicator ranges keep their internal placement contracts", () => {
  assert.equal(pointCountForTool("anchored-volume-profile"), 1);
  assert.equal(pointCountForTool("fixed-range-volume-profile"), 2);
  assert.equal(labels(FORECAST_FLYOUT_SECTIONS).includes("fixed-range-volume-profile"), false);
});

test("mobile axes reserve TradingView-like interactive gutters", () => {
  assert.deepEqual(responsiveAxisMinimums(390, true), {
    priceScaleWidth: 64,
    timeScaleHeight: 28,
  });
  assert.deepEqual(responsiveAxisMinimums(1440, false), {
    priceScaleWidth: 0,
    timeScaleHeight: 0,
  });
});

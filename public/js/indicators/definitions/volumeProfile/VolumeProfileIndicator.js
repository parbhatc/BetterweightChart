import { defineIndicator } from "../../defineIndicator.js";
import { createBool, createColor, createFloat, createInt } from "../../builders.js";
import { computeVolumeProfile } from "../../math/volumeProfile.js";
import { tickSizeFromSymbol } from "../../symbol.js";
import { applyColorOpacity } from "../../../ui/color/picker.js";

function timeAt(chartBars, index) {
  return chartBars[Math.max(0, Math.min(chartBars.length - 1, index))]?.time;
}

/**
 * Lookback Volume Profile. Defined with the small object API intentionally: it
 * is the reference implementation for adding an overlay without controller or
 * sidebar boilerplate.
 */
const VolumeProfileIndicator = defineIndicator({
  id: "volume_profile",
  title: "Volume Profile",
  shortTitle: "VP",
  overlayPrimitive: "boxes",
  inputs: [
    createInt("numberOfBars", "Number of Bars", 150, { min: 1 }),
    createInt("rowSize", "Row Size", 24, { min: 1 }),
    createFloat("valueAreaPercent", "Value Area Volume %", 70),
    createFloat("width", "Width", 2),
    createBool("showPoc", "POC", true, { section: "Style" }),
    createColor("upColor", "Up Volume", { color: "#26a69a", opacity: 75 }, { section: "Style" }),
    createColor("downColor", "Down Volume", { color: "#ec407a", opacity: 75 }, { section: "Style" }),
    createColor("valueAreaUpColor", "Value Area Up", { color: "#00bcd4", opacity: 90 }, { section: "Style" }),
    createColor("valueAreaDownColor", "Value Area Down", { color: "#f06292", opacity: 90 }, { section: "Style" }),
    createColor("pocColor", "POC", { color: "#f23645", opacity: 100 }, { section: "Style" }),
  ],
  legendParams(instance) {
    return [
      String(instance.inputs.numberOfBars ?? 150),
      String(instance.inputs.rowSize ?? 24),
      String(instance.inputs.valueAreaPercent ?? 70),
      String(instance.inputs.width ?? 2),
    ];
  },
  overlay(utcBars, chartBars, inputs, _style, ctx) {
    const count = Math.max(1, Math.floor(Number(inputs.numberOfBars) || 150));
    const startIndex = Math.max(0, utcBars.length - count);
    const selected = utcBars.slice(startIndex);
    if (!selected.length) return [];

    const profile = computeVolumeProfile(selected, {
      rows: inputs.rowSize,
      rowsLayout: "number_of_rows",
      tickSize: tickSizeFromSymbol(ctx.symbolInfo),
      valueAreaPercent: inputs.valueAreaPercent,
    });
    if (!profile.rows.length) return [];

    const rangeBars = utcBars.length - startIndex;
    // The source script's Width=2 occupies roughly ten percent of a 150-bar
    // range. Expressing that as range-relative bars keeps the shape stable at
    // every zoom level and avoids pixel work during pan.
    const maxWidthBars = Math.max(1, Math.round(rangeBars * Math.max(0.01, Math.min(0.5, (Number(inputs.width) || 2) * 0.05))));
    const maxVolume = Math.max(...profile.rows.map((row) => row.totalVolume), 1);
    const startTime = timeAt(chartBars, startIndex);
    const rangeEndTime = timeAt(chartBars, chartBars.length - 1);
    if (startTime == null || rangeEndTime == null) return [];

    const up = applyColorOpacity(String(inputs.upColor ?? "#26a69a"), Number(inputs.upColorOpacity ?? 75));
    const down = applyColorOpacity(String(inputs.downColor ?? "#ec407a"), Number(inputs.downColorOpacity ?? 75));
    const vaUp = applyColorOpacity(String(inputs.valueAreaUpColor ?? "#00bcd4"), Number(inputs.valueAreaUpColorOpacity ?? 90));
    const vaDown = applyColorOpacity(String(inputs.valueAreaDownColor ?? "#f06292"), Number(inputs.valueAreaDownColorOpacity ?? 90));
    /** @type {object[]} */
    const boxes = [];

    for (const row of profile.rows) {
      if (row.totalVolume <= 0) continue;
      const totalBars = Math.max(1, Math.round(maxWidthBars * row.totalVolume / maxVolume));
      let upBars = Math.round(totalBars * row.upVolume / row.totalVolume);
      if (row.upVolume > 0) upBars = Math.max(1, upBars);
      upBars = Math.min(totalBars, upBars);
      const downBars = totalBars - upBars;
      if (upBars > 0) {
        boxes.push({
          timeStart: startTime,
          timeEnd: timeAt(chartBars, startIndex + upBars),
          priceTop: row.priceTop,
          priceBottom: row.priceBottom,
          fillColor: row.inValueArea ? vaUp : up,
        });
      }
      if (downBars > 0) {
        boxes.push({
          timeStart: timeAt(chartBars, startIndex + upBars),
          timeEnd: timeAt(chartBars, startIndex + totalBars),
          priceTop: row.priceTop,
          priceBottom: row.priceBottom,
          fillColor: row.inValueArea ? vaDown : down,
        });
      }
    }

    if (inputs.showPoc !== false && profile.pocIndex >= 0) {
      const row = profile.rows[profile.pocIndex];
      const mid = (row.priceTop + row.priceBottom) / 2;
      const hairline = Math.max(Number.EPSILON, (row.priceTop - row.priceBottom) * 0.025);
      boxes.push({
        timeStart: startTime,
        timeEnd: rangeEndTime,
        priceTop: mid + hairline,
        priceBottom: mid - hairline,
        fillColor: applyColorOpacity(String(inputs.pocColor ?? "#f23645"), Number(inputs.pocColorOpacity ?? 100)),
      });
    }
    return boxes;
  },
});

export default VolumeProfileIndicator;

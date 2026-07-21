import { ComputeIndicator } from "../../ComputeIndicator.js";
import { calcInputs, createBool, createFloat, createInt, createSelect, createSource, fill, plot } from "../../builders.js";
import { barSourceValue, sourceLabel } from "../../math/source.js";
import { offsetSeries } from "../../math/rolling.js";
import { resolutionSec } from "../../../chart/resolutions.js";

const ANCHORS = [
  { id: "session", label: "Session" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "quarter", label: "Quarter" },
  { id: "year", label: "Year" },
  { id: "decade", label: "Decade" },
  { id: "century", label: "Century" },
];

const TIME_ZONE_FORMATTERS = new Map();
const HOURLY_TIME_ZONE_OFFSETS = new Map();

function timeZoneFormatter(timeZone) {
  let formatter = TIME_ZONE_FORMATTERS.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    TIME_ZONE_FORMATTERS.set(timeZone, formatter);
  }
  return formatter;
}

function timeZoneOffsetSeconds(time, timeZone) {
  // Computing Intl calendar parts for every bar is expensive. Exchange offsets
  // only change at DST boundaries, so one lookup per UTC hour keeps VWAP refresh
  // fast while still handling the transition hour correctly.
  const hour = Math.floor(Number(time) / 3600);
  const cacheKey = `${timeZone}:${hour}`;
  if (HOURLY_TIME_ZONE_OFFSETS.has(cacheKey)) return HOURLY_TIME_ZONE_OFFSETS.get(cacheKey);
  const probe = hour * 3600 + 1800;
  let offset = 0;
  try {
    const values = Object.fromEntries(
      timeZoneFormatter(timeZone).formatToParts(new Date(probe * 1000)).map((part) => [part.type, part.value]),
    );
    const asUtc = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second),
    ) / 1000;
    offset = asUtc - probe;
  } catch {
    // Unknown provider timezones fall back to UTC instead of breaking a study.
  }
  if (HOURLY_TIME_ZONE_OFFSETS.size > 4096) HOURLY_TIME_ZONE_OFFSETS.clear();
  HOURLY_TIME_ZONE_OFFSETS.set(cacheKey, offset);
  return offset;
}

function sessionStartMinutes(session) {
  const match = String(session ?? "").match(/(?:^|,)(\d{2})(\d{2})-/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function tradingDate(time, symbolInfo) {
  const unix = Number(time);
  const timeZone = String(symbolInfo?.timezone || "Etc/UTC");
  const local = new Date((unix + timeZoneOffsetSeconds(unix, timeZone)) * 1000);
  let day = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) / 1000;
  const start = sessionStartMinutes(symbolInfo?.session);
  const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
  // Overnight sessions belong to the trading date on which they started.
  if (start != null && minute < start) day -= 86400;
  return new Date(day * 1000);
}

function anchorKey(time, anchor, symbolInfo) {
  const date = tradingDate(time, symbolInfo);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  if (anchor === "week") {
    const day = (date.getUTCDay() + 6) % 7;
    const monday = Date.UTC(year, month, date.getUTCDate() - day) / 1000;
    return `w${monday}`;
  }
  if (anchor === "month") return `${year}-${month}`;
  if (anchor === "quarter") return `${year}-q${Math.floor(month / 3)}`;
  if (anchor === "year") return String(year);
  if (anchor === "decade") return String(Math.floor(year / 10));
  if (anchor === "century") return String(Math.floor(year / 100));
  return `${year}-${month}-${date.getUTCDate()}`;
}

class VwapIndicator extends ComputeIndicator {
  static requiredChartBars(inputs, chartResolution) {
    const seconds = Math.max(1, resolutionSec(chartResolution));
    if (inputs?.hideOnDailyOrAbove !== false && seconds >= 86400) return 0;

    // A session-anchored VWAP must begin at the exchange session open. The
    // default 500 bars starts too late in CME's overnight session on 1m charts.
    if (String(inputs?.anchor ?? "session") === "session") {
      return Math.ceil(86400 / seconds);
    }

    // Longer anchors can exceed the loader's cap on intraday charts. Ask for
    // the maximum available history so they are as complete as possible.
    return 4000;
  }

  constructor() {
    super("vwap", "VWAP", "Volume Weighted Average Price");
    this.setPrimaryPlot("vwap");
    this.setPlots([
      plot("vwap", "VWAP", "#2962ff"),
      plot("upper1", "Upper Band #1", "#4caf50", { when: (i) => i.band1Enabled !== false }),
      plot("lower1", "Lower Band #1", "#4caf50", { when: (i) => i.band1Enabled !== false }),
      plot("upper2", "Upper Band #2", "#f57c00", { when: (i) => i.band2Enabled === true }),
      plot("lower2", "Lower Band #2", "#f57c00", { when: (i) => i.band2Enabled === true }),
      plot("upper3", "Upper Band #3", "#7b1fa2", { when: (i) => i.band3Enabled === true }),
      plot("lower3", "Lower Band #3", "#7b1fa2", { when: (i) => i.band3Enabled === true }),
    ]);
    this.setFills([
      fill("band1Fill", "upper1", "lower1", "Bands Fill #1", "#4caf50", { when: (i) => i.band1Enabled !== false }),
      fill("band2Fill", "upper2", "lower2", "Bands Fill #2", "#f57c00", { when: (i) => i.band2Enabled === true }),
      fill("band3Fill", "upper3", "lower3", "Bands Fill #3", "#7b1fa2", { when: (i) => i.band3Enabled === true }),
    ]);
    this.setInputs([
      createBool("hideOnDailyOrAbove", "Hide VWAP on 1D or Above", true),
      createSelect("anchor", "Anchor Period", "session", ANCHORS),
      createSource("source", "Source", "hlc3"),
      createInt("offset", "Offset", 0),
      createSelect("bandsMode", "Bands Calculation mode", "standard_deviation", [
        { id: "standard_deviation", label: "Standard Deviation" },
        { id: "percentage", label: "Percentage" },
      ]),
      { type: "row", section: "Bands", fields: [
        createBool("band1Enabled", "Band #1", true),
        createFloat("band1Multiplier", "Multiplier", 1),
      ] },
      { type: "row", section: "Bands", fields: [
        createBool("band2Enabled", "Band #2", false),
        createFloat("band2Multiplier", "Multiplier", 2),
      ] },
      { type: "row", section: "Bands", fields: [
        createBool("band3Enabled", "Band #3", false),
        createFloat("band3Multiplier", "Multiplier", 3),
      ] },
      ...calcInputs(),
    ]);
  }

  computeSeries(bars, inputs, _style, instance) {
    const empty = () => new Array(bars.length).fill(null);
    if (inputs.hideOnDailyOrAbove !== false && resolutionSec(instance?._chartResolution ?? "") >= 86400) {
      return { vwap: empty(), upper1: empty(), lower1: empty(), upper2: empty(), lower2: empty(), upper3: empty(), lower3: empty() };
    }

    const source = String(inputs.source ?? "hlc3");
    const anchor = String(inputs.anchor ?? "session");
    const mode = String(inputs.bandsMode ?? "standard_deviation");
    const vwap = empty();
    const dev = empty();
    let currentKey = null;
    let volumeSum = 0;
    let weightedSum = 0;
    let weightedSqSum = 0;

    for (let i = 0; i < bars.length; i += 1) {
      const bar = bars[i];
      const key = anchorKey(bar.time, anchor, instance?._symbolInfo);
      if (key !== currentKey) {
        currentKey = key;
        volumeSum = 0;
        weightedSum = 0;
        weightedSqSum = 0;
      }
      const price = barSourceValue(bar, source);
      const volume = Math.max(0, Number(bar.volume) || 0);
      if (!Number.isFinite(price) || volume <= 0) continue;
      volumeSum += volume;
      weightedSum += price * volume;
      weightedSqSum += price * price * volume;
      const avg = weightedSum / volumeSum;
      vwap[i] = avg;
      dev[i] = Math.sqrt(Math.max(0, weightedSqSum / volumeSum - avg * avg));
    }

    const band = (multiplier, direction) => vwap.map((value, i) => {
      if (value == null) return null;
      const distance = mode === "percentage"
        ? value * multiplier / 100
        : (dev[i] ?? 0) * multiplier;
      return value + direction * distance;
    });
    const m1 = Number(inputs.band1Multiplier) || 1;
    const m2 = Number(inputs.band2Multiplier) || 2;
    const m3 = Number(inputs.band3Multiplier) || 3;
    const offset = Number(inputs.offset) || 0;
    return {
      vwap: offsetSeries(vwap, offset),
      upper1: offsetSeries(band(m1, 1), offset),
      lower1: offsetSeries(band(m1, -1), offset),
      upper2: offsetSeries(band(m2, 1), offset),
      lower2: offsetSeries(band(m2, -1), offset),
      upper3: offsetSeries(band(m3, 1), offset),
      lower3: offsetSeries(band(m3, -1), offset),
    };
  }

  legendParams(instance) {
    return [String(instance.inputs.anchor ?? "Session"), sourceLabel(String(instance.inputs.source ?? "hlc3")).toLowerCase()];
  }
}

ComputeIndicator.define(VwapIndicator);

export default VwapIndicator;

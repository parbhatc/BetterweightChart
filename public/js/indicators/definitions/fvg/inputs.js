import { DEFAULT_FVG_TIMEFRAMES } from "../../ui/fvgTimeframesPanel.js";
import { compareSymbolInputs } from "../../security/compareBars.js";
import {
  createBool,
  createColor,
  createField,
  createFloat,
  createInt,
  createSelect,
  createText,
  inlinePair,
} from "../../builders.js";

/** @returns {import("../../types.js").InputDef[]} */
export function buildInputs() {
  return [
    createField("fvgTimeframes", "fvgTimeframes", DEFAULT_FVG_TIMEFRAMES, { section: "Timeframes" }),
    createBool("hideLowerTf", "Hide FVGs lower than enabled timeframes", true, { section: "FVG settings" }),
    createBool("showFvg", "Show FVG", true, { section: "FVG settings" }),
    createSelect(
      "filledType",
      "Filled FVG Type",
      "close",
      [
        { id: "close", label: "Close" },
        { id: "wick", label: "Wick" },
      ],
      { section: "FVG settings" },
    ),
    createInt("maxBarsBack", "Max bars back to find FVGs (HTF bars per layer)", 300, { section: "FVG settings" }),
    createInt("maxFvgZones", "Max FVG zones to show", 300, { min: 0, section: "FVG settings", inline: true }),
    createColor("partialCloseColor", "Partial close", { color: "#ff9800", opacity: 20 }, { section: "FVG settings" }),
    createBool("showLiveForming", "Show live forming FVG", true, { section: "Live Forming" }),
    inlinePair(
      "Live Forming",
      createColor("formingBullColor", "Bullish", { color: "#00bcd4", opacity: 25 }),
      createColor("formingBearColor", "Bearish", { color: "#ab47bc", opacity: 25 }),
      { header: "Forming FVG color" },
    ),
    createBool("requireCorrelatedFvg", "Require matching FVG on compare symbol", false, { section: "Correlated FVG" }),
    createSelect(
      "correlatedFvgTf",
      "Timeframe",
      "all",
      [{ id: "all", label: "All" }],
      {
        section: "Correlated FVG",
        disabled: (inputs) => inputs.requireCorrelatedFvg !== true,
        showInStatusLine: false,
      },
    ),
    ...compareSymbolInputs("Correlated FVG", { showInStatusLine: false }),
    createBool("sizeFilterOn", "Filter FVG by size", false, { section: "FVG Size Filter", showInStatusLine: false }),
    createSelect(
      "sizeFilterUnit",
      "Unit",
      "none",
      [
        { id: "none", label: "None" },
        { id: "ticks", label: "Ticks" },
        { id: "points", label: "Points" },
      ],
      {
        section: "FVG Size Filter",
        disabled: (inputs) => inputs.sizeFilterOn !== true,
        showInStatusLine: false,
      },
    ),
    inlinePair(
      "FVG Size Filter",
      createFloat("sizeFilterMin", "Min", 0, {
        disabled: (inputs) => inputs.sizeFilterOn !== true || inputs.sizeFilterUnit === "none",
        showInStatusLine: false,
      }),
      createFloat("sizeFilterMax", "Max", 0, {
        disabled: (inputs) => inputs.sizeFilterOn !== true || inputs.sizeFilterUnit === "none",
        showInStatusLine: false,
      }),
      { header: "Global min / max (0 = no limit)" },
    ),
    createField(
      "symbolSizeRules",
      "sizeFilterRules",
      [{ symbol: "NQ", min: 8, max: 20 }],
      {
        title: "Per-symbol overrides",
        section: "FVG Size Filter",
        disabled: (inputs) => inputs.sizeFilterOn !== true,
      },
    ),
    createBool("showIfvg", "Show IFVG (inversed FVG)", true, { section: "IFVG settings" }),
    createInt("maxIfvgZones", "Max IFVG zones to show", 1, { min: 0, section: "IFVG settings" }),
    createText("ifvgLabel", "IFVG label", "IFVG", { section: "IFVG settings" }),
    createBool("showLabels", "Show Labels", true, { section: "Label Settings" }),
    createBool("showSizeOnLabel", "Show FVG size on label", false, { section: "Label Settings" }),
    createBool("showFvgNameOnLabel", "Show FVG name on label", true, {
      section: "Label Settings",
      disabled: (inputs) => inputs.showLabels === false,
    }),
    createSelect(
      "sizeLabelFormat",
      "Size format",
      "both",
      [
        { id: "both", label: "Points / Ticks" },
        { id: "points", label: "Points" },
        { id: "ticks", label: "Ticks" },
      ],
      {
        section: "Label Settings",
        disabled: (inputs) => inputs.showSizeOnLabel !== true,
        showInStatusLine: false,
      },
    ),
    createBool("deleteOnFill", "Delete Boxes after fill", true, { section: "Box Settings" }),
    createBool("extendBoxes", "Extend Boxes", false, { section: "Box Settings" }),
    createInt("boxLength", "Length of Boxes", 20, { section: "Box Settings" }),
    inlinePair(
      "Box Settings",
      createColor("bullBoxColor", "Bullish", { color: "#00e676", opacity: 10 }),
      createColor("bearBoxColor", "Bearish", { color: "#f23645", opacity: 10 }),
      { header: "FVG Box Color" },
    ),
    createSelect(
      "borderStyle",
      "Border style",
      "solid",
      [
        { id: "solid", label: "Solid" },
        { id: "dashed", label: "Dashed" },
        { id: "dotted", label: "Dotted" },
      ],
      { section: "Border Settings" },
    ),
    createInt("borderWidth", "Border Width", 1, { section: "Border Settings" }),
    inlinePair(
      "Border Settings",
      createColor("bullBorderColor", "Bullish", { color: "#00e676", opacity: 0 }),
      createColor("bearBorderColor", "Bearish", { color: "#f23645", opacity: 0 }),
      { header: "FVG Border Colors" },
    ),
    createColor("ifvgBoxColor", "IFVG", { color: "#ffff00", opacity: 20 }, { section: "IFVG settings" }),
  ];
}

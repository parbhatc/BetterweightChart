export const SETTINGS_ICONS = {
  symbol: `<svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true"><path fill="currentColor" d="M12 7h-.75V4h-1.5v3H9a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h.75v3h1.5v-3H12a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1ZM9.5 19.5v-11h2v11h-2Zm8-3v-5h2v5h-2Zm.24-6.5H17a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h.75v3h1.5v-3H20a1 1 0 0 0 1-1v-6a1 1 0 0 0-1-1h-.76V7h-1.5v3Z"/></svg>`,
  statusLine: `<svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M7 7.5h14a.5.5 0 0 1 0 1H7a.5.5 0 0 1 0-1ZM5 8c0-1.1.9-2 2-2h14a2 2 0 1 1 0 4H7a2 2 0 0 1-2-2Zm13 5H6v1.5h12V13ZM6 17h12v1.5H6V17Zm12 4H6v1.5h12V21Z"/></svg>`,
  scales: `<svg viewBox="0 0 28 28" width="28" height="28" fill="none" aria-hidden="true"><path stroke="currentColor" d="M10.5 20.5a2 2 0 1 1-2-2m2 2a2 2 0 0 0-2-2m2 2h14m-16-2v-14m16 16L21 17m3.5 3.5L21 24M8.5 4.5L12 8M8.5 4.5L5 8"/></svg>`,
  canvas: `<svg viewBox="0 0 28 28" width="28" height="28" fill="none" aria-hidden="true"><path fill="currentColor" d="M18.703 5c.727.007 1.451.3 2.009.85l1.437 1.359c.583.509.853 1.245.854 1.989.001.784-.297 1.577-.846 2.126l-.003.003L11.735 21.64l-1.154 1.142-.219.217H5v-5.51l.219-.219 1.071-1.077.001-.002L16.619 5.864A2.9 2.9 0 0 1 18.703 5M6.501 18.109v3.39h3.244l.399-.394-3.32-3.32zm1.38-1.388 3.329 3.328 8.68-8.591-3.372-3.372zm11.786-9.797a1.406 1.406 0 0 0-1.987 0l-.102.101 3.377 3.377.144-.142a1.405 1.405 0 0 0 .002-1.98l-1.42-1.34-.007-.008z"/></svg>`,
  drawings: `<svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true"><path fill="currentColor" d="M6 21.5V6.5h16v15H6Zm1.5-1.5h13v-12h-13v12Zm2.25-9h8.5v1.5h-8.5V11Zm0 3h8.5v1.5h-8.5V14Zm0 3h5.5v1.5h-5.5V17Z"/></svg>`,
  appearance: `<svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true"><path fill="currentColor" d="M14 7.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm-8.5 6.5a8.5 8.5 0 0 1 8.5-8.5V3a1 1 0 1 1 2 0v2.5A8.5 8.5 0 0 1 22.5 14H25a1 1 0 1 1 0 2h-2.5A8.5 8.5 0 0 1 14 22.5V25a1 1 0 1 1-2 0v-2.5A8.5 8.5 0 0 1 5.5 16H3a1 1 0 1 1 0-2h2.5Z"/></svg>`,
  close: `<svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true"><path stroke="currentColor" stroke-width="1.2" d="m1.5 1.5 15 15m0-15-15 15"/></svg>`,
  chevron: `<svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M3.92 7.83 9 12.29l5.08-4.46-1-1.13L9 10.29l-4.09-3.6-.99 1.14Z"/></svg>`,
  check: `<svg viewBox="0 0 18 18" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M7.5 12.5 3.5 8.5l1-1 3 3 7-7 1 1z"/></svg>`,
};

export const DEFAULT_SETTINGS = {
  symbol: {
    colorBarsOnPrevClose: false,
    bodyVisible: true,
    bodyUpColor: "#089981",
    bodyDownColor: "#f23645",
    bordersVisible: true,
    bordersUpColor: "#089981",
    bordersDownColor: "#f23645",
    wickVisible: true,
    wickUpColor: "#089981",
    wickDownColor: "#f23645",
    session: "electronic",
    sessionBreaks: false,
    ethBackground: "rgba(148, 163, 184, 0.08)",
    precision: "default",
    timezone: "America/New_York",
  },
  statusLine: {
    showTitle: true,
    titleSource: "name",
    showMarketStatus: true,
    showOHLC: true,
    showBarChange: true,
    showVolume: true,
    showBackground: false,
    backgroundOpacity: 50,
  },
  scales: {
    autoScale: false,
    logarithmic: false,
    invertScale: false,
    priceScaleMode: "regular",
    scalePriceChartOnly: false,
    scaleLines: true,
    lockPriceToBarRatio: false,
    lockPriceToBarRatioValue: null,
    scalesPlacement: "auto",
    noOverlappingLabels: true,
    countdownToBarClose: true,
    symbolLabelName: false,
    symbolLabelValue: true,
    symbolLabelLine: true,
    symbolLabelLineUpColor: "#089981",
    symbolLabelLineDownColor: "#f23645",
    symbolLabelLineWidth: 1,
    symbolLabelLineStyle: 2,
    bidLabelValue: true,
    bidLabelLine: true,
    bidLabelLineColor: "#2962FF",
    askLabelValue: true,
    askLabelLine: true,
    askLabelLineColor: "#F23645",
    bidAskLabelLineWidth: 1,
    bidAskLabelLineStyle: 1,
    dayOfWeekOnLabels: true,
    dateFormat: "dd_mmm_yy",
    timeHoursFormat: "12-hours",
  },
  canvas: {
    backgroundType: "solid",
    backgroundColor: "#020617",
    backgroundGradientTopColor: "#0f172a",
    backgroundGradientBottomColor: "#020617",
    gridLinesMode: "vertAndHorz",
    gridVertColor: "rgba(226, 232, 240, 0.06)",
    gridHorzColor: "rgba(226, 232, 240, 0.06)",
    crosshairColor: "#64748b",
    crosshairWidth: 1,
    crosshairOpacity: 100,
    crosshairStyle: 2,
    watermarkColor: "rgba(148, 163, 184, 0.25)",
    watermarkTicker: false,
    watermarkInterval: false,
    watermarkDescription: false,
    scalesTextColor: "#e2e8f0",
    scalesFontSize: "13",
    scalesLineColor: "rgba(242, 242, 242, 0)",
    navButtonsVisibility: "visibleOnMouseOver",
    paneButtonsVisibility: "visibleOnMouseOver",
    attributionLogo: true,
    marginTop: 10,
    marginBottom: 8,
    marginRight: 10,
  },
};

export const SETTINGS_SECTIONS = [
  { id: "appearance", label: "Appearance", icon: SETTINGS_ICONS.appearance },
  { id: "symbol", label: "Symbol", icon: SETTINGS_ICONS.symbol },
  { id: "statusLine", label: "Status line", icon: SETTINGS_ICONS.statusLine },
  { id: "scales", label: "Scales and lines", icon: SETTINGS_ICONS.scales },
  { id: "canvas", label: "Canvas", icon: SETTINGS_ICONS.canvas },
  { id: "drawings", label: "Drawings", icon: SETTINGS_ICONS.drawings },
];

export const THEME_OPTIONS = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
];

export const BACKGROUND_TYPE_OPTIONS = [
  { value: "solid", label: "Solid" },
  { value: "gradient", label: "Gradient" },
];

export const TITLE_SOURCE_OPTIONS = [
  { value: "name", label: "Name" },
  { value: "symbol", label: "Symbol" },
  { value: "symbol_name", label: "Symbol and name" },
];

export const SCALES_PLACEMENT_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
];

export const DATE_FORMAT_OPTIONS = [
  { value: "qq_yy", label: "Q3 '97" },
  { value: "qq_yyyy", label: "Q3 1997" },
  { value: "dd_mmm_yy", label: "29 Sep '97" },
  { value: "mmm_yy", label: "Sep '97" },
  { value: "mmm_dd_yyyy", label: "Sep 29, 1997" },
  { value: "mmm_d_yyyy", label: "Sep 29 1997" },
  { value: "mmm_yyyy", label: "Sep 1997" },
  { value: "mmm_dd", label: "Sep 29" },
  { value: "dd_mmm", label: "29 Sep" },
  { value: "yyyy_mm_dd", label: "1997-09-29" },
  { value: "yy_mm_dd_dash", label: "97-09-29" },
  { value: "yy_mm_dd_slash", label: "97/09/29" },
  { value: "yyyy_mm_dd_slash", label: "1997/09/29" },
  { value: "dd_mm_yyyy_dash", label: "29-09-1997" },
  { value: "dd_mm_yy_dash", label: "29-09-97" },
  { value: "dd_mm_yy_slash", label: "29/09/97" },
  { value: "dd_mm_yyyy_slash", label: "29/09/1997" },
  { value: "mm_dd_yy_slash", label: "09/29/97" },
  { value: "mm_dd_yyyy_slash", label: "09/29/1997" },
];

/** @param {boolean} showDow */
export function dateFormatOptionsForUi(showDow) {
  const prefix = showDow ? "Mon " : "";
  return DATE_FORMAT_OPTIONS.map((o) => ({ value: o.value, label: `${prefix}${o.label}` }));
}

export const TIME_HOURS_FORMAT_OPTIONS = [
  { value: "12-hours", label: "12-hours" },
  { value: "24-hours", label: "24-hours" },
];

export const SYMBOL_LABEL_PARTS = [
  { key: "symbolLabelName", label: "Name" },
  { key: "symbolLabelValue", label: "Value" },
  { key: "symbolLabelLine", label: "Line" },
];

export const BID_LABEL_PARTS = [
  { key: "bidLabelValue", label: "Value" },
  { key: "bidLabelLine", label: "Line" },
];

export const ASK_LABEL_PARTS = [
  { key: "askLabelValue", label: "Value" },
  { key: "askLabelLine", label: "Line" },
];

export const WATERMARK_PARTS = [
  { key: "watermarkTicker", label: "Ticker" },
  { key: "watermarkInterval", label: "Interval" },
  { key: "watermarkDescription", label: "Description" },
];

export const GRID_LINES_MODE_OPTIONS = [
  { value: "vertAndHorz", label: "Vert and horz" },
  { value: "vert", label: "Vertical" },
  { value: "horz", label: "Horizontal" },
  { value: "none", label: "None" },
];

export const FONT_SIZE_OPTIONS = [
  { value: "11", label: "11" },
  { value: "12", label: "12" },
  { value: "13", label: "13" },
  { value: "14", label: "14" },
  { value: "16", label: "16" },
  { value: "18", label: "18" },
  { value: "20", label: "20" },
];

export const SETTINGS_UI_STORAGE_KEY = "tv-settings-ui";

/** @returns {typeof DEFAULT_SETTINGS} */
export function cloneSettingsDefaults() {
  return structuredClone(DEFAULT_SETTINGS);
}

export function resolveSettingsSection(id) {
  const coarse = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  if (id === "drawings" && !coarse) return "appearance";
  return SETTINGS_SECTIONS.some((s) => s.id === id) ? id : "appearance";
}

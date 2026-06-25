/**
 * @typedef {{
 *   index: number,
 *   chart: import("lightweight-charts").IChartApi,
 *   series: import("lightweight-charts").ISeriesApi,
 *   el: HTMLElement,
 *   symbol: string,
 *   resolution: string,
 *   symbolInfo: object | null,
 *   bars: object[],
 *   statusEl?: HTMLElement | null,
 *   sessionBg?: object,
 *   backgroundPrimitive?: import("../../../primitives/background/composite.js").PaneBackgroundPrimitive,
 *   priceLineLabel?: object,
 *   hoverBar?: object,
 *   hoverPrev?: object,
 *   timeAdapter?: ReturnType<import("../../../chart/time/timeAdapter.js").createTimeAdapter> | null,
 * }} ChartPane
 */

export {};

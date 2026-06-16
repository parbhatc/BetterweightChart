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
 *   futureWhitespaceBars?: number | null,
 *   statusEl?: HTMLElement | null,
 *   sessionBg?: object,
 *   priceLineLabel?: object,
 *   hoverBar?: object,
 *   hoverPrev?: object,
 *   timeToIdx?: Map<number, number>,
 * }} ChartPane
 */

export {};

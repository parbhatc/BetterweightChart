/**
 * @typedef {{ time: number, open: number, high: number, low: number, close: number, volume?: number }} Bar
 */

/**
 * @typedef {{
 *   supported_resolutions?: string[],
 *   resolutions?: { id: string, label: string, sec?: number }[],
 *   default_symbol?: string,
 *   default_resolution?: string,
 *   themes?: Record<string, object>,
 *   symbols?: Record<string, object>,
 * }} DatafeedConfig
 */

/**
 * @typedef {{
 *   name: string,
 *   ticker?: string,
 *   description?: string,
 *   type?: string,
 *   exchange?: string,
 *   pricescale?: number,
 *   tick?: number,
 *   minmov?: number,
 *   timezone?: string,
 *   session?: string,
 *   has_intraday?: boolean,
 *   supported_resolutions?: string[],
 * }} SymbolInfo
 */

/**
 * @typedef {{
 *   from?: number,
 *   to?: number,
 *   countBack?: number,
 *   firstDataRequest?: boolean,
 * }} PeriodParams
 */

/**
 * @typedef {{
 *   bars: Bar[],
 *   noData?: boolean,
 *   meta?: object,
 * }} GetBarsResult
 */

/**
 * @typedef {object} Datafeed
 * @property {() => Promise<DatafeedConfig>} onReady
 * @property {(userInput: string, exchange?: string, symbolType?: string, limit?: number) => Promise<object[]>} [searchSymbols]
 * @property {(symbolName: string) => Promise<SymbolInfo>} resolveSymbol
 * @property {(symbolInfo: SymbolInfo, resolution: string, periodParams?: PeriodParams) => Promise<GetBarsResult>} getBars
 * @property {(...args: unknown[]) => void} [subscribeBars]
 * @property {(...args: unknown[]) => void} [unsubscribeBars]
 */

export {};

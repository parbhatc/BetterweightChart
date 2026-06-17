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
 *   listed_exchange?: string,
 *   pricescale?: number,
 *   tick?: number,
 *   minmov?: number,
 *   minTick?: number,
 *   pipSize?: number,
 *   pipValue?: number,
 *   pointvalue?: number,
 *   timezone?: string,
 *   session?: string,
 *   subsession_id?: string,
 *   subsessions?: object[],
 *   session_holidays?: string,
 *   corrections?: string,
 *   has_intraday?: boolean,
 *   has_daily?: boolean,
 *   has_weekly_and_monthly?: boolean,
 *   has_ticks?: boolean,
 *   has_seconds?: boolean,
 *   supported_resolutions?: string[],
 *   currency_code?: string,
 *   data_status?: string,
 *   volume_precision?: number,
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

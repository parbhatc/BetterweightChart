/**
 * @typedef {object} IndicatorInstance
 * @property {string} instanceId
 * @property {string} defId
 * @property {string} type
 * @property {number} paneIndex
 * @property {object} inputs
 * @property {object} style
 * @property {Record<string, boolean>} visibility
 * @property {boolean} hidden
 * @property {Record<string, Array<number | null>>} [lastPlots]
 */

/**
 * @typedef {object} PlotStyle
 * @property {boolean} visible
 * @property {string} color
 * @property {number} width
 * @property {number} lineStyle
 * @property {boolean} [priceLine]
 * @property {string} title
 */

/**
 * @typedef {object} LegendMeta
 * @property {string} shortTitle
 * @property {string} title
 * @property {string[]} params
 */

/**
 * @typedef {object} ValueLabel
 * @property {string} key
 * @property {string} title
 */

/**
 * @typedef {object} LineStyleKeys
 * @property {string} visibleKey
 * @property {string} colorKey
 * @property {string} [widthKey]
 * @property {string} [styleKey]
 * @property {string} [priceLineKey]
 * @property {string} [plotTypeKey]
 * @property {string} [label]
 */

/**
 * @typedef {object} InputDef
 * @property {string} id
 * @property {"int"|"float"|"source"|"select"|"bool"|"timeframe"} type
 * @property {string} title
 * @property {*} [defval]
 * @property {string} [section]
 * @property {{ id: string, label: string }[]} [options]
 * @property {(inputs: object) => boolean} [disabled]
 * @property {boolean} [affectsStyle]
 */

/**
 * @typedef {object} PlotDef
 * @property {string} id
 * @property {string} title
 * @property {"line"|"histogram"} [type="line"]
 * @property {string} [color]
 * @property {boolean} [priceLine]
 * @property {number} [paneIndex]
 * @property {boolean} [band]
 * @property {(inputs: object, style?: object) => boolean} [when]
 */

/**
 * @typedef {object} FillDef
 * @property {string} id
 * @property {string} upper
 * @property {string} lower
 * @property {string} title
 * @property {string} [color]
 * @property {number} [opacity]
 * @property {(inputs: object) => boolean} [when]
 */

export {};

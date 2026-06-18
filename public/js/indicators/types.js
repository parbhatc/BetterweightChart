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
 * @typedef {object} InputFieldDef
 * @property {string} id
 * @property {"int"|"float"|"source"|"select"|"bool"|"timeframe"|"text"|"color"} type
 * @property {string} title
 * @property {*} [defval]
 * @property {boolean} [inline] Group with adjacent inline fields on one row (legacy flat schema)
 * @property {{ id: string, label: string }[]} [options]
 * @property {(inputs: object) => boolean} [disabled]
 * @property {boolean} [affectsStyle]
 * @property {string} [opacityKey] For `color` — opacity stored under this key (default `${id}Opacity`)
 * @property {"inputs"|"style"} [store="inputs"] Where color values are stored
 * @property {boolean} [showInStatusLine=true] Show this input's value in the legend status line after the study title
 */

/**
 * Checkbox + field on one row (e.g. enable timeframe + timeframe select).
 * @typedef {object} InputRowDef
 * @property {"row"} type
 * @property {string} [section]
 * @property {InputFieldDef[]} fields
 */

/**
 * Two fields side by side (e.g. Bullish | Bearish colors, FVG | iFVG labels).
 * @typedef {object} InputInlinePairDef
 * @property {"inlinePair"} type
 * @property {string} [section]
 * @property {string} [header] — title row above left/right cells (e.g. "FVG Box Color")
 * @property {InputFieldDef} left
 * @property {InputFieldDef} right
 */

/**
 * @typedef {InputFieldDef | InputRowDef | InputInlinePairDef} InputDef
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
 * @typedef {object} GraphicObjectDef
 * @property {string} styleKey — `instance.style` toggle key
 * @property {string} label — Settings dialog checkbox label
 * @property {boolean} [default=true]
 * @property {string} [overlay] — overlay primitive id this toggle gates (`labels`, `lines`, …). Omit to gate all overlays on the study.
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

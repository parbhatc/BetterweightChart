/**
 * @typedef {object} OrderLineState
 * @property {string} id
 * @property {number} price
 * @property {string} text
 * @property {string} quantity
 * @property {number} lineStyle
 * @property {number} lineLength
 * @property {string} lineColor
 * @property {string} bodyBackgroundColor
 * @property {string} bodyTextColor
 * @property {string} bodyBorderColor
 * @property {string} quantityBackgroundColor
 * @property {string} quantityTextColor
 * @property {string} quantityBorderColor
 * @property {string} cancelButtonBorderColor
 * @property {string} cancelButtonIconColor
 * @property {string} cancelTooltip
 * @property {boolean} removed
 * @property {{ price: number, type: string | null } | null} target
 * @property {boolean} isMoving
 */

/**
 * @typedef {object} OrderLineHandlers
 * @property {(() => void) | null} modify
 * @property {(() => void) | null} cancel
 * @property {(() => void) | null} move
 * @property {(() => void) | null} moving
 * @property {(() => unknown[] | null) | null} contextMenu
 */

export {};

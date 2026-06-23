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
 * @property {string} cancelButtonBackgroundColor
 * @property {string} cancelButtonIconColor
 * @property {string} cancelTooltip
 * @property {string} bodyTooltip
 * @property {string} quantityTooltip
 * @property {boolean} removed
 * @property {{ price: number, type: string | null } | null} target
 * @property {boolean} isMoving
 * @property {"left"|"right"} [pillSide] control pill anchor on chart pane
 * @property {number} [pillOffset] px inset from the anchored edge (right default)
 * @property {boolean} [lineFullWidth] span the horizontal line across the full chart pane
 * @property {number} [bodyFontWeight] CSS font-weight for body pill text (100–900)
 * @property {number} [quantityFontWeight] CSS font-weight for quantity pill text (100–900)
 * @property {number} [bodyFontSize] CSS font-size in px for body pill text (9–16)
 * @property {number} [quantityFontSize] CSS font-size in px for quantity pill text (9–16)
 * @property {string} [bodyFontFamily] CSS font-family for body pill text
 * @property {string} [quantityFontFamily] CSS font-family for quantity pill text
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

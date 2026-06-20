/**
 * TradingView-style on-chart table model.
 * Indicators and boot providers build {@link ChartTable} objects; {@link renderChartTable}
 * turns them into compact HTML overlays.
 *
 * @typedef {'header' | 'bull' | 'bear' | 'neutral' | 'done' | 'pending' | 'current' | 'muted'} ChartTableTone
 */

/**
 * @typedef {object} ChartTableCell
 * @property {string} text
 * @property {ChartTableTone} [tone]
 * @property {number} [colspan]
 * @property {string} [bg]
 * @property {string} [color]
 */

/**
 * @typedef {object} ChartTableRow
 * @property {ChartTableCell[]} cells
 */

/**
 * @typedef {object} ChartTable
 * @property {string} id
 * @property {string} [title]
 * @property {ChartTableTone} [titleTone]
 * @property {number} [columns]
 * @property {ChartTableRow[]} rows
 * @property {('done' | 'current' | 'pending')[]} [progress]
 * @property {number} [stackIndex]
 */

/** @param {string} s */
export function escTableText(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

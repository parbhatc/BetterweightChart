/** @typedef {(input: object, draftInputs: object, helpers?: object) => string} CustomInputRenderer */
/** @typedef {(inputsPanel: HTMLElement, fieldId: string) => unknown} CustomInputReader */

/** @type {Map<string, CustomInputRenderer>} */
const renderers = new Map();

/** @type {Map<string, CustomInputReader>} */
const readers = new Map();

/** @param {string} type @param {CustomInputRenderer} fn */
export function registerCustomInputRenderer(type, fn) {
  renderers.set(type, fn);
}

/** @param {string} type @param {CustomInputReader} fn */
export function registerCustomInputReader(type, fn) {
  readers.set(type, fn);
}

/** @type {((ev: Event, ctx: object) => boolean)[]} */
const clickHandlers = [];

/** @param {(ev: Event, ctx: object) => boolean} fn — return true if handled */
export function registerCustomSettingsClickHandler(fn) {
  clickHandlers.push(fn);
}

/** @param {Event} ev @param {object} ctx */
export function runCustomSettingsClickHandlers(ev, ctx) {
  for (const fn of clickHandlers) {
    if (fn(ev, ctx)) return true;
  }
  return false;
}

/** @param {string} type */
export function hasCustomInputRenderer(type) {
  return renderers.has(type);
}

/**
 * @param {string} type
 * @param {object} input
 * @param {object} draftInputs
 * @param {object} [helpers]
 */
export function renderCustomInput(type, input, draftInputs, helpers) {
  return renderers.get(type)?.(input, draftInputs, helpers) ?? "";
}

/**
 * @param {string} type
 * @param {HTMLElement} inputsPanel
 * @param {string} fieldId
 */
export function readCustomInput(type, inputsPanel, fieldId) {
  return readers.get(type)?.(inputsPanel, fieldId);
}

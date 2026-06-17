import { EmaIndicator } from "./definitions/EmaIndicator.js";
import { VolumeIndicator } from "./definitions/VolumeIndicator.js";
import { RsiIndicator } from "./definitions/RsiIndicator.js";
import { MacdIndicator } from "./definitions/MacdIndicator.js";

/** @typedef {typeof import("./BaseIndicator.js").BaseIndicator} IndicatorClass */
/** @typedef {import("./types.js").IndicatorInstance} IndicatorInstance */

/** @type {Map<string, IndicatorClass>} */
const registry = new Map([
  [EmaIndicator.id, EmaIndicator],
  [VolumeIndicator.id, VolumeIndicator],
  [RsiIndicator.id, RsiIndicator],
  [MacdIndicator.id, MacdIndicator],
]);

/** @returns {IndicatorClass[]} */
export function listIndicators() {
  return [...registry.values()]
    .filter((Indicator) => Indicator.enabled)
    .sort((a, b) => a.title.localeCompare(b.title));
}

/** @param {string} id @returns {IndicatorClass | null} */
export function getIndicatorClass(id) {
  return registry.get(id) ?? null;
}

/** @param {IndicatorClass} Indicator */
export function registerIndicator(Indicator) {
  if (!Indicator.id) throw new Error("Indicator.id is required");
  registry.set(Indicator.id, Indicator);
}

/** @param {string} defId @param {number} paneIndex @returns {IndicatorInstance | null} */
export function createIndicatorInstance(defId, paneIndex) {
  const Indicator = getIndicatorClass(defId);
  return Indicator?.createInstance(paneIndex) ?? null;
}

/** @deprecated use getIndicatorClass */
export function getIndicatorDefinition(id) {
  return getIndicatorClass(id);
}

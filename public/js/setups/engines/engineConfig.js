/** @typedef {import("../setupText.js").SetupTextConfig} SetupTextConfig */
/** @typedef {import("../setupChecklist.js").ChecklistItemDef} ChecklistItemDef */

/**
 * @typedef {object} SetupEngineBundle
 * @property {SetupTextConfig} text
 * @property {ChecklistItemDef[]} checklist
 * @property {{ reset_on_opposite_fvg_tap?: boolean } | undefined} [cycle]
 */

/** @type {Map<string, SetupEngineBundle>} */
const bySlug = new Map();

/** @param {string} slug @param {SetupEngineBundle} bundle */
export function configure(slug, bundle) {
  bySlug.set(slug, bundle);
}

/** @param {string} slug @returns {SetupEngineBundle} */
export function bundle(slug) {
  const c = bySlug.get(slug);
  if (!c) throw new Error(`Setup engine not configured: ${slug}`);
  return c;
}

/** @param {string} slug @returns {SetupTextConfig} */
export function config(slug) {
  return bundle(slug).text;
}

/** @param {string} slug @returns {ChecklistItemDef[]} */
export function checklist(slug) {
  return bundle(slug).checklist;
}

/** @param {string} slug */
export function setupCycle(slug) {
  return bundle(slug).cycle;
}

/** @param {string} slug @returns {SetupEngineBundle | undefined} */
export function tryBundle(slug) {
  return bySlug.get(slug);
}

export class EngineConfig {
  static configure = configure;
  static bundle = bundle;
  static get = config;
  static checklist = checklist;
  static try = tryBundle;
}

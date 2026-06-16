/** @type {Record<string, Record<string, unknown>>} */
let scoped = {};

/** @type {() => void} */
let onChange = () => {};

export function setLayoutToolDefaultsChangeHandler(fn) {
  onChange = fn;
}

/** @param {Record<string, Record<string, unknown>> | null | undefined} next */
export function setLayoutToolDefaults(next) {
  scoped =
    next && typeof next === "object"
      ? structuredClone(next)
      : {};
}

export function getLayoutToolDefaultsSnapshot() {
  return structuredClone(scoped);
}

/** @param {string} toolType */
export function loadLayoutScopedToolDefaults(toolType) {
  const saved = scoped[toolType];
  return saved && typeof saved === "object" ? { ...saved } : {};
}

/** @param {string} toolType @param {Record<string, unknown>} patch */
export function saveLayoutScopedToolDefault(toolType, patch) {
  const prev = scoped[toolType] && typeof scoped[toolType] === "object" ? scoped[toolType] : {};
  scoped[toolType] = { ...prev, ...patch };
  onChange();
}

/** @param {string} toolType */
export function clearLayoutScopedToolDefault(toolType) {
  if (!scoped[toolType]) return;
  delete scoped[toolType];
  onChange();
}

/** @param {string} toolType */
export function hasLayoutScopedToolDefault(toolType) {
  return Boolean(scoped[toolType] && Object.keys(scoped[toolType]).length);
}

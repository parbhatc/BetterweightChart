/** @typedef {{ templates: Record<string, Record<string, Record<string, unknown>>>, active: Record<string, string> }} LayoutDrawingTemplates */

/** @type {LayoutDrawingTemplates} */
let scoped = { templates: {}, active: {} };

/** @type {() => void} */
let onChange = () => {};

export function setLayoutDrawingTemplatesChangeHandler(fn) {
  onChange = fn;
}

/** @param {LayoutDrawingTemplates | null | undefined} next */
export function setLayoutDrawingTemplates(next) {
  if (!next || typeof next !== "object") {
    scoped = { templates: {}, active: {} };
    return;
  }
  scoped = {
    templates:
      next.templates && typeof next.templates === "object"
        ? structuredClone(next.templates)
        : {},
    active:
      next.active && typeof next.active === "object" ? structuredClone(next.active) : {},
  };
}

export function getLayoutDrawingTemplatesSnapshot() {
  return structuredClone(scoped);
}

function emit() {
  onChange();
}

/** @param {string} toolType */
export function listNamedTemplates(toolType) {
  const byType = scoped.templates[toolType];
  if (!byType || typeof byType !== "object") return [];
  return Object.keys(byType).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

/** @param {string} toolType @param {string} name */
export function hasNamedTemplate(toolType, name) {
  const byType = scoped.templates[toolType];
  return Boolean(byType && typeof byType === "object" && byType[name]);
}

/** @param {string} toolType @param {string} name */
export function loadNamedTemplate(toolType, name) {
  const patch = scoped.templates[toolType]?.[name];
  return patch && typeof patch === "object" ? { ...patch } : {};
}

/** @param {string} toolType @param {string} name @param {Record<string, unknown>} patch */
export function saveNamedTemplate(toolType, name, patch) {
  if (!scoped.templates[toolType]) scoped.templates[toolType] = {};
  scoped.templates[toolType][name] = { ...patch };
  scoped.active[toolType] = name;
  emit();
}

/** @param {string} toolType */
export function getActiveTemplateName(toolType) {
  const name = scoped.active[toolType];
  if (!name || !hasNamedTemplate(toolType, name)) return null;
  return name;
}

/** @param {string} toolType @param {string | null} name */
export function setActiveTemplateName(toolType, name) {
  if (!name) {
    delete scoped.active[toolType];
  } else {
    scoped.active[toolType] = name;
  }
  emit();
}

/** @param {string} toolType */
export function clearActiveTemplateName(toolType) {
  setActiveTemplateName(toolType, null);
}

/** @param {string} toolType */
export function hasNamedTemplatesForTool(toolType) {
  return listNamedTemplates(toolType).length > 0;
}

/** @param {string} toolType */
export function hasTemplateIndicator(toolType) {
  return Boolean(getActiveTemplateName(toolType)) || hasNamedTemplatesForTool(toolType);
}

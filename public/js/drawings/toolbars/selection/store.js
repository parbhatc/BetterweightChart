const TOOLBAR_GROUP_TOOLS_KEY = "tv-toolbar-group-tools";

/** @returns {Record<string, string>} */
export function loadToolbarGroupTools() {
  try {
    const raw = localStorage.getItem(TOOLBAR_GROUP_TOOLS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** @param {string} groupId @param {string} toolType */
export function saveToolbarGroupTool(groupId, toolType) {
  if (!groupId || !toolType) return;
  const all = loadToolbarGroupTools();
  all[groupId] = toolType;
  localStorage.setItem(TOOLBAR_GROUP_TOOLS_KEY, JSON.stringify(all));
}

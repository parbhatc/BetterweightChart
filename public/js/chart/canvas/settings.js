/** @param {string | undefined} mode @param {"vert" | "horz"} axis */
export function gridAxisVisible(mode, axis) {
  if (mode === "none") return false;
  if (mode === "vertAndHorz") return true;
  return mode === axis;
}

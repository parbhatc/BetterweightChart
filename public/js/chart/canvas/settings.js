/** @param {string | undefined} mode @param {"vert" | "horz"} axis */
export function gridAxisVisible(mode, axis) {
  if (mode === "none") return false;
  if (mode === "vertAndHorz") return true;
  return mode === axis;
}

/** @param {object} cv @param {{ bg?: string }} [themeColors] */
export function resolveLayoutBackground(cv, themeColors = {}) {
  const fallback = themeColors.bg ?? "#020617";
  if (cv?.backgroundType === "gradient") {
    return {
      type: "gradient",
      topColor: cv.backgroundGradientTopColor ?? fallback,
      bottomColor: cv.backgroundGradientBottomColor ?? fallback,
    };
  }
  return {
    type: "solid",
    color: cv?.backgroundColor || fallback,
  };
}

/** @param {object} cv @param {{ bg?: string }} [themeColors] */
export function resolvePaneBackgroundColor(cv, themeColors = {}) {
  const fallback = themeColors.bg ?? "#020617";
  if (cv?.backgroundType === "gradient") {
    return cv.backgroundGradientTopColor ?? fallback;
  }
  return cv?.backgroundColor ?? fallback;
}

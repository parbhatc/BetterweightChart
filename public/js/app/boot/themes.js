export const CHART_THEMES = {
  dark: {
    bg: "#131722",
    text: "#d1d4dc",
    grid: "#1e222d",
    border: "#2a2e39",
    crosshair: "#758696",
    labelBg: "#363a45",
    up: "#089981",
    down: "#f23645",
  },
  light: {
    bg: "#ffffff",
    text: "#131722",
    grid: "#f0f3fa",
    border: "#e0e3eb",
    crosshair: "#9598a1",
    labelBg: "#131722",
    up: "#089981",
    down: "#f23645",
  },
};

/** @param {string} [mode] */
export function chartThemeFallback(mode) {
  return CHART_THEMES[mode === "light" ? "light" : "dark"];
}

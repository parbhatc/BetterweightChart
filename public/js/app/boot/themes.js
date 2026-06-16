export const CHART_THEMES = {
  dark: {
    bg: "#020617",
    text: "#e2e8f0",
    grid: "#1e293b",
    border: "#334155",
    crosshair: "#64748b",
    labelBg: "#0f172a",
    up: "#3fb950",
    down: "#f85149",
  },
  light: {
    bg: "#ffffff",
    text: "#0f172a",
    grid: "#f1f5f9",
    border: "#e2e8f0",
    crosshair: "#94a3b8",
    labelBg: "#0f172a",
    up: "#16a34a",
    down: "#dc2626",
  },
};

/** @param {string} [mode] */
export function chartThemeFallback(mode) {
  return CHART_THEMES[mode === "light" ? "light" : "dark"];
}

/** @param {ReturnType<typeof import("../../ui/settings/store.js").createChartSettings>} store @param {"dark" | "light"} mode */
export function applyCanvasPresetForTheme(store, mode) {
  const t = chartThemeFallback(mode);
  const patch = {
    backgroundColor: t.bg,
    gridVertColor: mode === "dark" ? "rgba(226, 232, 240, 0.06)" : "rgba(15, 23, 42, 0.06)",
    gridHorzColor: mode === "dark" ? "rgba(226, 232, 240, 0.06)" : "rgba(15, 23, 42, 0.06)",
    crosshairColor: t.crosshair,
    scalesTextColor: t.text,
    scalesLineColor: mode === "dark" ? "rgba(242, 242, 242, 0)" : "rgba(15, 23, 42, 0)",
    watermarkColor: mode === "dark" ? "rgba(148, 163, 184, 0.25)" : "rgba(100, 116, 139, 0.2)",
  };
  for (const [key, value] of Object.entries(patch)) {
    store.set("canvas", key, value, { skipHistory: true });
  }
}

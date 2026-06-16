const THEME_STORAGE_KEY = "tv-chart-theme";

/** @param {"dark" | "light"} [fallback] */
export function loadThemePreference(fallback = "dark") {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* storage unavailable */
  }
  return fallback;
}

/** @param {"dark" | "light"} mode */
export function saveThemePreference(mode) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode === "light" ? "light" : "dark");
  } catch {
    /* storage unavailable */
  }
}

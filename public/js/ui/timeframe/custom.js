const CUSTOM_STORAGE_KEY = "tv-tf-custom";

/**
 * @returns {Array<{ id: string, label: string, sec: number }>}
 */
export function loadCustomResolutions() {
  try {
    const raw = localStorage.getItem(CUSTOM_STORAGE_KEY);
    if (!raw) return [];
    const rows = JSON.parse(raw);
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((r) => r && typeof r.id === "string")
      .map((r) => ({
        id: r.id,
        label: r.label ?? r.id,
        sec: Number(r.sec) || 60,
      }));
  } catch {
    return [];
  }
}

/** @param {Array<{ id: string, label: string, sec: number }>} rows */
export function saveCustomResolutions(rows) {
  localStorage.setItem(
    CUSTOM_STORAGE_KEY,
    JSON.stringify(
      rows.map((r) => ({
        id: r.id,
        label: r.label,
        sec: r.sec,
      })),
    ),
  );
}

/**
 * @param {Array<{ id: string }>} rows
 * @param {{ id: string, label: string, sec: number }} def
 */
export function addCustomResolution(rows, def) {
  if (rows.some((r) => r.id === def.id)) return rows;
  return [...rows, def];
}

/**
 * @param {Array<{ id: string }>} rows
 * @param {string} id
 */
export function removeCustomResolution(rows, id) {
  return rows.filter((r) => r.id !== id);
}

/** @param {string} id @param {Array<{ id: string }>} custom */
export function isCustomResolution(id, custom) {
  return custom.some((r) => r.id === id);
}

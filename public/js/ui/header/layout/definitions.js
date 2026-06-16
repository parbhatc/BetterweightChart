/** @typedef {{ gridColumn: string, gridRow: string }} PanePlacement */
/** @typedef {{ id: string, count: number, cols: string, rows: string, placements: PanePlacement[] }} LayoutDef */

/** @param {number} col @param {number} row @param {number} [colSpan] @param {number} [rowSpan] */
function cell(col, row, colSpan = 1, rowSpan = 1) {
  return {
    gridColumn: colSpan > 1 ? `${col} / span ${colSpan}` : String(col),
    gridRow: rowSpan > 1 ? `${row} / span ${rowSpan}` : String(row),
  };
}

/** @param {number} n @param {number} m */
function uniform(n, m) {
  const placements = [];
  for (let r = 1; r <= m; r++) {
    for (let c = 1; c <= n; c++) placements.push(cell(c, r));
  }
  return {
    count: n * m,
    cols: Array(n).fill("1fr").join(" "),
    rows: Array(m).fill("1fr").join(" "),
    placements,
  };
}

/** @type {Record<string, Omit<LayoutDef, "id">>} */
const SPECS = {
  s: uniform(1, 1),
  "2h": uniform(2, 1),
  "2v": uniform(1, 2),
  "3h": uniform(3, 1),
  "3v": uniform(1, 3),
  "3s": { count: 3, cols: "1fr 1fr", rows: "1fr 1fr", placements: [cell(1, 1, 1, 2), cell(2, 1), cell(2, 2)] },
  "3r": { count: 3, cols: "1fr 1fr", rows: "1fr 1fr", placements: [cell(1, 1), cell(1, 2), cell(2, 1, 1, 2)] },
  "2-1": { count: 3, cols: "1fr 1fr", rows: "1fr 1fr", placements: [cell(1, 1), cell(2, 1), cell(1, 2, 2, 1)] },
  "1-2": { count: 3, cols: "1fr 1fr", rows: "1fr 1fr", placements: [cell(1, 1, 2, 1), cell(1, 2), cell(2, 2)] },
  "4": uniform(2, 2),
  "4v": uniform(1, 4),
  "4h": uniform(4, 1),
  "4s": {
    count: 4,
    cols: "1fr 1fr",
    rows: "1fr 1fr",
    placements: [cell(1, 1, 1, 2), cell(2, 1, 1, 2), cell(1, 2), cell(2, 2)],
  },
  "4s-l": {
    count: 4,
    cols: "1fr 1fr",
    rows: "1fr 1fr 1fr",
    placements: [cell(1, 1, 1, 3), cell(2, 1), cell(2, 2), cell(2, 3)],
  },
  "1-3": { count: 4, cols: "1fr 1fr 1fr", rows: "1fr 1fr", placements: [cell(1, 1, 3, 1), cell(1, 2), cell(2, 2), cell(3, 2)] },
  "3-1": { count: 4, cols: "1fr 1fr 1fr", rows: "1fr 1fr", placements: [cell(1, 1), cell(2, 1), cell(3, 1), cell(1, 2, 3, 1)] },
  "2-2-l": { count: 4, cols: "1fr 1fr 1fr", rows: "1fr 1fr", placements: [cell(1, 1, 1, 2), cell(2, 1), cell(3, 1), cell(2, 2, 2, 1)] },
  "2-2-r": { count: 4, cols: "1fr 1fr 1fr", rows: "1fr 1fr", placements: [cell(1, 1), cell(2, 1), cell(3, 1, 1, 2), cell(1, 2, 2, 1)] },
  "2-2": { count: 4, cols: "1fr 1fr", rows: "1fr 1fr 1fr", placements: [cell(1, 1, 2, 1), cell(1, 2), cell(2, 2), cell(1, 3, 2, 1)] },
  "1-4": uniform(4, 1),
  "5h": uniform(5, 1),
  "5v": uniform(1, 5),
  "5s": {
    count: 5,
    cols: "1fr 1fr",
    rows: "1fr 1fr 1fr 1fr",
    placements: [cell(1, 1, 1, 4), cell(2, 1), cell(2, 2), cell(2, 3), cell(2, 4)],
  },
  "5s-l": {
    count: 5,
    cols: "1fr 1fr",
    rows: "1fr 1fr 1fr 1fr",
    placements: [cell(2, 1, 1, 4), cell(1, 1), cell(1, 2), cell(1, 3), cell(1, 4)],
  },
  "2-3": { count: 5, cols: "1fr 1fr 1fr", rows: "1fr 1fr", placements: [cell(1, 1, 2, 1), cell(3, 1), cell(1, 2), cell(2, 2), cell(3, 2)] },
  "3-2": { count: 5, cols: "1fr 1fr", rows: "1fr 1fr 1fr", placements: [cell(1, 1), cell(2, 1, 1, 2), cell(1, 2), cell(1, 3), cell(2, 3)] },
  "4-1": { count: 5, cols: "1fr 1fr 1fr 1fr", rows: "1fr 1fr", placements: [cell(1, 1), cell(2, 1), cell(3, 1), cell(4, 1), cell(1, 2, 4, 1)] },
  "2-3-l": { count: 5, cols: "1fr 1fr 1fr", rows: "1fr 1fr 1fr", placements: [cell(1, 1, 1, 3), cell(2, 1), cell(3, 1), cell(2, 2), cell(2, 3, 2, 1)] },
  "2-3-r": { count: 5, cols: "1fr 1fr 1fr", rows: "1fr 1fr 1fr", placements: [cell(3, 1, 1, 3), cell(1, 1), cell(2, 1), cell(1, 2, 2, 1), cell(1, 3)] },
  "6": uniform(3, 2),
  "6h": uniform(6, 1),
  "6v": uniform(1, 6),
  "6c": { count: 6, cols: "1fr 1fr", rows: "1fr 1fr 1fr", placements: [cell(1, 1, 1, 2), cell(2, 1), cell(2, 2), cell(1, 3), cell(2, 3), cell(1, 2)] },
  "2-4": { count: 6, cols: "1fr 1fr 1fr 1fr", rows: "1fr 1fr", placements: [cell(1, 1, 2, 1), cell(3, 1), cell(4, 1), cell(1, 2), cell(2, 2), cell(3, 2, 2, 1)] },
  "4-2": { count: 6, cols: "1fr 1fr 1fr", rows: "1fr 1fr 1fr", placements: [cell(1, 1), cell(2, 1), cell(3, 1), cell(1, 2, 2, 1), cell(3, 2), cell(1, 3, 3, 1)] },
  "4-3": { count: 7, cols: "1fr 1fr 1fr 1fr", rows: "1fr 1fr", placements: [cell(1, 1), cell(2, 1), cell(3, 1), cell(4, 1), cell(1, 2), cell(2, 2), cell(3, 2, 2, 1)] },
  "7h": uniform(7, 1),
  "7s": { count: 7, cols: "1fr 1fr", rows: "1fr 1fr 1fr 1fr 1fr 1fr", placements: [cell(1, 1, 1, 6), cell(2, 1), cell(2, 2), cell(2, 3), cell(2, 4), cell(2, 5), cell(2, 6)] },
  "8": uniform(4, 2),
  "8c": { count: 8, cols: "1fr 1fr", rows: "1fr 1fr 1fr 1fr", placements: [cell(1, 1), cell(2, 1), cell(1, 2), cell(2, 2), cell(1, 3), cell(2, 3), cell(1, 4), cell(2, 4)] },
  "8h": uniform(8, 1),
  "8v": uniform(1, 8),
  "9s": uniform(3, 3),
  "5-4": { count: 9, cols: "1fr 1fr 1fr 1fr 1fr", rows: "1fr 1fr", placements: [cell(1, 1), cell(2, 1), cell(3, 1), cell(4, 1), cell(5, 1), cell(1, 2), cell(2, 2), cell(3, 2), cell(4, 2, 2, 1)] },
  "9h": uniform(9, 1),
  "9v": uniform(1, 9),
  "10c5": { count: 10, cols: "1fr 1fr 1fr 1fr 1fr", rows: "1fr 1fr", placements: [...Array(5)].flatMap((_, i) => [cell(i + 1, 1), cell(i + 1, 2)]) },
  "10h": uniform(10, 1),
  "10v": uniform(1, 10),
  "12c6": { count: 12, cols: "1fr 1fr 1fr 1fr 1fr 1fr", rows: "1fr 1fr", placements: [...Array(6)].flatMap((_, i) => [cell(i + 1, 1), cell(i + 1, 2)]) },
  "12c4": { count: 12, cols: "1fr 1fr 1fr 1fr", rows: "1fr 1fr 1fr", placements: [...Array(4)].flatMap((_, r) => [...Array(3)].map((_, c) => cell(c + 1, r + 1))) },
  "12h": uniform(12, 1),
  "14c7": { count: 14, cols: "1fr 1fr 1fr 1fr 1fr 1fr 1fr", rows: "1fr 1fr", placements: [...Array(7)].flatMap((_, i) => [cell(i + 1, 1), cell(i + 1, 2)]) },
  "16c8": { count: 16, cols: "1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr", rows: "1fr 1fr", placements: [...Array(8)].flatMap((_, i) => [cell(i + 1, 1), cell(i + 1, 2)]) },
  "16c4": uniform(4, 4),
};

/** @type {LayoutDef[]} */
export const LAYOUT_DEFINITIONS = Object.entries(SPECS).map(([id, spec]) => ({ id, ...spec }));

/** @type {{ label: string, ids: string[] }[]} */
export const LAYOUT_GROUPS = [
  { label: "1", ids: ["s"] },
  { label: "2", ids: ["2h", "2v"] },
  { label: "3", ids: ["3h", "3v", "3s", "3r", "2-1", "1-2"] },
  { label: "4", ids: ["4", "4v", "4h", "4s", "4s-l", "1-3", "3-1", "2-2-l", "2-2-r", "2-2"] },
  { label: "5", ids: ["1-4", "5h", "5v", "5s", "5s-l", "2-3", "3-2", "4-1", "2-3-l", "2-3-r"] },
  { label: "6", ids: ["6", "6h", "6v", "6c", "2-4", "4-2"] },
  { label: "7", ids: ["4-3", "7h", "7s"] },
  { label: "8", ids: ["8", "8c", "8h", "8v"] },
  { label: "9", ids: ["9s", "5-4", "9h", "9v"] },
  { label: "10", ids: ["10c5", "10h", "10v"] },
  { label: "12", ids: ["12c6", "12c4", "12h"] },
  { label: "14", ids: ["14c7"] },
  { label: "16", ids: ["16c8", "16c4"] },
];

/** @param {string} id */
export function getLayoutDef(id) {
  const spec = SPECS[id];
  if (!spec) return SPECS.s;
  return { id, ...spec };
}

export const DEFAULT_LAYOUT_ID = "s";

/** Layouts available on mobile (groups 1 and 2 only). */
export const MOBILE_LAYOUT_IDS = ["s", "2h", "2v"];

const MOBILE_LAYOUT_ID_SET = new Set(MOBILE_LAYOUT_IDS);
const MOBILE_LAYOUT_GROUP_LABELS = new Set(["1", "2"]);

const MOBILE_LAYOUT_MQ =
  typeof window !== "undefined" ? window.matchMedia("(max-width: 768px)") : null;

/** @returns {boolean} */
export function isMobileLayoutViewport() {
  return Boolean(MOBILE_LAYOUT_MQ?.matches);
}

/** @param {string} id */
export function isLayoutAllowedOnMobile(id) {
  return MOBILE_LAYOUT_ID_SET.has(id);
}

/** @param {string} id */
export function clampLayoutIdForViewport(id) {
  if (!isMobileLayoutViewport()) return id;
  return isLayoutAllowedOnMobile(id) ? id : DEFAULT_LAYOUT_ID;
}

/** @returns {{ label: string, ids: string[] }[]} */
export function getLayoutGroupsForViewport() {
  if (!isMobileLayoutViewport()) return LAYOUT_GROUPS;
  return LAYOUT_GROUPS.filter((g) => MOBILE_LAYOUT_GROUP_LABELS.has(g.label));
}

/** @param {(matches: boolean) => void} fn */
export function onMobileLayoutViewportChange(fn) {
  if (!MOBILE_LAYOUT_MQ) return () => {};
  const handler = () => fn(MOBILE_LAYOUT_MQ.matches);
  MOBILE_LAYOUT_MQ.addEventListener("change", handler);
  return () => MOBILE_LAYOUT_MQ.removeEventListener("change", handler);
}

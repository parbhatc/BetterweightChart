/** Layout picker icons (21×19 viewBox unless noted). */

const FRAME =
  '<path fill="currentColor" d="M2.5 1C1.67 1 1 1.67 1 2.5v12c0 .83.67 1.5 1.5 1.5h14c.83 0 1.5-.67 1.5-1.5v-12c0-.83-.67-1.5-1.5-1.5h-14ZM0 2.5A2.5 2.5 0 0 1 2.5 0h14A2.5 2.5 0 0 1 19 2.5v12a2.5 2.5 0 0 1-2.5 2.5h-14A2.5 2.5 0 0 1 0 14.5v-12Z"/>';

/** @param {string} inner */
function icon(inner, w = 21, h = 19, vb = "-1 -1 21 19") {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${w}" height="${h}" aria-hidden="true">${inner}</svg>`;
}

/** @type {Record<string, string>} */
export const LAYOUT_ICONS = {
  s: icon(FRAME),
  "2h": icon(
    '<path fill="currentColor" fill-rule="evenodd" d="M1 2.5C1 1.67 1.67 1 2.5 1H9v15H2.5A1.5 1.5 0 0 1 1 14.5v-12ZM10 16h6.5c.83 0 1.5-.67 1.5-1.5v-12c0-.83-.67-1.5-1.5-1.5H10v15ZM2.5 0A2.5 2.5 0 0 0 0 2.5v12A2.5 2.5 0 0 0 2.5 17h14a2.5 2.5 0 0 0 2.5-2.5v-12A2.5 2.5 0 0 0 16.5 0h-14Z"/>',
  ),
  "2v": icon(
    '<path fill="currentColor" fill-rule="evenodd" d="M1 2.5C1 1.67 1.67 1 2.5 1h14c.83 0 1.5.67 1.5 1.5V8H1V2.5ZM1 9v5.5c0 .83.67 1.5 1.5 1.5h14c.83 0 1.5-.67 1.5-1.5V9H1Zm1.5-9A2.5 2.5 0 0 0 0 2.5v12A2.5 2.5 0 0 0 2.5 17h14a2.5 2.5 0 0 0 2.5-2.5v-12A2.5 2.5 0 0 0 16.5 0h-14Z"/>',
  ),
  "3h": icon(
    '<path fill="currentColor" fill-rule="evenodd" d="M1 2.5C1 1.67 1.67 1 2.5 1H6v15H2.5A1.5 1.5 0 0 1 1 14.5v-12ZM7 16h5V1H7v15Zm6-15v15h3.5c.83 0 1.5-.67 1.5-1.5v-12c0-.83-.67-1.5-1.5-1.5H13ZM2.5 0A2.5 2.5 0 0 0 0 2.5v12A2.5 2.5 0 0 0 2.5 17h14a2.5 2.5 0 0 0 2.5-2.5v-12A2.5 2.5 0 0 0 16.5 0h-14Z"/>',
  ),
  "3v": icon(
    '<path fill="currentColor" fill-rule="evenodd" d="M1 2.5C1 1.67 1.67 1 2.5 1h14c.83 0 1.5.67 1.5 1.5V5H1V2.5ZM1 6v5h17V6H1Zm17 6H1v2.5c0 .83.67 1.5 1.5 1.5h14c.83 0 1.5-.67 1.5-1.5V12ZM2.5 0A2.5 2.5 0 0 0 0 2.5v12A2.5 2.5 0 0 0 2.5 17h14a2.5 2.5 0 0 0 2.5-2.5v-12A2.5 2.5 0 0 0 16.5 0h-14Z"/>',
  ),
  "3s": icon(
    '<path fill="currentColor" fill-rule="evenodd" d="M1 2.5C1 1.67 1.67 1 2.5 1H9v15H2.5A1.5 1.5 0 0 1 1 14.5v-12ZM10 16h6.5c.83 0 1.5-.67 1.5-1.5V9h-8v7Zm8-8V2.5c0-.83-.67-1.5-1.5-1.5H10v7h8ZM2.5 0A2.5 2.5 0 0 0 0 2.5v12A2.5 2.5 0 0 0 2.5 17h14a2.5 2.5 0 0 0 2.5-2.5v-12A2.5 2.5 0 0 0 16.5 0h-14Z"/>',
  ),
  "3r": icon(
    '<path fill="currentColor" fill-rule="evenodd" d="M1 2.5C1 1.67 1.67 1 2.5 1H9v7H1V2.5ZM1 9v5.5c0 .83.67 1.5 1.5 1.5H9V9H1Zm9 7h6.5c.83 0 1.5-.67 1.5-1.5v-12c0-.83-.67-1.5-1.5-1.5H10v15ZM2.5 0A2.5 2.5 0 0 0 0 2.5v12A2.5 2.5 0 0 0 2.5 17h14a2.5 2.5 0 0 0 2.5-2.5v-12A2.5 2.5 0 0 0 16.5 0h-14Z"/>',
  ),
  "2-1": icon(
    '<path fill="currentColor" fill-rule="evenodd" d="M1 2.5C1 1.67 1.67 1 2.5 1H9v7H1V2.5ZM1 9v5.5c0 .83.67 1.5 1.5 1.5h14c.83 0 1.5-.67 1.5-1.5V9H1Zm17-1V2.5c0-.83-.67-1.5-1.5-1.5H10v7h8ZM2.5 0A2.5 2.5 0 0 0 0 2.5v12A2.5 2.5 0 0 0 2.5 17h14a2.5 2.5 0 0 0 2.5-2.5v-12A2.5 2.5 0 0 0 16.5 0h-14Z"/>',
  ),
  "1-2": icon(
    '<path fill="currentColor" fill-rule="evenodd" d="M1 2.5C1 1.67 1.67 1 2.5 1h14c.83 0 1.5.67 1.5 1.5V8H1V2.5ZM1 9v5.5c0 .83.67 1.5 1.5 1.5H9V9H1Zm9 7h6.5c.83 0 1.5-.67 1.5-1.5V9h-8v7ZM2.5 0A2.5 2.5 0 0 0 0 2.5v12A2.5 2.5 0 0 0 2.5 17h14a2.5 2.5 0 0 0 2.5-2.5v-12A2.5 2.5 0 0 0 16.5 0h-14Z"/>',
  ),
  "4": icon(
    '<path fill="currentColor" fill-rule="evenodd" d="M1 2.5C1 1.67 1.67 1 2.5 1H9v7H1V2.5ZM1 9v5.5c0 .83.67 1.5 1.5 1.5H9V9H1Zm9 7h6.5c.83 0 1.5-.67 1.5-1.5V9h-8v7Zm8-8V2.5c0-.83-.67-1.5-1.5-1.5H10v7h8ZM2.5 0A2.5 2.5 0 0 0 0 2.5v12A2.5 2.5 0 0 0 2.5 17h14a2.5 2.5 0 0 0 2.5-2.5v-12A2.5 2.5 0 0 0 16.5 0h-14Z"/>',
  ),
  "4v": icon(
    '<path fill="currentColor" fill-rule="evenodd" d="M1 2.5C1 1.67 1.67 1 2.5 1h14c.83 0 1.5.67 1.5 1.5V4H1V2.5ZM1 5v3h17V5H1Zm17 4H1v3h17V9Zm0 4H1v1.5c0 .83.67 1.5 1.5 1.5h14c.83 0 1.5-.67 1.5-1.5V13ZM2.5 0A2.5 2.5 0 0 0 0 2.5v12A2.5 2.5 0 0 0 2.5 17h14a2.5 2.5 0 0 0 2.5-2.5v-12A2.5 2.5 0 0 0 16.5 0h-14Z"/>',
  ),
  "4h": icon(
    '<path fill="currentColor" fill-rule="evenodd" d="M1 2.5C1 1.67 1.67 1 2.5 1H4v15H2.5A1.5 1.5 0 0 1 1 14.5v-12ZM5 16h4V1H5v15Zm5-15v15h4V1h-4Zm5 0v15h1.5c.83 0 1.5-.67 1.5-1.5v-12c0-.83-.67-1.5-1.5-1.5H15ZM2.5 0A2.5 2.5 0 0 0 0 2.5v12A2.5 2.5 0 0 0 2.5 17h14a2.5 2.5 0 0 0 2.5-2.5v-12A2.5 2.5 0 0 0 16.5 0h-14Z"/>',
  ),
  "1-4": icon(
    '<path fill="currentColor" fill-rule="evenodd" d="M1 2.5C1 1.67 1.67 1 2.5 1h14c.83 0 1.5.67 1.5 1.5V8H1V2.5ZM1 9v5.5c0 .83.67 1.5 1.5 1.5H4V9H1Zm4 7h4V9H5v7Zm5 0h4V9h-4v7Zm5 0h1.5c.83 0 1.5-.67 1.5-1.5V9h-3v7ZM2.5 0A2.5 2.5 0 0 0 0 2.5v12A2.5 2.5 0 0 0 2.5 17h14a2.5 2.5 0 0 0 2.5-2.5v-12A2.5 2.5 0 0 0 16.5 0h-14Z"/>',
  ),
  "9s": icon(
    '<path fill="currentColor" fill-rule="evenodd" d="M3.5 1A2.5 2.5 0 0 0 1 3.5v12A2.5 2.5 0 0 0 3.5 18h14a2.5 2.5 0 0 0 2.5-2.5v-12A2.5 2.5 0 0 0 17.5 1h-14ZM7 2H3.5C2.67 2 2 2.67 2 3.5V6h5V2Zm1 0v4h5V2H8Zm0 5h5v5H8V7Zm-1 5V7H2v5h5Zm-5 1h5v4H3.5A1.5 1.5 0 0 1 2 15.5V13Zm6 0h5v4H8v-4Zm6 0v4h3.5c.83 0 1.5-.67 1.5-1.5V13h-5Zm5-1V7h-5v5h5ZM14 2v4h5V3.5c0-.83-.67-1.5-1.5-1.5H14Z"/>',
    21,
    19,
    "0 0 21 19",
  ),
  "16c4": icon(
    '<path fill="currentColor" fill-rule="evenodd" d="M3.5 2C2.67 2 2 2.67 2 3.5v12c0 .83.67 1.5 1.5 1.5H5v-3H2v-1h3v-3H2V9h3V6H2V5h3V2H3.5ZM6 14v3h4v-3H6Zm4-1H6v-3h4v3Zm1 1v3h4v-3h-4Zm4-1h-4v-3h4v3Zm1 1v3h1.5c.83 0 1.5-.67 1.5-1.5V14h-3Zm3-1h-3v-3h3v3Zm-8-4h4V6h-4v3Zm5-3v3h3V6h-3ZM6 9h4V6H6v3Zm0-4h4V2H6v3Zm10 13H3.5A2.5 2.5 0 0 1 1 15.5v-12A2.5 2.5 0 0 1 3.5 1h14A2.5 2.5 0 0 1 20 3.5v12a2.5 2.5 0 0 1-2.5 2.5H16Zm0-13V2h1.5c.83 0 1.5.67 1.5 1.5V5h-3Zm-1-3h-4v3h4V2Z"/>',
    21,
    19,
    "0 0 21 19",
  ),
};

/** @param {string} id */
export function getLayoutIcon(id) {
  if (LAYOUT_ICONS[id]) return LAYOUT_ICONS[id];
  const uniform = parseUniformLayout(id);
  if (uniform) return uniformIcon(uniform.cols, uniform.rows);
  return LAYOUT_ICONS.s;
}

/** @param {string} id @returns {{ cols: number, rows: number } | null} */
function parseUniformLayout(id) {
  const hm = id.match(/^(\d+)h$/);
  if (hm) return { cols: Number(hm[1]), rows: 1 };
  const vm = id.match(/^(\d+)v$/);
  if (vm) return { cols: 1, rows: Number(vm[1]) };
  if (id === "1-4") return { cols: 4, rows: 1 };
  return null;
}

/** @param {number} cols @param {number} rows */
function uniformIcon(cols, rows) {
  const w = 17;
  const h = 15;
  const gap = 1;
  const cellW = (w - gap * (cols - 1)) / cols;
  const cellH = (h - gap * (rows - 1)) / rows;
  let paths = "";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = 1 + c * (cellW + gap);
      const y = 1 + r * (cellH + gap);
      paths += `<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" fill="currentColor" opacity="${0.35 + (0.65 * (c + r)) / (cols + rows)}"/>`;
    }
  }
  paths += FRAME;
  return icon(paths);
}

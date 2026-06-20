import { escTableText } from "./types.js";

/** @param {import("./types.js").ChartTableTone | undefined} tone */
function toneClass(tone, prefix) {
  return tone ? `${prefix}--${tone}` : "";
}

/** @param {import("./types.js").ChartTableCell} cell @param {string} tag */
function renderCell(cell, tag) {
  const style = [];
  if (cell.bg) style.push(`background:${cell.bg}`);
  if (cell.color) style.push(`color:${cell.color}`);
  const styleAttr = style.length ? ` style="${style.join(";")}"` : "";
  const colspan = cell.colspan && cell.colspan > 1 ? ` colspan="${cell.colspan}"` : "";
  const cls = toneClass(cell.tone, "chart-table__cell");
  return `<${tag} class="chart-table__cell${cls ? ` ${cls}` : ""}"${colspan}${styleAttr}>${escTableText(cell.text)}</${tag}>`;
}

/** @param {import("./types.js").ChartTable} table */
export function renderChartTable(table) {
  const columns = Math.max(1, table.columns ?? 2);
  const titleTone = table.titleTone ?? "header";
  const stack = Number.isFinite(table.stackIndex) ? ` style="--chart-table-stack:${table.stackIndex}"` : "";

  const titleRow = table.title
    ? `<tr class="chart-table__row chart-table__row--title">
        <th class="chart-table__cell chart-table__cell--title ${toneClass(titleTone, "chart-table__cell")}" colspan="${columns}">${escTableText(table.title)}</th>
      </tr>`
    : "";

  const bodyRows = (table.rows ?? [])
    .map((row) => {
      const cells = row.cells ?? [];
      const tds = cells
        .map((cell) => renderCell(cell, "td"))
        .join("");
      return `<tr class="chart-table__row">${tds}</tr>`;
    })
    .join("");

  const progress = table.progress?.length
    ? `<div class="chart-table__progress" aria-hidden="true">${table.progress
        .map((state) => `<span class="chart-table__dot chart-table__dot--${state}"></span>`)
        .join("")}</div>`
    : "";

  return `<div class="chart-table" data-chart-table="${escTableText(table.id)}"${stack}>
    <table class="chart-table__grid">
      <tbody>${titleRow}${bodyRows}</tbody>
    </table>
    ${progress}
  </div>`;
}

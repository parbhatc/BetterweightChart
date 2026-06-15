import { CrosshairMode } from "lightweight-charts";

const CURSOR_CLASS_PREFIX = "chart--cursor-";

/** @param {import("lightweight-charts").IChartApi} chart @param {HTMLElement} el @param {string} tool @param {boolean} isCursor @param {import("lightweight-charts").ISeriesApi} [series] */
export function applyCursorMode(chart, el, tool, isCursor, series) {
  el.classList.toggle("chart--draw-mode", !isCursor);
  for (const cls of [...el.classList]) {
    if (cls.startsWith(CURSOR_CLASS_PREFIX)) el.classList.remove(cls);
  }
  if (isCursor) el.classList.add(`${CURSOR_CLASS_PREFIX}${tool}`);

  const hideLines = tool === "eraser" || tool === "arrow";
  const dotCenter = tool === "dot" || tool === "demonstration";

  const mode = hideLines
    ? CrosshairMode.Hidden
    : tool === "magic"
      ? CrosshairMode.Magnet
      : CrosshairMode.Normal;

  chart.applyOptions({
    crosshair: {
      mode,
      vertLine: { visible: !hideLines },
      horzLine: { visible: !hideLines },
    },
  });

  if (series) {
    series.applyOptions({ crosshairMarkerVisible: !dotCenter });
  }
}

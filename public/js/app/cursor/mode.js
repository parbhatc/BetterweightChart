import { CrosshairMode, LineStyle } from "lightweight-charts";
import { applyColorOpacity } from "../../ui/color/picker.js";

const CURSOR_CLASS_PREFIX = "chart--cursor-";
export const TV_DRAW_CROSSHAIR = "#2962FF";
export const REPLAY_SELECT_VERT_WIDTH = 2;

/**
 * @param {object} settingsStore
 * @param {object} themeColors
 */
export function resolveThemeCrosshair(settingsStore, themeColors) {
  const cv = settingsStore.get().canvas ?? {};
  const crosshairStyleMap = {
    0: LineStyle.Solid,
    1: LineStyle.Dotted,
    2: LineStyle.Dashed,
  };
  const color = applyColorOpacity(
    cv.crosshairColor ?? themeColors.crosshair,
    cv.crosshairOpacity ?? 100,
  );
  return {
    color,
    labelBg: themeColors.labelBg ?? color,
    width: Number(cv.crosshairWidth) || 1,
    style: crosshairStyleMap[Number(cv.crosshairStyle)] ?? LineStyle.Dashed,
  };
}

/**
 * @param {import("lightweight-charts").IChartApi} chart
 * @param {HTMLElement} el
 * @param {string} tool
 * @param {boolean} isCursor
 * @param {import("lightweight-charts").ISeriesApi} [series]
 * @param {{ color: string, labelBg: string, width: number, style: number } | null} [themeCrosshair]
 */
export function applyCursorMode(chart, el, tool, isCursor, series, themeCrosshair = null) {
  el.classList.toggle("chart--draw-mode", !isCursor);
  for (const cls of [...el.classList]) {
    if (cls.startsWith(CURSOR_CLASS_PREFIX)) el.classList.remove(cls);
  }
  if (isCursor) el.classList.add(`${CURSOR_CLASS_PREFIX}${tool}`);

  const hideLines = tool === "eraser" || tool === "arrow";
  const dotCenter = tool === "dot" || tool === "demonstration";
  const drawBlue = !isCursor && !hideLines;

  const mode = hideLines
    ? CrosshairMode.Hidden
    : tool === "magic"
      ? CrosshairMode.Magnet
      : CrosshairMode.Normal;

  /** @param {boolean} visible */
  function lineOpts(visible) {
    const opts = { visible, labelVisible: visible };
    if (!visible) return opts;
    if (drawBlue) {
      opts.color = TV_DRAW_CROSSHAIR;
      opts.labelBackgroundColor = TV_DRAW_CROSSHAIR;
      return opts;
    }
    if (themeCrosshair) {
      opts.color = themeCrosshair.color;
      opts.width = themeCrosshair.width;
      opts.style = themeCrosshair.style;
      opts.labelBackgroundColor = themeCrosshair.labelBg;
    }
    return opts;
  }

  chart.applyOptions({
    crosshair: {
      mode,
      vertLine: lineOpts(!hideLines),
      horzLine: lineOpts(!hideLines),
    },
  });

  if (series) {
    series.applyOptions({
      crosshairMarkerVisible: !dotCenter && (isCursor || drawBlue),
      ...(drawBlue
        ? {
            crosshairMarkerBorderColor: TV_DRAW_CROSSHAIR,
            crosshairMarkerBackgroundColor: TV_DRAW_CROSSHAIR,
          }
        : themeCrosshair
          ? {
              crosshairMarkerBorderColor: themeCrosshair.color,
              crosshairMarkerBackgroundColor: themeCrosshair.color,
            }
          : {}),
    });
  }
}

/**
 * Blue vertical crosshair while picking a replay start bar.
 * @param {import("lightweight-charts").IChartApi} chart
 * @param {HTMLElement} el
 * @param {import("lightweight-charts").ISeriesApi} [series]
 */
export function applyReplaySelectCrosshair(chart, el, series) {
  el.classList.add("chart--draw-mode");

  chart.applyOptions({
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: {
        visible: false,
        labelVisible: false,
      },
      horzLine: {
        visible: false,
        labelVisible: false,
      },
    },
  });

  if (series) {
    series.applyOptions({
      crosshairMarkerVisible: false,
    });
  }
}


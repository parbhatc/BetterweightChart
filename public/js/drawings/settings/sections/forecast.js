import { applyColorOpacity } from "../../../ui/color/picker.js";
import {
  FORECAST_STYLE_DEFAULTS,
  forecastDraftFromDrawing,
  isForecastTool,
  supportsForecastStyleSettings,
} from "../../tools/forecast/index.js";
import { syncLineStylePreview } from "../dialog/utils.js";

const FORECAST_COLOR_FIELDS = [
  { key: "forecastSourceTextColor", data: "forecast-source-text-color" },
  { key: "forecastSourceBgColor", data: "forecast-source-bg-color" },
  { key: "forecastSourceBorderColor", data: "forecast-source-border-color" },
  { key: "forecastTargetTextColor", data: "forecast-target-text-color" },
  { key: "forecastTargetBgColor", data: "forecast-target-bg-color" },
  { key: "forecastTargetBorderColor", data: "forecast-target-border-color" },
  { key: "forecastSuccessTextColor", data: "forecast-success-text-color" },
  { key: "forecastSuccessBgColor", data: "forecast-success-bg-color" },
  { key: "forecastFailureTextColor", data: "forecast-failure-text-color" },
  { key: "forecastFailureBgColor", data: "forecast-failure-bg-color" },
];

export { forecastDraftFromDrawing };

/** @param {HTMLElement} root @param {Record<string, unknown>} draft */
export function syncForecastDialogUi(root, draft) {
  const drawingType = String(draft.drawingType ?? "");
  const show = supportsForecastStyleSettings(drawingType);

  root.querySelectorAll("[data-forecast-section]").forEach((el) => {
    if (el instanceof HTMLElement) el.hidden = !show;
  });

  const textTab = root.querySelector('[data-tab="text"]');
  if (textTab instanceof HTMLElement && show) textTab.hidden = true;

  if (!show) return;

  const styleSwatch = root.querySelector("[data-style-swatch]");
  const styleLine = root.querySelector("[data-style-line]");
  const color = draft.color ?? FORECAST_STYLE_DEFAULTS.color;
  const opacity = draft.colorOpacity ?? 100;
  const lineWidth = draft.lineWidth ?? 2;

  if (styleSwatch instanceof HTMLElement) {
    styleSwatch.style.backgroundColor = applyColorOpacity(color, opacity);
  }
  syncLineStylePreview(styleLine, {
    color,
    opacity,
    width: lineWidth,
    style: Number(draft.lineStyle ?? 0),
  });

  for (const field of FORECAST_COLOR_FIELDS) {
    const swatch = root.querySelector(`[data-${field.data}-swatch]`);
    if (swatch instanceof HTMLElement) {
      swatch.style.backgroundColor = String(draft[field.key] ?? FORECAST_STYLE_DEFAULTS[field.key]);
    }
  }
}

/** @param {HTMLElement} root @param {Record<string, unknown>} draft */
export function readForecastDraftFromUi(root, draft) {
  if (!isForecastTool(String(draft.drawingType ?? ""))) return {};
  return forecastDraftFromDrawing(
    /** @type {import("../../types.js").UserDrawing} */ ({ ...draft, type: draft.drawingType }),
  );
}

/**
 * @param {HTMLElement} root
 * @param {{ getDraft: () => Record<string, unknown>, patchDrawing: (patch: Record<string, unknown>) => void, colorPicker: ReturnType<typeof import("../../../ui/color/picker.js").createColorPicker> }} ctx
 */
export function wireForecastSettings(root, ctx) {
  for (const field of FORECAST_COLOR_FIELDS) {
    root.querySelector(`[data-${field.data}]`)?.addEventListener("click", (ev) => {
      const draft = ctx.getDraft();
      if (!isForecastTool(String(draft.drawingType ?? ""))) return;
      const target = ev.currentTarget;
      if (!(target instanceof HTMLElement)) return;
      const current = String(draft[field.key] ?? FORECAST_STYLE_DEFAULTS[field.key]);
      ctx.colorPicker.openSwatch(
        target,
        { color: current, opacity: 100 },
        {
          onChange: (value) => {
            ctx.patchDrawing({ [field.key]: value.color });
            syncForecastDialogUi(root, ctx.getDraft());
          },
        },
      );
    });
  }
}

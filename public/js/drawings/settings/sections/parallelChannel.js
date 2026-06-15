import { applyColorOpacity } from "../../../ui/color/picker.js";
import {
  normalizeChannelLevels,
  supportsParallelChannelSettings,
} from "../../tools/channel/parallel.js";
import { isFibRetracementTool } from "../../tools/fib/retracement.js";
import { CHECK_SVG, setTvCheck } from "../dialog/utils.js";
import { syncChannelBackgroundUi } from "./channelStyle.js";

/** @param {unknown} level @param {string} baseColor @param {number} baseOpacity @param {number} baseWidth */
function linePreviewStyle(level, baseColor, baseOpacity, baseWidth) {
  const lv = /** @type {{ color?: string, colorOpacity?: number, lineWidth?: number, lineStyle?: number }} */ (level);
  const color = lv.color ?? baseColor;
  const opacity = lv.colorOpacity ?? baseOpacity;
  const width = lv.lineWidth ?? baseWidth;
  const style = lv.lineStyle ?? 0;
  if (style === 1) {
    const segments = [0, 1, 2, 3]
      .map(
        (i) =>
          `<span class="tv-pc-level-line-seg" style="width:5px;height:${width}px;background-color:${applyColorOpacity(color, opacity)};margin-left:${i ? 3 : 0}px"></span>`,
      )
      .join("");
    return { color, opacity, width, style, segments };
  }
  return {
    color,
    opacity,
    width,
    style,
    segments: `<span class="tv-pc-level-line-seg" style="width:30px;height:${width}px;background-color:${applyColorOpacity(color, opacity)}"></span>`,
  };
}

/**
 * @param {HTMLElement} root
 * @param {Record<string, unknown>} draft
 */
export function buildParallelLevelsList(root, draft) {
  const pcLevelsList = root.querySelector("[data-pc-levels-list]");
  if (!(pcLevelsList instanceof HTMLElement)) return;
  const levels = normalizeChannelLevels(draft.channelLevels);
  const baseColor = draft.color ?? "#2962FF";
  const baseOpacity = draft.colorOpacity ?? 100;
  const baseWidth = draft.lineWidth ?? 2;
  draft.channelLevels = levels;

  pcLevelsList.innerHTML = levels
    .map((level, i) => {
      const preview = linePreviewStyle(level, baseColor, baseOpacity, baseWidth);
      const disabled = !level.enabled;
      return `<div class="tv-pc-level-row" data-pc-level-row="${i}">
          <button type="button" class="tv-set__check${level.enabled ? " tv-set__check--on" : ""}" data-pc-level-enable="${i}" role="checkbox" aria-checked="${level.enabled ? "true" : "false"}" aria-label="Level ${level.offset}">
            <span class="tv-set__check-box">${level.enabled ? CHECK_SVG : ""}</span>
          </button>
          <input type="text" class="tv-drawing-settings__input tv-pc-level-offset" data-pc-level-offset="${i}" inputmode="decimal" value="${level.offset}" ${disabled ? "disabled" : ""} />
          <button type="button" class="tv-drawing-settings__color-btn tv-drawing-settings__color-btn--compact" data-pc-level-color="${i}" aria-label="Level line style" ${disabled ? "disabled" : ""}>
            <span class="tv-drawing-settings__color-swatch" style="background-color:${applyColorOpacity(preview.color, preview.opacity)}"></span>
            <span class="tv-pc-level-line-preview">${preview.segments}</span>
          </button>
        </div>`;
    })
    .join("");
}

/**
 * @param {HTMLElement} root
 * @param {Record<string, unknown>} draft
 */
export function syncParallelChannelUi(root, draft) {
  const lineSection = root.querySelector("[data-line-section]");
  const parallelChannelSection = root.querySelector("[data-parallel-channel-section]");
  const show = supportsParallelChannelSettings(String(draft.drawingType ?? ""));
  if (lineSection instanceof HTMLElement) lineSection.hidden = show || isFibRetracementTool(String(draft.drawingType ?? ""));
  if (parallelChannelSection instanceof HTMLElement) parallelChannelSection.hidden = !show;
  if (!show) return;
  buildParallelLevelsList(root, draft);
}

/**
 * @param {HTMLElement} root
 * @param {{
 *   getDraft: () => Record<string, unknown>,
 *   patchDrawing: (patch: Record<string, unknown>) => void,
 *   colorPicker: ReturnType<typeof import("../../../ui/color/picker.js").createColorPicker>,
 * }} ctx
 */
export function wireParallelChannelSettings(root, ctx) {
  const { getDraft, patchDrawing, colorPicker } = ctx;
  const pcLevelsList = root.querySelector("[data-pc-levels-list]");
  const pcBackgroundBtn = root.querySelector("[data-pc-background-btn]");
  const pcBackgroundColorBtn = root.querySelector("[data-pc-background-color]");

  pcLevelsList?.addEventListener("click", (ev) => {
    const draft = getDraft();
    const enableBtn = ev.target.closest("[data-pc-level-enable]");
    if (enableBtn instanceof HTMLButtonElement) {
      const i = Number(enableBtn.dataset.pcLevelEnable);
      const levels = normalizeChannelLevels(draft.channelLevels);
      if (!Number.isFinite(i) || !levels[i]) return;
      levels[i] = { ...levels[i], enabled: !levels[i].enabled };
      draft.channelLevels = levels;
      patchDrawing({ channelLevels: levels });
      syncParallelChannelUi(root, draft);
      return;
    }

    const colorBtn = ev.target.closest("[data-pc-level-color]");
    if (colorBtn instanceof HTMLButtonElement && !colorBtn.disabled) {
      const i = Number(colorBtn.dataset.pcLevelColor);
      const levels = normalizeChannelLevels(draft.channelLevels);
      const level = levels[i];
      if (!level) return;
      const baseColor = draft.color ?? "#2962FF";
      const baseOpacity = draft.colorOpacity ?? 100;
      colorPicker.openLine(
        colorBtn,
        {
          color: level.color ?? baseColor,
          width: level.lineWidth ?? draft.lineWidth ?? 2,
          opacity: level.colorOpacity ?? baseOpacity,
          style: level.lineStyle ?? 0,
        },
        {
          showOpacity: true,
          showLineStyle: true,
          onChange: (value) => {
            levels[i] = {
              ...levels[i],
              color: value.color,
              colorOpacity: value.opacity,
              lineWidth: value.width,
              lineStyle: value.style,
            };
            draft.channelLevels = levels;
            patchDrawing({ channelLevels: levels });
            syncParallelChannelUi(root, draft);
          },
        },
      );
    }
  });

  pcLevelsList?.addEventListener("input", (ev) => {
    const draft = getDraft();
    const input = ev.target;
    if (!(input instanceof HTMLInputElement) || !input.dataset.pcLevelOffset) return;
    const i = Number(input.dataset.pcLevelOffset);
    const levels = normalizeChannelLevels(draft.channelLevels);
    const parsed = Number(input.value);
    if (!levels[i] || !Number.isFinite(parsed)) return;
    levels[i] = { ...levels[i], offset: parsed };
    draft.channelLevels = levels;
    patchDrawing({ channelLevels: levels });
  });

  pcBackgroundBtn?.addEventListener("click", () => {
    if (!(pcBackgroundBtn instanceof HTMLButtonElement)) return;
    const next = !pcBackgroundBtn.classList.contains("tv-set__check--on");
    setTvCheck(pcBackgroundBtn, next);
    patchDrawing({ showChannelBackground: next });
    syncChannelBackgroundUi(root, getDraft());
  });

  pcBackgroundColorBtn?.addEventListener("click", (ev) => {
    const draft = getDraft();
    const btn = ev.currentTarget;
    if (!(btn instanceof HTMLElement)) return;
    colorPicker.openSwatch(
      btn,
      {
        color: draft.channelBackgroundColor ?? draft.color ?? "#2962FF",
        opacity: draft.channelBackgroundOpacity ?? 20,
      },
      {
        onChange: (value) => {
          patchDrawing({
            channelBackgroundColor: value.color,
            channelBackgroundOpacity: value.opacity,
          });
          draft.channelBackgroundColor = value.color;
          draft.channelBackgroundOpacity = value.opacity;
          syncChannelBackgroundUi(root, draft);
        },
      },
    );
  });
}

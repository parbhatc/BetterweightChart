import { applyColorOpacity } from "../../../ui/color/picker.js";
import { isChannelBackgroundTool, supportsChannelLineStyleSettings } from "../../tools/channel/family.js";
import { lineEndIconHtml, setTvCheck } from "../dialog/utils.js";

/**
 * @param {HTMLElement} root
 * @param {Record<string, unknown>} draft
 */
export function syncChannelBackgroundUi(root, draft) {
  const pcBackgroundSection = root.querySelector("[data-pc-background-section]");
  const pcBackgroundBtn = root.querySelector("[data-pc-background-btn]");
  const pcBackgroundSwatch = root.querySelector("[data-pc-background-swatch]");
  const show = isChannelBackgroundTool(String(draft.drawingType ?? ""));
  if (pcBackgroundSection instanceof HTMLElement) pcBackgroundSection.hidden = !show;
  if (!show) return;

  setTvCheck(pcBackgroundBtn, Boolean(draft.showChannelBackground));
  const bgColor = draft.channelBackgroundColor ?? draft.color ?? "#2962FF";
  const bgOpacity = draft.channelBackgroundOpacity ?? 20;
  if (pcBackgroundSwatch instanceof HTMLElement) {
    pcBackgroundSwatch.style.backgroundColor = applyColorOpacity(bgColor, bgOpacity);
  }
}

/**
 * @param {HTMLElement} root
 * @param {Record<string, unknown>} draft
 */
export function syncChannelLineStyleUi(root, draft) {
  const channelPricesSection = root.querySelector("[data-channel-prices-section]");
  const lineSection = root.querySelector("[data-line-section]");
  const leftEndBtn = root.querySelector("[data-left-end-btn]");
  const rightEndBtn = root.querySelector("[data-right-end-btn]");
  const leftEndIcon = root.querySelector("[data-left-end-icon]");
  const rightEndIcon = root.querySelector("[data-right-end-icon]");
  const channelPricesBtn = root.querySelector("[data-channel-prices-btn]");
  const channelPricesColorBtn = root.querySelector("[data-channel-prices-color]");
  const channelPricesFontSize = root.querySelector("[data-channel-prices-font-size]");
  const channelPricesSwatch = root.querySelector("[data-channel-prices-swatch]");

  const show = supportsChannelLineStyleSettings(String(draft.drawingType ?? ""));
  if (channelPricesSection instanceof HTMLElement) channelPricesSection.hidden = !show;
  if (!show) return;

  if (lineSection instanceof HTMLElement) lineSection.hidden = false;
  if (leftEndBtn instanceof HTMLElement) leftEndBtn.hidden = false;
  if (rightEndBtn instanceof HTMLElement) rightEndBtn.hidden = false;

  const leftEnd = String(draft.leftEnd ?? "normal");
  const rightEnd = String(draft.rightEnd ?? "normal");
  if (leftEndIcon instanceof HTMLElement) leftEndIcon.innerHTML = lineEndIconHtml(leftEnd, false);
  if (rightEndIcon instanceof HTMLElement) rightEndIcon.innerHTML = lineEndIconHtml(rightEnd, true);

  const pricesOn = Boolean(draft.showPriceLabels);
  setTvCheck(channelPricesBtn, pricesOn);
  if (channelPricesColorBtn instanceof HTMLButtonElement) channelPricesColorBtn.disabled = !pricesOn;
  if (channelPricesFontSize instanceof HTMLSelectElement) {
    channelPricesFontSize.disabled = !pricesOn;
    channelPricesFontSize.value = String(draft.fontSize ?? 12);
  }
  const textColor = draft.textColor ?? draft.color ?? "#ff9800";
  const textOpacity = draft.textColorOpacity ?? draft.colorOpacity ?? 100;
  if (channelPricesSwatch instanceof HTMLElement) {
    channelPricesSwatch.style.backgroundColor = applyColorOpacity(textColor, textOpacity);
  }
}

/**
 * @param {HTMLElement} root
 * @param {{
 *   getDraft: () => Record<string, unknown>,
 *   patchDrawing: (patch: Record<string, unknown>) => void,
 *   colorPicker: ReturnType<typeof import("../../../ui/color/picker.js").createColorPicker>,
 * }} ctx
 */
export function wireChannelStyleSettings(root, ctx) {
  const { getDraft, patchDrawing, colorPicker } = ctx;
  const channelPricesBtn = root.querySelector("[data-channel-prices-btn]");
  const channelPricesColorBtn = root.querySelector("[data-channel-prices-color]");
  const channelPricesFontSize = root.querySelector("[data-channel-prices-font-size]");

  channelPricesBtn?.addEventListener("click", () => {
    if (!(channelPricesBtn instanceof HTMLButtonElement)) return;
    const next = !channelPricesBtn.classList.contains("tv-set__check--on");
    setTvCheck(channelPricesBtn, next);
    patchDrawing({ showPriceLabels: next });
    syncChannelLineStyleUi(root, getDraft());
  });

  channelPricesColorBtn?.addEventListener("click", (ev) => {
    const draft = getDraft();
    const btn = ev.currentTarget;
    if (!(btn instanceof HTMLButtonElement) || btn.disabled) return;
    colorPicker.openSwatch(
      btn,
      {
        color: draft.textColor ?? draft.color ?? "#ff9800",
        opacity: draft.textColorOpacity ?? draft.colorOpacity ?? 100,
      },
      {
        onChange: (value) => {
          patchDrawing({
            textColor: value.color,
            textColorOpacity: value.opacity,
          });
          draft.textColor = value.color;
          draft.textColorOpacity = value.opacity;
          syncChannelLineStyleUi(root, draft);
        },
      },
    );
  });

  channelPricesFontSize?.addEventListener("change", () => {
    if (!(channelPricesFontSize instanceof HTMLSelectElement)) return;
    patchDrawing({ fontSize: Number(channelPricesFontSize.value) || 12 });
  });
}

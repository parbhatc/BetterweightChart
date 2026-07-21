import { setTvCheck } from "../dialog/utils.js";
import {
  isVolumeProfileTool,
  volumeProfileDraftFromDrawing,
} from "../../tools/volumeProfile/index.js";

function ensureMarkup(panel) {
  if (panel.dataset.lastInputsTool === "volume-profile") return;
  panel.dataset.lastInputsTool = "volume-profile";
  panel.innerHTML = `
    <div class="tv-set__section">
      <div class="tv-set__section-body tv-set__section-body--fields">
        <div class="tv-set__field-row">
          <span class="tv-set__field-label">Rows Layout</span>
          <select class="tv-drawing-settings__select" data-vp-rows-layout>
            <option value="number_of_rows">Number Of Rows</option>
            <option value="ticks_per_row">Ticks Per Row</option>
          </select>
        </div>
        <div class="tv-set__field-row">
          <span class="tv-set__field-label">Row Size</span>
          <input class="tv-drawing-settings__input" data-vp-row-size type="text" inputmode="numeric" />
        </div>
        <div class="tv-set__field-row">
          <span class="tv-set__field-label">Volume</span>
          <select class="tv-drawing-settings__select" data-vp-volume-mode>
            <option value="total">Total</option>
            <option value="up_down">Up/Down</option>
            <option value="delta">Delta</option>
          </select>
        </div>
        <div class="tv-set__field-row">
          <span class="tv-set__field-label">Value Area Volume</span>
          <input class="tv-drawing-settings__input" data-vp-value-area type="text" inputmode="decimal" />
        </div>
        <div class="tv-set__check-row">
          <button type="button" class="tv-set__check" data-vp-extend-right role="checkbox" aria-label="Extend Right"><span class="tv-set__check-box"></span></button>
          <span class="tv-set__check-label">Extend Right</span>
        </div>
      </div>
    </div>`;
}

function setValue(panel, selector, value) {
  const el = panel.querySelector(selector);
  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) el.value = String(value ?? "");
}

export function syncVolumeProfileDialogUi(root, draft) {
  const show = isVolumeProfileTool(String(draft.drawingType ?? ""));
  if (!show) {
    if (root.dataset.volumeProfileActive === "1") {
      delete root.dataset.volumeProfileActive;
      root.querySelectorAll("[data-line-section]").forEach((el) => {
        if (el instanceof HTMLElement) el.hidden = false;
      });
    }
    return;
  }
  root.dataset.volumeProfileActive = "1";
  const panel = root.querySelector('[data-panel="inputs"]');
  if (!(panel instanceof HTMLElement)) return;
  ensureMarkup(panel);
  const values = volumeProfileDraftFromDrawing(/** @type {any} */ (draft));
  setValue(panel, "[data-vp-rows-layout]", values.vpRowsLayout);
  setValue(panel, "[data-vp-row-size]", values.vpRowSize);
  setValue(panel, "[data-vp-volume-mode]", values.vpVolumeMode);
  setValue(panel, "[data-vp-value-area]", values.vpValueAreaPercent);
  const extend = panel.querySelector("[data-vp-extend-right]");
  if (extend instanceof HTMLButtonElement) setTvCheck(extend, Boolean(values.vpExtendRight));
  root.querySelectorAll("[data-line-section]").forEach((el) => {
    if (el instanceof HTMLElement) el.hidden = true;
  });
}

export function readVolumeProfileDraftFromUi(root, draft) {
  if (!isVolumeProfileTool(String(draft.drawingType ?? ""))) return {};
  const panel = root.querySelector('[data-panel="inputs"]');
  if (!(panel instanceof HTMLElement)) return {};
  const value = (selector) => panel.querySelector(selector)?.value;
  return {
    vpRowsLayout: value("[data-vp-rows-layout]") === "ticks_per_row" ? "ticks_per_row" : "number_of_rows",
    vpRowSize: Math.max(1, Math.floor(Number(value("[data-vp-row-size]")) || 24)),
    vpVolumeMode: ["total", "up_down", "delta"].includes(value("[data-vp-volume-mode]")) ? value("[data-vp-volume-mode]") : "up_down",
    vpValueAreaPercent: Math.max(0, Math.min(100, Number(value("[data-vp-value-area]")) || 70)),
    vpExtendRight: panel.querySelector("[data-vp-extend-right]")?.classList.contains("tv-set__check--on") ?? false,
  };
}

export function wireVolumeProfileSettings(root, ctx) {
  const panel = root.querySelector('[data-panel="inputs"]');
  if (!(panel instanceof HTMLElement)) return;
  const apply = () => {
    const draft = ctx.getDraft();
    if (!isVolumeProfileTool(String(draft.drawingType ?? ""))) return;
    ctx.patchDrawing(readVolumeProfileDraftFromUi(root, draft));
  };
  panel.addEventListener("change", apply);
  panel.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("[data-vp-extend-right]") : null;
    if (!(button instanceof HTMLButtonElement)) return;
    setTvCheck(button, !button.classList.contains("tv-set__check--on"));
    apply();
  });
}

import { INDICATOR_SETTINGS_KEY } from "../core/constants.js";

export class IndicatorSettingsStorage {
  /**
   * @param {object} els
   * @param {(n: number) => number} clampMax
   * @param {(n: number) => number} clampExtend
   * @param {{ setLeftToolsOpen?: (open: boolean) => void }} [hooks]
   */
  static loadFromStorage(els, clampMax, clampExtend, hooks) {
    try {
      const raw = localStorage.getItem(INDICATOR_SETTINGS_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (!s || typeof s !== "object") return;
      const {
        fvgCheckbox,
        fvgShowCurrent,
        fvgShow15m,
        fvgLabelCurrentInput,
        fvgLabel15mInput,
        fvgHideFilled,
        fvgMaxZonesInput,
        fvgExtendBarsInput,
        fvgExtendStrategySelect,
      } = els;
      if (typeof s.fvgEnable === "boolean" && fvgCheckbox) fvgCheckbox.checked = s.fvgEnable;
      if (typeof s.fvgShowCurrent === "boolean" && fvgShowCurrent) fvgShowCurrent.checked = s.fvgShowCurrent;
      if (typeof s.fvgShow15m === "boolean" && fvgShow15m) fvgShow15m.checked = s.fvgShow15m;
      if (typeof s.fvgLabelCurrent === "string" && fvgLabelCurrentInput) {
        fvgLabelCurrentInput.value = s.fvgLabelCurrent.slice(0, 20);
      }
      if (typeof s.fvgLabel15m === "string" && fvgLabel15mInput) {
        fvgLabel15mInput.value = s.fvgLabel15m.slice(0, 20);
      }
      if (typeof s.fvgHideFilled === "boolean" && fvgHideFilled) fvgHideFilled.checked = s.fvgHideFilled;
      if (fvgMaxZonesInput && Number.isFinite(s.fvgMaxZones)) {
        fvgMaxZonesInput.value = String(clampMax(s.fvgMaxZones));
      }
      if (fvgExtendBarsInput && Number.isFinite(s.fvgExtendBars)) {
        fvgExtendBarsInput.value = String(clampExtend(s.fvgExtendBars));
      }
      if (typeof s.leftToolsOpen === "boolean" && typeof hooks?.setLeftToolsOpen === "function") {
        hooks.setLeftToolsOpen(s.leftToolsOpen);
      }
    } catch {
      //
    }
  }

  /**
   * @param {object} els
   * @param {() => number} readFvgMaxZones
   * @param {() => number} readFvgExtendBars
   * @param {() => boolean} [readLeftToolsOpen]
   */
  static saveToStorage(els, readFvgMaxZones, readFvgExtendBars, readLeftToolsOpen) {
    try {
      const {
        fvgCheckbox,
        fvgShowCurrent,
        fvgShow15m,
        fvgLabelCurrentInput,
        fvgLabel15mInput,
        fvgHideFilled,
      } = els;
      const payload = {
        v: 2,
        fvgEnable: fvgCheckbox.checked,
        fvgShowCurrent: fvgShowCurrent?.checked !== false,
        fvgShow15m: fvgShow15m?.checked === true,
        fvgLabelCurrent: fvgLabelCurrentInput?.value ?? "FVG",
        fvgLabel15m: fvgLabel15mInput?.value ?? "15m",
        fvgHideFilled: fvgHideFilled?.checked !== false,
        fvgMaxZones: readFvgMaxZones(),
        fvgExtendBars: readFvgExtendBars(),
        fvgExtendStrategy: els.fvgExtendStrategySelect?.value === "manual" ? "manual" : "auto",
      };
      if (typeof readLeftToolsOpen === "function") {
        payload.leftToolsOpen = readLeftToolsOpen();
      }
      localStorage.setItem(INDICATOR_SETTINGS_KEY, JSON.stringify(payload));
    } catch {
      //
    }
  }
}

export const loadIndicatorSettingsFromStorage = (...a) => IndicatorSettingsStorage.loadFromStorage(...a);
export const saveIndicatorSettingsToStorage = (...a) => IndicatorSettingsStorage.saveToStorage(...a);

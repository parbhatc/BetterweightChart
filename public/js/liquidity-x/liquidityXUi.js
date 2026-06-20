import { LiquidityXSettingsStore } from "./liquidityXSettings.js";

export class LiquidityXUi {
  static defaultLiquidityXSettings = LiquidityXSettingsStore.defaults;
  static loadLiquidityXSettings = () => new LiquidityXSettingsStore().load();
  static saveLiquidityXSettings = (s) => new LiquidityXSettingsStore().save(s);
}

export const defaultLiquidityXSettings = LiquidityXSettingsStore.defaults;
export { loadLiquidityXSettings, saveLiquidityXSettings } from "./liquidityXSettings.js";

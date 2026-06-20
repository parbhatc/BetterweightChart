import { SetupHistory } from "../registry/setupHistory.js";
import "../registry/index.js";

export class SetupHistoryCache {
  static resetAll() {
    SetupHistory.resetAll();
  }
}

export { reset as resetSetup1HistoryCache, reset as resetSetupHistoryCache } from "../engines/checklistEngine.js";
export { resetHistoryCache as resetSetup2HistoryCache } from "../engines/fvgTapHistory.js";

export const resetAllSetupHistoryCaches = () => SetupHistoryCache.resetAll();

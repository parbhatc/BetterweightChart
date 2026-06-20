/**
 * Side-effect import registers all setups from setups/*.json (see loadSetups.js).
 */
import "./loadSetups.js";

export { SetupRegistry, register, list, get, byKey } from "./setupRegistry.js";
export { registerSetup, panelKeys } from "./registerSetup.js";
export { registerSetupFromJson } from "./setupEngines.js";
export { SetupHistory, resetAll, anyWarm, resolve, counts, countNewAfter, buildAll, toPayload } from "./setupHistory.js";
export { SetupView, esc, history } from "./setupPanel.js";

import { bootChart, registerIndicator } from "/chart/sdk.js";
import FvgIndicator from "./indicators/fvg/FvgIndicator.js";
import LevelsIndicator from "./indicators/levels/LevelsIndicator.js";
import { registerTestingInputPanels } from "./indicators/inputPanels.js";

registerIndicator(FvgIndicator);
registerIndicator(LevelsIndicator);
registerTestingInputPanels();

bootChart()
  .then((widget) => {
    if (typeof window !== "undefined") window.__BWC_WIDGET__ = widget;
  })
  .catch((err) => {
    console.error(err);
    document.getElementById("app-loader")?.classList.add("app-loader--hidden");
  });

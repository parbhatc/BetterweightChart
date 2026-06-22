import { bootChart, registerIndicator, readPageOptions } from "/chart/sdk.js";
import FvgIndicator from "./indicators/fvg/FvgIndicator.js";
import LevelsIndicator from "./indicators/levels/LevelsIndicator.js";
import { registerTestingInputPanels } from "./indicators/inputPanels.js";
import { mountTestingHelpers } from "./mountTestingHelpers.js";

registerIndicator(FvgIndicator);
registerIndicator(LevelsIndicator);
registerTestingInputPanels();

const pageOpts = readPageOptions();

bootChart(pageOpts)
  .then((widget) => {
    if (typeof window !== "undefined") window.__BWC_WIDGET__ = widget;
    mountTestingHelpers(widget);
  })
  .catch((err) => {
    console.error(err);
    document.getElementById("app-loader")?.classList.add("app-loader--hidden");
  });

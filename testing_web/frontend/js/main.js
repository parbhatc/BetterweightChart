import { bootChart, registerIndicator, readPageOptions } from "/chart/sdk.js";
import FvgIndicator from "./indicators/fvg/FvgIndicator.js";
import LevelsIndicator from "./indicators/levels/LevelsIndicator.js";
import { registerTestingInputPanels } from "./indicators/inputPanels.js";
import { mountBarTestDev } from "./barTestDev.js";

registerIndicator(FvgIndicator);
registerIndicator(LevelsIndicator);
registerTestingInputPanels();

const pageOpts = readPageOptions();
const isFakeFeed = pageOpts.datafeedType !== "tradingview" && !pageOpts.tradingview;

bootChart(pageOpts)
  .then((widget) => {
    if (typeof window !== "undefined") window.__BWC_WIDGET__ = widget;
    if (isFakeFeed) mountBarTestDev(widget);
  })
  .catch((err) => {
    console.error(err);
    document.getElementById("app-loader")?.classList.add("app-loader--hidden");
  });

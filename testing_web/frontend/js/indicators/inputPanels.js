import {
  registerCustomInputReader,
  registerCustomInputRenderer,
} from "/js/indicators/ui/customInputPanels.js";
import { registerTestingSettingsHandlers } from "./settingsHandlers.js";
import { renderFvgTimeframesPanel } from "./ui/fvgTimeframesPanel.js";
import { renderFvgExtendBoxesPanel } from "./ui/fvgExtendBoxesPanel.js";
import { renderFvgBoxColorsPanel } from "./ui/fvgBoxColorsPanel.js";
import { renderSessionLevelsPanel, renderTimeLevelsPanel } from "./ui/levelsLayersPanel.js";
import { renderNewsLevelsPanel } from "./ui/newsLevelsPanel.js";
import { readFvgTimeframesFromPanel } from "./ui/fvgTimeframesPanel.js";
import { readFvgExtendBoxesFromPanel } from "./ui/fvgExtendBoxesPanel.js";
import { readFvgBoxColorsFromPanel } from "./ui/fvgBoxColorsPanel.js";
import {
  readSessionLevelsFromPanel,
  readTimeLevelsFromPanel,
} from "./ui/levelsLayersPanel.js";

/** Wire FVG / Levels custom input panels into the public chart settings UI. */
export function registerTestingInputPanels() {
  registerCustomInputRenderer("fvgTimeframes", (input, draftInputs, helpers) =>
    renderFvgTimeframesPanel(input, draftInputs, helpers?.timeframeOptions ?? []),
  );
  registerCustomInputRenderer("fvgExtendBoxes", (input, draftInputs, helpers) =>
    renderFvgExtendBoxesPanel(input, draftInputs, helpers?.timeframeOptions ?? []),
  );
  registerCustomInputRenderer("fvgBoxColors", (input, draftInputs, helpers) =>
    renderFvgBoxColorsPanel(input, draftInputs, helpers?.timeframeOptions ?? []),
  );
  registerCustomInputRenderer("timeLevels", (input, draftInputs, helpers) =>
    renderTimeLevelsPanel(input, draftInputs, helpers?.timeframeOptions ?? []),
  );
  registerCustomInputRenderer("sessionLevels", (input, draftInputs) =>
    renderSessionLevelsPanel(input, draftInputs),
  );
  registerCustomInputRenderer("newsLevels", (input, draftInputs) =>
    renderNewsLevelsPanel(input, draftInputs),
  );

  registerCustomInputReader("fvgTimeframes", readFvgTimeframesFromPanel);
  registerCustomInputReader("fvgExtendBoxes", readFvgExtendBoxesFromPanel);
  registerCustomInputReader("fvgBoxColors", readFvgBoxColorsFromPanel);
  registerCustomInputReader("timeLevels", readTimeLevelsFromPanel);
  registerCustomInputReader("sessionLevels", readSessionLevelsFromPanel);
  registerTestingSettingsHandlers();
}

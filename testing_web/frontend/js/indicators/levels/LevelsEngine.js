import { levelsHtfStyles } from "./htfStyles.js";
import { levelsSessionDefs } from "./sessionDefs.js";
import { buildLevelsEngineConfig, sessionConfigFromRow } from "./config.js";
import {
  buildLevelsEngineOpts,
  debugLevelsEngineResult,
  debugLevelsOverlayStart,
  debugLevelsPriceSanity,
  debugLevelsReplayStep,
  debugLevelsTimeMapping,
  levelsToOverlayLines,
} from "./overlayMap.js";
import { runLevelsEngine } from "./run.js";

export { buildLevelsEngineConfig, sessionConfigFromRow, runLevelsEngine, levelsToOverlayLines };

/** Thin Pine-style facade — logic lives in levels/*.js modules. */
export class LevelsEngine {
  constructor(htfStyles = levelsHtfStyles, sessionDefs = levelsSessionDefs) {
    this.htfStyles = htfStyles;
    this.sessionDefs = sessionDefs;
  }

  run(bars, anchorUnix, opts) {
    return runLevelsEngine(bars, anchorUnix, {
      ...opts,
      htfStyles: opts.htfStyles ?? this.htfStyles.all(),
      sessionDefs: opts.sessionDefs ?? this.sessionDefs.all(),
    });
  }

  toOverlayLines(lines, utcBars, chartBars, style) {
    return levelsToOverlayLines(lines, utcBars, chartBars, style);
  }

  computeOverlay(utcBars, chartBars, inputs, style, ctx = {}, levelsHtf) {
    if (style.graphicLines === false) return [];
    if (!utcBars?.length || utcBars.length !== chartBars?.length) return [];

    const anchorUnix = utcBars.at(-1)?.time;
    if (anchorUnix == null) return [];

    const engineOpts = { ...buildLevelsEngineOpts(inputs, style, ctx, this, levelsHtf), chartBars };
    debugLevelsOverlayStart(ctx, utcBars, chartBars, engineOpts);

    const { lines, htfState } = this.run(utcBars, anchorUnix, engineOpts);
    debugLevelsEngineResult(utcBars, anchorUnix, engineOpts, lines, htfState);
    debugLevelsReplayStep(anchorUnix, lines, htfState);

    const overlay = this.toOverlayLines(lines, utcBars, chartBars, style);
    debugLevelsTimeMapping(lines, overlay, utcBars, chartBars);
    debugLevelsPriceSanity(overlay, chartBars);
    return overlay;
  }
}

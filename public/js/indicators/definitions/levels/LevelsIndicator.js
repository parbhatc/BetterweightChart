import {
  DEFAULT_SESSION_LEVELS,
  DEFAULT_TIME_LEVELS,
  resolveSessionLevels,
  resolveTimeLevels,
} from "../../ui/levelsLayersPanel.js";
import { DEFAULT_NEWS_LEVELS } from "../../ui/newsLevelsPanel.js";
import { resolveNewsLevels } from "../../../news/events.js";
import { LevelsEngine } from "./LevelsEngine.js";
import { BarScriptIndicator } from "../../BarScriptIndicator.js";
import {
  createBool,
  createColor,
  createField,
  createInt,
} from "../../builders.js";
import { levelsHtf } from "./htf.js";
import { htfSeriesRecomputeKey } from "../../security/htfPolicy.js";

class LevelsIndicator extends BarScriptIndicator {

  constructor() {
    super("levels", "Levels", "Levels");
    this.setOverlayPrimitive("lines");
    this.setGraphicObjects([
      { styleKey: "graphicLines", label: "Lines", overlay: "lines" },
      { styleKey: "graphicLabels", label: "Labels" },
    ]);
    this.setInputs([
      createField("timeLevels", "timeLevels", DEFAULT_TIME_LEVELS, {
        title: "Time levels",
        section: "Time levels",
      }),
      createField("sessionLevels", "sessionLevels", DEFAULT_SESSION_LEVELS, {
        title: "Sessions",
        section: "Sessions",
      }),
      createBool("newsEnabled", "News", true, { section: "News" }),
      createField("newsLevels", "newsLevels", DEFAULT_NEWS_LEVELS, {
        title: "Event types",
        section: "News",
      }),
      createInt("pivotLeftBars", "Pivot left bars", 1, { min: 1, section: "Pivot", inline: true }),
      createInt("pivotRightBars", "Pivot right bars", 1, { min: 1, section: "Pivot", inline: true }),
      createInt("maxBarsBack", "Max bars back to find levels (HTF bars per layer)", 300, {
        min: 10,
        section: "Display limits",
      }),
      createInt("maxUnswept", "Max unswept levels", 15, {
        min: 1,
        section: "Display limits",
        inline: true,
      }),
      createInt("maxSwept", "Max swept levels", 5, {
        min: 0,
        section: "Display limits",
        inline: true,
      }),
      createInt("maxSessions", "Max session instances", 3, { min: 1, section: "Display limits" }),
      createBool("mergeConfluence", "Merge confluence levels", true, { section: "Confluence" }),
      createColor("confHiColor", "Confluence high", { color: "#9400d3", opacity: 100 }, {
        section: "Confluence",
        inline: true,
      }),
      createColor("confLoColor", "Confluence low", { color: "#ffaa00", opacity: 100 }, {
        section: "Confluence",
        inline: true,
        disabled: (inputs) => inputs.mergeConfluence === false,
      }),
    ]);
  }

  mergeStyleDefaults(style) {
    return {
      ...style,
      graphicLines: style.graphicLines ?? true,
      graphicLabels: style.graphicLabels ?? true,
    };
  }

  requiredChartBars(inputs, chartResolution) {
    return levelsHtf.requiredChartBars(inputs, chartResolution);
  }

  /** @param {import("../../types.js").IndicatorInstance} instance @param {{ symbol?: string, resolution?: string, bars?: object[] }} pane */
  collectDataNeeds(instance, pane) {
    const inputs = instance.inputs;
    const htfPad = levelsHtf.requiredHtfBars(inputs) + 20;
    /** @type {import("../../security/indicatorDataNeeds.js").IndicatorDataNeeds} */
    const needs = { htf: [] };
    for (const { tfId } of levelsHtf.enabledResolutions(inputs, pane.resolution ?? "1")) {
      needs.htf.push({ symbol: pane.symbol ?? "", resolution: tfId, countBack: htfPad });
    }
    return needs;
  }

  /** @param {import("../../types.js").IndicatorInstance} instance @param {object} ctx */
  overlayPending(instance, ctx) {
    return levelsHtf.htfPending(instance.inputs, ctx);
  }

  legendParams(instance) {
    const enabled = [
      ...resolveTimeLevels(instance.inputs).filter((r) => r.enabled),
      ...resolveSessionLevels(instance.inputs).filter((r) => r.enabled),
    ];
    if (instance.inputs.newsEnabled !== false) {
      enabled.push(...resolveNewsLevels(instance.inputs).filter((r) => r.enabled !== false));
    }
    if (!enabled.length) return [];
    return [enabled.map((r) => r.label).join(", ")];
  }

  /** @param {object} instance @param {object} ctx */
  overlayRecomputeExtra(instance, ctx) {
    const time = JSON.stringify(resolveTimeLevels(instance.inputs));
    const sessions = JSON.stringify(resolveSessionLevels(instance.inputs));
    const newsRows = instance.inputs.newsEnabled !== false ? resolveNewsLevels(instance.inputs) : [];
    const news = instance.inputs.newsEnabled !== false ? JSON.stringify(newsRows) : "";
    const newsSource = ctx.newsOpts?.source ?? "forexfactory";
    const newsKey = Object.keys(ctx.getNewsByDay?.() ?? {})
      .sort()
      .join(",");
    const symbol = ctx.primarySymbol ?? ctx.symbol;
    const htfKey = htfSeriesRecomputeKey(
      ctx,
      symbol,
      levelsHtf.enabledResolutions(instance.inputs, ctx.chartResolution ?? "1").map(({ tfId }) => tfId),
    );
    return `${time}|${sessions}|${news}|${newsSource}|${newsKey}|${htfKey}|${instance.inputs.maxBarsBack}|${instance.inputs.pivotLeftBars}|${instance.inputs.pivotRightBars}|${instance.inputs.maxUnswept}|${instance.inputs.maxSwept}|${instance.inputs.mergeConfluence}|${instance.inputs.confHiColor}|${instance.inputs.confLoColor}|${instance.style.graphicLabels}`;
  }

  /**
   * @param {object[]} utcBars
   * @param {object[]} chartBars
   * @param {object} inputs
   * @param {object} style
   * @param {object} [ctx]
   */
  overlay(utcBars, chartBars, inputs, style, ctx = {}) {
    return new LevelsEngine().computeOverlay(utcBars, chartBars, inputs, style, ctx, levelsHtf);
  }
}

BarScriptIndicator.define(LevelsIndicator);

export default LevelsIndicator;

export { LevelsHtf, levelsHtf } from "./htf.js";
export { LevelsEngine } from "./LevelsEngine.js";
export { LevelsSessionDefs, levelsSessionDefs } from "./sessionDefs.js";
export { LevelsHtfStyles, levelsHtfStyles } from "./htfStyles.js";

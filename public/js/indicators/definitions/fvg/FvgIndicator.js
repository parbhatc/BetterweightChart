import { BarScriptIndicator } from "../../BarScriptIndicator.js";
import { symbolTicker } from "../../../app/symbol/ticker.js";
import { resolveFvgTimeframeRows } from "../../ui/fvgTimeframesPanel.js";
import { compareSymbol } from "../../security/compareSymbol.js";
import { compareBarsRecomputeKey } from "../../security/compareBars.js";
import { FvgEngine } from "./FvgEngine.js";
import { fvgHtf } from "./htf.js";
import { buildInputs } from "./inputs.js";

class FvgIndicator extends BarScriptIndicator {

  constructor() {
    super("fvg", "FVG", "FVG");
    this.setOverlayPrimitive("boxes");
    this.setGraphicObjects([
      { styleKey: "graphicBoxes", label: "Boxes", overlay: "boxes" },
      { styleKey: "graphicLabels", label: "Labels", overlay: "labels" },
    ]);
    this.setInputs(buildInputs());
  }

  mergeStyleDefaults(style) {
    const boxesVisible =
      style.graphicBoxes !== false &&
      style.graphicForming !== false &&
      style.graphicIfvg !== false;
    return {
      ...style,
      graphicBoxes: style.graphicBoxes ?? boxesVisible,
      graphicLabels: style.graphicLabels ?? true,
    };
  }

  /** @param {object} [inputs] @param {string} [chartResolution] */
  inputSchema(inputs = {}, chartResolution = "1") {
    const options = fvgHtf.correlatedTfOptions(inputs, chartResolution);
    return buildInputs().map((item) =>
      item.id === "correlatedFvgTf" ? { ...item, options } : item,
    );
  }

  requiredChartBars(inputs, chartResolution) {
    return fvgHtf.requiredChartBars(inputs, chartResolution);
  }

  /** @param {import("../../types.js").IndicatorInstance} instance @param {{ symbol?: string, resolution?: string, bars?: object[] }} pane */
  collectDataNeeds(instance, pane) {
    const inputs = instance.inputs;
    const chartCount = Math.max(pane.bars?.length ?? 300, 300);
    const htfPad = fvgHtf.requiredHtfBars(inputs) + 20;
    /** @type {import("../../security/indicatorDataNeeds.js").IndicatorDataNeeds} */
    const needs = { htf: [], compare: [] };
    for (const { tfId } of fvgHtf.enabledResolutions(inputs, pane.resolution ?? "1")) {
      needs.htf.push({ symbol: pane.symbol ?? "", resolution: tfId, countBack: htfPad });
    }
    if (fvgHtf.requiresCorrelatedCompare(inputs)) {
      const sym = compareSymbol.resolve(inputs, pane.symbol ?? "");
      /** @type {import("../../security/indicatorDataNeeds.js").CompareNeed} */
      const compare = { symbol: sym, chartCountBack: chartCount, htf: [] };
      for (const { tfId } of fvgHtf.enabledResolutions(inputs, pane.resolution ?? "1")) {
        compare.htf.push({ resolution: tfId, countBack: htfPad });
      }
      needs.compare.push(compare);
    }
    return needs;
  }

  legendParams(instance, ctx = {}) {
    const inputs = instance.inputs;
    /** @type {string[]} */
    const params = [];
    const enabled = resolveFvgTimeframeRows(inputs).filter((r) => r.enabled);
    if (enabled.length) params.push(enabled.map((r) => r.label).join(", "));
    if (inputs.requireCorrelatedFvg === true) {
      params.push(symbolTicker(compareSymbol.resolve(inputs, ctx.primarySymbol ?? "")));
      const tf = inputs.correlatedFvgTf ?? "all";
      if (tf !== "all") {
        const opt = fvgHtf.correlatedTfOptions(inputs, ctx.chartResolution ?? "1").find((o) => o.id === tf);
        if (opt?.label) params.push(opt.label);
      }
    }
    return params;
  }

  /** @param {object} instance @param {object} ctx */
  overlayRecomputeExtra(instance, ctx) {
    const b = ctx.formingBar;
    const ohlc = b ? `${b.open}|${b.high}|${b.low}|${b.close}` : "";
    let extra = ohlc;
    if (instance.inputs.sizeFilterOn === true) {
      extra += `|sf:${instance.inputs.sizeFilterUnit}|${instance.inputs.sizeFilterMin}|${instance.inputs.sizeFilterMax}|${JSON.stringify(instance.inputs.sizeFilterRules ?? [])}`;
    }
    extra += `|lbl:${instance.inputs.showLabels}|${instance.style?.graphicLabels}|${instance.inputs.showSizeOnLabel}|${instance.inputs.showFvgNameOnLabel}|${instance.inputs.sizeLabelFormat}`;
    if (instance.inputs.requireCorrelatedFvg !== true) return extra;
    const corrTf = instance.inputs.correlatedFvgTf ?? "all";
    return `${extra}|${compareBarsRecomputeKey(ctx, instance.inputs, { ohlc: true })}|${corrTf}`;
  }

  init() {
    this.state.engine = new FvgEngine(this);
    this.state.engine.init();
  }

  onBar() {
    this.state.engine?.onBar();
  }
}

BarScriptIndicator.define(FvgIndicator);

export default FvgIndicator;

export { fvgHtf } from "./htf.js";

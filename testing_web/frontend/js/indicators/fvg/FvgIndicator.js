import { BarScriptIndicator } from "/js/indicators/BarScriptIndicator.js";
import { symbolTicker } from "/js/app/symbol/ticker.js";
import { resolveFvgTimeframeRows } from "../ui/fvgTimeframesPanel.js";
import { compareSymbol } from "/js/indicators/security/compareSymbol.js";
import { compareBarsRecomputeKey } from "/js/indicators/security/compareBars.js";
import { overlayRecomputeKey } from "/js/indicators/overlayCache.js";
import { createBarScriptContext } from "/js/indicators/pineRuntime.js";
import { getSecuritySeries } from "/js/indicators/security/htfAccess.js";
import { FvgEngine } from "./FvgEngine.js";
import { fvgHtf } from "./htf.js";
import { buildInputs } from "./inputs.js";

/** @param {import("../../types.js").IndicatorInstance} instance @param {object} ctx */
function htfRecomputeKey(instance, ctx) {
  /** @type {string[]} */
  const parts = [];
  for (const { tfId } of fvgHtf.enabledResolutions(instance.inputs, ctx.chartResolution ?? "1")) {
    const htf = getSecuritySeries(ctx, undefined, tfId);
    const bars = htf?.utcBars ?? [];
    parts.push(`${tfId}:${bars[0]?.time ?? ""}|${bars.at(-1)?.time ?? ""}|${bars.length}`);
  }
  return parts.join(";");
}

/** Live-tick key — only fields that can change boxes on the forming bar (not every close tick). */
function formingLiveKey(instance, ctx) {
  const b = ctx.formingBar;
  if (!b) return "";
  const inputs = instance.inputs;
  const parts = [`t:${b.time}`];
  const boxesVisible = instance.style?.graphicBoxes !== false;
  if (inputs.showLiveForming !== false && inputs.showFvg !== false && boxesVisible) {
    parts.push(`hl:${b.high}|${b.low}`);
  }
  const fillType = inputs.filledType === "wick" ? "wick" : "close";
  const liveFill = inputs.deleteOnFill !== false || inputs.showPartial === true;
  if (liveFill) {
    parts.push(fillType === "wick" ? `wick:${b.high}|${b.low}` : `cls:${b.close}`);
  }
  if (inputs.requireCorrelatedFvg === true) {
    parts.push(compareBarsRecomputeKey(ctx, inputs, { ohlc: true }));
  }
  return parts.join("|");
}

/** @param {object[]} chartBars @param {object | undefined} rt */
function isAppendOneBar(chartBars, rt) {
  if (!rt?.snapshot?.barLen || rt.barHead == null) return false;
  const len = chartBars.length;
  if (len !== rt.snapshot.barLen + 1) return false;
  if (chartBars[0]?.time !== rt.barHead) return false;
  return chartBars[len - 2]?.time === rt.barTail;
}

/** Chart head changed but tail unchanged — history was prepended (incremental paths are invalid). */
function isPrependHistory(chartBars, rt) {
  if (!rt?.barHead || !chartBars.length) return false;
  if (chartBars[0].time === rt.barHead) return false;
  return chartBars.at(-1)?.time === rt.barTail && chartBars.length > (rt.barLen ?? 0);
}

/** @param {object[]} chartBars */
function barMeta(chartBars) {
  return {
    barLen: chartBars.length,
    barHead: chartBars[0]?.time ?? "",
    barTail: chartBars.at(-1)?.time ?? "",
  };
}

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
    let extra = "";
    if (instance.inputs.sizeFilterOn === true) {
      extra += `|sf:${instance.inputs.sizeFilterUnit}|${instance.inputs.sizeFilterMin}|${instance.inputs.sizeFilterMax}|${JSON.stringify(instance.inputs.sizeFilterRules ?? [])}`;
    }
    extra += `|lbl:${instance.inputs.showLabels}|${instance.style?.graphicLabels}|${instance.inputs.showSizeOnLabel}|${instance.inputs.showFvgNameOnLabel}|${instance.inputs.sizeLabelFormat}`;
    if (instance.inputs.requireCorrelatedFvg !== true) return extra;
    const corrTf = instance.inputs.correlatedFvgTf ?? "all";
    return `${extra}|${compareBarsRecomputeKey(ctx, instance.inputs)}|${corrTf}`;
  }

  /**
   * @param {object[]} utcBars
   * @param {object[]} chartBars
   * @param {import("../../types.js").IndicatorInstance} instance
   * @param {object} [ctx]
   */
  static computeOverlay(utcBars, chartBars, instance, ctx = {}) {
    const baseKey = overlayRecomputeKey(instance, chartBars, FvgIndicator);
    const extra = FvgIndicator.prototype.overlayRecomputeExtra(instance, ctx);
    const chartKey = `${baseKey}|${extra}`;
    const htfKey = htfRecomputeKey(instance, ctx);
    const fullKey = `${chartKey}|htf:${htfKey}`;
    const liveKey = formingLiveKey(instance, ctx);
    const meta = barMeta(chartBars);

    let rt = instance._fvgRuntime;
    if (isPrependHistory(chartBars, rt)) {
      delete instance._fvgRuntime;
      rt = null;
    }

    if (rt?.fullKey === fullKey && rt.liveKey === liveKey && Array.isArray(rt.boxes)) {
      return rt.boxes;
    }

    if (
      rt?.snapshot &&
      rt.chartKey === chartKey &&
      rt.htfKey !== htfKey
    ) {
      const patched = FvgIndicator.patchHtfOverlay(utcBars, chartBars, instance, ctx, rt.snapshot, rt.boxes);
      if (patched) {
        instance._fvgRuntime = {
          fullKey,
          chartKey,
          htfKey,
          liveKey,
          snapshot: patched.snapshot,
          boxes: patched.boxes,
          ...meta,
        };
        return patched.boxes;
      }
    }

    if (
      rt?.snapshot &&
      isAppendOneBar(chartBars, rt)
    ) {
      const patched = FvgIndicator.patchAppendOverlay(utcBars, chartBars, instance, ctx, rt.snapshot, rt.boxes);
      if (patched) {
        instance._fvgRuntime = {
          fullKey,
          chartKey,
          htfKey,
          liveKey,
          snapshot: patched.snapshot,
          boxes: patched.boxes,
          ...meta,
        };
        return patched.boxes;
      }
    }

    if (
      rt?.chartKey === chartKey &&
      rt.snapshot &&
      rt.liveKey !== liveKey
    ) {
      const patched = FvgIndicator.patchLiveOverlay(utcBars, chartBars, instance, ctx, rt.snapshot, rt.boxes);
      if (patched) {
        instance._fvgRuntime = {
          fullKey,
          chartKey,
          htfKey,
          liveKey,
          snapshot: patched.snapshot,
          boxes: patched.boxes,
          ...meta,
        };
        return patched.boxes;
      }
    }

    const boxes = super.computeOverlay(utcBars, chartBars, instance, ctx);
    const snapshot = instance._fvgSnapshot ?? null;
    delete instance._fvgSnapshot;
    instance._fvgRuntime = { fullKey, chartKey, htfKey, liveKey, snapshot, boxes, ...meta };
    return boxes;
  }

  /**
   * @param {object[]} utcBars
   * @param {object[]} chartBars
   * @param {import("../../types.js").IndicatorInstance} instance
   * @param {object} ctx
   * @param {object} snapshot
   * @param {object[]} [previousBoxes]
   */
  static patchLiveOverlay(utcBars, chartBars, instance, ctx, snapshot, previousBoxes = []) {
    const { ctx: script } = createBarScriptContext({
      utcBars,
      chartBars,
      inputs: instance.inputs,
      style: instance.style,
      plotIds: ["fvg"],
      symbolInfo: ctx.symbolInfo ?? null,
      overlayCtx: ctx,
      instance,
    });
    const engine = new FvgEngine(script);
    return engine.runLiveTick(snapshot, previousBoxes);
  }

  static patchAppendOverlay(utcBars, chartBars, instance, ctx, snapshot, previousBoxes = []) {
    const { ctx: script } = createBarScriptContext({
      utcBars,
      chartBars,
      inputs: instance.inputs,
      style: instance.style,
      plotIds: ["fvg"],
      symbolInfo: ctx.symbolInfo ?? null,
      overlayCtx: ctx,
      instance,
    });
    const engine = new FvgEngine(script);
    return engine.runAppendBar(snapshot, previousBoxes);
  }

  static patchHtfOverlay(utcBars, chartBars, instance, ctx, snapshot, previousBoxes = []) {
    const { ctx: script } = createBarScriptContext({
      utcBars,
      chartBars,
      inputs: instance.inputs,
      style: instance.style,
      plotIds: ["fvg"],
      symbolInfo: ctx.symbolInfo ?? null,
      overlayCtx: ctx,
      instance,
    });
    const engine = new FvgEngine(script);
    return engine.runHtfRefresh(snapshot, previousBoxes);
  }

  /** @param {import("../../types.js").IndicatorInstance} instance @param {object} ctx */
  static shouldRefreshOverlayOnCacheHit(instance, ctx) {
    const liveKey = formingLiveKey(instance, ctx);
    const rt = instance._fvgRuntime;
    if (!rt?.snapshot) return false;
    return rt.liveKey !== liveKey;
  }

  /** @param {import("../../types.js").IndicatorInstance} instance */
  needsLiveOverlayRefresh(instance) {
    const inputs = instance.inputs;
    const style = instance.style ?? {};
    if (style.graphicBoxes === false) return false;
    const liveForming = inputs.showLiveForming !== false && inputs.showFvg !== false;
    const liveFill = inputs.deleteOnFill !== false || inputs.showPartial === true;
    if (liveForming || liveFill) return true;
    return inputs.requireCorrelatedFvg === true;
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

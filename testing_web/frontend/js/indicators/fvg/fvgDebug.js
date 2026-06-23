import {
  chartDebug,
  chartDebugThrottle,
  isChartDebugEnabled,
} from "/js/debug/chart/index.js";

/** @param {unknown} sec */
function fmtUnix(sec) {
  if (sec == null || !Number.isFinite(Number(sec))) return String(sec);
  try {
    return `${Number(sec)} (${new Date(Number(sec) * 1000).toISOString()})`;
  } catch {
    return String(sec);
  }
}

/** @param {object} zone @param {object[]} [series] */
function zoneSummary(zone, series) {
  const confirmBar = series?.[zone.confirmIndex];
  const confirmTime = confirmBar?.confirmChartTime ?? confirmBar?.chartTime ?? zone.startTime;
  return {
    kind: zone.kind,
    top: zone.top,
    bottom: zone.bottom,
    size: zone.top != null && zone.bottom != null ? Math.abs(zone.top - zone.bottom) : null,
    startChart: fmtUnix(zone.startTime),
    confirmChart: fmtUnix(confirmTime),
    forming: Boolean(zone.forming),
    partial: Boolean(zone.partial),
    filled: Boolean(zone.filled),
    invertTime: zone.invertTime != null ? fmtUnix(zone.invertTime) : null,
  };
}

/**
 * @param {string} reason
 * @param {unknown} [detail]
 */
export function debugFvgInitSkip(reason, detail) {
  if (!isChartDebugEnabled()) return;
  chartDebug("fvg", `init skip: ${reason}`, detail);
}

/**
 * @param {string} reason
 * @param {unknown} [detail]
 */
export function debugFvgInitPending(reason, detail) {
  if (!isChartDebugEnabled()) return;
  chartDebugThrottle("fvg", `pending:${reason}`, `init pending: ${reason}`, detail, 1500);
}

/**
 * @param {object} script
 * @param {{ tfSec: number, tfId: string, label: string }[]} layers
 * @param {object} cfg
 */
export function debugFvgInitOk(script, layers, cfg) {
  if (!isChartDebugEnabled()) return;

  const ctx = script.overlayCtx ?? {};
  /** @type {Record<string, { seriesBars: number, active: number, ifvg: number, htf: boolean }>} */
  const layerSummary = {};
  for (const entry of script.state.chartLayers ?? []) {
    layerSummary[entry.layer.label] = {
      seriesBars: entry.series?.length ?? 0,
      active: script.state.layerActive.get(entry.layer.label)?.length ?? 0,
      ifvg: script.state.layerIfvg.get(entry.layer.label)?.length ?? 0,
      htf: false,
    };
  }
  for (const entry of script.state.htfLayers ?? []) {
    layerSummary[entry.layer.label] = {
      seriesBars: entry.series?.length ?? 0,
      active: script.state.layerActive.get(entry.layer.label)?.length ?? 0,
      ifvg: script.state.layerIfvg.get(entry.layer.label)?.length ?? 0,
      htf: true,
    };
  }

  chartDebugThrottle(
    "fvg",
    "init-ok",
    "init ok",
    {
      chartResolution: ctx.chartResolution ?? null,
      chartSec: cfg.chartSec,
      bars: script.bars?.length ?? 0,
      layers: layers.map((l) => ({ label: l.label, tfId: l.tfId, tfSec: l.tfSec })),
      requireCorrelatedFvg: cfg.requireCorrelatedFvg,
      correlatedFvgTf: cfg.correlatedFvgTf,
      compareSymbol: script.state.compareSymbol ?? null,
      maxFvgZones: cfg.maxFvgZones,
      maxIfvgZones: cfg.maxIfvgZones,
      showFvg: cfg.showFvg,
      showIfvg: cfg.showIfvg,
      showLiveForming: cfg.showLiveForming,
      layerSummary,
    },
    2000,
  );
}

/**
 * @param {{ label: string, tfId: string }} layer
 * @param {object} zone
 * @param {object[]} series
 * @param {number} barIdx
 * @param {"new"|"ifvg"|"filled"|"deleted"} event
 */
export function debugFvgZoneEvent(layer, zone, series, barIdx, event) {
  if (!isChartDebugEnabled()) return;
  const key = `${layer.label}:${event}:${zone.kind}:${zone.startTime}`;
  chartDebugThrottle(
    "fvg",
    key,
    `${event} ${zone.kind} FVG @ ${layer.label}`,
    {
      layer: layer.label,
      tfId: layer.tfId,
      barIdx,
      event,
      zone: zoneSummary(zone, series),
    },
    event === "new" ? 800 : 1200,
  );
}

/**
 * @param {object} opts
 * @param {number} opts.candidateFvg
 * @param {number} opts.candidateIfvg
 * @param {number} opts.drawnFvg
 * @param {number} opts.drawnIfvg
 * @param {object} opts.filtered
 * @param {object[]} opts.fvgZones
 * @param {object[]} opts.ifvgZones
 * @param {object} opts.cfg
 */
export function debugFvgEmitResult(opts) {
  if (!isChartDebugEnabled() || opts.silent) return;

  const mapDrawn = (items, isIfvg) =>
    items.map((item) => ({
      layer: item.layer.label,
      tfId: item.layer.tfId,
      isIfvg,
      label: isIfvg ? opts.cfg.ifvgLabel : item.layer.label,
      zone: zoneSummary(item.zone, item.series),
    }));

  chartDebugThrottle(
    "fvg",
    "emit",
    "draw pass",
    {
      candidates: { fvg: opts.candidateFvg, ifvg: opts.candidateIfvg },
      drawn: { fvg: opts.drawnFvg, ifvg: opts.drawnIfvg },
      filtered: opts.filtered,
      maxFvgZones: opts.cfg.maxFvgZones,
      maxIfvgZones: opts.cfg.maxIfvgZones,
      fvg: mapDrawn(opts.fvgZones, false),
      ifvg: mapDrawn(opts.ifvgZones, true),
    },
    2000,
  );
}

/**
 * @param {{ label: string }} layer
 * @param {object} zone
 * @param {object[]} series
 * @param {string} label
 * @param {boolean} showLabel
 */
export function debugFvgDrawBox(layer, zone, series, label, showLabel, silent = false) {
  if (!isChartDebugEnabled() || silent) return;
  const key = `draw:${layer.label}:${zone.kind}:${zone.startTime}:${Boolean(zone.forming)}:${Boolean(zone.partial)}`;
  chartDebugThrottle(
    "fvg",
    key,
    `draw box ${layer.label}`,
    {
      layer: layer.label,
      label,
      showLabel,
      zone: zoneSummary(zone, series),
    },
    1500,
  );
}

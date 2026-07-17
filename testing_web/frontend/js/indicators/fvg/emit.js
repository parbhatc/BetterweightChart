import { buildFvgBoxLabel, fvgZonePassesSizeFilter } from "../ui/symbolSizeRulesPanel.js";
import { resolveLayerExtend } from "../ui/fvgExtendBoxesPanel.js";
import { resolveLayerBoxFills } from "../ui/fvgBoxColorsPanel.js";
import { barChartTime, fvgAtBar, takeRecentZones, zoneConfirmTime, zoneFromFvgHit, zoneInvertTime } from "./detect.js";
import { formingSeriesForLayer } from "./layers.js";
import { passesCorrelatedFilter } from "./zones.js";
import { debugFvgDrawBox, debugFvgEmitResult } from "./fvgDebug.js";

const LABEL_DISTANCE_BARS = 10;

/** @param {object} script @param {{ tfSec: number, tfId: string, label: string }} layer @param {object[]} series @param {object} zone @param {{ isIfvg?: boolean, layerLabel?: string, silent?: boolean }} opts */
export function emitZoneBox(script, layer, series, zone, opts = {}) {
  const cfg = script.state.cfg;
  const isIfvg = opts.isIfvg === true;
  const silent = opts.silent === true;
  if (isIfvg && !cfg.showIfvg) return;
  if (!isIfvg && zone.forming && !cfg.showLiveForming) return;
  if (!isIfvg && !zone.forming && !cfg.showFvg) return;

  const confirmBar = series[zone.confirmIndex];
  const confirmTime = barChartTime(script, confirmBar, zone.confirmIndex) ?? zone.startTime;
  const invertTime = isIfvg ? zoneInvertTime(zone, series) : confirmTime;
  const anchorTime = isIfvg ? invertTime : confirmTime;
  const startTime = zone.startTime;
  const boxLenSec = cfg.boxLen * cfg.chartSec;
  let endTime = anchorTime + boxLenSec;
  let extendRight = false;

  if (resolveLayerExtend(layer, script.inputs)) {
    if (!isIfvg && zone.filled && zone.fillIndex != null) {
      endTime = barChartTime(script, series[zone.fillIndex], zone.fillIndex) ?? cfg.lastChartTime;
    } else {
      endTime = anchorTime;
      extendRight = true;
    }
  } else {
    endTime = anchorTime + boxLenSec;
    if (!isIfvg && zone.filled && zone.fillIndex != null) {
      const fillTime = barChartTime(script, series[zone.fillIndex], zone.fillIndex);
      if (fillTime != null) endTime = Math.min(endTime, fillTime);
    }
  }

  const isBull = zone.kind === "bull";
  let fillColor;
  let borderColor;
  let borderWidth;
  let label;
  let textColor;

  if (isIfvg) {
    fillColor = cfg.ifvgColor;
    borderColor = cfg.ifvgColor;
    borderWidth = cfg.ifvgColor ? cfg.borderWidth : 0;
    label = cfg.ifvgLabel;
    textColor = script.inputs.ifvgBoxColor ?? "#ffff00";
  } else if (zone.forming) {
    fillColor = isBull ? cfg.formingBullFill : cfg.formingBearFill;
    borderColor = fillColor;
    borderWidth = fillColor ? cfg.borderWidth : 0;
    label = opts.layerLabel ?? layer.label;
    textColor = isBull
      ? (script.inputs.formingBullColor ?? "#00bcd4")
      : (script.inputs.formingBearColor ?? "#ab47bc");
  } else if (zone.partial) {
    fillColor = cfg.partialFill;
    borderColor = cfg.partialFill;
    borderWidth = cfg.partialFill ? cfg.borderWidth : 0;
    label = opts.layerLabel ?? layer.label;
    textColor = script.inputs.partialCloseColor ?? "#ff9800";
  } else {
    const layerFills = resolveLayerBoxFills(layer, script.inputs);
    fillColor = isBull ? (layerFills?.bullFill ?? cfg.bullFill) : (layerFills?.bearFill ?? cfg.bearFill);
    borderColor = isBull
      ? (layerFills?.bullBorder ?? cfg.bullBorder)
      : (layerFills?.bearBorder ?? cfg.bearBorder);
    borderWidth = borderColor ? cfg.borderWidth : 0;
    label = opts.layerLabel ?? layer.label;
    textColor = isBull
      ? (script.inputs.bullBorderColor ?? "#00e676")
      : (script.inputs.bearBorderColor ?? "#f23645");
  }

  if (!isIfvg) {
    label = buildFvgBoxLabel(cfg, opts.layerLabel ?? layer.label, zone, script.overlayCtx?.symbolInfo ?? null);
  }

  const showLabel = cfg.showLabels && Boolean(label && String(label).trim());
  debugFvgDrawBox(layer, zone, series, label, showLabel, silent);

  // HTF zones can start before the pane's loaded history (datafeed HTF stores
  // reach further back than the chart bars). Times outside the time scale have
  // no coordinate — the fallback extrapolation draws ghost bands in the wrong
  // place. Clamp to the first loaded bar; skip boxes entirely left of history.
  const firstChartTime = script.chartBars?.[0]?.time;
  let drawStart = startTime;
  if (firstChartTime != null && drawStart < firstChartTime) {
    if (!extendRight && endTime <= firstChartTime) return;
    drawStart = firstChartTime;
  }

  script.drawBox({
    timeStart: drawStart,
    timeEnd: extendRight ? endTime : Math.max(endTime, drawStart),
    extendRight,
    labelTime: extendRight ? drawStart + LABEL_DISTANCE_BARS * cfg.chartSec : null,
    priceTop: zone.top,
    priceBottom: zone.bottom,
    fillColor,
    borderColor: borderColor ?? "transparent",
    borderWidth,
    borderDash: cfg.borderDash,
    label,
    showLabel,
    labelAlign: "center",
    textColor,
    isIfvg,
    isPartial: Boolean(zone.partial),
    isForming: Boolean(zone.forming),
  });
}

/** @param {object} script @param {{ silent?: boolean }} [opts] */
export function emitAllBoxes(script, opts = {}) {
  const silent = opts.silent === true;
  const cfg = script.state.cfg;
  const fvgCandidates = [];
  const ifvgCandidates = [];
  const filtered = {
    filled: 0,
    unconfirmed: 0,
    correlated: 0,
    size: 0,
    formingCorrelated: 0,
    formingSize: 0,
    cappedFvg: 0,
    cappedIfvg: 0,
  };

  const allLayers = [
    ...script.state.chartLayers.map((e) => ({ layer: e.layer, series: e.series })),
    ...(script.state.htfLayers ?? []),
  ];

  for (const { layer, series } of allLayers) {
    const active = script.state.layerActive.get(layer.label) ?? [];
    const ifvgActive = script.state.layerIfvg.get(layer.label) ?? [];
    const lastIdx = series.length - 1;
    for (const zone of active) {
      if (zone.filled) {
        filtered.filled += 1;
        continue;
      }
      if (zone.confirmIndex === lastIdx) {
        filtered.unconfirmed += 1;
        continue;
      }
      if (!passesCorrelatedFilter(script, layer, series, zone)) {
        filtered.correlated += 1;
        continue;
      }
      if (!fvgZonePassesSizeFilter(zone, cfg.sizeFilterLimits, script.overlayCtx?.symbolInfo ?? null)) {
        filtered.size += 1;
        continue;
      }
      fvgCandidates.push({ layer, series, zone, sortTime: zoneConfirmTime(zone, series) });
    }
    if (cfg.showLiveForming && cfg.showFvg && series.length >= 3) {
      const formingSeries = formingSeriesForLayer(script, layer, series, lastIdx);
      const hit = fvgAtBar(formingSeries, lastIdx, layer.tfSec);
      const formingZone = hit ? zoneFromFvgHit(hit, formingSeries, lastIdx, script) : null;
      if (formingZone) {
        formingZone.forming = true;
        if (!passesCorrelatedFilter(script, layer, series, formingZone)) {
          filtered.formingCorrelated += 1;
        } else if (
          !fvgZonePassesSizeFilter(formingZone, cfg.sizeFilterLimits, script.overlayCtx?.symbolInfo ?? null)
        ) {
          filtered.formingSize += 1;
        } else {
          fvgCandidates.push({ layer, series, zone: formingZone, sortTime: zoneConfirmTime(formingZone, series) });
        }
      }
    }
    for (const zone of ifvgActive) {
      ifvgCandidates.push({ layer, series, zone, sortTime: zoneInvertTime(zone, series) });
    }
  }

  const fvgZones = takeRecentZones(fvgCandidates, cfg.maxFvgZones, (z) => z.sortTime);
  const ifvgZones = takeRecentZones(ifvgCandidates, cfg.maxIfvgZones, (z) => z.sortTime);
  filtered.cappedFvg = Math.max(0, fvgCandidates.length - fvgZones.length);
  filtered.cappedIfvg = Math.max(0, ifvgCandidates.length - ifvgZones.length);

  debugFvgEmitResult({
    candidateFvg: fvgCandidates.length,
    candidateIfvg: ifvgCandidates.length,
    drawnFvg: fvgZones.length,
    drawnIfvg: ifvgZones.length,
    filtered,
    fvgZones,
    ifvgZones,
    cfg,
    silent,
  });

  for (const item of fvgZones) {
    emitZoneBox(script, item.layer, item.series, item.zone, { layerLabel: item.layer.label, silent });
  }
  for (const item of ifvgZones) {
    emitZoneBox(script, item.layer, item.series, item.zone, { isIfvg: true, silent });
  }
}

import {
  barChartTime,
  compareFvgKindAtConfirmTime,
  fvgAtBar,
  isFvgFilled,
  isIfvgCloseInversion,
  isPartialClose,
  layerMatchesCorrelatedTfSel,
  zoneFromFvgHit,
} from "./detect.js";
import { debugFvgZoneEvent } from "./fvgDebug.js";

/** @param {object} script @param {{ tfSec: number, tfId: string, label: string }} layer @param {object[]} primarySeries @param {object} zone */
export function passesCorrelatedFilter(script, layer, primarySeries, zone) {
  if (!script.state.cfg.requireCorrelatedFvg) return true;
  const sel = script.state.cfg.correlatedFvgTf ?? "all";
  if (sel !== "all" && !layerMatchesCorrelatedTfSel(sel, layer, script.state.cfg.chartSec)) {
    return true;
  }
  const cmpSeries = script.state.compareSeriesByLayer?.get(layer.label);
  if (!cmpSeries?.length) return false;
  const confirmBar = primarySeries[zone.confirmIndex];
  const confirmTime = confirmBar?.confirmChartTime ?? confirmBar?.chartTime;
  const cmpKind = compareFvgKindAtConfirmTime(cmpSeries, confirmTime, layer.tfSec);
  return cmpKind != null && cmpKind === zone.kind;
}

/** @param {object} script @param {{ tfSec: number, tfId: string, label: string }} layer @param {object[]} series @param {object[]} active @param {object[]} ifvgActive @param {number} i @param {number} lastBarIdx @param {boolean} [logEvents] */
export function processFvgBar(script, layer, series, active, ifvgActive, i, lastBarIdx, logEvents = true) {
  const { deleteOnFill, fillType, showIfvg, showPartial } = script.state.cfg;
  const isFormingBar = i === lastBarIdx;

  for (let z = active.length - 1; z >= 0; z--) {
    const zone = active[z];
    if (showIfvg && !isFormingBar && isIfvgCloseInversion(zone, series[i])) {
      const ifvgZone = {
        ...zone,
        invertIndex: i,
        invertTime: barChartTime(script, series[i], i) ?? series[i]?.time,
      };
      ifvgActive.push(ifvgZone);
      if (logEvents) debugFvgZoneEvent(layer, ifvgZone, series, i, "ifvg");
      active.splice(z, 1);
      continue;
    }
    if (isFormingBar && showPartial) {
      if (isPartialClose(zone, series[i])) {
        active[z] = { ...zone, partial: true };
        continue;
      }
      if (zone.partial) active[z] = { ...zone, partial: false };
    } else if (zone.partial) {
      active[z] = { ...zone, partial: false };
    }
    if (!isFvgFilled(zone, series[i], fillType)) continue;
    if (deleteOnFill) {
      if (logEvents) debugFvgZoneEvent(layer, zone, series, i, "deleted");
      active.splice(z, 1);
    } else {
      const filledZone = { ...zone, filled: true, fillIndex: i, partial: false };
      active[z] = filledZone;
      if (logEvents) debugFvgZoneEvent(layer, filledZone, series, i, "filled");
    }
  }

  const hit = fvgAtBar(series, i, layer.tfSec);
  if (!hit || isFormingBar) return;

  const zone = zoneFromFvgHit(hit, series, i, script);
  if (!zone) return;
  active.push(zone);
  if (logEvents) debugFvgZoneEvent(layer, zone, series, i, "new");
}

/** @param {object} script @param {{ tfSec: number, tfId: string, label: string }} layer @param {object[]} series @param {number} startIdx @param {number} barIdx */
export function onBarLayer(script, layer, series, startIdx, barIdx) {
  if (barIdx < startIdx || barIdx >= series.length) return;
  const active = script.state.layerActive.get(layer.label) ?? [];
  const ifvgActive = script.state.layerIfvg.get(layer.label) ?? [];
  const logEvents = barIdx === series.length - 1;
  processFvgBar(script, layer, series, active, ifvgActive, barIdx, series.length - 1, logEvents);
  script.state.layerActive.set(layer.label, active);
  script.state.layerIfvg.set(layer.label, ifvgActive);
}

/** @param {object} script @param {{ tfSec: number, tfId: string, label: string }} layer @param {object[]} series @param {number} startIdx */
export function scanLayerSeries(script, layer, series, startIdx) {
  const active = [];
  const ifvgActive = [];
  const lastBarIdx = series.length - 1;
  for (let i = startIdx; i < series.length; i++) {
    processFvgBar(script, layer, series, active, ifvgActive, i, lastBarIdx, false);
  }
  script.state.layerActive.set(layer.label, active);
  script.state.layerIfvg.set(layer.label, ifvgActive);
}

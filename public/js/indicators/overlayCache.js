/** @param {object} line */
export function overlayLineSignature(line) {
  return `${line.timeStart}|${line.timeEnd}|${line.priceStart}|${line.priceEnd}|${line.color ?? ""}|${line.kind ?? ""}|${line.label ?? ""}|${line.labelAnchor ?? ""}|${Boolean(line.swept)}|${line.width ?? ""}`;
}

/** @param {object} box */
export function overlayBoxSignature(box) {
  return `${box.timeStart}|${box.timeEnd}|${Boolean(box.extendRight)}|${box.priceTop}|${box.priceBottom}|${box.label ?? ""}|${Boolean(box.showLabel)}|${box.fillColor ?? ""}|${box.isIfvg ? 1 : 0}|${box.isPartial ? 1 : 0}|${box.isForming ? 1 : 0}`;
}

/** @param {object[] | null | undefined} items */
export function overlayGeometryKey(items) {
  if (!items?.length) return "0";
  const first = items[0];
  if (first?.timeStart != null && first?.priceStart != null) {
    return items.map(overlayLineSignature).join(";");
  }
  return items.map(overlayBoxSignature).join(";");
}

/** @param {object[]} a @param {object[]} b */
export function overlayGeometryEqual(a, b) {
  return overlayGeometryKey(a) === overlayGeometryKey(b);
}

/**
 * Cache key for skipping FVG/overlay recompute.
 * Includes head + length so history prepend invalidates stale box lists (maxBarsBack window shifts).
 * @param {object} instance
 * @param {object[]} chartBars
 * @param {typeof import("./BaseIndicator.js").BaseIndicator} Indicator
 */
export function overlayRecomputeKey(instance, chartBars, Indicator) {
  const head = chartBars[0]?.time ?? "";
  const tail = chartBars.at(-1)?.time ?? "";
  const len = chartBars.length;
  const styleKeys = Indicator.graphicStyleKeysForOverlay?.(Indicator.overlayPrimitive ?? "") ?? [];
  const stylePart = styleKeys.map((k) => instance.style?.[k]).join(",");
  return `${instance.defId}|${head}|${tail}|${len}|${JSON.stringify(instance.inputs)}|${stylePart}`;
}

/** @param {object} instance */
export function clearOverlayInstanceCache(instance) {
  instance._overlayRecomputeKey = undefined;
  instance._overlayGeomKey = undefined;
  instance._overlayBoxCache = undefined;
  instance._overlayLastSyncToken = undefined;
  instance._overlayAppliedGeomKey = undefined;
  instance._pendingOverlayApply = undefined;
}

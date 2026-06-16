import { chartDebug } from "./index.js";
import { TOOL_LABELS } from "../../drawings/catalog/tools.js";

/** @param {string} type */
export function drawingTypeLabel(type) {
  return TOOL_LABELS[type] ?? type;
}

/** @param {{ time?: number, price?: number } | null | undefined} p */
export function formatDrawPoint(p) {
  if (!p || p.time == null || p.price == null) return "—";
  const price = Number(p.price);
  const priceText = Number.isFinite(price) ? price.toLocaleString(undefined, { maximumFractionDigits: 4 }) : "—";
  return `t=${p.time} @ ${priceText}`;
}

/** @param {{ type?: string, id?: string, points?: { time?: number, price?: number }[] }} drawing */
export function summarizeDrawing(drawing) {
  if (!drawing) return "—";
  const pts = drawing.points?.map(formatDrawPoint).filter(Boolean) ?? [];
  return {
    id: drawing.id,
    type: drawing.type,
    label: drawingTypeLabel(drawing.type ?? ""),
    points: pts,
    at: pts[0] ?? null,
  };
}

/**
 * @param {string} message
 * @param {unknown} [detail]
 */
export function debugDrawings(message, detail) {
  chartDebug("drawings", message, detail);
}

/** @param {number} count @param {string} [source] */
export function debugDrawingsLoaded(count, source) {
  const noun = count === 1 ? "drawing" : "drawings";
  const msg = source ? `loaded ${count} ${noun} (${source})` : `loaded ${count} ${noun}`;
  debugDrawings(msg);
}

/** @param {{ type?: string, id?: string, points?: { time?: number, price?: number }[] }} drawing @param {string} [verb] */
export function debugDrawingAction(drawing, verb = "added") {
  const label = drawingTypeLabel(drawing.type ?? "drawing");
  const at = drawing.points?.[0];
  const where = at ? formatDrawPoint(at) : "—";
  debugDrawings(`${verb} ${label} at ${where}`, summarizeDrawing(drawing));
}

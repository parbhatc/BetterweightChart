import { normalizeResolutionId } from "/js/chart/resolutionFormat.js";
import { resolutionSec } from "/js/chart/resolutions.js";
import { levelsHtfStyles } from "./htfStyles.js";
import { levelsSessionDefs } from "./sessionDefs.js";

/** @typedef {{ enabled: boolean, label: string, layer: string }} LevelLayerRow */

/** @param {{ sessionId?: string, label?: string }} row @param {Record<string, { label: string }>} [sessionDefs] */
function resolveSessionIdFromRow(row, sessionDefs = {}) {
  const sid = String(row.sessionId ?? "").trim();
  if (sid && sessionDefs[sid]) return sid;
  const label = String(row.label ?? "").trim();
  for (const [id, def] of Object.entries(sessionDefs)) {
    if (def.label === label) return id;
  }
  return sid || "asia";
}

/** @param {unknown} raw */
function parseHm(raw) {
  const m = String(raw ?? "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return { h, min };
}

/** @param {{ sessionId?: string, startTime?: string, endTime?: string, label?: string }} row @param {Record<string, { label: string; startH: number; startM: number; endH: number; endM: number; crossesMidnight: boolean; color: string }>} [sessionDefs] */
export function sessionConfigFromRow(row, sessionDefs = {}) {
  const sid = resolveSessionIdFromRow(row, sessionDefs);
  const def = sessionDefs[sid];
  const start = parseHm(row.startTime) ?? (def ? { h: def.startH, min: def.startM } : null);
  const end = parseHm(row.endTime) ?? (def ? { h: def.endH, min: def.endM } : null);
  if (!start || !end) return null;
  const startMod = start.h * 60 + start.min;
  const endMod = end.h * 60 + end.min;
  return {
    label: row.label || def?.label || "Session",
    startH: start.h,
    startM: start.min,
    endH: end.h,
    endM: end.min,
    crossesMidnight: endMod <= startMod,
    color: def?.color ?? "#00ffcc",
  };
}

/**
 * @param {LevelLayerRow[]} timeRows
 * @param {import("../ui/levelsLayersPanel.js").SessionLevelRow[]} sessionRows
 * @param {{ htfStyles?: Record<string, { tag?: string; hi: string; lo: string }>; sessionDefs?: Record<string, { label: string; startH: number; startM: number; endH: number; endM: number; crossesMidnight: boolean; color: string }> }} [palette]
 */
export function buildLevelsEngineConfig(timeRows, sessionRows, palette = {}) {
  const htfStyles = palette.htfStyles ?? {};
  const sessionDefs = palette.sessionDefs ?? {};
  /** @type {{ slot: string; label: string; tfSec: number; hiColor: string; loColor: string }[]} */
  const htf = [];
  /** @type {{ label: string; color: string; startH: number; startM: number; endH: number; endM: number; crossesMidnight: boolean }[]} */
  const sessions = [];
  const seenHtf = new Set();
  const seenSession = new Set();

  for (const row of timeRows ?? []) {
    if (!row.enabled) continue;
    const layer = String(row.layer ?? "").trim();
    const label = String(row.label ?? "").trim();
    if (!layer || !label) continue;

    const tfId = normalizeResolutionId(layer);
    const tfSec = resolutionSec(tfId);
    if (!tfSec || seenHtf.has(tfId)) continue;
    seenHtf.add(tfId);
    const style = htfStyles[tfId] ?? levelsHtfStyles.resolve(tfId);
    htf.push({
      slot: `htf_${tfId}`,
      tfId,
      label: label || style.tag,
      tfSec,
      hiColor: style.hi,
      loColor: style.lo,
    });
  }

  for (const row of sessionRows ?? []) {
    if (!row.enabled) continue;
    const label = String(row.label ?? "").trim();
    if (!label) continue;
    const sid = String(row.sessionId ?? "asia").trim();
    if (seenSession.has(label)) continue;
    seenSession.add(label);
    const cfg = sessionConfigFromRow(row, sessionDefs);
    if (!cfg) continue;
    sessions.push({ ...cfg, label });
  }
  return { htf, sessions };
}

export { levelsHtfStyles, levelsSessionDefs };

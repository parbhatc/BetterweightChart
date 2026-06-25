/** Tradesea-supported UDF resolution ids (matches Auren tradeseaResolutions.ts). */
export const TRADESEA_RESOLUTIONS = [
  { id: "100T", label: "100 tick", sec: 1 },
  { id: "500T", label: "500 tick", sec: 1 },
  { id: "1000T", label: "1000 tick", sec: 1 },
  { id: "2000T", label: "2000 tick", sec: 1 },
  { id: "5000T", label: "5000 tick", sec: 1 },
  { id: "1S", label: "1s", sec: 1 },
  { id: "5S", label: "5s", sec: 5 },
  { id: "10S", label: "10s", sec: 10 },
  { id: "15S", label: "15s", sec: 15 },
  { id: "30S", label: "30s", sec: 30 },
  { id: "45S", label: "45s", sec: 45 },
  { id: "1", label: "1m", sec: 60 },
  { id: "2", label: "2m", sec: 120 },
  { id: "3", label: "3m", sec: 180 },
  { id: "5", label: "5m", sec: 300 },
  { id: "10", label: "10m", sec: 600 },
  { id: "15", label: "15m", sec: 900 },
  { id: "30", label: "30m", sec: 1800 },
  { id: "60", label: "1h", sec: 3600 },
  { id: "120", label: "2h", sec: 7200 },
  { id: "1D", label: "1D", sec: 86400 },
  { id: "1W", label: "1W", sec: 604800 },
  { id: "1M", label: "1M", sec: 2592000 },
];

export const TRADESEA_RESOLUTION_IDS = TRADESEA_RESOLUTIONS.map((r) => r.id);

/** @param {string} resolution */
export function tradeseaResolutionSec(resolution) {
  const r = String(resolution).trim().toUpperCase();
  const hit = TRADESEA_RESOLUTIONS.find((x) => x.id.toUpperCase() === r);
  if (hit) return hit.sec;
  if (r.endsWith("T")) return 1;
  if (r.endsWith("S")) {
    const sec = Number.parseInt(r.slice(0, -1), 10);
    return Number.isFinite(sec) && sec > 0 ? sec : 1;
  }
  if (r === "D" || r === "1D") return 86400;
  if (r === "W" || r === "1W") return 604800;
  if (r === "M" || r === "1M") return 2592000;
  const mins = Number.parseInt(r, 10);
  return Number.isFinite(mins) && mins > 0 ? mins * 60 : 60;
}

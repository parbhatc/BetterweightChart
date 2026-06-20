/** @typedef {{ enabled: boolean, label: string, eventId: string }} NewsLevelRow */

/** @type {{ id: string, label: string }[]} */
export const NEWS_SOURCE_OPTIONS = [{ id: "forexfactory", label: "ForexFactory" }];

/** @type {NewsLevelRow[]} */
export const DEFAULT_NEWS_LEVELS = [
  { enabled: true, label: "PPI", eventId: "ppi" },
  { enabled: true, label: "CPI", eventId: "cpi" },
  { enabled: true, label: "FOMC", eventId: "fomc" },
];

/** @param {{ title?: string, event?: string, name?: string }} ev */
export function eventTitle(ev) {
  return String(ev?.title ?? ev?.event ?? ev?.name ?? "")
    .trim()
    .toLowerCase();
}

/** @param {string} title */
export function isPpiEvent(title) {
  const t = String(title ?? "").trim().toLowerCase();
  return t === "core ppi m/m" || t === "ppi m/m";
}

/** @param {string} title */
export function isCpiEvent(title) {
  const t = String(title ?? "").trim().toLowerCase();
  return t === "core cpi m/m" || t === "cpi m/m";
}

/** @param {string} title */
export function isFomcEvent(title) {
  const t = String(title ?? "").trim().toLowerCase();
  return /^fomc (statement|press conference|economic projections|meeting minutes)$/.test(t);
}

/** @param {string} eventId @param {string} title */
export function eventMatchesId(eventId, title) {
  const id = String(eventId ?? "").trim().toLowerCase();
  const t = String(title ?? "").trim().toLowerCase();
  if (id === "ppi") return isPpiEvent(t);
  if (id === "cpi") return isCpiEvent(t);
  if (id === "fomc") return isFomcEvent(t);
  if (!id) return false;
  return t.includes(id);
}

/** @param {string} title @param {string[]} typeIds */
export function eventMatchesTypes(title, typeIds) {
  return typeIds.some((id) => eventMatchesId(id, title));
}

/** @param {unknown} raw @returns {NewsLevelRow[]} */
export function normalizeNewsLevels(raw) {
  if (!Array.isArray(raw)) return DEFAULT_NEWS_LEVELS.map((r) => ({ ...r }));
  return raw
    .map((r) => ({
      enabled: r?.enabled !== false,
      label: String(r?.label ?? "").trim(),
      eventId: resolveNewsEventId(String(r?.label ?? "").trim(), String(r?.eventId ?? "")),
    }))
    .filter((r) => r.label);
}

/** @param {object} inputs @returns {NewsLevelRow[]} */
export function resolveNewsLevels(inputs) {
  if (Array.isArray(inputs.newsLevels) && inputs.newsLevels.length > 0) {
    return normalizeNewsLevels(inputs.newsLevels);
  }
  return DEFAULT_NEWS_LEVELS.map((r) => ({ ...r }));
}

/** @param {NewsLevelRow[]} rows @returns {string[]} */
export function enabledNewsTypeIds(rows) {
  return rows.filter((r) => r.enabled !== false).map((r) => r.eventId);
}

/** @param {string} label @param {string} [storedId] */
export function resolveNewsEventId(label, storedId) {
  const id = String(storedId ?? "").trim().toLowerCase();
  if (id && ["ppi", "cpi", "fomc"].includes(id)) return id;
  const lower = label.toLowerCase();
  if (lower.includes("ppi")) return "ppi";
  if (lower.includes("cpi")) return "cpi";
  if (lower.includes("fomc")) return "fomc";
  return id || lower.replace(/\s+/g, "-") || "custom";
}

/** @param {{ title?: string, event?: string, name?: string }[] | null | undefined} events @param {NewsLevelRow[]} rows */
export function filterEventsByNewsLevels(events, rows) {
  const typeIds = enabledNewsTypeIds(rows);
  if (!typeIds.length) return [];
  return (events ?? []).filter((ev) => eventMatchesTypes(eventTitle(ev), typeIds));
}

/** @param {{ title?: string, event?: string, name?: string }[] | null | undefined} events @param {NewsLevelRow[]} rows */
export function releaseDayKindFromEvents(events, rows) {
  const filtered = filterEventsByNewsLevels(events, rows);
  const ids = enabledNewsTypeIds(rows);
  if (filtered.some((ev) => ids.includes("ppi") && isPpiEvent(eventTitle(ev)))) return "ppi";
  if (filtered.some((ev) => ids.includes("cpi") && isCpiEvent(eventTitle(ev)))) return "cpi";
  if (filtered.some((ev) => ids.includes("fomc") && isFomcEvent(eventTitle(ev)))) return "fomc";
  return null;
}

export const PPI_COLOR = "#ff8c00";
export const CPI_COLOR = "#6366f1";
export const FOMC_COLOR = "#eab308";

/** @param {"ppi"|"cpi"|"fomc"|null|undefined} kind */
export function releaseMetaFromKind(kind) {
  switch (kind) {
    case "cpi":
      return { prefix: "CPI", color: CPI_COLOR };
    case "fomc":
      return { prefix: "FOMC", color: FOMC_COLOR };
    case "ppi":
    default:
      return { prefix: "PPI", color: PPI_COLOR };
  }
}

/**
 * @param {Record<string, { events?: object[] }>} newsByDay
 * @param {NewsLevelRow[]} rows
 */
export function buildReleasePlan(newsByDay, rows) {
  /** @type {Map<string, { kind: string, hm: string, prefix: string, color: string, events: object[] }>} */
  const plan = new Map();
  for (const [ymd, payload] of Object.entries(newsByDay ?? {})) {
    const events = payload?.events ?? [];
    const kind = releaseDayKindFromEvents(events, rows);
    if (!kind) continue;
    const matched = filterEventsByNewsLevels(events, rows).filter((ev) => {
      const t = eventTitle(ev);
      if (kind === "ppi") return isPpiEvent(t);
      if (kind === "cpi") return isCpiEvent(t);
      if (kind === "fomc") return isFomcEvent(t);
      return false;
    });
    const { prefix, color } = releaseMetaFromKind(kind);
    plan.set(ymd, {
      kind,
      hm: primaryReleaseTimeHm(matched),
      prefix,
      color,
      events: matched,
    });
  }
  return plan;
}

/** `8:30am` → `08:30` ET */
export function parseFfTimeEt(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (!s || /all day|tentative|^day \d|^\d+$/.test(s)) return null;
  const m = s.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2];
  if (m[3] === "pm" && h !== 12) h += 12;
  if (m[3] === "am" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${min}`;
}

/** @param {{ hmEt?: string, timeLabel?: string }[]} events @param {string} [fallback="08:30"] */
export function primaryReleaseTimeHm(events, fallback = "08:30") {
  for (const ev of events ?? []) {
    const hm = ev.hmEt ?? parseFfTimeEt(ev.timeLabel);
    if (hm) return hm;
  }
  return fallback;
}

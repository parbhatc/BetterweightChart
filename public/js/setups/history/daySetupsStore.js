import { SetupRegistry } from "../registry/setupRegistry.js";

/** @typedef {import("../engines/checklistEngine.js").HtfSweepSnapshot} HtfSweepSnapshot */
/** @typedef {import("../engines/checklistCycleLive.js").FvgTapSnapshot} FvgTapSnapshot */

function emptyById() {
  /** @type {Map<number, object[]>} */
  const byId = new Map();
  for (const def of SetupRegistry.list()) {
    byId.set(def.id, []);
  }
  return byId;
}

export class DaySetupsStore {
  static _store = {
    dayKey: "",
    loaded: false,
    endUnix: null,
    byId: emptyById(),
  };

  /**
   * @param {{ setups?: Record<string, object[]>; setups1?: object[]; setups2?: object[]; meta?: { endUnix?: number } }} payload
   * @param {string} dayYmd
   */
  static fromApi(payload, dayYmd) {
    const byId = emptyById();
    for (const def of SetupRegistry.list()) {
      const fromNested = payload.setups?.[def.apiKey];
      const legacy =
        def.apiKey === "setups1"
          ? payload.setups1
          : def.apiKey === "setups2"
            ? payload.setups2
            : undefined;
      byId.set(def.id, fromNested ?? legacy ?? []);
    }
    DaySetupsStore._store = {
      dayKey: dayYmd || "",
      loaded: Boolean(dayYmd),
      endUnix: payload.meta?.endUnix ?? null,
      byId,
    };
  }

  static clear() {
    DaySetupsStore._store = { dayKey: "", loaded: false, endUnix: null, byId: emptyById() };
  }

  /** @param {string} [dayYmd] */
  static has(dayYmd) {
    const s = DaySetupsStore._store;
    return Boolean(dayYmd && s.loaded && s.dayKey === dayYmd);
  }

  /** @param {string} [dayYmd] */
  static meta(dayYmd) {
    if (!DaySetupsStore.has(dayYmd)) return null;
    /** @type {Record<string, number>} */
    const counts = {};
    for (const def of SetupRegistry.list()) {
      counts[`count${def.id}`] = DaySetupsStore._store.byId.get(def.id)?.length ?? 0;
    }
    return {
      endUnix: DaySetupsStore._store.endUnix,
      ...counts,
      count1: counts.count1 ?? 0,
      count2: counts.count2 ?? 0,
    };
  }

  /**
   * @param {number | null | undefined} anchorUnix
   * @param {string} [dayYmd]
   */
  static through(anchorUnix, dayYmd) {
    /** @type {Map<number, object[]>} */
    const byId = emptyById();
    if (!DaySetupsStore.has(dayYmd) || anchorUnix == null) {
      return { byId, completed: [], completed2: [] };
    }
    for (const def of SetupRegistry.list()) {
      const list = (DaySetupsStore._store.byId.get(def.id) ?? []).filter(
        (s) => s.completedAt != null && s.completedAt <= anchorUnix,
      );
      byId.set(def.id, list);
    }
    return {
      byId,
      completed: byId.get(1) ?? [],
      completed2: byId.get(2) ?? [],
    };
  }

  /** @param {number | null | undefined} anchorUnix @param {number} recordAfterUnix @param {string} [dayYmd] */
  static countNewAfter(anchorUnix, recordAfterUnix, dayYmd) {
    if (!DaySetupsStore.has(dayYmd) || anchorUnix == null) return 0;
    const { byId } = DaySetupsStore.through(anchorUnix, dayYmd);
    const after = recordAfterUnix ?? -Infinity;
    let total = 0;
    for (const list of byId.values()) {
      total += list.filter((s) => s.completedAt > after).length;
    }
    return total;
  }
}

export const setDaySetupsFromApi = (...a) => DaySetupsStore.fromApi(...a);
export const clearDaySetups = () => DaySetupsStore.clear();
export const hasDaySetups = (...a) => DaySetupsStore.has(...a);
export const getDaySetupsMeta = (...a) => DaySetupsStore.meta(...a);
export const getDaySetupsThroughAnchor = (...a) => DaySetupsStore.through(...a);
export const countNewSetupsAfter = (...a) => DaySetupsStore.countNewAfter(...a);

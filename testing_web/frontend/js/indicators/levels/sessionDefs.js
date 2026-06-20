/** @typedef {{ label: string; startH: number; startM: number; endH: number; endM: number; crossesMidnight: boolean; color: string }} SessionDef */

export class LevelsSessionDefs {
  /** @returns {Record<string, SessionDef>} */
  all() {
    return {
      asia: { label: "Asia", startH: 20, startM: 0, endH: 0, endM: 0, crossesMidnight: true, color: "#00ffcc" },
      london: { label: "London", startH: 2, startM: 0, endH: 5, endM: 0, crossesMidnight: false, color: "#9400d3" },
      ny_am: { label: "New York AM", startH: 9, startM: 30, endH: 11, endM: 0, crossesMidnight: false, color: "#ff007f" },
      ny_lunch: { label: "New York Lunch", startH: 12, startM: 0, endH: 13, endM: 0, crossesMidnight: false, color: "#ffaa00" },
      ny_pm: { label: "New York PM", startH: 13, startM: 30, endH: 16, endM: 0, crossesMidnight: false, color: "#007fff" },
    };
  }

  /** @param {string} id */
  get(id) {
    return this.all()[id];
  }

  /** @param {{ sessionId?: string, label?: string }} row */
  resolveId(row) {
    const sid = String(row.sessionId ?? "").trim();
    if (sid && this.get(sid)) return sid;
    const label = String(row.label ?? "").trim();
    for (const [id, def] of Object.entries(this.all())) {
      if (def.label === label) return id;
    }
    return sid || "asia";
  }

  /** @param {string} label @param {string} [storedId] */
  resolveIdFromLabel(label, storedId) {
    return this.resolveId({ sessionId: storedId, label });
  }
}

export const levelsSessionDefs = new LevelsSessionDefs();

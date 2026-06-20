/** @typedef {import("../setupLabelsPrimitive.js").SetupTooltipSection} SetupTooltipSection */

/**
 * @typedef {object} SetupHistoryApi
 * @property {(opts: unknown, anchorUnix: number, dayYmd?: string) => object[]} through
 * @property {(anchorUnix: number, dayYmd?: string, sweepCount?: number) => object[] | null} peek
 * @property {(dayYmd?: string) => boolean} warm
 * @property {() => void} reset
 */

/**
 * @typedef {object} SetupMarkersApi
 * @property {(setup: object) => string} id
 * @property {(setup: object) => number | null | undefined} regimeStart
 * @property {(setup: object, entryTime1m: number) => SetupTooltipSection[]} tooltips
 */

/**
 * @typedef {object} SetupRuntimeContext
 * @property {() => import("../levelsCalc.js").HtfSweepEvent[]} getSweepEvents
 * @property {() => { time: number; high: number; low: number; close?: number }[]} getRaw1m
 * @property {() => number | null | undefined} getAnchorUnix
 * @property {() => string | undefined} [getDayYmd]
 * @property {() => { time: number; high: number; low: number }[]} [getCompBars1m]
 * @property {() => string} [getSymbol]
 * @property {() => { smtPivotLeft?: number; smtPivotRight?: number }} [getLxSettings]
 * @property {() => boolean} [getHasPpiNews]
 * @property {() => { title?: string; event?: string; name?: string; hmEt?: string; time?: string; timeLabel?: string; currency?: string }[]} [getCalendarEvents]
 * @property {() => "ppi" | "cpi" | null} [getReleaseDayKind]
 * @property {() => import("../setupTradingWindow.js").SetupTradingWindowSettings} [getSetupTradingWindow]
 * @property {() => void} [ensureCompBars]
 * @property {() => string} [getTf] — active chart timeframe (for `internal_sweep` steps)
 */

/**
 * @typedef {object} SetupDefinition
 * @property {string} slug — engine id, e.g. `htfSweep`
 * @property {number} id
 * @property {string} name
 * @property {string} apiKey
 * @property {string} label
 * @property {string} contextPanelKey
 * @property {string} historyPanelKey
 * @property {string} idleHint
 * @property {import("../setupText.js").SetupTextConfig} text
 * @property {import("../setupChecklist.js").ChecklistItemDef[]} checklist
 * @property {SetupHistoryApi} history
 * @property {(ctx: SetupRuntimeContext) => unknown} opts
 * @property {(ctx: SetupRuntimeContext, completed: object[]) => object} live
 * @property {(setup: object) => string} panel
 * @property {(setup: object) => string} detail
 * @property {SetupMarkersApi} markers
 */

export class SetupRegistry {
  static _defs = [];

  /** @param {SetupDefinition} def */
  static register(def) {
    if (SetupRegistry._defs.some((s) => s.id === def.id)) {
      throw new Error(`Setup id ${def.id} is already registered (${def.label})`);
    }
    if (SetupRegistry._defs.some((s) => s.apiKey === def.apiKey)) {
      throw new Error(`Setup apiKey "${def.apiKey}" is already registered`);
    }
    SetupRegistry._defs.push(def);
    SetupRegistry._defs.sort((a, b) => a.id - b.id);
  }

  /** @returns {readonly SetupDefinition[]} */
  static list() {
    return SetupRegistry._defs;
  }

  /** @param {number} id @returns {SetupDefinition | undefined} */
  static get(id) {
    return SetupRegistry._defs.find((s) => s.id === id);
  }

  /** @param {string} apiKey @returns {SetupDefinition | undefined} */
  static byKey(apiKey) {
    return SetupRegistry._defs.find((s) => s.apiKey === apiKey);
  }
}

export const register = (...a) => SetupRegistry.register(...a);
export const list = (...a) => SetupRegistry.list(...a);
export const get = (...a) => SetupRegistry.get(...a);
export const byKey = (...a) => SetupRegistry.byKey(...a);

import { registerSetup } from "./registerSetup.js";
import { normalizeChecklist } from "../setupChecklist.js";
import { getEngineByKey, resolveEngineFromChecklist } from "./setupEngineRegistry.js";

/** @typedef {import("../setupText.js").SetupTextConfig} SetupTextConfig */

/**
 * @typedef {object} SetupJsonDef
 * @property {number} id
 * @property {string} name
 * @property {string} [engine] — optional override when checklist inference is ambiguous
 * @property {string} [slug]
 * @property {"htfSweep"|"fvgTap"|"lastCandleSweep"} [ui]
 * @property {Partial<SetupTextConfig>} [text] — optional copy overrides
 * @property {import("../setupChecklist.js").ChecklistItemDef[]} checklist
 * @property {{ reset_on_opposite_fvg_tap?: boolean }} [cycle]
 */

export { ENGINE_KEYS } from "./setupEngineRegistry.js";

/** @param {SetupJsonDef} def */
export function registerSetupFromJson(def) {
  const checklist = normalizeChecklist(def.checklist);
  const engine = def.engine ? getEngineByKey(def.engine) : resolveEngineFromChecklist(checklist);
  const slug = def.slug ?? engine.key;
  const ui = def.ui ?? engine.ui;
  const { id, name } = def;

  return registerSetup({
    id,
    name: name ?? `Setup #${id}`,
    slug,
    text: def.text,
    checklist,
    cycle: def.cycle,
    ui,
    history: engine.history,
    opts: engine.opts,
    live: engine.live,
    detail: engine.detail,
    markers: {
      id: (setup) => engine.markers.id(setup, id),
      regimeStart: engine.markers.regimeStart,
    },
  });
}

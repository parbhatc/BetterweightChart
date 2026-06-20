import { configure } from "../engines/engineConfig.js";
import { buildSetupText, deriveFeedsFromChecklist } from "../setupChecklistUi.js";
import { stepLabel } from "../setupText.js";
import { primaryFvgTapTf } from "../setupFvgTap.js";
import { lastCandleSweepTf } from "../setupLastCandleSweep.js";
import { internalSweepRow, primaryInternalSweepTf } from "../setupSweep.js";
import { CHECKLIST_STEP, isStepId } from "../setupStepTypes.js";
import { normalizeChecklist } from "../setupChecklist.js";
import { SetupRegistry } from "./setupRegistry.js";
import {
  finishTooltips,
  fvgTapFeeds,
  fvgTapNextIdleHint,
  fvgTapTooltips,
  htfSweepFeeds,
  htfSweepTooltips,
  lastCandleSweepFeeds,
  lastCandleSweepTooltips,
  setupPanel,
} from "./setupUi.js";

/** @param {string} slug */
export function panelKeys(slug) {
  const kebab = slug.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
  return { context: `${kebab}-context`, history: `${kebab}-history` };
}

/**
 * @typedef {import("./setupRegistry.js").SetupDefinition} SetupDefinition
 * @typedef {import("../setupText.js").SetupTextConfig} SetupTextConfig
 * @typedef {import("./setupRegistry.js").SetupHistoryApi} SetupHistoryApi
 * @typedef {import("./setupRegistry.js").SetupRuntimeContext} SetupRuntimeContext
 * @typedef {import("./setupRegistry.js").SetupMarkersApi} SetupMarkersApi
 */

/** @param {import("../setupText.js").SetupTextConfig} text @param {import("../setupChecklist.js").ChecklistItemDef[]} checklist */
function enrichTextFromChecklist(text, checklist) {
  const hasLastCandle = normalizeChecklist(checklist).some((item) =>
    isStepId(item.id, CHECKLIST_STEP.LAST_CANDLE_SWEEP),
  );
  const enriched = {
    ...text,
    fvgTapTf: hasLastCandle
      ? lastCandleSweepTf(checklist, text.fvgTapTf)
      : primaryFvgTapTf(checklist, text.fvgTapTf),
  };
  const internalRow = internalSweepRow(checklist);
  if (internalRow?.id !== "internal_sweep") {
    enriched.internalTf = primaryInternalSweepTf(checklist, text.internalTf);
  }
  return enriched;
}

/** @param {string} name @param {number} id @param {import("../setupChecklist.js").ChecklistItemDef[]} checklist @param {Partial<import("../setupText.js").SetupTextConfig>} [textOverrides] @param {{ reset_on_opposite_fvg_tap?: boolean } | undefined} [cycle] */
function resolveSetupText(name, id, checklist, textOverrides, cycle) {
  const built = buildSetupText(name, id, checklist, textOverrides ?? {}, cycle);
  const enriched = enrichTextFromChecklist(built, checklist);
  return {
    ...enriched,
    label: name || `Setup #${id}`,
    feeds: { ...deriveFeedsFromChecklist(checklist, enriched), ...textOverrides?.feeds },
  };
}

/** @param {"htfSweep"|"fvgTap"|"lastCandleSweep"} preset @param {SetupTextConfig} text @param {string} contextKey */
function panelFromPreset(preset, text, contextKey) {
  if (preset === "htfSweep") {
    return (setup) => setupPanel(text, contextKey, setup, htfSweepFeeds(text, setup));
  }
  if (preset === "lastCandleSweep") {
    return (setup) => setupPanel(text, contextKey, setup, lastCandleSweepFeeds(text, setup));
  }
  return (setup) =>
    setupPanel(text, contextKey, setup, fvgTapFeeds(text, setup), fvgTapNextIdleHint(text));
}

/** @param {"htfSweep"|"fvgTap"|"lastCandleSweep"} preset @param {SetupTextConfig} text */
function tooltipsFromPreset(preset, text) {
  const sections =
    preset === "htfSweep"
      ? htfSweepTooltips
      : preset === "lastCandleSweep"
        ? lastCandleSweepTooltips
        : fvgTapTooltips;
  return (setup, entryTime1m) => finishTooltips(sections(text, setup), setup, entryTime1m);
}

/**
 * Register a setup — configures display text, derives apiKey + panel keys.
 *
 * @param {{
 *   id: number;
 *   name: string;
 *   slug: string;
 *   text?: Partial<SetupTextConfig>;
 *   checklist: import("../setupChecklist.js").ChecklistItemDef[];
 *   cycle?: { reset_on_opposite_fvg_tap?: boolean };
 *   history: SetupHistoryApi;
 *   opts: (ctx: SetupRuntimeContext) => unknown;
 *   live: (ctx: SetupRuntimeContext, completed: object[]) => object;
 *   ui?: "htfSweep" | "fvgTap" | "lastCandleSweep";
 *   panel?: (setup: object) => string;
 *   detail?: (setup: object) => string;
 *   markers: Omit<SetupMarkersApi, "tooltips"> & { tooltips?: SetupMarkersApi["tooltips"] };
 *   idleHint?: string;
 *   apiKey?: string;
 * }} reg
 * @returns {SetupDefinition}
 */
export function registerSetup(reg) {
  const { id, name, slug, text: textOverrides, checklist: checklistItems, cycle, history, opts, live, detail, markers, idleHint, apiKey, ui } = reg;
  const enrichedText = resolveSetupText(name, id, checklistItems, textOverrides, cycle);
  configure(slug, {
    text: enrichedText,
    checklist: checklistItems,
    cycle,
  });

  const keys = panelKeys(slug);
  const resolvedIdle =
    idleHint ??
    (enrichedText.idleHint.includes("{") ? stepLabel(enrichedText.idleHint, enrichedText) : enrichedText.idleHint);

  const panel =
    reg.panel ??
    (ui ? panelFromPreset(ui, enrichedText, keys.context) : () => `<p>Setup panel not configured</p>`);

  const tooltips =
    markers.tooltips ?? (ui ? tooltipsFromPreset(ui, enrichedText) : () => []);

  /** @type {SetupDefinition} */
  const def = {
    slug,
    id,
    name,
    apiKey: apiKey ?? `setups${id}`,
    label: name,
    text: enrichedText,
    checklist: checklistItems,
    contextPanelKey: keys.context,
    historyPanelKey: keys.history,
    idleHint: resolvedIdle,
    history,
    opts,
    live,
    panel,
    detail: detail ?? (() => ""),
    markers: { ...markers, tooltips },
  };

  SetupRegistry.register(def);
  return def;
}

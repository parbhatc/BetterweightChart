import { resolveSetup2Cycle, splitSetup2Cycles, closedThroughTapFvg } from "../../confluence/fvgTapContext.js";
import { buildInternalSweepEvents } from "../../confluence/internalSweepContext.js";
import { buildIfvgEvents } from "../../confluence/ifvgContext.js";
import { buildSmtEvents } from "../../confluence/smtContext.js";
import { sliceBarsThroughAnchor } from "../../levels/levelsCalc.js";
import { makeSetupState } from "../setupContext.js";
import {
  capAnchorForSetupWindow,
  filterConfluencesForSetupWindow,
  floorRegimeStartForSetupWindow,
  isSetupEntryAllowed,
  isWithinSetupTradingWindow,
  setupEntryPreviewHint,
  setupTradingWindowPhase,
} from "../setupTradingWindow.js";
import { ppiHtfSweepBeforeAnchor, releaseDaySetupHint } from "../../confluence/ppiNews.js";
import { config, checklist as checklistItems, setupCycle } from "./engineConfig.js";
import { buildChecklistRows, idleChecklistRows } from "../setupChecklist.js";
import { applyCycleLiveFreshness } from "../setupFreshness.js";
import { resolveSmtPivot, smtRequiredBeforeIfvg, cycleResetsOnOppositeTap } from "../setupSmt.js";
import { primaryFvgTapTf } from "../setupFvgTap.js";
import { resolveInternalSweepTf } from "../setupSweep.js";
import { internalSweepStepOpts } from "../setupInternalSweep.js";
import {
  closeThroughLabel,
  tapBiasHint,
} from "../setupText.js";
import { cycleFlowStepDone } from "../checklistStepDone.js";
import { checklistStepIds } from "../setupSteps.js";
import { CHECKLIST_STEP } from "../setupStepTypes.js";

/** @typedef {import("../../confluence/fvgTapContext.js").FvgTapEvent} FvgTapEvent */
/** @typedef {import("../../confluence/internalSweepContext.js").InternalSweepEvent} InternalSweepEvent */
/** @typedef {import("../../confluence/ifvgContext.js").IfvgEvent} IfvgEvent */
/** @typedef {import("../../confluence/smtContext.js").SmtEvent} SmtEvent */

const SLUG = "fvgTap";

/**
 * @param {SmtEvent[]} smtEvents
 * @param {IfvgEvent[]} ifvgEvents
 * @param {number} afterInternal
 * @param {"bull"|"bear"} smtKind
 */
function findSmtIfvgPair(smtEvents, ifvgEvents, afterInternal, smtKind) {
  const smts = smtEvents.filter((s) => s.kind === smtKind && s.endTime > afterInternal);
  const ifvgs = ifvgEvents.filter((e) => e.time > afterInternal);

  let best = null;
  for (const ifvg of ifvgs) {
    const smt = smts.filter((s) => s.endTime <= ifvg.time).at(-1);
    if (!smt) continue;
    if (!best || ifvg.time > best.ifvg.time) best = { smt, ifvg };
  }
  return best;
}

/** @param {string} bias */
function biasHintFromTap(bias) {
  return tapBiasHint(bias, config(SLUG));
}

/** @param {string} [biasHint] */
function emptyLive(biasHint) {
  const text = config(SLUG);
  const items = checklistItems(SLUG);
  const hint = biasHint ?? tapBiasHint("—", text);
  const close = closeThroughLabel("—", text);
  return {
    ...makeSetupState(text.label, idleChecklistRows(text, items, { bias: "—" })),
    bias: "—",
    biasHint: hint,
    anchorTap: null,
    fvgTaps: [],
    internalSweeps: [],
    smtEvents: [],
    recentSmt: null,
    recentIfvg: null,
    completedAt: null,
    closedAbove15m: false,
    closedAbove15mTime: null,
    closeLabel: close,
  };
}


function latestCompletedAtFromHistory(history) {
  const last = history.length ? history[history.length - 1] : null;
  return last?.completedAt ?? null;
}

export class FvgTapEngine {
  static buildLive(opts) {
    const { bars1m, compBars1m = [], anchorUnix, compLabel = "ES" } = opts;
    const tradingBounds = opts.tradingBounds ?? null;
    const text = config(SLUG);
    const items = checklistItems(SLUG);
    const smtPivot = resolveSmtPivot(items, {
      pivotLeft: opts.pivotLeft,
      pivotRight: opts.pivotRight,
    });
    const pivotLeft = smtPivot.pivotLeft;
    const pivotRight = smtPivot.pivotRight;

    if (!bars1m?.length || anchorUnix == null) {
      return emptyLive();
    }

    const phase = setupTradingWindowPhase(anchorUnix, tradingBounds);
    const previewBeforeWindow = phase === "before";
    if (phase === "after") {
      return emptyLive(
        `Setup window closed (${tradingBounds?.startLabel ?? "—"}–${tradingBounds?.endLabel ?? "—"} ET)`,
      );
    }

    const effectiveAnchor = previewBeforeWindow
      ? anchorUnix
      : capAnchorForSetupWindow(anchorUnix, tradingBounds);
    if (
      !previewBeforeWindow &&
      opts.getHasPpiNews?.() === true &&
      !ppiHtfSweepBeforeAnchor(
        opts.getSweepEvents?.() ?? [],
        effectiveAnchor,
        opts.getDayYmd?.(),
      )
    ) {
      return emptyLive(releaseDaySetupHint(opts.getReleaseDayKind?.()));
    }
    const regimeStart = previewBeforeWindow
      ? opts.regimeStart ?? bars1m[0]?.time ?? 0
      : floorRegimeStartForSetupWindow(opts.regimeStart ?? bars1m[0]?.time ?? 0, tradingBounds);
    const fvgTapTf = primaryFvgTapTf(items, text.fvgTapTf);
    const { taps: cycleTaps, anchorTap: rawAnchorTap } = resolveSetup2Cycle(
      bars1m,
      effectiveAnchor,
      regimeStart,
      fvgTapTf,
    );
    const anchorTap =
      rawAnchorTap &&
      (previewBeforeWindow || isWithinSetupTradingWindow(rawAnchorTap.time, tradingBounds))
        ? rawAnchorTap
        : null;
    if (!anchorTap) {
      return previewBeforeWindow
        ? emptyLive(`Preview${setupEntryPreviewHint(tradingBounds)}`)
        : emptyLive();
    }
    const bias =
      anchorTap.direction === "bull"
        ? "Bullish"
        : anchorTap.direction === "bear"
          ? "Bearish"
          : "—";
    const tapTime = anchorTap.time;
    const internalTf = resolveInternalSweepTf(items, text.internalTf, opts.getTf?.());
    const internalSweepOpts = internalSweepStepOpts(items, opts.getTf?.(), { hasQualifyingTap: true });

    let internalSweeps =
      bias !== "—"
        ? buildInternalSweepEvents(bars1m, effectiveAnchor, internalTf, tapTime, bias, internalSweepOpts)
        : [];
    const firstInternal = internalSweeps[0] ?? null;
    const internalTime = firstInternal?.time ?? Infinity;

    const smtEvents = buildSmtEvents(
      bars1m,
      compBars1m,
      effectiveAnchor,
      pivotLeft,
      pivotRight,
      compLabel,
    );
    const ifvgEvents =
      bias !== "—" ? buildIfvgEvents(bars1m, effectiveAnchor, tapTime, bias, 2, compBars1m) : [];

    const smtKind = bias === "Bullish" ? "bull" : bias === "Bearish" ? "bear" : null;
    const smtIfvgPair =
      smtKind && Number.isFinite(internalTime)
        ? findSmtIfvgPair(smtEvents, ifvgEvents, internalTime, smtKind)
        : null;
    const recentSmtAlone =
      smtKind && Number.isFinite(internalTime)
        ? smtEvents.filter((s) => s.kind === smtKind && s.endTime > internalTime).at(-1) ?? null
        : null;
    const stepIds = checklistStepIds(items);
    const combinedSmtIfvg = stepIds.has(CHECKLIST_STEP.SMT_IFVG);
    let recentSmt;
    let recentIfvg;
    if (combinedSmtIfvg) {
      recentSmt = smtIfvgPair?.smt ?? recentSmtAlone;
      recentIfvg = smtIfvgPair?.ifvg ?? null;
    } else {
      recentSmt = recentSmtAlone;
      recentIfvg =
        recentSmtAlone != null
          ? (ifvgEvents
              .filter((e) => e.time > internalTime && e.time >= recentSmtAlone.endTime)
              .at(-1) ?? null)
          : null;
    }
    if (smtRequiredBeforeIfvg(items) && !recentSmt) {
      recentIfvg = null;
    }

    const slice = sliceBarsThroughAnchor(bars1m, effectiveAnchor);
    const close = closeThroughLabel(bias, text);

    const entryAllowed = isSetupEntryAllowed(anchorUnix, tradingBounds);
    const closeCheck = entryAllowed
      ? closedThroughTapFvg(slice, recentIfvg?.time ?? Infinity, bias, anchorTap)
      : { done: false, time: null };

    const stepState = {
      anchorTap,
      firstInternal,
      smtIfvgPair,
      recentSmt,
      recentIfvg,
      closeDone: closeCheck.done,
    };
    const rows = buildChecklistRows(text, items, (step) => cycleFlowStepDone(step.id, stepState), {
      bias,
      closeLabel: close,
    });
    const setup = makeSetupState(text.label, rows);

    const fvgTaps =
      tradingBounds && !previewBeforeWindow
        ? filterConfluencesForSetupWindow(cycleTaps, tradingBounds)
        : cycleTaps;
    if (tradingBounds && !previewBeforeWindow) {
      internalSweeps = filterConfluencesForSetupWindow(internalSweeps, tradingBounds);
    }
    let completedAt = entryAllowed && setup.complete ? closeCheck.time ?? null : null;
    if (completedAt != null && !isWithinSetupTradingWindow(completedAt, tradingBounds)) {
      completedAt = null;
    }
    return applyCycleLiveFreshness(
      {
        ...setup,
        bias,
        biasHint: previewBeforeWindow
          ? `${biasHintFromTap(bias)}${setupEntryPreviewHint(tradingBounds)}`
          : biasHintFromTap(bias),
        complete: completedAt != null,
        completedAt,
        anchorTap,
        fvgTaps,
        internalSweeps,
        smtEvents: recentSmt ? [recentSmt] : [],
        recentSmt,
        recentIfvg,
        closedAbove15m: closeCheck.done,
        closedAbove15mTime: closeCheck.time,
        closeLabel: close,
      },
      effectiveAnchor,
      SLUG,
      opts.getTf?.(),
    );
  }


  /** @returns {FvgTapSnapshot} */
  static buildIdle() {
    const text = config(SLUG);
    const items = checklistItems(SLUG);
    const close = closeThroughLabel("—", text);
    return {
      ...makeSetupState(text.label, idleChecklistRows(text, items, { bias: "—" })),
      bias: "—",
      biasHint: text.completeIdleHint,
      anchorTap: null,
      fvgTaps: [],
      internalSweeps: [],
      smtEvents: [],
      recentSmt: null,
      recentIfvg: null,
      completedAt: null,
      closedAbove15m: false,
      closedAbove15mTime: null,
      closeLabel: close,
    };
  }

  /** @param {FvgTapSnapshot[]} history */

  /**
   * After completion, show neutral until the next Setup #2 cycle (opposite 15m tap).
   * @param {FvgTapSnapshot} setup2
   * @param {Parameters<typeof buildLive>[0]} opts
   * @param {FvgTapSnapshot[]} [completedHistory]
   */
  static applyCycleReset(setup2, opts, completedHistory) {
    if (!cycleResetsOnOppositeTap(setupCycle(SLUG))) return setup2;
    const { bars1m, anchorUnix, tradingBounds } = opts;
    if (anchorUnix == null || !bars1m?.length) return setup2;

    const phase = setupTradingWindowPhase(anchorUnix, tradingBounds ?? null);
    if (phase === "before") return setup2;
    if (phase === "after") {
      return emptyLive(
        `Setup window closed (${tradingBounds?.startLabel ?? "—"}–${tradingBounds?.endLabel ?? "—"} ET)`,
      );
    }

    const completedAt =
      setup2.complete && setup2.completedAt != null
        ? setup2.completedAt
        : latestCompletedAtFromHistory(completedHistory ?? []);

    if (completedAt == null) return setup2;
    if (anchorUnix < completedAt) return setup2;

    const sessionStart = bars1m[0]?.time ?? 0;
    const text = config(SLUG);
    const fvgTapTf = primaryFvgTapTf(checklistItems(SLUG), text.fvgTapTf);
    const cycles = splitSetup2Cycles(bars1m, anchorUnix, sessionStart, fvgTapTf);
    const nextCycle = cycles.find((c) => c.start > completedAt);
    if (!nextCycle) return buildIdle();

    return buildLive({ ...opts, regimeStart: nextCycle.start });
  }

  /** @typedef {ReturnType<typeof buildLive>} FvgTapSnapshot */

  /**
   * Bar times where Setup #2 may complete (close-through after SMT + IFVG).
   * @param {Parameters<typeof buildLive>[0]} opts
   * @param {number} scanEnd
   * @param {number} sessionStart
   */
  static collectEntryCandidates(opts, scanEnd, sessionStart) {
    const probe = buildLive({ ...opts, anchorUnix: scanEnd });
    if (!probe.anchorTap || probe.bias === "—") return [];

    const slice = sliceBarsThroughAnchor(opts.bars1m, scanEnd);
    const tapTime = probe.anchorTap.time;
    const text = config(SLUG);
    const items = checklistItems(SLUG);
    const internalTf = resolveInternalSweepTf(items, text.internalTf, opts.getTf?.());
    const internalSweepOpts = internalSweepStepOpts(items, opts.getTf?.(), { hasQualifyingTap: true });
    const internalSweeps = buildInternalSweepEvents(opts.bars1m, scanEnd, internalTf, tapTime, probe.bias, internalSweepOpts);
    const firstInternal = internalSweeps[0]?.time ?? Infinity;
    if (!Number.isFinite(firstInternal)) return [];

    const smtKind = probe.bias === "Bullish" ? "bull" : "bear";
    const smtEvents = buildSmtEvents(
      opts.bars1m,
      opts.compBars1m ?? [],
      scanEnd,
      opts.pivotLeft ?? 1,
      opts.pivotRight ?? 1,
      opts.compLabel ?? "ES",
    );
    const ifvgEvents = buildIfvgEvents(opts.bars1m, scanEnd, tapTime, probe.bias, 2, opts.compBars1m);

    /** @type {number[]} */
    const times = [];
    const seen = new Set();
    const add = (t) => {
      if (Number.isFinite(t) && !seen.has(t)) {
        seen.add(t);
        times.push(t);
      }
    };

    const ifvgs = ifvgEvents.filter((e) => e.time > firstInternal);
    for (const ifvg of ifvgs) {
      const smt = smtEvents.filter((s) => s.kind === smtKind && s.endTime > firstInternal && s.endTime <= ifvg.time).at(-1);
      if (!smt) continue;
      add(ifvg.time);
      const check = closedThroughTapFvg(slice, ifvg.time, probe.bias, probe.anchorTap);
      if (check.time) add(check.time);
    }

    return times.sort((a, b) => a - b);
  }

}

export const buildLive = (...a) => FvgTapEngine.buildLive(...a);
export const buildIdle = (...a) => FvgTapEngine.buildIdle(...a);
export const applyCycleReset = (...a) => FvgTapEngine.applyCycleReset(...a);
export const collectEntryCandidates = (...a) => FvgTapEngine.collectEntryCandidates(...a);

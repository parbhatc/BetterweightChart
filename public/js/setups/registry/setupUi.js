import { fvgTapsForBias } from "../../confluence/fvgTapContext.js";
import { ifvgTooltipLines } from "../../confluence/ifvgContext.js";
import { feedTitleFromChecklist, panelEmptyForStep } from "../setupChecklistUi.js";
import { CHECKLIST_STEP } from "../setupStepTypes.js";
import { stepLabel, tapBiasHint } from "../setupText.js";
import {
  CRT_HIGH_COLOR,
  CRT_LOW_COLOR,
  SWEEP_HIGH_COLOR,
  SWEEP_LOW_COLOR,
} from "../crtLinesPrimitive.js";
import { Format } from "../../utils/format.js";
import { SetupView } from "./setupPanel.js";

/** @param {number} time */
export function fmtSetupTime(time) {
  return Format.time12h(Format.toDate(time));
}

/** @param {Array<{ time: number; label: string; price?: number }>} events */
export function sweepTooltipItems(events) {
  return events.map((sw) => {
    const price = Number.isFinite(sw.price) ? sw.price.toFixed(2) : "—";
    return `${fmtSetupTime(sw.time)} · ${sw.label} @ ${price}`;
  });
}

/** @param {Array<{ time: number; label: string; bottom: number; top: number }>} taps */
export function tapTooltipItems(taps) {
  return taps.map((tap) => {
    const zone = `${tap.bottom.toFixed(2)}–${tap.top.toFixed(2)}`;
    return `${fmtSetupTime(tap.time)} · ${tap.label} @ ${zone}`;
  });
}

/**
 * @param {import("../setupText.js").SetupTextConfig} text
 * @param {string} feedKey
 * @param {string} bodyHtml
 */
export function feedBlock(text, feedKey, bodyHtml) {
  return `<div class="setup-panel__feed">
        <h4 class="setup-panel__feed-title">${SetupView.esc(feedTitleFromChecklist(feedKey, text))}</h4>
        ${bodyHtml}
      </div>`;
}

/**
 * @param {import("../setupLabelsPrimitive.js").SetupTooltipSection[]} sections
 * @param {object} setup
 * @param {number} entryTime1m
 */
export function finishTooltips(sections, setup, entryTime1m) {
  const closeLabel = setup.checklist?.at(-1)?.[0] ?? "Entry";
  sections.push({ title: "Entry", items: [`${fmtSetupTime(entryTime1m)} · ${closeLabel}`] });
  if (setup.biasHint && setup.bias && setup.bias !== "—") {
    sections.unshift({ title: setup.bias, items: [setup.biasHint] });
  }
  return sections;
}

/**
 * @param {import("../setupText.js").SetupTextConfig} text
 * @param {string} contextPanelKey
 * @param {object} setup
 * @param {string} feedsHtml
 * @param {string} [nextIdleHint]
 */
export function setupPanel(text, contextPanelKey, setup, feedsHtml, nextIdleHint) {
  const active = setup.bias !== "—" || setup.forming;
  const checklist = active
    ? `<ul class="checklist checklist--setup">${SetupView.checklist(setup.checklist)}</ul>`
    : "";
  return `
        <div class="setup-panel${SetupView.panelMod(setup)}">
          <h3 class="setup-panel__title">${SetupView.esc(text.label)}</h3>
          <div class="setup-panel__bias">
            ${SetupView.biasCard(
              setup.bias,
              setup.biasHint,
              SetupView.nextStep(setup.checklist, setup.complete, setup.bias, nextIdleHint),
              setup.complete,
            )}
          </div>
          ${checklist}
          <details class="context-fold" data-panel="${contextPanelKey}">
            <summary class="context-fold__summary">Confluences</summary>
            <div class="context-fold__body">${feedsHtml}</div>
          </details>
        </div>`;
}

/** HTF sweep setup — standard confluence feeds. */
export function htfSweepFeeds(text, setup) {
  return [
    feedBlock(text, "htfSweeps", SetupView.htfSweeps(setup.htfSweeps ?? [])),
    feedBlock(
      text,
      "fvgTaps",
      SetupView.fvgTaps(fvgTapsForBias(setup.fvgTaps ?? [], setup.bias)),
    ),
    feedBlock(text, "internalSweeps", SetupView.internalSweeps(setup.internalSweeps ?? [])),
    feedBlock(
      text,
      "ifvg",
      SetupView.ifvg(
        setup.recentIfvg,
        (setup.internalSweeps?.length ?? 0) > 0
          ? panelEmptyForStep(text, CHECKLIST_STEP.IFVG)
          : panelEmptyForStep(text, CHECKLIST_STEP.INTERNAL_SWEEP),
      ),
    ),
  ].join("");
}

/** @param {import("../setupText.js").SetupTextConfig} text @param {object} setup */
export function htfSweepTooltips(text, setup) {
  /** @type {import("../setupLabelsPrimitive.js").SetupTooltipSection[]} */
  const sections = [];
  const htf = setup.htfSweeps ?? [];
  if (htf.length) {
    sections.push({ title: feedTitleFromChecklist("htfSweeps", text), items: sweepTooltipItems(htf) });
  }
  const taps = setup.fvgTaps ?? [];
  if (taps.length) {
    sections.push({ title: feedTitleFromChecklist("fvgTaps", text), items: tapTooltipItems(taps) });
  }
  const internals = setup.internalSweeps ?? [];
  if (internals.length) {
    sections.push({
      title: feedTitleFromChecklist("internalSweeps", text),
      items: sweepTooltipItems(internals),
    });
  }
  if (setup.recentIfvg) {
    sections.push({
      title: feedTitleFromChecklist("ifvg", text),
      items: ifvgTooltipLines(setup.recentIfvg),
    });
  }
  return sections;
}

/** FVG tap setup — standard confluence feeds. */
export function fvgTapFeeds(text, setup) {
  return [
    feedBlock(
      text,
      "fvgTaps",
      SetupView.fvgTaps(setup.fvgTaps ?? [], tapBiasHint("—", text)),
    ),
    feedBlock(
      text,
      "internalSweeps",
      SetupView.internalSweeps(
        setup.internalSweeps ?? [],
        setup.anchorTap
          ? panelEmptyForStep(text, CHECKLIST_STEP.INTERNAL_SWEEP)
          : tapBiasHint("—", text),
      ),
    ),
    feedBlock(
      text,
      "smt",
      SetupView.smt(
        setup.recentSmt,
        panelEmptyForStep(text, CHECKLIST_STEP.SMT),
      ),
    ),
    feedBlock(
      text,
      "ifvg",
      SetupView.ifvg(
        setup.recentIfvg,
        panelEmptyForStep(text, CHECKLIST_STEP.IFVG),
      ),
    ),
  ].join("");
}

/** @param {import("../setupText.js").SetupTextConfig} text @param {object} setup */
export function fvgTapTooltips(text, setup) {
  /** @type {import("../setupLabelsPrimitive.js").SetupTooltipSection[]} */
  const sections = [];
  const taps = setup.fvgTaps ?? [];
  if (taps.length) {
    sections.push({ title: feedTitleFromChecklist("fvgTaps", text), items: tapTooltipItems(taps) });
  }
  const internals = setup.internalSweeps ?? [];
  if (internals.length) {
    sections.push({
      title: feedTitleFromChecklist("internalSweeps", text),
      items: sweepTooltipItems(internals),
    });
  }
  if (setup.recentSmt) {
    sections.push({
      title: feedTitleFromChecklist("smt", text),
      items: [`${fmtSetupTime(setup.recentSmt.endTime)} · ${setup.recentSmt.label}`],
    });
  }
  if (setup.recentIfvg) {
    sections.push({
      title: feedTitleFromChecklist("ifvg", text),
      items: ifvgTooltipLines(setup.recentIfvg),
    });
  }
  return sections;
}

/** @param {import("../setupText.js").SetupTextConfig} text */
export function fvgTapNextIdleHint(text) {
  return tapBiasHint("—", text);
}

function crtLastCandleFeed(bar, emptyLabel) {
  if (!bar) return `<p class="events-feed__empty">${SetupView.esc(emptyLabel)}</p>`;
  const time = fmtSetupTime(bar.time);
  return `<ul class="events-feed sweep-feed">
    <li class="events-feed__item sweep-feed__item">
      <span class="events-feed__time">${SetupView.esc(time)}</span>
      <span class="events-feed__text" style="color:${CRT_HIGH_COLOR}">CRT High @ ${bar.high.toFixed(2)}</span>
    </li>
    <li class="events-feed__item sweep-feed__item">
      <span class="events-feed__text" style="color:${CRT_LOW_COLOR}">CRT Low @ ${bar.low.toFixed(2)}</span>
    </li>
  </ul>`;
}

function sweepCandleFeed(bar, emptyLabel) {
  if (!bar) return `<p class="events-feed__empty">${SetupView.esc(emptyLabel)}</p>`;
  const time = fmtSetupTime(bar.time);
  return `<ul class="events-feed sweep-feed">
    <li class="events-feed__item sweep-feed__item">
      <span class="events-feed__time">${SetupView.esc(time)}</span>
      <span class="events-feed__text" style="color:${SWEEP_HIGH_COLOR}">High @ ${bar.high.toFixed(2)}</span>
    </li>
    <li class="events-feed__item sweep-feed__item">
      <span class="events-feed__text" style="color:${SWEEP_LOW_COLOR}">Low @ ${bar.low.toFixed(2)}</span>
    </li>
  </ul>`;
}

/** Setup #3 — CRT last candle + sweep candle feeds. */
export function lastCandleSweepFeeds(text, setup) {
  const crtTitle = feedTitleFromChecklist("lastCandle", text);
  const sweepTitle = feedTitleFromChecklist("sweepCandle", text);
  return [
    feedBlock(text, "lastCandle", crtLastCandleFeed(setup.lastBar, `Waiting for ${crtTitle}…`)),
    feedBlock(text, "sweepCandle", sweepCandleFeed(setup.sweepBar, `Waiting for ${sweepTitle}…`)),
  ].join("");
}

/** @param {import("../setupText.js").SetupTextConfig} text @param {object} setup */
export function lastCandleSweepTooltips(text, setup) {
  /** @type {import("../setupLabelsPrimitive.js").SetupTooltipSection[]} */
  const sections = [];
  if (setup.lastBar) {
    sections.push({
      title: feedTitleFromChecklist("lastCandle", text),
      items: [
        `CRT High @ ${setup.lastBar.high.toFixed(2)}`,
        `CRT Low @ ${setup.lastBar.low.toFixed(2)}`,
      ],
    });
  }
  if (setup.lastCandleSweep) {
    sections.push({
      title: feedTitleFromChecklist("lastCandleSweep", text),
      items: sweepTooltipItems([setup.lastCandleSweep]),
    });
  }
  if (setup.sweepBar) {
    sections.push({
      title: feedTitleFromChecklist("sweepCandle", text),
      items: [
        `High @ ${setup.sweepBar.high.toFixed(2)} · Low @ ${setup.sweepBar.low.toFixed(2)}`,
      ],
    });
  }
  return sections;
}

import { Format } from "../../utils/format.js";
import { ifvgTooltipLines } from "../../confluence/ifvgContext.js";

/** @param {string} s */
function escFn(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** @param {string | undefined} color */
function sweepColorAttrFn(color) {
  const c = String(color || "").trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(c) || /^rgba?\(/.test(c) || /^var\(--/.test(c)) {
    return ` style="--sweep-color: ${c}"`;
  }
  return "";
}

/** @param {string} bias */
function biasToneFn(bias) {
  return bias === "Bullish" ? "bull" : bias === "Bearish" ? "bear" : "neutral";
}

/** @param {string} bias */
function sideLabelFn(bias) {
  return bias === "Bullish" ? "Long" : bias === "Bearish" ? "Short" : "—";
}

/** @param {Array<[string, boolean]>} checklist @param {boolean} complete */
function nextStepFn(checklist, complete, bias, idleHint = "Waiting for HTF sweep…") {
  if (bias === "—" && !complete) {
    const next = checklist.find(([, ok]) => !ok);
    return next ? `Next: ${next[0]}` : idleHint;
  }
  if (complete) return "Setup complete";
  const next = checklist.find(([, ok]) => !ok);
  return next ? `Next: ${next[0]}` : "Waiting…";
}

/** @param {{ forming: boolean; complete: boolean }} setup */
function panelModFn(setup) {
  if (setup.complete) return " setup-panel--complete";
  if (setup.forming) return " setup-panel--forming";
  return "";
}

function biasCardFn(bias, biasHint, nextStep, complete) {
  const tone = biasToneFn(bias);
  const nextMod = complete ? " context-card__next--done" : "";
  return `<div class="context-card context-card--${tone}">
    <div class="context-card__value">${escFn(bias)}</div>
    <div class="context-card__sub">${escFn(biasHint)}</div>
    <div class="context-card__next${nextMod}">${escFn(nextStep)}</div>
  </div>`;
}

/** @param {Array<[string, boolean]>} rows */
function checklistFn(rows) {
  let currentMarked = false;
  return rows
    .map(([label, ok], idx) => {
      const isCurrent = !ok && !currentMarked;
      if (isCurrent) currentMarked = true;
      return `<li class="checklist__item${ok ? " checklist__item--done" : ""}${isCurrent ? " checklist__item--current" : ""}">
          <span class="checklist__step" aria-hidden="true">${idx + 1}</span>
          <span class="checklist__box" aria-hidden="true">${ok ? "✓" : ""}</span>
          <span class="checklist__label">${escFn(label)}</span>
        </li>`;
    })
    .join("");
}

function htfSweepsFn(sweeps, empty = "None within the last hour — step replay forward") {
  if (!sweeps.length) return `<p class="events-feed__empty">${escFn(empty)}</p>`;
  return `<ul class="events-feed sweep-feed">
    ${sweeps
      .map((sw) => {
        const time = Format.time12h(Format.toDate(sw.time));
        const price = Number.isFinite(sw.price) ? sw.price.toFixed(2) : "—";
        return `<li class="events-feed__item sweep-feed__item"${sweepColorAttrFn(sw.color)}>
          <span class="events-feed__time">${escFn(time)}</span>
          <span class="events-feed__text">${escFn(sw.label)} @ ${escFn(price)} · ${escFn(sw.bias)}</span>
        </li>`;
      })
      .join("")}
  </ul>`;
}

function fvgTapsFn(taps, empty = "None within the last hour") {
  if (!taps.length) return `<p class="events-feed__empty">${escFn(empty)}</p>`;
  return `<ul class="events-feed sweep-feed fvg-tap-feed">
    ${taps
      .map((tap) => {
        const time = Format.time12h(Format.toDate(tap.time));
        const zone = `${tap.bottom.toFixed(2)}–${tap.top.toFixed(2)}`;
        return `<li class="events-feed__item sweep-feed__item"${sweepColorAttrFn(tap.color)}>
          <span class="events-feed__time">${escFn(time)}</span>
          <span class="events-feed__text">${escFn(tap.label)} @ ${escFn(zone)}</span>
        </li>`;
      })
      .join("")}
  </ul>`;
}

function internalSweepsFn(sweeps, empty = "None within the last hour") {
  if (!sweeps.length) return `<p class="events-feed__empty">${escFn(empty)}</p>`;
  return `<ul class="events-feed sweep-feed internal-sweep-feed">
    ${sweeps
      .map((sw) => {
        const time = Format.time12h(Format.toDate(sw.time));
        const price = Number.isFinite(sw.price) ? sw.price.toFixed(2) : "—";
        return `<li class="events-feed__item sweep-feed__item"${sweepColorAttrFn(sw.color)}>
          <span class="events-feed__time">${escFn(time)}</span>
          <span class="events-feed__text">${escFn(sw.label)} @ ${escFn(price)} · ${escFn(sw.bias)}</span>
        </li>`;
      })
      .join("")}
  </ul>`;
}

function smtFn(smt, empty = "Waiting for SMT + IFVG…") {
  if (!smt) return `<p class="events-feed__empty">${escFn(empty)}</p>`;
  const time = Format.time12h(Format.toDate(smt.endTime));
  return `<ul class="events-feed sweep-feed smt-feed">
    <li class="events-feed__item sweep-feed__item"${sweepColorAttrFn(smt.color)}>
      <span class="events-feed__time">${escFn(time)}</span>
      <span class="events-feed__text">${escFn(smt.label)}</span>
    </li>
  </ul>`;
}

/** @param {{ internalSweeps?: unknown[] }} setup */
function ifvgEmptyForSetup1Fn(setup) {
  if ((setup.internalSweeps?.length ?? 0) > 0) return "Waiting for IFVG…";
  return "Waiting for internal sweep…";
}

function ifvgFn(ifvg, empty = "Waiting for internal sweep…") {
  if (!ifvg) return `<p class="events-feed__empty">${escFn(empty)}</p>`;
  const lines = ifvgTooltipLines(ifvg);
  return `<ul class="events-feed sweep-feed ifvg-feed">
    ${lines
      .map(
        (line) =>
          `<li class="events-feed__item sweep-feed__item ifvg-feed__line"${sweepColorAttrFn(ifvg.color)}>${escFn(line)}</li>`,
      )
      .join("")}
  </ul>`;
}

/** @param {object} setup */
function defaultDetailFn(setup) {
  return setup.htfSweeps?.[0]?.label ?? setup.anchorTap?.label ?? "";
}

function historyFn(completed, sessionYmd, detail = defaultDetailFn) {
  if (!completed.length) {
    return '<p class="events-feed__empty">None yet — step replay forward</p>';
  }

  return `<ul class="setup-history">
    ${completed
      .map((setup, idx) => {
        const tone = biasToneFn(setup.bias);
        const at = setup.completedAt;
        const time = Format.setupHistory(at, sessionYmd);
        const timeClass =
          at != null && sessionYmd && !Format.isSessionDay(at, sessionYmd)
            ? " setup-history__time--dated"
            : "";
        const side = sideLabelFn(setup.bias);
        const sweep = detail(setup);
        return `<li class="setup-history__item setup-history__item--${tone}">
          <span class="setup-history__num">${idx + 1}</span>
          <span class="setup-history__time${timeClass}">${escFn(time)}</span>
          <span class="setup-history__side">${escFn(side)}</span>
          ${sweep ? `<span class="setup-history__detail">${escFn(sweep)}</span>` : ""}
        </li>`;
      })
      .join("")}
  </ul>`;
}

export class SetupView {
  static esc = escFn;
  static sweepColorAttr = sweepColorAttrFn;
  static biasTone = biasToneFn;
  static sideLabel = sideLabelFn;
  static nextStep = nextStepFn;
  static panelMod = panelModFn;
  static biasCard = biasCardFn;
  static checklist = checklistFn;
  static htfSweeps = htfSweepsFn;
  static fvgTaps = fvgTapsFn;
  static internalSweeps = internalSweepsFn;
  static smt = smtFn;
  static ifvgEmptyForSetup1 = ifvgEmptyForSetup1Fn;
  static ifvg = ifvgFn;
  static history = historyFn;
  static defaultDetail = defaultDetailFn;
}

export const esc = (...a) => SetupView.esc(...a);
export const history = (...a) => SetupView.history(...a);

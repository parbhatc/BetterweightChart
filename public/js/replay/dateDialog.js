import { alignBarTime } from "../app/bar/periodParams.js";
import { utcToChartTime, chartTimeZoneForPane } from "../chart/timezone/chartTime.js";
import { replayBarIndexForUtcTime } from "./persist.js";
import { replayDebug } from "./debug.js";

const CLOSE =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width="18" height="18" aria-hidden="true"><path stroke="currentColor" stroke-width="1.2" d="m1.5 1.5 15 15m0-15-15 15"/></svg>';
const CHEV_LEFT =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="m16.47 7.47 1.06 1.06L12.06 14l5.47 5.47-1.06 1.06L9.94 14l6.53-6.53Z"/></svg>';
const CAL_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="18" height="18" fill="none" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M10 4h1v2h6V4h1v2h2.5A2.5 2.5 0 0 1 23 8.5v11a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 5 19.5v-11A2.5 2.5 0 0 1 7.5 6H10V4zm8 3H7.5C6.67 7 6 7.67 6 8.5v11c0 .83.67 1.5 1.5 1.5h13c.83 0 1.5-.67 1.5-1.5v-11c0-.83-.67-1.5-1.5-1.5H18zm-3 2h-2v2h2V9zm-7 4h2v2H8v-2zm12-4h-2v2h2V9zm-7 4h2v2h-2v-2zm-3 4H8v2h2v-2zm3 0h2v2h-2v-2zm7-4h-2v2h2v-2z"/></svg>';
const CLOCK_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="18" height="18" fill="none" aria-hidden="true"><path fill="currentColor" d="M14 3c6.075 0 11 4.925 11 11s-4.925 11-11 11S3 20.075 3 14 7.925 3 14 3m0 1C8.477 4 4 8.477 4 14s4.477 10 10 10 10-4.477 10-10S19.523 4 14 4m1 12h-5v-1h4V8h1z"/></svg>';

/** @param {number} y @param {number} m @param {number} d */
function dayKey(y, m, d) {
  return y * 10000 + m * 100 + d;
}

/** @param {number} utcSec @param {string} timeZone */
function utcToWallParts(utcSec, timeZone) {
  const chartSec = utcToChartTime(utcSec, timeZone);
  const dt = new Date(chartSec * 1000);
  return {
    y: dt.getUTCFullYear(),
    m: dt.getUTCMonth() + 1,
    d: dt.getUTCDate(),
    h: dt.getUTCHours(),
    min: dt.getUTCMinutes(),
  };
}

/** @param {number} y @param {number} m @param {number} d @param {number} h @param {number} min @param {string} timeZone */
function wallClockToUtcSec(y, m, d, h, min, timeZone) {
  const targetChart = Date.UTC(y, m - 1, d, h, min, 0) / 1000;
  if (timeZone === "Etc/UTC") return targetChart;
  let lo = targetChart - 3 * 86400;
  let hi = targetChart + 3 * 86400;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (utcToChartTime(mid, timeZone) < targetChart) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** @param {number} y @param {number} m */
function monthLabel(y, m) {
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** @param {number} y @param {number} m @param {number} d */
function isoDate(y, m, d) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** @param {number} h @param {number} min */
function timeLabel(h, min) {
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** @param {string} raw */
function parseIsoDate(raw) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(raw).trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

/** @param {string} raw */
function parseTime(raw) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(raw).trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || h < 0 || h > 23 || min < 0 || min > 59) return null;
  return { h, min };
}

/** @type {(() => void) | null} */
let openClose = null;

/**
 * @param {object} opts
 * @param {import("../app/boot/chart/state.js").BootContext} opts.ctx
 * @param {ReturnType<import("./mode.js").mountReplayMode>} opts.replay
 * @param {HTMLElement} [opts.anchorEl]
 */
export function openReplayDateDialog(opts) {
  openClose?.();
  openClose = null;

  const { ctx, replay, anchorEl } = opts;
  const pane = ctx.getActivePane?.() ?? ctx.chartPanes.get(0);
  if (!pane?.bars?.length) return;

  const timeZone = chartTimeZoneForPane(pane, ctx.settingsStore, pane.symbolInfo ?? ctx.symbolInfo);
  const barSec = ctx.barSecForPaneLocal?.(pane) ?? 60;
  const firstUtc = pane.bars[0].time;
  const lastUtc = pane.bars.at(-1).time;
  const minDay = utcToWallParts(firstUtc, timeZone);
  const maxDay = utcToWallParts(lastUtc, timeZone);
  const minKey = dayKey(minDay.y, minDay.m, minDay.d);
  const maxKey = dayKey(maxDay.y, maxDay.m, maxDay.d);

  const state = replay.getState();
  const seedUtc = state.selectedBarTime ?? lastUtc;
  let parts = utcToWallParts(seedUtc, timeZone);
  let viewY = parts.y;
  let viewM = parts.m;

  const overlay = document.createElement("div");
  overlay.className = "tv-replay-date-overlay";
  overlay.innerHTML = `<div class="tv-replay-date-dialog" role="dialog" aria-modal="true" aria-labelledby="tv-replay-date-title" data-name="select-date-dialog">
    <div class="tv-replay-date-dialog__header">
      <div class="tv-replay-date-dialog__title" id="tv-replay-date-title">Select date</div>
      <button type="button" class="tv-replay-date-dialog__close" data-close aria-label="Close">${CLOSE}</button>
    </div>
    <div class="tv-replay-date-dialog__body">
      <div class="tv-replay-date-dialog__inputs">
        <label class="tv-replay-date-dialog__field">
          <span class="tv-replay-date-dialog__field-icon">${CAL_ICON}</span>
          <input type="text" class="tv-replay-date-dialog__input" data-date-input placeholder="YYYY-MM-DD" autocomplete="off" />
        </label>
        <label class="tv-replay-date-dialog__field">
          <span class="tv-replay-date-dialog__field-icon">${CLOCK_ICON}</span>
          <input type="text" class="tv-replay-date-dialog__input tv-replay-date-dialog__input--time" data-time-input placeholder="HH:MM" maxlength="5" autocomplete="off" />
        </label>
      </div>
      <div class="tv-replay-date-dialog__calendar" data-calendar></div>
    </div>
    <div class="tv-replay-date-dialog__footer">
      <button type="button" class="tv-replay-date-dialog__btn tv-replay-date-dialog__btn--secondary" data-cancel>Cancel</button>
      <button type="button" class="tv-replay-date-dialog__btn tv-replay-date-dialog__btn--primary" data-submit>Select</button>
    </div>
  </div>`;

  document.body.appendChild(overlay);
  const dialog = overlay.querySelector(".tv-replay-date-dialog");
  const dateInput = overlay.querySelector("[data-date-input]");
  const timeInput = overlay.querySelector("[data-time-input]");
  const calendarEl = overlay.querySelector("[data-calendar]");

  function positionDialog() {
    if (!(dialog instanceof HTMLElement)) return;
    const pad = 8;
    const w = 320;
    let left = window.innerWidth / 2 - w / 2;
    let top = window.innerHeight / 2 - 180;
    if (anchorEl instanceof HTMLElement) {
      const rect = anchorEl.getBoundingClientRect();
      left = rect.left;
      top = rect.top - 340;
      if (top < pad) top = rect.bottom + 8;
    }
    left = Math.max(pad, Math.min(left, window.innerWidth - w - pad));
    top = Math.max(pad, Math.min(top, window.innerHeight - 360));
    dialog.style.left = `${left}px`;
    dialog.style.top = `${top}px`;
  }

  function syncInputsFromParts() {
    if (dateInput instanceof HTMLInputElement) {
      dateInput.value = isoDate(parts.y, parts.m, parts.d);
    }
    if (timeInput instanceof HTMLInputElement) {
      timeInput.value = timeLabel(parts.h, parts.min);
    }
  }

  function clampPartsToRange() {
    const key = dayKey(parts.y, parts.m, parts.d);
    if (key < minKey) parts = { ...minDay, h: parts.h, min: parts.min };
    if (key > maxKey) parts = { ...maxDay, h: parts.h, min: parts.min };
  }

  function renderCalendar() {
    if (!(calendarEl instanceof HTMLElement)) return;
    const first = new Date(Date.UTC(viewY, viewM - 1, 1));
    const startDow = first.getUTCDay();
    const startMon = startDow === 0 ? 6 : startDow - 1;
    const daysInMonth = new Date(Date.UTC(viewY, viewM, 0)).getUTCDate();

    const canPrev = viewY > minDay.y || (viewY === minDay.y && viewM > minDay.m);
    const canNext = viewY < maxDay.y || (viewY === maxDay.y && viewM < maxDay.m);

    let cells = "";
    for (let i = 0; i < startMon; i += 1) {
      cells += `<span class="tv-replay-date-dialog__pad" aria-hidden="true"></span>`;
    }
    for (let d = 1; d <= daysInMonth; d += 1) {
      const key = dayKey(viewY, viewM, d);
      const disabled = key < minKey || key > maxKey;
      const selected = parts.y === viewY && parts.m === viewM && parts.d === d;
      const today = key === maxKey;
      cells += `<button type="button" class="tv-replay-date-dialog__day${selected ? " is-selected" : ""}${today ? " is-today" : ""}" data-day="${isoDate(viewY, viewM, d)}" ${disabled ? "disabled" : ""} aria-pressed="${selected ? "true" : "false"}">${d}</button>`;
    }

    calendarEl.innerHTML = `<div class="tv-replay-date-dialog__cal-head">
      <button type="button" class="tv-replay-date-dialog__nav" data-prev-month aria-label="Previous month" ${canPrev ? "" : "disabled"}>${CHEV_LEFT}</button>
      <div class="tv-replay-date-dialog__month">${monthLabel(viewY, viewM)}</div>
      <button type="button" class="tv-replay-date-dialog__nav tv-replay-date-dialog__nav--next" data-next-month aria-label="Next month" ${canNext ? "" : "disabled"}>${CHEV_LEFT}</button>
    </div>
    <div class="tv-replay-date-dialog__dow" aria-hidden="true"><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span><span>Su</span></div>
    <div class="tv-replay-date-dialog__days">${cells}</div>`;
  }

  function close() {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
    if (openClose === close) openClose = null;
  }

  function submit() {
    if (!(dateInput instanceof HTMLInputElement) || !(timeInput instanceof HTMLInputElement)) return;
    const date = parseIsoDate(dateInput.value);
    const time = parseTime(timeInput.value);
    if (!date || !time) {
      replayDebug("selectBar.date.invalid", { date: dateInput.value, time: timeInput.value });
      return;
    }

    parts = { ...date, h: time.h, min: time.min };
    clampPartsToRange();

    let utc = wallClockToUtcSec(parts.y, parts.m, parts.d, parts.h, parts.min, timeZone);
    utc = alignBarTime(utc, barSec);
    utc = Math.max(firstUtc, Math.min(lastUtc, utc));

    const index = replayBarIndexForUtcTime(pane.bars, utc);
    if (index == null) {
      replayDebug("selectBar.date.miss", { utc, parts });
      return;
    }

    pane.replayCutLocalY = (pane.el?.clientHeight ?? 0) / 2;
    replayDebug("selectBar.date", { index, utc, parts });
    replay.setSelectedBar(index, pane.bars[index].time);
    close();
  }

  function onKey(ev) {
    if (ev.key === "Escape") {
      ev.preventDefault();
      close();
    }
  }

  syncInputsFromParts();
  renderCalendar();
  positionDialog();

  document.addEventListener("keydown", onKey);
  openClose = close;

  overlay.addEventListener("click", (ev) => {
    if (ev.target === overlay) close();
  });
  overlay.querySelector("[data-close]")?.addEventListener("click", close);
  overlay.querySelector("[data-cancel]")?.addEventListener("click", close);
  overlay.querySelector("[data-submit]")?.addEventListener("click", submit);

  calendarEl?.addEventListener("click", (ev) => {
    const dayBtn = ev.target instanceof Element ? ev.target.closest("[data-day]") : null;
    if (!(dayBtn instanceof HTMLButtonElement) || dayBtn.disabled) return;
    const parsed = parseIsoDate(dayBtn.dataset.day ?? "");
    if (!parsed) return;
    parts = { ...parts, ...parsed };
    viewY = parts.y;
    viewM = parts.m;
    syncInputsFromParts();
    renderCalendar();
  });

  calendarEl?.addEventListener("click", (ev) => {
    const prev = ev.target instanceof Element ? ev.target.closest("[data-prev-month]") : null;
    const next = ev.target instanceof Element ? ev.target.closest("[data-next-month]") : null;
    if (prev instanceof HTMLButtonElement && !prev.disabled) {
      viewM -= 1;
      if (viewM < 1) {
        viewM = 12;
        viewY -= 1;
      }
      renderCalendar();
    }
    if (next instanceof HTMLButtonElement && !next.disabled) {
      viewM += 1;
      if (viewM > 12) {
        viewM = 1;
        viewY += 1;
      }
      renderCalendar();
    }
  });

  dateInput?.addEventListener("change", () => {
    if (!(dateInput instanceof HTMLInputElement)) return;
    const parsed = parseIsoDate(dateInput.value);
    if (!parsed) return;
    parts = { ...parts, ...parsed };
    clampPartsToRange();
    viewY = parts.y;
    viewM = parts.m;
    syncInputsFromParts();
    renderCalendar();
  });

  timeInput?.addEventListener("change", () => {
    if (!(timeInput instanceof HTMLInputElement)) return;
    const parsed = parseTime(timeInput.value);
    if (!parsed) return;
    parts = { ...parts, ...parsed };
    syncInputsFromParts();
  });
}

const ICON_CLOSE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width="18" height="18" aria-hidden="true"><path stroke="currentColor" stroke-width="1.2" fill="none" d="m1.5 1.5 15 15m0-15-15 15"/></svg>`;
const ICON_CALENDAR = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="18" height="18" fill="none" aria-hidden="true"><path fill="currentColor" d="M10 6h8V4h1v2h1.5A2.5 2.5 0 0 1 23 8.5v11a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 5 19.5v-11A2.5 2.5 0 0 1 7.5 6H9V4h1zM6 19.5A1.5 1.5 0 0 0 7.5 21h13a1.5 1.5 0 0 0 1.5-1.5V11H6zM7.5 7A1.5 1.5 0 0 0 6 8.5V10h16V8.5A1.5 1.5 0 0 0 20.5 7H19v1h-1V7h-8v1H9V7z"/></svg>`;
const ICON_CHEV = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="m16.47 7.47 1.06 1.06L12.06 14l5.47 5.47-1.06 1.06L9.94 14l6.53-6.53Z"/></svg>`;

/** @param {Date} d */
function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** @param {string} iso */
function parseIsoDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** @param {string} iso */
function dayStartSec(iso) {
  return Math.floor(parseIsoDate(iso).getTime() / 1000);
}

/** @param {string} iso */
function dayEndSec(iso) {
  const d = parseIsoDate(iso);
  d.setHours(23, 59, 59, 999);
  return Math.floor(d.getTime() / 1000);
}

/** @returns {{ from: string, to: string }} */
function defaultCustomDates() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 90);
  return { from: isoDate(from), to: isoDate(to) };
}

/**
 * @param {object} [opts]
 * @param {(range: { id: string, from: number, to: number, fromDate: string, toDate: string }) => void} [opts.onApply]
 */
export function createBacktestCustomDateDialog(opts = {}) {
  const { onApply } = opts;
  const root = document.createElement("div");
  root.className = "tv-strategy-custom-dates";
  root.hidden = true;
  root.innerHTML = `<div class="tv-strategy-custom-dates__backdrop" data-custom-close></div>
    <div class="tv-strategy-custom-dates__dialog" role="dialog" aria-modal="true" aria-labelledby="tv-strategy-custom-dates-title" data-name="custom-date-range-dialog">
      <header class="tv-strategy-custom-dates__header">
        <h2 id="tv-strategy-custom-dates-title" class="tv-strategy-custom-dates__title">Backtesting dates</h2>
        <button type="button" class="tv-strategy-custom-dates__close" data-custom-close aria-label="Close">${ICON_CLOSE}</button>
      </header>
      <div class="tv-strategy-custom-dates__body">
        <div class="tv-strategy-custom-dates__inputs">
          <label class="tv-strategy-custom-dates__field">
            <span class="tv-strategy-custom-dates__field-icon">${ICON_CALENDAR}</span>
            <input type="date" class="tv-strategy-custom-dates__input" data-custom-from />
          </label>
          <label class="tv-strategy-custom-dates__field">
            <span class="tv-strategy-custom-dates__field-icon">${ICON_CALENDAR}</span>
            <input type="date" class="tv-strategy-custom-dates__input" data-custom-to />
          </label>
        </div>
        <div class="tv-strategy-custom-dates__calendar" data-custom-calendar></div>
      </div>
      <footer class="tv-strategy-custom-dates__footer">
        <button type="button" class="tv-strategy-custom-dates__btn tv-strategy-custom-dates__btn--ghost" data-custom-cancel>Cancel</button>
        <button type="button" class="tv-strategy-custom-dates__btn tv-strategy-custom-dates__btn--primary" data-custom-submit>Select</button>
      </footer>
    </div>`;
  document.body.appendChild(root);

  const fromInput = root.querySelector("[data-custom-from]");
  const toInput = root.querySelector("[data-custom-to]");
  const calendarEl = root.querySelector("[data-custom-calendar]");
  const submitBtn = root.querySelector("[data-custom-submit]");

  let fromDate = defaultCustomDates().from;
  let toDate = defaultCustomDates().to;
  /** @type {Date} */
  let viewMonth = parseIsoDate(toDate);
  /** @type {"start" | "end"} */
  let pickPhase = "start";

  function syncInputs() {
    if (fromInput instanceof HTMLInputElement) fromInput.value = fromDate;
    if (toInput instanceof HTMLInputElement) toInput.value = toDate;
    syncSubmit();
  }

  function syncSubmit() {
    if (!(submitBtn instanceof HTMLButtonElement)) return;
    const ok = fromDate && toDate && dayStartSec(fromDate) <= dayEndSec(toDate);
    submitBtn.disabled = !ok;
  }

  /** @param {string} iso */
  function inRange(iso) {
    if (!fromDate || !toDate) return false;
    const t = dayStartSec(iso);
    return t >= dayStartSec(fromDate) && t <= dayEndSec(toDate);
  }

  function renderCalendar() {
    if (!(calendarEl instanceof HTMLElement)) return;
    const y = viewMonth.getFullYear();
    const m = viewMonth.getMonth();
    const monthLabel = viewMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    const first = new Date(y, m, 1);
    const startPad = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    let cells = "";
    for (let i = 0; i < startPad; i++) {
      cells += `<span class="tv-strategy-custom-dates__day tv-strategy-custom-dates__day--empty"></span>`;
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = isoDate(new Date(y, m, day));
      const selected = iso === fromDate || iso === toDate;
      const inSel = inRange(iso);
      cells += `<button type="button" class="tv-strategy-custom-dates__day${selected ? " is-edge" : ""}${inSel ? " is-in-range" : ""}" data-custom-day="${iso}">${day}</button>`;
    }

    calendarEl.innerHTML = `<div class="tv-strategy-custom-dates__cal-head">
        <button type="button" class="tv-strategy-custom-dates__cal-nav" data-custom-prev aria-label="Previous month">${ICON_CHEV}</button>
        <span class="tv-strategy-custom-dates__cal-title">${monthLabel}</span>
        <button type="button" class="tv-strategy-custom-dates__cal-nav tv-strategy-custom-dates__cal-nav--next" data-custom-next aria-label="Next month">${ICON_CHEV}</button>
      </div>
      <div class="tv-strategy-custom-dates__cal-weekdays" aria-hidden="true">
        <span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span><span>Su</span>
      </div>
      <div class="tv-strategy-custom-dates__cal-grid">${cells}</div>`;
  }

  function close() {
    root.hidden = true;
  }

  /**
   * @param {object} [seed]
   * @param {string} [seed.fromDate]
   * @param {string} [seed.toDate]
   */
  function open(seed = {}) {
    const defaults = defaultCustomDates();
    fromDate = seed.fromDate ?? defaults.from;
    toDate = seed.toDate ?? defaults.to;
    if (dayStartSec(fromDate) > dayEndSec(toDate)) {
      const tmp = fromDate;
      fromDate = toDate;
      toDate = tmp;
    }
    viewMonth = parseIsoDate(toDate);
    pickPhase = "start";
    syncInputs();
    renderCalendar();
    root.hidden = false;
    fromInput?.focus();
  }

  function apply() {
    if (!fromDate || !toDate) return;
    let from = fromDate;
    let to = toDate;
    if (dayStartSec(from) > dayEndSec(to)) {
      const tmp = from;
      from = to;
      to = tmp;
    }
    onApply?.({
      id: "custom",
      from: dayStartSec(from),
      to: dayEndSec(to),
      fromDate: from,
      toDate: to,
    });
    close();
  }

  root.addEventListener("click", (ev) => {
    const target = ev.target;
    if (!(target instanceof Element)) return;
    if (target.closest("[data-custom-close]") || target.closest("[data-custom-cancel]")) {
      close();
      return;
    }
    if (target.closest("[data-custom-submit]")) {
      apply();
      return;
    }
    if (target.closest("[data-custom-prev]")) {
      viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1);
      renderCalendar();
      return;
    }
    if (target.closest("[data-custom-next]")) {
      viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1);
      renderCalendar();
      return;
    }
    const dayBtn = target.closest("[data-custom-day]");
    if (dayBtn instanceof HTMLElement && dayBtn.dataset.customDay) {
      const iso = dayBtn.dataset.customDay;
      if (pickPhase === "start") {
        fromDate = iso;
        toDate = iso;
        pickPhase = "end";
      } else {
        toDate = iso;
        if (dayStartSec(fromDate) > dayEndSec(toDate)) {
          const tmp = fromDate;
          fromDate = toDate;
          toDate = tmp;
        }
        pickPhase = "start";
      }
      syncInputs();
      renderCalendar();
    }
  });

  fromInput?.addEventListener("change", () => {
    if (fromInput instanceof HTMLInputElement && fromInput.value) {
      fromDate = fromInput.value;
      if (dayStartSec(fromDate) > dayEndSec(toDate)) toDate = fromDate;
      syncInputs();
      renderCalendar();
    }
  });

  toInput?.addEventListener("change", () => {
    if (toInput instanceof HTMLInputElement && toInput.value) {
      toDate = toInput.value;
      if (dayStartSec(fromDate) > dayEndSec(toDate)) fromDate = toDate;
      syncInputs();
      renderCalendar();
    }
  });

  return { open, close, isOpen: () => !root.hidden };
}

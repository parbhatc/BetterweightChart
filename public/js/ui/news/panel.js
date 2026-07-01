import { etParts } from "../../core/etTime.js";
import {
  enabledNewsTypeIds,
  eventMatchesId,
  eventTitle,
  PPI_COLOR,
  CPI_COLOR,
  FOMC_COLOR,
} from "../../news/events.js";

const MOBILE_NEWS_MQ = "(max-width: 768px)";
const ICON_CLOSE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width="18" height="18" aria-hidden="true"><path stroke="currentColor" stroke-width="1.2" fill="none" d="m1.5 1.5 15 15m0-15-15 15"/></svg>`;

function isMobileNewsViewport() {
  return typeof window !== "undefined" && window.matchMedia(MOBILE_NEWS_MQ).matches;
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.anchor
 * @param {HTMLElement} [opts.anchorRoot]
 * @param {() => string} opts.getChartDayYmd
 * @param {() => Record<string, { events?: object[] }>} opts.getNewsByDay
 * @param {import("../../news/settings.js").ReturnType<typeof import("../../news/settings.js").createNewsSettings>} opts.newsStore
 */
export function createNewsPanel(opts) {
  const { anchor, anchorRoot, getChartDayYmd, getNewsByDay, newsStore } = opts;
  const dismissRoot = anchorRoot ?? anchor;

  const shell = document.createElement("div");
  shell.className = "tv-news-shell";
  shell.hidden = true;

  const backdrop = document.createElement("div");
  backdrop.className = "tv-news-shell__backdrop";
  backdrop.setAttribute("aria-hidden", "true");

  const panel = document.createElement("div");
  panel.className = "tv-news-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "News calendar");
  panel.setAttribute("aria-modal", "true");

  shell.append(backdrop, panel);
  document.body.appendChild(shell);

  let open = false;

  function positionPanel() {
    if (isMobileNewsViewport()) {
      panel.style.left = "";
      panel.style.top = "";
      panel.style.visibility = "";
      return;
    }
    const rect = anchor.getBoundingClientRect();
    const pad = 8;
    panel.style.visibility = "hidden";
    void panel.offsetHeight;
    const w = panel.offsetWidth;
    const h = panel.offsetHeight;
    let left = rect.right - w;
    let top = rect.top - h - 6;
    if (left < pad) left = pad;
    if (left + w > window.innerWidth - pad) left = window.innerWidth - w - pad;
    if (top < pad) top = rect.bottom + 6;
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.visibility = "";
  }

  function formatDayLabel(ymd) {
    if (!ymd) return "";
    const [y, m, d] = ymd.split("-").map(Number);
    if (!y || !m || !d) return ymd;
    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    return dt.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  /** @param {unknown} impact */
  function impactClass(impact) {
    const v = String(impact ?? "").toLowerCase();
    if (v.includes("high")) return "high";
    if (v.includes("medium") || v.includes("moderate")) return "medium";
    return "low";
  }

  /** @param {object} ev @param {import("../../news/settings.js").NewsSettings} settings */
  function passesDisplayFilters(ev, settings) {
    const impacts = settings.displayImpacts ?? [];
    const currencies = settings.displayCurrencies ?? [];
    const impact = impactClass(ev.impact ?? ev.importance);
    if (impacts.length && !impacts.includes(impact)) return false;
    if (!currencies.length) return true;
    const cur = String(ev.currency ?? ev.country ?? "")
      .trim()
      .toUpperCase();
    return Boolean(cur && currencies.includes(cur));
  }

  /** @param {object[]} events */
  function collectCurrencies(events) {
    const set = new Set();
    for (const ev of events) {
      const cur = String(ev.currency ?? ev.country ?? "")
        .trim()
        .toUpperCase();
      if (cur) set.add(cur);
    }
    return [...set].sort();
  }

  /** @param {string} ymd @param {object[]} events @param {import("../../news/settings.js").NewsSettings} settings */
  function renderFilters(ymd, events, settings) {
    const filtersEl = panel.querySelector("[data-news-filters]");
    if (!(filtersEl instanceof HTMLElement)) return;

    const currencies = collectCurrencies(events);
    const selectedCurrencies = settings.displayCurrencies ?? [];
    const selectedImpacts = settings.displayImpacts ?? [];

    const impactHtml = ["high", "medium", "low"]
      .map((impact) => {
        const active = selectedImpacts.includes(impact);
        const label = impact === "medium" ? "Med" : impact.charAt(0).toUpperCase() + impact.slice(1);
        return `<button type="button" class="tv-news-filter-chip tv-news-filter-chip--impact tv-news-filter-chip--${impact}${active ? " is-active" : ""}" data-impact="${impact}" aria-pressed="${active}">${label}</button>`;
      })
      .join("");

    const currencyHtml = currencies.length
      ? currencies
          .map((cur) => {
            const active = selectedCurrencies.includes(cur);
            return `<button type="button" class="tv-news-filter-chip tv-news-filter-chip--currency${active ? " is-active" : ""}" data-currency="${escapeHtml(cur)}" aria-pressed="${active}">${escapeHtml(cur)}</button>`;
          })
          .join("")
      : `<span class="tv-news-panel__filter-empty">No currencies for this day</span>`;

    const impactClear =
      selectedImpacts.length > 0
        ? `<button type="button" class="tv-news-filter-clear" data-clear-impacts>Clear</button>`
        : "";
    const currencyClear =
      selectedCurrencies.length > 0
        ? `<button type="button" class="tv-news-filter-clear" data-clear-currencies>Clear</button>`
        : "";

    filtersEl.innerHTML = `
      <div class="tv-news-panel__filter-row">
        <div class="tv-news-panel__filter-head">
          <span class="tv-news-panel__filter-label">Impact</span>
          ${impactClear}
        </div>
        <div class="tv-news-panel__filter-chips" data-impact-filters role="group" aria-label="Impact filters">${impactHtml}</div>
      </div>
      <div class="tv-news-panel__filter-row">
        <div class="tv-news-panel__filter-head">
          <span class="tv-news-panel__filter-label">Currency</span>
          ${currencyClear}
        </div>
        <div class="tv-news-panel__filter-chips tv-news-panel__filter-chips--scroll" data-currency-filters role="group" aria-label="Currency filters">${currencyHtml}</div>
      </div>
      <p class="tv-news-panel__filter-hint">Tap multiple chips to combine filters. None selected = show all.</p>`;
  }

  function renderEventsList(ymd, settings) {
    const body = panel.querySelector("[data-news-events-body]");
    if (!(body instanceof HTMLElement)) return;

    if (!settings.enabled) {
      body.innerHTML = `<div class="tv-news-list__empty">News is disabled. Enable it below to show calendar events and release levels.</div>`;
      return;
    }

    const payload = getNewsByDay()[ymd];
    const typeIds = enabledNewsTypeIds(settings.eventTypes ?? []);
    const allEvents = payload?.events ?? [];
    const events = allEvents.filter((ev) => passesDisplayFilters(ev, settings));

    renderFilters(ymd, allEvents, settings);

    if (!allEvents.length) {
      body.innerHTML = `<div class="tv-news-list__empty">No news events for ${formatDayLabel(ymd)}.</div>`;
      return;
    }

    if (!events.length) {
      body.innerHTML = `<div class="tv-news-list__empty">No events match the current filters.</div>`;
      return;
    }

    const kinds = [
      { id: "ppi", label: "PPI", color: PPI_COLOR },
      { id: "cpi", label: "CPI", color: CPI_COLOR },
      { id: "fomc", label: "FOMC", color: FOMC_COLOR },
    ];

    const buckets = new Map([
      ["ppi", []],
      ["cpi", []],
      ["fomc", []],
      ["other", []],
    ]);

    for (const ev of events) {
      const titleKey = eventTitle(ev);
      const kind = kinds.find((k) => eventMatchesId(k.id, titleKey))?.id ?? "other";
      buckets.get(kind)?.push(ev);
    }

    const folderHtml = [];
    for (const kind of kinds) {
      const list = buckets.get(kind.id) ?? [];
      if (!list.length) continue;
      const enabled = typeIds.includes(kind.id);
      const muted = !enabled;
      folderHtml.push(`
        <div class="tv-news-folder${enabled ? "" : " is-disabled"}" style="--folder-color:${kind.color}">
          <div class="tv-news-folder__head">
            <div class="tv-news-folder__left">
              <span class="tv-news-folder__dot"></span>
              <span class="tv-news-folder__title">${kind.label}</span>
            </div>
            <span class="tv-news-folder__meta">${list.length} events</span>
          </div>
          <div class="tv-news-folder__body">
            <ul class="tv-news-list">
              ${list
                .map((ev) => {
                  const title = ev.title ?? ev.event ?? ev.name ?? "Event";
                  const time = ev.timeLabel ?? ev.hmEt ?? "";
                  const impact = impactClass(ev.impact ?? ev.importance);
                  const detail = ev.currency ?? ev.country ?? "";
                  const match = enabled && true;
                  return `<li class="tv-news-list__item tv-news-list__item--${impact}${
                    muted ? " tv-news-list__item--muted" : ""
                  }">
                    <div>
                      <span class="tv-news-list__time">${escapeHtml(time)}</span>
                      <span class="tv-news-list__impact tv-news-list__impact--${impact}">${impact}</span>
                    </div>
                    <div class="tv-news-list__main">
                      <span class="tv-news-list__label">${
                        match ? "<strong>★</strong> " : ""
                      }${escapeHtml(title)}</span>
                    </div>
                    ${detail ? `<span class="tv-news-list__detail tv-news-list__detail--right">${escapeHtml(detail)}</span>` : ""}
                  </li>`;
                })
                .join("")}
            </ul>
          </div>
        </div>
      `);
    }

    const other = buckets.get("other") ?? [];
    if (other.length) {
      folderHtml.push(`
        <div class="tv-news-folder" style="--folder-color:#787b86">
          <div class="tv-news-folder__head">
            <div class="tv-news-folder__left">
              <span class="tv-news-folder__dot"></span>
              <span class="tv-news-folder__title">Other</span>
            </div>
            <span class="tv-news-folder__meta">${other.length} events</span>
          </div>
          <div class="tv-news-folder__body">
            <ul class="tv-news-list">
              ${other
                .map((ev) => {
                  const title = ev.title ?? ev.event ?? ev.name ?? "Event";
                  const time = ev.timeLabel ?? ev.hmEt ?? "";
                  const impact = impactClass(ev.impact ?? ev.importance);
                  const detail = ev.currency ?? ev.country ?? "";
                  return `<li class="tv-news-list__item tv-news-list__item--${impact} tv-news-list__item--muted">
                    <div>
                      <span class="tv-news-list__time">${escapeHtml(time)}</span>
                      <span class="tv-news-list__impact tv-news-list__impact--${impact}">${impact}</span>
                    </div>
                    <div class="tv-news-list__main">
                      <span class="tv-news-list__label">${escapeHtml(title)}</span>
                    </div>
                    ${detail ? `<span class="tv-news-list__detail tv-news-list__detail--right">${escapeHtml(detail)}</span>` : ""}
                  </li>`;
                })
                .join("")}
            </ul>
          </div>
        </div>
      `);
    }

    body.innerHTML = `<div class="tv-news-folders">${folderHtml.join("")}</div>`;
  }

  function render() {
    const settings = newsStore.get();
    const ymd = getChartDayYmd();
    const dayEl = panel.querySelector("[data-news-day]");
    if (dayEl) dayEl.textContent = formatDayLabel(ymd);
    renderEventsList(ymd, settings);
  }

  panel.innerHTML = `
    <div class="tv-news-panel__head">
      <div class="tv-news-panel__head-main">
        <div class="tv-news-panel__title">News</div>
        <div class="tv-news-panel__day" data-news-day></div>
      </div>
      <button type="button" class="tv-news-panel__close" data-news-close aria-label="Close news">${ICON_CLOSE}</button>
    </div>
    <div class="tv-news-panel__filters" data-news-filters></div>
    <div class="tv-news-panel__body" data-news-events-body></div>`;

  panel.addEventListener("click", (ev) => {
    const closeBtn = ev.target instanceof Element ? ev.target.closest("[data-news-close]") : null;
    if (closeBtn) {
      ev.preventDefault();
      closePanel();
      anchor.focus?.();
      return;
    }

    const impactBtn = ev.target instanceof Element ? ev.target.closest("[data-impact]") : null;
    if (impactBtn instanceof HTMLButtonElement) {
      ev.preventDefault();
      const impact = impactBtn.dataset.impact;
      if (!impact) return;
      const settings = newsStore.get();
      const selected = new Set(settings.displayImpacts ?? []);
      if (selected.has(impact)) selected.delete(impact);
      else selected.add(impact);
      newsStore.update({ displayImpacts: [...selected] });
      return;
    }

    const currencyBtn = ev.target instanceof Element ? ev.target.closest("[data-currency]") : null;
    if (currencyBtn instanceof HTMLButtonElement) {
      ev.preventDefault();
      const cur = currencyBtn.dataset.currency ?? "";
      if (!cur) return;
      const settings = newsStore.get();
      const selected = new Set(settings.displayCurrencies ?? []);
      if (selected.has(cur)) selected.delete(cur);
      else selected.add(cur);
      newsStore.update({ displayCurrencies: [...selected] });
      return;
    }

    const clearImpacts = ev.target instanceof Element ? ev.target.closest("[data-clear-impacts]") : null;
    if (clearImpacts) {
      ev.preventDefault();
      newsStore.update({ displayImpacts: [] });
      return;
    }

    const clearCurrencies = ev.target instanceof Element ? ev.target.closest("[data-clear-currencies]") : null;
    if (clearCurrencies) {
      ev.preventDefault();
      newsStore.update({ displayCurrencies: [] });
    }
  });

  newsStore.onChange(() => {
    if (open) render();
  });

  function syncShellLayout() {
    shell.classList.toggle("tv-news-shell--mobile", isMobileNewsViewport());
  }

  function openPanel() {
    open = true;
    shell.hidden = false;
    syncShellLayout();
    document.body.classList.toggle("tv-news-shell-open", isMobileNewsViewport());
    anchor.setAttribute("aria-expanded", "true");
    render();
    positionPanel();
  }

  function closePanel() {
    open = false;
    shell.hidden = true;
    document.body.classList.remove("tv-news-shell-open");
    anchor.setAttribute("aria-expanded", "false");
  }

  function onOutsidePointer(ev) {
    if (!open) return;
    const t = ev.target;
    if (!(t instanceof Node)) return;
    if (panel.contains(t) || dismissRoot.contains(t)) return;
    closePanel();
  }

  document.addEventListener("pointerdown", onOutsidePointer, true);

  backdrop.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    closePanel();
    anchor.focus?.();
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && open) {
      ev.preventDefault();
      closePanel();
      anchor.focus?.();
    }
  });

  window.addEventListener("resize", () => {
    if (!open) return;
    syncShellLayout();
    document.body.classList.toggle("tv-news-shell-open", isMobileNewsViewport());
    positionPanel();
  });

  return {
    open: openPanel,
    close: closePanel,
    toggle() {
      if (open) closePanel();
      else openPanel();
    },
    isOpen: () => open,
    refresh: render,
  };
}

/** @param {string} s */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function chartDayFromPane(pane, replayState) {
  if (replayState?.active === true) {
    const idx = pane?.replayCursorEndIndex;
    const fromIdx = Number.isFinite(idx) && idx >= 0 ? pane?.bars?.[idx]?.time : null;
    if (fromIdx != null && Number.isFinite(fromIdx)) {
      return etParts(Number(fromIdx)).ymd;
    }
  }

  const replayUtc =
    replayState?.active === true
      ? (replayState.currentBarTime ?? replayState.selectedBarTime)
      : null;
  if (replayUtc != null && Number.isFinite(replayUtc)) {
    return etParts(Number(replayUtc)).ymd;
  }
  const bars = pane?.bars ?? [];
  const last = bars.at(-1);
  if (last?.time != null) return etParts(last.time).ymd;
  return etParts(Math.floor(Date.now() / 1000)).ymd;
}

import { etParts } from "../../core/etTime.js";
import {
  enabledNewsTypeIds,
  eventMatchesId,
  eventTitle,
  PPI_COLOR,
  CPI_COLOR,
  FOMC_COLOR,
} from "../../news/events.js";

/**
 * @param {object} opts
 * @param {HTMLElement} opts.anchor
 * @param {() => string} opts.getChartDayYmd
 * @param {() => Record<string, { events?: object[] }>} opts.getNewsByDay
 * @param {import("../../news/settings.js").ReturnType<typeof import("../../news/settings.js").createNewsSettings>} opts.newsStore
 */
export function createNewsPanel(opts) {
  const { anchor, getChartDayYmd, getNewsByDay, newsStore } = opts;

  const panel = document.createElement("div");
  panel.className = "tv-news-panel";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "News calendar");
  document.body.appendChild(panel);

  let open = false;

  function positionPanel() {
    const rect = anchor.getBoundingClientRect();
    const pad = 8;
    panel.style.visibility = "hidden";
    panel.hidden = false;
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

  function impactClass(impact) {
    const v = String(impact ?? "").toLowerCase();
    if (v.includes("high")) return "high";
    if (v.includes("medium") || v.includes("moderate")) return "medium";
    return "low";
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
    const events = payload?.events ?? [];

    if (!events.length) {
      body.innerHTML = `<div class="tv-news-list__empty">No news events for ${formatDayLabel(ymd)}.</div>`;
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
      const kind =
        kinds.find((k) => eventMatchesId(k.id, titleKey))?.id ?? "other";
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
      <div>
        <div class="tv-news-panel__title">News</div>
        <div class="tv-news-panel__day" data-news-day></div>
      </div>
    </div>
    <div class="tv-news-panel__body" data-news-events-body></div>`;

  newsStore.onChange(() => {
    if (open) render();
  });

  function openPanel() {
    open = true;
    panel.hidden = false;
    anchor.setAttribute("aria-expanded", "true");
    render();
    positionPanel();
  }

  function closePanel() {
    open = false;
    panel.hidden = true;
    anchor.setAttribute("aria-expanded", "false");
  }

  document.addEventListener(
    "click",
    (ev) => {
      if (!open) return;
      const t = ev.target;
      if (!(t instanceof Node)) return;
      if (panel.contains(t) || anchor.contains(t)) return;
      closePanel();
    },
    true,
  );

  window.addEventListener("resize", () => {
    if (open) positionPanel();
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
  // In replay, prefer pane cursor index time because replay state times can lag
  // after history prepends while index stays accurate.
  if (replayState?.active === true) {
    const idx = pane?.replayCursorEndIndex;
    const fromIdx =
      Number.isFinite(idx) && idx >= 0
        ? pane?.bars?.[idx]?.time
        : null;
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

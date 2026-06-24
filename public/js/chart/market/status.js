import { symbolDelayFromInfo } from "../../datafeed/symbolDelay.js";

const EXCHANGES = {
  CME: { full: "Chicago Mercantile Exchange Globex", tz: "America/Chicago", city: "Chicago" },
  CBOT: { full: "Chicago Board of Trade", tz: "America/Chicago", city: "Chicago" },
  NYMEX: { full: "New York Mercantile Exchange", tz: "America/New_York", city: "New York" },
  COMEX: { full: "COMEX", tz: "America/New_York", city: "New York" },
  NASDAQ: { full: "NASDAQ", tz: "America/New_York", city: "New York" },
  ARCA: { full: "NYSE Arca", tz: "America/New_York", city: "New York" },
  FOREX: { full: "Forex", tz: "America/New_York", city: "New York" },
  CRYPTO: { full: "Crypto", tz: "Etc/UTC", city: "UTC" },
};

const ICON_MARKET_OPEN = `<svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M9 5a4 4 0 1 1 0 8 4 4 0 0 1 0-8"></path></svg>`;
const ICON_MARKET_CLOSED = `<svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M9 5a4 4 0 1 1 0 8 4 4 0 0 1 0-8" opacity="0.45"></path></svg>`;
const ICON_DELAYED = `<svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M9.17 4.55q1.26 0 2.14.5.9.49 1.36 1.42.48.94.48 2.26v.01q0 1.36-.47 2.31a3.3 3.3 0 0 1-1.36 1.46q-.88.5-2.15.5H6V4.54zm-1.66 7.18h1.46q.84 0 1.43-.34.6-.35.9-1.01t.3-1.61v-.01q0-.93-.3-1.59-.33-.66-.91-1-.6-.35-1.42-.35H7.51z"></path></svg>`;

/** @param {string} tz @param {number} [nowMs] */
function zonedParts(tz, nowMs = Date.now()) {
  const d = new Date(nowMs);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? "";
  const hour = Number(get("hour") === "24" ? 0 : get("hour"));
  const minute = Number(get("minute"));
  const weekday = get("weekday");
  const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    weekday,
    day: dayMap[weekday] ?? 0,
    mins: hour * 60 + minute,
    hour,
    minute,
  };
}

/** @param {number} mins */
function fmtDuration(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const parts = [];
  if (h) parts.push(`${h} hour${h === 1 ? "" : "s"}`);
  if (m) parts.push(`${m} minute${m === 1 ? "" : "s"}`);
  return parts.join(" and ") || "less than a minute";
}

/** @param {number} startMin @param {number} endMin */
function segmentPct(startMin, endMin) {
  const left = (startMin / 1440) * 100;
  const width = ((endMin - startMin) / 1440) * 100;
  return { left, width };
}

/** @param {string} tz @param {string} city @param {number} [nowMs] */
function exchangeTzLabel(tz, city, nowMs = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "shortOffset",
  }).formatToParts(new Date(nowMs));
  const off = parts.find((p) => p.type === "timeZoneName")?.value?.replace("GMT", "UTC") ?? "UTC";
  return `Exchange timezone: ${city} (${off})`;
}

/**
 * @param {object} [symbolInfo]
 * @param {number} [nowMs]
 */
export function getMarketStatusDetails(symbolInfo, nowMs = Date.now()) {
  const type = symbolInfo?.type ?? "stock";
  const exchange = symbolInfo?.exchange ?? "NASDAQ";
  const ex = EXCHANGES[exchange] ?? EXCHANGES.NASDAQ;
  const tz = ex.tz;
  const z = zonedParts(tz, nowMs);
  const { delayed, delayMinutes } = symbolDelayFromInfo(symbolInfo);

  /** @type {{ type: "open"|"closed", left: number, width: number, label: string, time: string }[]} */
  let segments = [];
  let open = false;
  let title = "Market closed";
  let subtitle = "Market is closed.";
  let detail = "";
  let markLeft = (z.mins / 1440) * 100;
  let timeMark = null;

  if (type === "crypto") {
    open = true;
    title = "Market open";
    subtitle = "All's well — market is open.";
    detail = "Crypto markets trade 24/7.";
    segments = [{ type: "open", left: 0, width: 100, label: "Market open", time: "24/7" }];
  } else if (type === "forex") {
    const friClose = z.day === 5 && z.mins >= 17 * 60;
    const sat = z.day === 6;
    const sunBefore = z.day === 0 && z.mins < 17 * 60;
    open = !friClose && !sat && !sunBefore;
    title = open ? "Market open" : "Market closed";
    subtitle = open ? "All's well — market is open." : "Market is closed.";
    if (z.day === 0) {
      segments = [
        { type: "closed", ...segmentPct(0, 17 * 60), label: "Market closed", time: "Fri 17:00 — Sun 17:00" },
        { type: "open", ...segmentPct(17 * 60, 1440), label: "Market open", time: "17:00 — 16:00" },
      ];
      timeMark = { left: segmentPct(0, 17 * 60).left + segmentPct(0, 17 * 60).width, label: "17:00" };
      if (open) {
        const left = 1440 - z.mins;
        detail = `It'll close in ${fmtDuration(left)}.`;
      } else {
        detail = `It'll open in ${fmtDuration(17 * 60 - z.mins)}.`;
      }
    } else if (z.day === 5) {
      segments = [
        { type: "open", ...segmentPct(0, 17 * 60), label: "Market open", time: "17:00 — 17:00" },
        { type: "closed", ...segmentPct(17 * 60, 1440), label: "Market closed", time: "Fri 17:00 — Sun 17:00" },
      ];
      timeMark = { left: segmentPct(0, 17 * 60).width, label: "17:00" };
      detail = open ? `It'll close in ${fmtDuration(17 * 60 - z.mins)}.` : `It'll open in ${fmtDuration(1440 - z.mins + 17 * 60)}.`;
    } else if (z.day === 6) {
      segments = [{ type: "closed", left: 0, width: 100, label: "Market closed", time: "Fri 17:00 — Sun 17:00" }];
      detail = `It'll open in ${fmtDuration(1440 - z.mins + 17 * 60)}.`;
    } else {
      segments = [{ type: "open", left: 0, width: 100, label: "Market open", time: "17:00 — 17:00" }];
      if (z.day === 4) detail = `It'll close in ${fmtDuration(1440 - z.mins + 17 * 60)}.`;
      else detail = "Forex session is active.";
    }
  } else if (type === "futures") {
    const breakStart = 16 * 60;
    const breakEnd = 17 * 60;
    if (z.day === 6) {
      open = false;
      segments = [{ type: "closed", left: 0, width: 100, label: "Market closed", time: "Fri 16:00 — Sun 17:00" }];
      detail = `It'll open in ${fmtDuration(1440 - z.mins + 17 * 60)}.`;
    } else if (z.day === 0) {
      open = z.mins >= breakEnd;
      segments = [
        { type: "closed", ...segmentPct(0, breakEnd), label: "Market closed", time: "Fri 16:00 — Sun 17:00" },
        { type: "open", ...segmentPct(breakEnd, 1440), label: "Market open", time: "17:00 — 16:00" },
      ];
      timeMark = { left: segmentPct(0, breakEnd).width, label: "17:00" };
      detail = open ? `It'll close in ${fmtDuration(1440 - z.mins + 16 * 60)}.` : `It'll open in ${fmtDuration(breakEnd - z.mins)}.`;
    } else if (z.day === 5) {
      open = z.mins < breakStart;
      segments = [
        { type: "open", ...segmentPct(0, breakStart), label: "Market open", time: "17:00 — 16:00" },
        { type: "closed", ...segmentPct(breakStart, 1440), label: "Market closed", time: "Fri 16:00 — Sun 17:00" },
      ];
      timeMark = { left: segmentPct(0, breakStart).width, label: "16:00" };
      detail = open ? `It'll close in ${fmtDuration(breakStart - z.mins)}.` : `It'll open in ${fmtDuration(1440 - z.mins + 17 * 60)}.`;
    } else {
      open = z.mins < breakStart || z.mins >= breakEnd;
      segments = [
        { type: "open", ...segmentPct(0, breakStart), label: "Market open", time: "17:00 — 16:00" },
        { type: "closed", ...segmentPct(breakStart, breakEnd), label: "Market closed", time: "16:00 — 17:00" },
        { type: "open", ...segmentPct(breakEnd, 1440), label: "Market open", time: "17:00 — 16:00" },
      ];
      timeMark = { left: segmentPct(0, breakStart).width, label: "16:00" };
      detail = open
        ? z.mins < breakStart
          ? `It'll close in ${fmtDuration(breakStart - z.mins)}.`
          : `It'll close in ${fmtDuration(1440 - z.mins + 16 * 60)}.`
        : `It'll open in ${fmtDuration(breakEnd - z.mins)}.`;
    }
    title = open ? "Market open" : "Market closed";
    subtitle = open ? "All's well — market is open." : "Market is closed.";
  } else {
    const openStart = 9 * 60 + 30;
    const openEnd = 16 * 60;
    const isWeekend = z.day === 0 || z.day === 6;
    open = !isWeekend && z.mins >= openStart && z.mins < openEnd;
    title = open ? "Market open" : "Market closed";
    subtitle = open ? "All's well — market is open." : "Market is closed.";
    if (isWeekend) {
      segments = [{ type: "closed", left: 0, width: 100, label: "Market closed", time: "Fri 16:00 — Mon 09:30" }];
      const minsToMon = z.day === 0 ? 24 * 60 - z.mins + openStart : 24 * 60 - z.mins + openStart;
      detail = `It'll open in ${fmtDuration(minsToMon)}.`;
    } else {
      segments = [
        { type: "closed", ...segmentPct(0, openStart), label: "Market closed", time: "16:00 — 09:30" },
        { type: "open", ...segmentPct(openStart, openEnd), label: "Market open", time: "09:30 — 16:00" },
        { type: "closed", ...segmentPct(openEnd, 1440), label: "Market closed", time: "16:00 — 09:30" },
      ];
      timeMark = { left: segmentPct(0, openStart).width, label: "09:30" };
      if (open) detail = `It'll close in ${fmtDuration(openEnd - z.mins)}.`;
      else if (z.mins < openStart) detail = `It'll open in ${fmtDuration(openStart - z.mins)}.`;
      else detail = `It'll open in ${fmtDuration(1440 - z.mins + openStart)}.`;
    }
  }

  return {
    open,
    title,
    subtitle,
    detail,
    delayed,
    delayMinutes,
    exchange,
    exchangeFull: ex.full,
    timezone: tz,
    timezoneLabel: exchangeTzLabel(tz, ex.city, nowMs),
    weekDay: z.weekday,
    segments,
    nowPercent: markLeft,
    timeMark,
    symbol: symbolInfo?.ticker ?? symbolInfo?.name ?? "",
  };
}

/** @param {ReturnType<typeof getMarketStatusDetails>} s */
function renderSessionBar(s) {
  const segs = s.segments
    .map(
      (seg) =>
        `<div class="mkt-session__seg mkt-session__seg--${seg.type}" style="left:${seg.left}%;width:calc(${seg.width}% + 0px)" title="${seg.label} · ${seg.time}"></div>`,
    )
    .join("");
  const mark = s.timeMark
    ? `<div class="mkt-session__mark-row"><div class="mkt-session__mark" style="left:${s.timeMark.left}%">${s.timeMark.label}</div></div>`
    : "";
  return `<div class="mkt-session">
    <div class="mkt-session__day mkt-session__day--active">
      <div class="mkt-session__weekday">${s.weekDay}</div>
      <div class="mkt-session__track-wrap">
        <div class="mkt-session__track">${segs}</div>
        <div class="mkt-session__now" style="left:${s.nowPercent}%"></div>
      </div>
    </div>
    ${mark}
    <div class="mkt-session__tz">${s.timezoneLabel}</div>
  </div>`;
}

/** @param {ReturnType<typeof getMarketStatusDetails>} s */
function renderMarketWidget(s) {
  return `<div class="mkt-widget">
    <span class="mkt-widget__icon mkt-widget__icon--${s.open ? "open" : "closed"}">${s.open ? ICON_MARKET_OPEN : ICON_MARKET_CLOSED}</span>
    <div class="mkt-widget__body">
      <div class="mkt-widget__title mkt-widget__title--${s.open ? "open" : "closed"}">${s.title}</div>
      <p class="mkt-widget__text">
        <span class="mkt-widget__item">${s.subtitle}</span>
        ${s.detail ? `<span class="mkt-widget__item mkt-widget__item--bold">${s.detail}</span>` : ""}
      </p>
      ${renderSessionBar(s)}
    </div>
  </div>`;
}

/** @param {ReturnType<typeof getMarketStatusDetails>} s */
function renderDelayWidget(s) {
  if (!s.delayed) return "";
  return `<div class="mkt-widget">
    <span class="mkt-widget__icon mkt-widget__icon--delay">${ICON_DELAYED}</span>
    <div class="mkt-widget__body">
      <div class="mkt-widget__title mkt-widget__title--delay">Data is delayed</div>
      <p class="mkt-widget__text">
        <span class="mkt-widget__item">${s.symbol} data is delayed${s.delayMinutes > 0 ? ` by ${s.delayMinutes} minutes` : ""} because of exchange requirements.</span>
        <span class="mkt-widget__item">To get real-time data for <b>${s.exchangeFull}</b>, please buy the real-time data package.</span>
      </p>
    </div>
  </div>`;
}

/**
 * @param {ReturnType<typeof getMarketStatusDetails>} s
 * @param {"market"|"delay"|"all"} kind
 */
export function renderMarketStatusPopup(s, kind = "all") {
  const widgets = [];
  if (kind === "market" || kind === "all") widgets.push(renderMarketWidget(s));
  if ((kind === "delay" || kind === "all") && s.delayed) widgets.push(renderDelayWidget(s));
  return `<div class="mkt-popup__inner">${widgets.join("")}</div>`;
}

/**
 * Status pill for the legend (TradingView-style open dot + delayed "D").
 * @param {ReturnType<typeof getMarketStatusDetails>} s
 */
export function renderMarketStatusIcons(s) {
  const openCls = s.open ? "mkt-pill--open" : "mkt-pill--closed";
  const dotCls = s.open ? "mkt-pill__dot--open" : "mkt-pill__dot--closed";
  const delayBadge = s.delayed
    ? `<span class="mkt-pill__status mkt-pill__status--delay" aria-hidden="true">D</span>`
    : "";
  const popupKind = s.delayed ? "all" : "market";
  const title = s.delayed
    ? s.delayMinutes > 0
      ? `${s.title} · ${s.delayMinutes} min delayed`
      : `${s.title} · delayed`
    : s.title;

  return `<span class="mkt-pill-wrap">
    <button type="button" class="mkt-pill ${openCls}" data-mkt-popup="${popupKind}" aria-label="${title}" title="${title}">
      <span class="mkt-pill__status mkt-pill__status--market" aria-hidden="true"><span class="mkt-pill__dot ${dotCls}"></span></span>${delayBadge}
    </button>
  </span>`;
}

/**
 * @param {HTMLElement} hostEl
 * @param {() => { symbolInfo?: object }} getContext
 */
export function mountMarketStatusPopup(hostEl, getContext) {
  const popup = document.createElement("div");
  popup.className = "mkt-popup";
  popup.hidden = true;
  document.body.appendChild(popup);

  let anchor = null;

  function close() {
    popup.hidden = true;
    anchor = null;
  }

  function open(btn, kind) {
    const { symbolInfo } = getContext();
    const status = getMarketStatusDetails(symbolInfo);
    popup.innerHTML = renderMarketStatusPopup(status, kind);
    popup.hidden = false;
    anchor = btn;
    position();
  }

  function position() {
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const pad = 8;
    popup.style.left = `${rect.left}px`;
    popup.style.top = `${rect.bottom + 6}px`;
    const popRect = popup.getBoundingClientRect();
    let left = rect.left;
    let top = rect.bottom + 6;
    if (left + popRect.width > window.innerWidth - pad) left = window.innerWidth - popRect.width - pad;
    if (top + popRect.height > window.innerHeight - pad) top = rect.top - popRect.height - 6;
    popup.style.left = `${Math.max(pad, left)}px`;
    popup.style.top = `${Math.max(pad, top)}px`;
  }

  hostEl.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-mkt-popup]");
    if (!btn || !hostEl.contains(btn)) return;
    ev.stopPropagation();
    const kind = /** @type {"market"|"delay"|"all"} */ (btn.dataset.mktPopup || "market");
    if (!popup.hidden && anchor === btn) {
      close();
      return;
    }
    open(btn, kind);
  });

  function dismissUnlessInside(ev) {
    if (popup.hidden) return;
    if (popup.contains(ev.target) || ev.target.closest("[data-mkt-popup]")) return;
    close();
  }

  document.addEventListener("click", dismissUnlessInside);
  document.addEventListener("pointerdown", dismissUnlessInside, true);
  document.addEventListener("touchstart", dismissUnlessInside, { capture: true, passive: true });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") close();
  });
  window.addEventListener("resize", close);
  window.addEventListener("scroll", () => {
    if (popup.hidden) return;
    close();
  }, true);

  return { close };
}

import { backtestRangePresetLabel, backtestPeriodLabel } from "./backtestRange.js";
import { createBacktestRangeMenu } from "./rangeMenu.js";
import { dateTime12h, toDate } from "../chart/format.js";

const ICON_METRICS = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width="18" height="18" fill="none" aria-hidden="true"><path fill="currentColor" d="m16.001 7.05-4.81 4.887-4.308-3.835-3.81 3.899L2 10.95l4.81-4.92 4.312 3.838 3.81-3.87z"/></svg>`;
const ICON_TRADES = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width="18" height="18" fill="none" aria-hidden="true"><path fill="currentColor" d="M14.653 3.008A1.5 1.5 0 0 1 16 4.5v10l-.008.153a1.5 1.5 0 0 1-1.339 1.34L14.5 16h-11a1.5 1.5 0 0 1-1.492-1.347L2 14.5v-10A1.5 1.5 0 0 1 3.5 3h11zM3 14.5a.5.5 0 0 0 .5.5H6v-3H3zm4 .5h7.5a.5.5 0 0 0 .5-.5V12H7zm-4-4h3V8H3zm4 0h8V8H7zM3.5 4a.5.5 0 0 0-.5.5V7h3V4zM7 7h8V4.5a.5.5 0 0 0-.5-.5H7z"/></svg>`;
const ICON_CALENDAR = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="18" height="18" fill="none" aria-hidden="true"><path fill="currentColor" d="M10 6h8V4h1v2h1.5A2.5 2.5 0 0 1 23 8.5v11a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 5 19.5v-11A2.5 2.5 0 0 1 7.5 6H9V4h1zM6 19.5A1.5 1.5 0 0 0 7.5 21h13a1.5 1.5 0 0 0 1.5-1.5V11H6zM7.5 7A1.5 1.5 0 0 0 6 8.5V10h16V8.5A1.5 1.5 0 0 0 20.5 7H19v1h-1V7h-8v1H9V7z"/></svg>`;
const ICON_CHEVRON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M3.92 7.83 9 12.29l5.08-4.46-1-1.13L9 10.29l-4.09-3.6-.99 1.14Z"/></svg>`;
const ICON_FILTER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width="18" height="18" fill="none" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M3 4.5A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5v.37c0 .398-.158.78-.44 1.06l-3.56 3.56a1.5 1.5 0 0 0-.44 1.06v3.35a.75.75 0 0 1-1.28.53l-1.72-1.72a1.5 1.5 0 0 1-.44-1.06V10.5a1.5 1.5 0 0 0-.44-1.06L3.44 5.94A1.5 1.5 0 0 1 3 4.87z"/></svg>`;
const ICON_CLOSE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width="18" height="18" aria-hidden="true"><path stroke="currentColor" stroke-width="1.2" fill="none" d="m1.5 1.5 15 15m0-15-15 15"/></svg>`;

const REPORT_HEIGHT_KEY = "bwc-strategy-report-height";
const REPORT_MIN_HEIGHT = 160;
const REPORT_DEFAULT_HEIGHT = 320;

/** @returns {HTMLElement | null} */
function reportSlotEl(root) {
  const slot = root.parentElement;
  return slot?.classList.contains("tv-strategy-report-slot") ? slot : null;
}

/** @returns {number} */
function reportMaxHeight() {
  const stage = document.querySelector(".tv-stage");
  const cap = stage?.clientHeight ?? window.innerHeight;
  return Math.max(REPORT_MIN_HEIGHT, Math.floor(cap * 0.75));
}

/** @returns {number} */
function reportDefaultHeight() {
  return Math.min(Math.floor(window.innerHeight * 0.4), 380);
}

/**
 * @param {HTMLElement} root
 * @param {number} px
 */
function applyReportHeight(root, px) {
  const slot = reportSlotEl(root);
  const h = Math.min(reportMaxHeight(), Math.max(REPORT_MIN_HEIGHT, Math.round(px)));
  if (slot) slot.style.height = `${h}px`;
  return h;
}

/** @param {HTMLElement} root */
function readReportHeight(root) {
  const stored = Number(localStorage.getItem(REPORT_HEIGHT_KEY));
  if (Number.isFinite(stored)) return applyReportHeight(root, stored);
  return applyReportHeight(root, reportDefaultHeight() || REPORT_DEFAULT_HEIGHT);
}

/** @param {HTMLElement} root */
function wireReportResize(root) {
  const handle = root.querySelector("[data-report-resize]");
  if (!(handle instanceof HTMLElement)) return;

  readReportHeight(root);

  /** @type {number | null} */
  let startY = null;
  /** @type {number | null} */
  let startHeight = null;

  const onMove = (ev) => {
    if (startY == null || startHeight == null) return;
    const delta = startY - ev.clientY;
    applyReportHeight(root, startHeight + delta);
  };

  const onEnd = () => {
    if (startY == null) return;
    startY = null;
    startHeight = null;
    root.classList.remove("is-resizing");
    document.body.style.cursor = "";
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onEnd);
    document.removeEventListener("pointercancel", onEnd);
    const slot = reportSlotEl(root);
    if (slot) localStorage.setItem(REPORT_HEIGHT_KEY, String(slot.offsetHeight));
  };

  handle.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    const slot = reportSlotEl(root);
    if (!slot) return;
    startY = ev.clientY;
    startHeight = slot.offsetHeight;
    root.classList.add("is-resizing");
    document.body.style.cursor = "ns-resize";
    handle.setPointerCapture(ev.pointerId);
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onEnd);
    document.addEventListener("pointercancel", onEnd);
  });

  window.addEventListener("resize", () => {
    const slot = reportSlotEl(root);
    if (!slot || slot.hidden) return;
    applyReportHeight(root, slot.offsetHeight);
  });
}

/** @param {number} time */
function fmtTradeTime(time) {
  if (time == null || !Number.isFinite(time)) return "—";
  return dateTime12h(toDate(time));
}

/**
 * @param {number | null | undefined} time
 * @param {string} kind
 */
function tradeTimeButton(time, kind) {
  if (time == null || !Number.isFinite(time)) {
    return `<span class="tv-strategy-report__trade-missing">—</span>`;
  }
  const label = kind === "exit" ? "exit" : "entry";
  return `<button type="button" class="tv-strategy-report__trade-jump" data-trade-time="${time}" title="Go to ${label} bar">${fmtTradeTime(time)}</button>`;
}

/** @param {number} n @param {number} [digits] @param {boolean} [signed] */
function fmtMoney(n, digits = 2, signed = true) {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  if (!signed) return abs;
  if (n > 0) return `+${abs}`;
  if (n < 0) return `−${abs}`;
  return abs;
}

/** @param {number} n @param {boolean} [signed] */
function fmtPct(n, signed = true) {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n).toFixed(2);
  if (!signed) return `${abs}%`;
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${abs}%`;
}

/** @param {number} price */
function tradePriceLine(price) {
  return `<span class="tv-strategy-report__trade-price">${fmtMoney(price, 2, false)}</span>`;
}

/**
 * @param {object} opts
 * @param {HTMLElement} [opts.mountEl]
 * @param {(instanceId: string, range: import("./backtestRange.js").BacktestRange | string) => void} [opts.onRangeChange]
 * @param {(chartTime: number, paneIndex: number) => void} [opts.onGoToBarTime]
 */
export function createStrategyReportPanel(opts = {}) {
  const { onRangeChange, onGoToBarTime, onDismiss } = opts;
  const root = document.createElement("div");
  root.className = "tv-strategy-report";
  root.hidden = true;
  root.innerHTML = `<div class="tv-strategy-report__resize-handle" data-report-resize role="separator" aria-orientation="horizontal" aria-label="Resize strategy report"></div>
    <header class="tv-strategy-report__toolbar" data-qa-id="backtesting-report-toolbar">
      <div class="tv-strategy-report__toolbar-start">
        <div class="tv-strategy-report__icon-tabs" role="tablist" aria-label="Report views">
          <button type="button" class="tv-strategy-report__icon-tab is-selected" data-report-tab="metrics" role="tab" title="Metrics" aria-selected="true">${ICON_METRICS}</button>
          <button type="button" class="tv-strategy-report__icon-tab" data-report-tab="trades" role="tab" title="List of trades" aria-selected="false">${ICON_TRADES}</button>
        </div>
        <button type="button" class="tv-strategy-report__range-pill" data-range-menu aria-haspopup="true" aria-expanded="false">
          <span class="tv-strategy-report__range-icon">${ICON_CALENDAR}</span>
          <span class="tv-strategy-report__range-label" data-range-label>Chart range</span>
          <span class="tv-strategy-report__range-badge" data-range-badge>Deep</span>
          <span class="tv-strategy-report__range-chev">${ICON_CHEVRON}</span>
        </button>
      </div>
      <button type="button" class="tv-strategy-report__close" data-report-close aria-label="Close report">${ICON_CLOSE}</button>
    </header>
    <div class="tv-strategy-report__body">
      <div class="tv-strategy-report__panel" data-report-panel="metrics">
        <section class="tv-strategy-report__section">
          <div class="tv-strategy-report__metrics-head">
            <div>
              <h2 class="tv-strategy-report__section-title">Key stats</h2>
              <p class="tv-strategy-report__period" data-report-period></p>
            </div>
          </div>
          <div class="tv-strategy-report__stats-scroll">
            <div class="tv-strategy-report__stats" data-stats></div>
          </div>
        </section>
        <section class="tv-strategy-report__section tv-strategy-report__section--chart">
          <div class="tv-strategy-report__perf-head">
            <h2 class="tv-strategy-report__section-title">Performance</h2>
            <span class="tv-strategy-report__legend">
              <span class="tv-strategy-report__legend-swatch"></span>
              Cumulative PnL
            </span>
          </div>
          <div class="tv-strategy-report__chart" data-equity-chart></div>
        </section>
      </div>
      <div class="tv-strategy-report__panel" data-report-panel="trades" hidden>
        <div class="tv-strategy-report__trades-head">
          <h2 class="tv-strategy-report__section-title">List of trades</h2>
          <div class="tv-strategy-report__trades-tools">
            <p class="tv-strategy-report__trades-meta" data-trades-meta></p>
            <div class="tv-strategy-report__trades-filter-wrap">
              <button type="button" class="tv-strategy-report__trades-filter" data-trades-filter aria-haspopup="true" aria-expanded="false" title="Sort trades">${ICON_FILTER}</button>
              <div class="tv-strategy-report__trades-sort-menu" data-trades-sort-menu hidden>
                <button type="button" class="tv-strategy-report__trades-sort-opt is-selected" data-trades-sort="newest">Newest to Oldest</button>
                <button type="button" class="tv-strategy-report__trades-sort-opt" data-trades-sort="oldest">Oldest to Newest</button>
              </div>
            </div>
          </div>
        </div>
        <div class="tv-strategy-report__trades-wrap">
          <table class="tv-strategy-report__trades">
            <thead>
              <tr>
                <th>#</th>
                <th>Side</th>
                <th>Size</th>
                <th>Entry</th>
                <th>Exit</th>
                <th>PnL</th>
              </tr>
            </thead>
            <tbody data-trades-body></tbody>
          </table>
        </div>
      </div>
      <div class="tv-strategy-report__loading" data-report-loading hidden>
        <div class="tv-strategy-report__loading-inner" role="status" aria-live="polite" aria-busy="true">
          <div class="tv-strategy-report__spinner" aria-hidden="true"></div>
          <span class="tv-strategy-report__loading-text">Running backtest…</span>
        </div>
      </div>
    </div>`;

  const mountEl =
    opts.mountEl ??
    document.getElementById("strategy-report-slot") ??
    document.querySelector(".tv-strategy-report-slot");
  if (mountEl instanceof HTMLElement) mountEl.appendChild(root);

  wireReportResize(root);

  /** @param {boolean} visible */
  function syncSlotVisibility(visible) {
    const slot = root.parentElement;
    if (slot?.classList.contains("tv-strategy-report-slot")) {
      slot.hidden = !visible;
      if (visible && !slot.style.height) readReportHeight(root);
    }
  }

  const statsEl = root.querySelector("[data-stats]");
  const periodEl = root.querySelector("[data-report-period]");
  const tradesBody = root.querySelector("[data-trades-body]");
  const tradesMeta = root.querySelector("[data-trades-meta]");
  const tradesFilter = root.querySelector("[data-trades-filter]");
  const tradesSortMenu = root.querySelector("[data-trades-sort-menu]");
  const rangeLabelEl = root.querySelector("[data-range-label]");
  const rangeBadgeEl = root.querySelector("[data-range-badge]");
  const rangePill = root.querySelector("[data-range-menu]");
  const chartHost = root.querySelector("[data-equity-chart]");
  const loadingEl = root.querySelector("[data-report-loading]");

  /** @param {boolean} loading @param {string} [message] */
  function setLoading(loading, message = "Running backtest…") {
    root.classList.toggle("is-loading", loading);
    if (loadingEl instanceof HTMLElement) {
      loadingEl.hidden = !loading;
      loadingEl.setAttribute("aria-busy", loading ? "true" : "false");
      const text = loadingEl.querySelector(".tv-strategy-report__loading-text");
      if (text instanceof HTMLElement) text.textContent = message;
    }
  }

  const rangeMenu = createBacktestRangeMenu();
  /** @type {import("./backtestRange.js").BacktestRange} */
  let activeRange = { id: "90d" };

  /** @type {import("lightweight-charts").IChartApi | null} */
  let chart = null;
  /** @type {import("lightweight-charts").ISeriesApi | null} */
  let equitySeries = null;
  /** @type {Promise<void> | null} */
  let chartInit = null;
  let activeTab = "metrics";
  /** @type {string | null} */
  let boundInstanceId = null;
  /** @type {number} */
  let boundPaneIndex = 0;
  let currency = "USD";
  /** @type {"newest" | "oldest"} */
  let tradeSortOrder = "newest";
  /** @type {object | null} */
  let lastReport = null;
  let userDismissed = false;

  function closeTradesSortMenu() {
    if (tradesSortMenu instanceof HTMLElement) tradesSortMenu.hidden = true;
    if (tradesFilter instanceof HTMLElement) tradesFilter.setAttribute("aria-expanded", "false");
  }

  /**
   * @param {object[]} trades
   */
  function sortTrades(trades) {
    const list = [...trades];
    list.sort((a, b) => {
      const ta = a.exitTime ?? a.entryTime ?? 0;
      const tb = b.exitTime ?? b.entryTime ?? 0;
      return tradeSortOrder === "newest" ? tb - ta : ta - tb;
    });
    return list;
  }

  /**
   * @param {object} report
   */
  function renderTrades(report) {
    if (!(tradesBody instanceof HTMLElement)) return;
    if (!report.trades.length) {
      tradesBody.innerHTML = `<tr><td colspan="6" class="tv-strategy-report__trades-empty">No trades in range</td></tr>`;
      return;
    }
    tradesBody.innerHTML = sortTrades(report.trades)
      .map(
        (t) => `<tr>
            <td>${t.id}</td>
            <td><span class="tv-strategy-report__side tv-strategy-report__side--${t.side}">${t.side}</span></td>
            <td>${t.size ?? 1}</td>
            <td class="tv-strategy-report__trade-cell">
              <div class="tv-strategy-report__trade-moment">${tradeTimeButton(t.entryTime, "entry")}</div>
              ${tradePriceLine(t.entryPrice)}
            </td>
            <td class="tv-strategy-report__trade-cell">
              <div class="tv-strategy-report__trade-moment">${tradeTimeButton(t.exitTime, "exit")}</div>
              ${tradePriceLine(t.exitPrice)}
            </td>
            <td class="${t.pnl >= 0 ? "is-positive" : "is-negative"}">${fmtMoney(t.pnl)}</td>
          </tr>`,
      )
      .join("");
  }

  function syncTabs() {
    root.querySelectorAll("[data-report-tab]").forEach((btn) => {
      if (!(btn instanceof HTMLElement)) return;
      const on = btn.dataset.reportTab === activeTab;
      btn.classList.toggle("is-selected", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    root.querySelectorAll("[data-report-panel]").forEach((panel) => {
      if (!(panel instanceof HTMLElement)) return;
      panel.hidden = panel.dataset.reportPanel !== activeTab;
    });
  }

  function ensureChart() {
    if (!chartHost || !(chartHost instanceof HTMLElement)) return Promise.resolve();
    if (chartInit) return chartInit;
    chartInit = (async () => {
      chartHost.innerHTML = "";
      const { createChart, LineSeries, ColorType, CrosshairMode } = await import("lightweight-charts");
      chart = createChart(chartHost, {
        width: chartHost.clientWidth,
        height: 184,
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: "#787b86",
          fontSize: 11,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif",
        },
        grid: {
          vertLines: { color: "rgba(42, 46, 57, 0.45)" },
          horzLines: { color: "rgba(42, 46, 57, 0.45)" },
        },
        rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.06 } },
        timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true },
        crosshair: { mode: CrosshairMode.Magnet, vertLine: { labelVisible: true }, horzLine: { labelVisible: true } },
        handleScroll: false,
        handleScale: false,
      });
      equitySeries = chart.addSeries(LineSeries, {
        color: "#089981",
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: true,
      });
      const ro = new ResizeObserver(() => {
        if (chart && chartHost) chart.applyOptions({ width: chartHost.clientWidth });
      });
      ro.observe(chartHost);
    })();
    return chartInit;
  }

  /**
   * @param {string} title
   * @param {string} value
   * @param {string} [sub]
   * @param {string} [valueClass]
   * @param {boolean} [showCurrency]
   */
  function statCard(title, value, sub = "", valueClass = "", showCurrency = false) {
    const currencyHtml = showCurrency
      ? `<span class="tv-strategy-report__stat-currency">${currency}</span>`
      : "";
    return `<article class="tv-strategy-report__stat">
      <h3 class="tv-strategy-report__stat-title">${title}</h3>
      <div class="tv-strategy-report__stat-row">
        <p class="tv-strategy-report__stat-value ${valueClass}">${value}</p>
        ${currencyHtml}
      </div>
      ${sub ? `<p class="tv-strategy-report__stat-sub">${sub}</p>` : ""}
    </article>`;
  }

  /**
   * @param {object} report
   * @param {object} [meta]
   */
  function renderStats(report, meta = {}) {
    if (!(statsEl instanceof HTMLElement)) return;
    if (periodEl instanceof HTMLElement) {
      const label = meta.periodLabel ?? "";
      periodEl.textContent = label;
      periodEl.hidden = !label;
    }
    const pf = Number.isFinite(report.profitFactor) ? report.profitFactor.toFixed(3) : "—";
    const pnlClass = report.totalPnl >= 0 ? "is-positive" : "is-negative";
    const payoffClass = report.expectedPayoff >= 0 ? "is-positive" : "is-negative";

    statsEl.innerHTML = [
      statCard("Total PnL", fmtMoney(report.totalPnl), fmtPct(report.totalPnlPct), pnlClass, true),
      statCard("Max drawdown", fmtMoney(report.maxDrawdown, 2, false), fmtPct(report.maxDrawdownPct, false), "", true),
      statCard("Profitable trades", `${report.profitablePct.toFixed(2)}%`, report.profitableCount),
      statCard("Profit factor", pf),
      statCard("Total trades", String(report.totalTrades)),
      statCard("Expected payoff", fmtMoney(report.expectedPayoff), "", payoffClass, true),
    ].join("");
  }

  /**
   * @param {object | null} report
   * @param {string | null} instanceId
   * @param {object} [meta]
   */
  function render(report, instanceId, meta = {}) {
    boundInstanceId = instanceId;
    boundPaneIndex = meta.paneIndex ?? 0;
    const loading = Boolean(meta.loading);

    if (!report && !loading) {
      root.hidden = true;
      syncSlotVisibility(false);
      return;
    }

    root.hidden = false;
    syncSlotVisibility(true);
    activeRange = meta.backtestRange ?? { id: meta.rangeId ?? activeRange.id ?? "90d" };
    currency = meta.currency ?? "USD";

    if (rangeLabelEl instanceof HTMLElement) {
      rangeLabelEl.textContent =
        meta.rangeLabel ?? backtestRangePresetLabel(activeRange.id ?? "90d");
    }
    if (rangeBadgeEl instanceof HTMLElement) {
      rangeBadgeEl.textContent = meta.mode ?? "Deep";
      rangeBadgeEl.hidden = !meta.mode;
    }

    setLoading(loading, meta.loadingMessage ?? "Running backtest…");

    if (loading && !report) return;
    if (!report) return;

    lastReport = report;
    renderStats(report, meta);

    if (tradesMeta instanceof HTMLElement) {
      tradesMeta.textContent =
        report.totalTrades > 0
          ? `${report.totalTrades} trades · commission ${fmtMoney(-report.commission)}`
          : "No closed trades in range";
    }

    renderTrades(report);

    ensureChart().then(() => {
      if (!equitySeries || !chart) return;
      const initial = report.initialCapital ?? 0;
      const points = (report.equity ?? []).map((e) => ({
        time: e.time,
        value: e.equity - initial,
      }));
      equitySeries.setData(points.length ? points : []);
      if (points.length) chart.timeScale().fitContent();
    });
  }

  function hide(opts = {}) {
    rangeMenu.close();
    closeTradesSortMenu();
    setLoading(false);
    userDismissed = Boolean(opts.userDismissed);
    root.hidden = true;
    syncSlotVisibility(false);
    if (!opts.userDismissed) boundInstanceId = null;
  }

  function reopen() {
    userDismissed = false;
  }

  function isUserDismissed() {
    return userDismissed;
  }

  root.addEventListener("click", (ev) => {
    const target = ev.target;
    if (!(target instanceof Element)) return;
    if (target.closest("[data-report-close]")) {
      hide({ userDismissed: true });
      onDismiss?.();
      return;
    }
    if (target.closest("[data-range-menu]")) {
      if (!(rangePill instanceof HTMLElement) || !boundInstanceId) return;
      const open = !rangeMenu.isOpen();
      if (open) {
        rangePill.setAttribute("aria-expanded", "true");
        rangeMenu.open(rangePill, {
          activeId: activeRange.id ?? "90d",
          customDates: {
            fromDate: activeRange.fromDate,
            toDate: activeRange.toDate,
          },
          onSelect: (range) => {
            rangePill.setAttribute("aria-expanded", "false");
            if (typeof range === "string") {
              if (range === activeRange.id) return;
              activeRange = { id: range };
            } else {
              activeRange = range;
            }
            if (rangeLabelEl instanceof HTMLElement) {
              rangeLabelEl.textContent =
                typeof range === "string"
                  ? backtestRangePresetLabel(range)
                  : backtestRangePresetLabel("custom");
            }
            if (boundInstanceId) onRangeChange?.(boundInstanceId, range);
          },
          onClose: () => rangePill.setAttribute("aria-expanded", "false"),
        });
      } else {
        rangePill.setAttribute("aria-expanded", "false");
        rangeMenu.close();
      }
      return;
    }
    const tab = target.closest("[data-report-tab]");
    if (tab instanceof HTMLElement && tab.dataset.reportTab) {
      activeTab = tab.dataset.reportTab;
      syncTabs();
      return;
    }
    const jump = target.closest("[data-trade-jump]");
    if (jump instanceof HTMLElement && jump.dataset.tradeTime) {
      const time = Number(jump.dataset.tradeTime);
      if (Number.isFinite(time)) onGoToBarTime?.(time, boundPaneIndex);
      return;
    }
    const sortOpt = target.closest("[data-trades-sort]");
    if (sortOpt instanceof HTMLElement && sortOpt.dataset.tradesSort) {
      const next = sortOpt.dataset.tradesSort === "oldest" ? "oldest" : "newest";
      if (next !== tradeSortOrder) {
        tradeSortOrder = next;
        root.querySelectorAll("[data-trades-sort]").forEach((btn) => {
          if (!(btn instanceof HTMLElement)) return;
          btn.classList.toggle("is-selected", btn.dataset.tradesSort === tradeSortOrder);
        });
        if (lastReport) renderTrades(lastReport);
      }
      closeTradesSortMenu();
      return;
    }
    if (target.closest("[data-trades-filter]")) {
      if (!(tradesFilter instanceof HTMLElement) || !(tradesSortMenu instanceof HTMLElement)) return;
      const open = tradesSortMenu.hidden;
      tradesSortMenu.hidden = !open;
      tradesFilter.setAttribute("aria-expanded", open ? "true" : "false");
      return;
    }
    if (!target.closest("[data-trades-sort-menu]")) closeTradesSortMenu();
  });

  return {
    render,
    hide,
    reopen,
    isUserDismissed,
    getBoundInstanceId: () => boundInstanceId,
    el: root,
  };
}

import { DaySetupsStore } from "./history/daySetupsStore.js";
import { SetupHistory, SetupRegistry, SetupView } from "./registry/index.js";
import { dumpSetupPanelState, setupDebugEnabled, setupDebugLog } from "./setupDebug.js";

/**
 * @param {{
 *   rightEl: HTMLElement | null;
 *   getSweepEvents: () => import("../levels/levelsCalc.js").HtfSweepEvent[];
 *   getRaw1m: () => { time: number; high: number; low: number; close: number }[];
 *   getAnchorUnix: () => number | null | undefined;
 *   getDayYmd?: () => string;
 *   getCompBars1m?: () => { time: number; high: number; low: number }[];
 *   getSymbol?: () => string;
 *   getLxSettings?: () => { smtPivotLeft?: number; smtPivotRight?: number };
 *   getHasPpiNews?: () => boolean;
 *   getCalendarEvents?: () => { title?: string; event?: string; name?: string; hmEt?: string; time?: string; timeLabel?: string; currency?: string }[];
 *   getReleaseDayKind?: () => "ppi" | "cpi" | null;
 *   getSetupTradingWindow?: () => import("../setups/setupTradingWindow.js").SetupTradingWindowSettings;
 *   ensureCompBars?: () => void;
 *   getTf?: () => string;
 *   onHistoryReady?: () => void;
 *   tabbed?: boolean;
 *   getEnabledSetupIds?: () => number[];
 * }} opts
 */
export class SetupPanelUi {
  constructor(opts) {
    const {
      rightEl,
      getSweepEvents,
      getRaw1m,
      getAnchorUnix,
      getDayYmd,
      onHistoryReady,
      getCompBars1m,
      getSymbol,
      getLxSettings,
      getHasPpiNews,
      getCalendarEvents,
      getReleaseDayKind,
      getSetupTradingWindow,
      ensureCompBars,
      getTf,
      tabbed,
      getEnabledSetupIds,
    } = opts;

    this.rightEl = rightEl;
    this.getSweepEvents = getSweepEvents;
    this.getRaw1m = getRaw1m;
    this.getAnchorUnix = getAnchorUnix;
    this.getDayYmd = getDayYmd;
    this.onHistoryReady = onHistoryReady;
    this.getCompBars1m = getCompBars1m;
    this.getSymbol = getSymbol;
    this.getLxSettings = getLxSettings;
    this.getHasPpiNews = getHasPpiNews;
    this.getCalendarEvents = getCalendarEvents;
    this.getReleaseDayKind = getReleaseDayKind;
    this.getSetupTradingWindow = getSetupTradingWindow;
    this.ensureCompBars = ensureCompBars;
    this.getTf = getTf;
    this.tabbed = tabbed === true;
    this.getEnabledSetupIds = getEnabledSetupIds;

    /** @type {Record<string, boolean>} */
    this.panelState = {};
    /** @type {Record<string, string>} */
    this.cachedHistoryHtml = {};
    this.historyIdleToken = 0;
    /** @type {number[]} */
    this.lastHistoryCounts = [];
    /** @type {string} */
    this.lastHistorySignature = "";
    /** @type {number | null} */
    this.activeSetupTab = null;

    for (const def of SetupRegistry.list()) {
      this.panelState[def.contextPanelKey] = true;
      this.panelState[def.historyPanelKey] = false;
      this.cachedHistoryHtml[String(def.id)] = "";
    }

    this.clear();
  }

  runtimeContext() {
    return {
      getSweepEvents: this.getSweepEvents,
      getRaw1m: this.getRaw1m,
      getAnchorUnix: this.getAnchorUnix,
      getDayYmd: this.getDayYmd,
      getCompBars1m: this.getCompBars1m,
      getSymbol: this.getSymbol,
      getLxSettings: this.getLxSettings,
      getHasPpiNews: this.getHasPpiNews,
      getCalendarEvents: this.getCalendarEvents,
      getReleaseDayKind: this.getReleaseDayKind,
      getSetupTradingWindow: this.getSetupTradingWindow,
      ensureCompBars: this.ensureCompBars,
      getTf: this.getTf,
    };
  }

  resolveCompletedHistory(anchorUnix, dayYmd) {
    return SetupHistory.resolve(this.runtimeContext(), anchorUnix, dayYmd);
  }

  stateOpts() {
    return {
      getSweepEvents: this.getSweepEvents,
      getRaw1m: this.getRaw1m,
      getAnchorUnix: this.getAnchorUnix,
      getDayYmd: this.getDayYmd,
      getHasPpiNews: this.getHasPpiNews,
      getCalendarEvents: this.getCalendarEvents,
      getReleaseDayKind: this.getReleaseDayKind,
      getSetupTradingWindow: this.getSetupTradingWindow,
      getTf: this.getTf,
    };
  }

  bindPanelToggles() {
    if (!this.rightEl) return;

    for (const def of SetupRegistry.list()) {
      for (const key of [def.contextPanelKey, def.historyPanelKey]) {
        const el = this.rightEl.querySelector(`[data-panel="${key}"]`);
        if (el instanceof HTMLDetailsElement) {
          el.open = this.panelState[key] ?? false;
          el.addEventListener("toggle", () => {
            this.panelState[key] = el.open;
          });
        }
      }
    }
  }

  /** @returns {import("./registry/setupRegistry.js").SetupDefinition[]} */
  visibleSetupDefs() {
    const all = SetupRegistry.list();
    const ids = this.getEnabledSetupIds?.();
    if (!ids?.length) return all;
    const enabled = new Set(ids);
    return all.filter((def) => enabled.has(def.id));
  }

  /** @param {import("./registry/setupRegistry.js").SetupDefinition[]} defs */
  resolveActiveSetupTab(defs) {
    if (this.activeSetupTab != null && defs.some((d) => d.id === this.activeSetupTab)) {
      return this.activeSetupTab;
    }
    return defs[0]?.id ?? null;
  }

  bindSetupTabs() {
    if (!this.rightEl || !this.tabbed) return;
    const bar = this.rightEl.querySelector(".setup-tabs__bar");
    if (!(bar instanceof HTMLElement)) return;

    bar.addEventListener("click", (ev) => {
      const target = ev.target;
      if (!(target instanceof Element)) return;
      const btn = target.closest("[data-setup-tab]");
      if (!(btn instanceof HTMLElement)) return;
      const id = Number(btn.dataset.setupTab);
      if (!Number.isFinite(id)) return;
      this.activeSetupTab = id;

      for (const tab of bar.querySelectorAll("[data-setup-tab]")) {
        if (!(tab instanceof HTMLElement)) continue;
        const active = Number(tab.dataset.setupTab) === id;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-selected", active ? "true" : "false");
      }

      for (const panel of this.rightEl.querySelectorAll("[data-setup-panel]")) {
        if (!(panel instanceof HTMLElement)) continue;
        const show = Number(panel.dataset.setupPanel) === id;
        panel.classList.toggle("is-active", show);
        panel.hidden = !show;
      }
    });
  }

  /**
   * @param {import("./registry/setupRegistry.js").SetupDefinition} def
   * @param {Map<number, object[]>} completedBySetup
   * @param {boolean} includeHistory
   * @param {boolean} refreshHistoryPanels
   * @param {string | undefined} dayYmd
   * @param {ReturnType<SetupPanelUi["runtimeContext"]>} ctx
   */
  renderSetupSections(def, completedBySetup, includeHistory, refreshHistoryPanels, dayYmd, ctx) {
    const completed = completedBySetup.get(def.id) ?? [];
    const live = def.live(ctx, completed);
    const contextSection = `<section class="events-panel__block">${def.panel(live)}</section>`;

    const cacheKey = String(def.id);
    let historyBody;
    if (refreshHistoryPanels) {
      historyBody =
        includeHistory || completed.length
          ? SetupView.history(completed, dayYmd, def.detail)
          : '<p class="events-feed__empty">Loading setup history…</p>';
      this.cachedHistoryHtml[cacheKey] = historyBody;
    } else {
      historyBody = this.cachedHistoryHtml[cacheKey];
    }

    const historySection = `<section class="events-panel__block events-panel__block--feed">
        <details class="context-fold" data-panel="${def.historyPanelKey}">
          <summary class="context-fold__summary">${def.label} history${completed.length ? ` (${completed.length})` : ""}</summary>
          <div class="context-fold__body">${historyBody}</div>
        </details>
      </section>`;

    return `${contextSection}${historySection}`;
  }

  /**
   * @param {{
   *   includeHistory?: boolean;
   *   completedBySetup?: Map<number, object[]>;
   *   refreshHistoryPanels?: boolean;
   * }} [renderOpts]
   */
  render(renderOpts) {
    if (!this.rightEl) return;

    this.ensureCompBars?.();

    const ctx = this.runtimeContext();
    const anchorUnix = this.getAnchorUnix();
    const dayYmd = this.getDayYmd?.();
    const includeHistory = renderOpts?.includeHistory !== false;
    const refreshHistoryPanels = renderOpts?.refreshHistoryPanels !== false;

    /** @type {Map<number, object[]>} */
    let completedBySetup = renderOpts?.completedBySetup ?? new Map();
    if (!renderOpts?.completedBySetup) {
      if (anchorUnix != null) {
        if (includeHistory) {
          completedBySetup = this.resolveCompletedHistory(anchorUnix, dayYmd);
        } else {
          completedBySetup = new Map();
          for (const def of SetupRegistry.list()) {
            const sweepCount = this.getSweepEvents().filter((s) => s.time <= anchorUnix).length;
            if (def.slug === "htfSweep") {
              completedBySetup.set(def.id, def.history.peek(anchorUnix, dayYmd, sweepCount) ?? []);
            } else if (def.slug === "fvgTap") {
              const compBarsLen = this.getCompBars1m?.().length ?? 0;
              completedBySetup.set(
                def.id,
                def.history.peek(anchorUnix, dayYmd, compBarsLen, sweepCount) ?? [],
              );
            } else {
              completedBySetup.set(def.id, def.history.peek(anchorUnix, dayYmd) ?? []);
            }
          }
        }
      }
    }

    const contextSections = SetupRegistry.list()
      .map((def) => {
        const completed = completedBySetup.get(def.id) ?? [];
        const live = def.live(ctx, completed);
        return `<section class="events-panel__block">${def.panel(live)}</section>`;
      })
      .join("");

    const historySections = SetupRegistry.list()
      .map((def) => {
        const completed = completedBySetup.get(def.id) ?? [];
        const cacheKey = String(def.id);
        let historyBody;
        if (refreshHistoryPanels) {
          historyBody =
            includeHistory || completed.length
              ? SetupView.history(completed, dayYmd, def.detail)
              : '<p class="events-feed__empty">Loading setup history…</p>';
          this.cachedHistoryHtml[cacheKey] = historyBody;
        } else {
          historyBody = this.cachedHistoryHtml[cacheKey];
        }

        return `<section class="events-panel__block events-panel__block--feed">
        <details class="context-fold" data-panel="${def.historyPanelKey}">
          <summary class="context-fold__summary">${def.label} history${completed.length ? ` (${completed.length})` : ""}</summary>
          <div class="context-fold__body">${historyBody}</div>
        </details>
      </section>`;
      })
      .join("");

    if (this.tabbed) {
      const defs = this.visibleSetupDefs();
      if (!defs.length) {
        this.rightEl.innerHTML = '<p class="events-feed__empty">No setups enabled.</p>';
        return;
      }

      const activeTab = this.resolveActiveSetupTab(defs);
      this.activeSetupTab = activeTab;

      const tabs = defs
        .map((def) => {
          const completed = completedBySetup.get(def.id) ?? [];
          const count = completed.length ? ` (${completed.length})` : "";
          const active = def.id === activeTab;
          return `<button type="button" class="setup-tabs__tab${active ? " is-active" : ""}" role="tab" data-setup-tab="${def.id}" aria-selected="${active ? "true" : "false"}">${def.label}${count}</button>`;
        })
        .join("");

      const panels = defs
        .map((def) => {
          const active = def.id === activeTab;
          return `<div class="setup-tabs__panel${active ? " is-active" : ""}" role="tabpanel" data-setup-panel="${def.id}"${active ? "" : " hidden"}>${this.renderSetupSections(def, completedBySetup, includeHistory, refreshHistoryPanels, dayYmd, ctx)}</div>`;
        })
        .join("");

      this.rightEl.innerHTML = `<div class="setup-tabs">
        <nav class="setup-tabs__bar" role="tablist" aria-label="Setups">${tabs}</nav>
        <div class="setup-tabs__panels">${panels}</div>
      </div>`;
      this.bindSetupTabs();
      this.bindPanelToggles();
      return;
    }

    this.rightEl.innerHTML = `${contextSections}${historySections}`;
    this.bindPanelToggles();
  }

  clear() {
    if (!this.rightEl) return;
    this.rightEl.innerHTML = '<p class="events-feed__empty">Load a session…</p>';
  }

  scheduleHistoryBuild() {
    const token = ++this.historyIdleToken;
    const run = async () => {
      if (token !== this.historyIdleToken) return;
      await this.ensureCompBars?.();
      const anchorUnix = this.getAnchorUnix();
      const dayYmd = this.getDayYmd?.();
      const completedBySetup = this.resolveCompletedHistory(anchorUnix, dayYmd);
      this.lastHistoryCounts = SetupHistory.counts(completedBySetup);
      this.lastHistorySignature = SetupHistory.signature(completedBySetup);
      this.render({ completedBySetup, refreshHistoryPanels: true });
      this.onHistoryReady?.();
    };
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(() => void run(), { timeout: 2000 });
    } else {
      setTimeout(() => void run(), 0);
    }
  }

  /** @returns {Promise<boolean>} */
  async sync() {
    const anchorUnix = this.getAnchorUnix();
    const dayYmd = this.getDayYmd?.();

    await this.ensureCompBars?.();

    if (DaySetupsStore.has(dayYmd)) {
      const completedBySetup = this.resolveCompletedHistory(anchorUnix, dayYmd);
      const countList = SetupHistory.counts(completedBySetup);
      const sig = SetupHistory.signature(completedBySetup);
      const historyChanged =
        sig !== this.lastHistorySignature ||
        countList.some((n, i) => n !== (this.lastHistoryCounts[i] ?? 0));
      this.lastHistoryCounts = countList;
      this.lastHistorySignature = sig;
      this.logSync("dayStore", anchorUnix, dayYmd, completedBySetup, historyChanged);
      this.render({ completedBySetup, refreshHistoryPanels: historyChanged });
      if (historyChanged) this.onHistoryReady?.();
      return historyChanged;
    }

    if (anchorUnix == null) {
      this.render({ includeHistory: false });
      setupDebugLog("sync", { phase: "cold", anchorUnix, dayYmd, warm: false });
      return false;
    }

    const completedBySetup = this.resolveCompletedHistory(anchorUnix, dayYmd);
    const countList = SetupHistory.counts(completedBySetup);
    const sig = SetupHistory.signature(completedBySetup);
    const historyChanged =
      sig !== this.lastHistorySignature ||
      countList.some((n, i) => n !== (this.lastHistoryCounts[i] ?? 0));
    this.lastHistoryCounts = countList;
    this.lastHistorySignature = sig;

    this.logSync(SetupHistory.anyWarm(dayYmd) ? "resolve" : "build", anchorUnix, dayYmd, completedBySetup, historyChanged);
    this.render({ completedBySetup, refreshHistoryPanels: historyChanged });

    if (historyChanged) this.onHistoryReady?.();
    return historyChanged;
  }

  /** @param {string} phase @param {number | null | undefined} anchorUnix @param {string | undefined} dayYmd @param {Map<number, object[]>} completedBySetup @param {boolean} historyChanged */
  logSync(phase, anchorUnix, dayYmd, completedBySetup, historyChanged) {
    if (!setupDebugEnabled()) return;
    setupDebugLog("sync", {
      phase,
      dayYmd,
      anchorUnix,
      historyChanged,
      counts: SetupHistory.counts(completedBySetup),
      setup1: (completedBySetup.get(1) ?? []).map((s) => ({
        at: s.completedAt,
        bias: s.bias,
      })),
      setup2: (completedBySetup.get(2) ?? []).map((s) => ({
        at: s.completedAt,
        bias: s.bias,
      })),
      sweepCount: this.getSweepEvents().filter((s) => anchorUnix != null && s.time <= anchorUnix).length,
      sweepCountTotal: this.getSweepEvents().length,
      compBarsLen: this.getCompBars1m?.().length ?? 0,
    });
  }

  dumpDebug(extra = {}) {
    return dumpSetupPanelState({
      getSweepEvents: this.getSweepEvents,
      getRaw1m: this.getRaw1m,
      getAnchorUnix: this.getAnchorUnix,
      getDayYmd: this.getDayYmd,
      getCompBars1m: this.getCompBars1m,
      getSymbol: this.getSymbol,
      getLxSettings: this.getLxSettings,
      getHasPpiNews: this.getHasPpiNews,
      getCalendarEvents: this.getCalendarEvents,
      getReleaseDayKind: this.getReleaseDayKind,
      getSetupTradingWindow: this.getSetupTradingWindow,
      getTf: this.getTf,
      ...extra,
    });
  }

  getStateOpts() {
    return this.stateOpts();
  }

  buildState() {
    const ctx = this.runtimeContext();
    const def = SetupRegistry.get(1);
    return def ? def.live(ctx, []) : null;
  }
}

export function createReplayContextUi(opts) {
  return new SetupPanelUi(opts);
}

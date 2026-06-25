import { logicalToChartTime, measureVisiblePriceRange } from "../../chart/coords/timeScale.js";
import { formatPriceLabel } from "../../chart/pane/viewportBarLayout.js";
import { measurePriceBarRatio } from "../../chart/price/barRatio.js";
import { barSecForPane } from "../../chart/pane/data.js";
import { getPaneChartView } from "../../chart/pane/viewCache.js";
import { dateTime12h, toDate } from "../../chart/format.js";

/** @param {number | null | undefined} utc */
function utcLabel(utc) {
  if (utc == null || !Number.isFinite(utc)) return null;
  return dateTime12h(toDate(utc));
}

/** @param {number} sec */
function formatDuration(sec) {
  if (!Number.isFinite(sec) || sec === 0) return "0";
  const sign = sec < 0 ? "-" : "+";
  const abs = Math.abs(sec);
  if (abs < 60) return `${sign}${abs}s`;
  if (abs < 3600) return `${sign}${Math.round(abs / 60)}m`;
  const h = Math.floor(abs / 3600);
  const m = Math.round((abs % 3600) / 60);
  return m ? `${sign}${h}h ${m}m` : `${sign}${h}h`;
}

/**
 * @param {object} ta
 * @param {{ time: number }[]} mapBars
 * @param {number} barSec
 * @param {number} logical
 */
function logicalToUtc(ta, mapBars, barSec, logical) {
  const chartTime = logicalToChartTime(mapBars, barSec, logical);
  if (chartTime == null || !Number.isFinite(chartTime)) return null;
  return ta.time.toUtc(chartTime);
}

/**
 * Console-friendly viewport + replay bar stats for the active pane.
 * @param {object} deps
 * @param {() => object | null | undefined} deps.getActivePane
 * @param {() => import("../../ui/chart/settings.js").createChartSettings} deps.settingsStore
 * @param {{ id: string, sec?: number }[]} deps.resolutions
 * @param {() => import("../../replay/mode.js").ReplayState | null | undefined} [deps.getReplayState]
 * @param {{ getCursorBarIndex?: () => number, getMaxBarIndex?: () => number, hasForwardBars?: () => boolean } | null | undefined} [deps.replayEngine]
 * @param {{ log?: boolean }} [opts]
 */
export function getChartViewportStats(deps, opts = {}) {
  const pane = deps.getActivePane?.();
  if (!pane?.chart) {
    const err = { ok: false, error: "no active chart pane" };
    if (opts.log !== false) console.warn("[BWC] visibleBars:", err.error);
    return err;
  }

  const settingsStore = deps.settingsStore;
  const symbolInfo = pane.symbolInfo ?? null;
  const view = getPaneChartView(pane, settingsStore, symbolInfo, deps.resolutions);
  const ta = view.timeAdapter;
  const mapBars = view.mapBars;
  const utcBars = view.utcBars;
  const barSec = view.barSec ?? barSecForPane(pane, deps.resolutions);
  const ts = pane.chart.timeScale();
  const logical = ts.getVisibleLogicalRange();
  const timeVisible = ts.getVisibleRange?.() ?? null;
  const barSpacing = ts.options().barSpacing ?? null;
  const rightOffset = ts.options().rightOffset ?? null;
  const paneH = pane.chart.paneSize?.()?.height ?? null;

  const replayState = deps.getReplayState?.() ?? null;
  const snap = pane._replaySnapshot ?? null;
  const cursorUtc = replayState?.active ? replayState.currentBarTime : utcBars.at(-1)?.time ?? null;
  const cursorIndex =
    cursorUtc != null ? (ta.index.utc(cursorUtc) ?? pane.replayCursorEndIndex ?? null) : null;
  const liveEndUtc = snap?.liveEndBarTime ?? null;

  const loadedFirst = pane.bars[0]?.time ?? null;
  const loadedLast = pane.bars.at(-1)?.time ?? null;

  let visibleFromUtc = null;
  let visibleToUtc = null;
  let visibleBarCount = null;
  let visibleRealBarCount = null;

  if (logical && Number.isFinite(logical.from) && Number.isFinite(logical.to)) {
    visibleFromUtc = logicalToUtc(ta, mapBars, barSec, logical.from);
    visibleToUtc = logicalToUtc(ta, mapBars, barSec, logical.to);
    visibleBarCount = Math.max(0, logical.to - logical.from);
    const realLastIdx = utcBars.length - 1;
    const fromIdx = Math.max(0, Math.floor(logical.from));
    const toIdx = Math.min(realLastIdx, Math.ceil(logical.to));
    visibleRealBarCount = realLastIdx >= 0 ? Math.max(0, toIdx - fromIdx + 1) : 0;
  }

  const aheadOfCursorSec =
    cursorUtc != null && visibleToUtc != null ? visibleToUtc - cursorUtc : null;
  const aheadOfCursorBars =
    aheadOfCursorSec != null && barSec > 0 ? Math.round(aheadOfCursorSec / barSec) : null;

  const behindCursorSec =
    cursorUtc != null && visibleFromUtc != null ? cursorUtc - visibleFromUtc : null;
  const behindCursorBars =
    behindCursorSec != null && barSec > 0 ? Math.round(behindCursorSec / barSec) : null;

  const forwardBarsRemaining =
    cursorUtc != null && liveEndUtc != null && barSec > 0
      ? Math.max(0, Math.round((liveEndUtc - cursorUtc) / barSec))
      : null;

  const maxFutureUtc =
    cursorUtc != null && barSec > 0 && liveEndUtc != null ? liveEndUtc + barSec * 48 : null;

  const relativeToLatest = {
    barsBefore: behindCursorBars,
    barsAfterVisible: aheadOfCursorBars,
    timeBefore: behindCursorSec != null ? formatDuration(-behindCursorSec) : null,
    timeAfterVisible: aheadOfCursorSec != null ? formatDuration(aheadOfCursorSec) : null,
    maxFutureUtc,
    maxFutureLabel: utcLabel(maxFutureUtc),
    timeToMaxFuture:
      cursorUtc != null && maxFutureUtc != null
        ? formatDuration(maxFutureUtc - cursorUtc)
        : null,
  };

  const realCount = utcBars.length;
  const anchorIndex =
    pane.replayCursorEndIndex != null && pane.replayCursorEndIndex >= 0
      ? pane.replayCursorEndIndex + 1
      : pane.bars?.length ?? realCount;
  const viewportLayout =
    logical && Number.isFinite(logical.to)
      ? {
          width: logical.to - logical.from,
          toBeyondAnchor: logical.to - anchorIndex,
          anchorIndex,
        }
      : null;

  const pTop = pane.series?.coordinateToPrice?.(0);
  const pBottom = paneH ? pane.series?.coordinateToPrice?.(paneH) : null;
  const priceMin = pTop != null && pBottom != null ? Math.min(pTop, pBottom) : null;
  const priceMax = pTop != null && pBottom != null ? Math.max(pTop, pBottom) : null;
  const psOpts = pane.series?.priceScale?.()?.options?.() ?? {};
  const priceLayout = {
    minPrice: priceMin,
    maxPrice: priceMax,
    minLabel: formatPriceLabel(priceMin),
    maxLabel: formatPriceLabel(priceMax),
    range: measureVisiblePriceRange(pane.chart, pane.series),
    scaleMargins: psOpts.scaleMargins ?? null,
    autoScale: psOpts.autoScale !== false,
    priceBarRatio: measurePriceBarRatio(pane.chart, pane.series),
  };

  const stats = {
    ok: true,
    resolution: pane.resolution ?? null,
    barSec,
    replay: replayState?.active
      ? {
          active: true,
          cursorUtc,
          cursorLabel: utcLabel(cursorUtc),
          cursorIndex,
          selectedUtc: replayState.selectedBarTime ?? null,
          liveEndUtc,
          liveEndLabel: utcLabel(liveEndUtc),
          forwardBarsRemaining,
          hasForwardBars: deps.replayEngine?.hasForwardBars?.() ?? null,
          maxBarIndex: deps.replayEngine?.getMaxBarIndex?.() ?? null,
        }
      : { active: false, latestUtc: cursorUtc, latestLabel: utcLabel(cursorUtc) },
    loaded: {
      count: pane.bars.length,
      firstUtc: loadedFirst,
      firstLabel: utcLabel(loadedFirst),
      lastUtc: loadedLast,
      lastLabel: utcLabel(loadedLast),
    },
    visible: {
      logicalFrom: logical?.from ?? null,
      logicalTo: logical?.to ?? null,
      barCount: visibleBarCount,
      realBarCount: visibleRealBarCount,
      fromUtc: visibleFromUtc,
      fromLabel: utcLabel(visibleFromUtc),
      toUtc: visibleToUtc,
      toLabel: utcLabel(visibleToUtc),
      chartTimeFrom: timeVisible?.from ?? null,
      chartTimeTo: timeVisible?.to ?? null,
    },
    relativeToLatest,
    viewportLayout,
    priceLayout,
    whitespace: {
      maxUtc: maxFutureUtc,
      maxLabel: utcLabel(maxFutureUtc),
    },
    timeScale: { barSpacing, rightOffset },
  };

  if (opts.log !== false) {
    const lines = [
      `[BWC] visibleBars — ${stats.resolution ?? "?"} (${barSec}s)`,
      `  loaded: ${stats.loaded.count} bars (${stats.loaded.firstLabel ?? "?"} → ${stats.loaded.lastLabel ?? "?"})`,
    ];
    if (stats.replay.active) {
      lines.push(
        `  replay latest: ${stats.replay.cursorLabel ?? "?"} (index ${stats.replay.cursorIndex ?? "?"})`,
      );
      if (stats.replay.liveEndLabel) {
        lines.push(
          `  replay live end: ${stats.replay.liveEndLabel} (${stats.replay.forwardBarsRemaining ?? "?"} bars forward)`,
        );
      }
    } else {
      lines.push(`  latest bar: ${stats.replay.latestLabel ?? "?"}`);
    }
    lines.push(
      `  on screen: ~${stats.visible.barCount != null ? stats.visible.barCount.toFixed(1) : "?"} slots (${stats.visible.realBarCount ?? "?"} real candles)`,
      `  viewport layout: width=${stats.viewportLayout?.width?.toFixed(1) ?? "?"}, tail=${stats.viewportLayout?.toBeyondAnchor?.toFixed(1) ?? "?"} bars past anchor`,
      `  price axis: ${stats.priceLayout.minLabel ?? "?"} → ${stats.priceLayout.maxLabel ?? "?"} (range ${stats.priceLayout.range != null ? stats.priceLayout.range.toFixed(2) : "?"}, zoom margins top=${stats.priceLayout.scaleMargins?.top?.toFixed(3) ?? "?"} bottom=${stats.priceLayout.scaleMargins?.bottom?.toFixed(3) ?? "?"}, autoScale=${stats.priceLayout.autoScale ? "on" : "off"})`,
      `  left edge:  ${stats.visible.fromLabel ?? "?"}`,
      `  right edge: ${stats.visible.toLabel ?? "?"} (farthest you can see)`,
    );
    const anchor = stats.replay.active ? "replay cursor" : "latest bar";
    lines.push(
      `  vs ${anchor}: ${stats.relativeToLatest.timeBefore ?? "?"} left, ${stats.relativeToLatest.timeAfterVisible ?? "?"} to visible right (${stats.relativeToLatest.barsAfterVisible ?? "?"} bars)`,
    );
    if (stats.whitespace.maxUtc != null) {
      lines.push(
        `  max scroll past ${anchor}: ${stats.relativeToLatest.timeToMaxFuture ?? "?"} (→ ${stats.whitespace.maxLabel ?? "?"})`,
      );
    }
    console.info(lines.join("\n"));
  }

  return stats;
}

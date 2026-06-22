/**
 * Live bar simulation (testing site, fake feed only).
 *
 * Console:
 *   __BWC_TEST__.startLive()   — resume auto simulation (default on load)
 *   __BWC_TEST__.stopLive()    — pause
 *   __BWC_TEST__.newBar()      — force next bar now
 *   __BWC_TEST__.tick()        — bump forming bar once
 */

import { resolutionSec } from "/js/chart/resolutions.js";

/** @param {object[]} bars */
function inferBarSec(bars, resolution) {
  if (bars.length >= 2) return bars.at(-1).time - bars.at(-2).time;
  return resolutionSec(resolution) || 60;
}

/** Random OHLC anchored to the previous bar's close. */
function randomOhlcFromLast(last) {
  const open = last.close;
  const tick = Math.max(Math.abs(last.close) * 0.0005, 0.1);
  const close = open + (Math.random() - 0.5) * tick * 4;
  const wick = Math.random() * tick * 3;
  return {
    open,
    high: Math.max(open, close) + wick,
    low: Math.min(open, close) - wick,
    close,
  };
}

/** @param {number} barSec */
function pollIntervalMs(barSec) {
  if (barSec <= 5) return 150;
  if (barSec <= 30) return 250;
  if (barSec <= 60) return 400;
  return 1000;
}

/**
 * @param {object} widget chart widget from bootChart()
 * @param {{ autoLive?: boolean }} [opts]
 */
export function mountBarTestDev(widget, opts = {}) {
  const autoLive = opts.autoLive !== false;
  let liveTimer = null;
  let liveRunning = false;

  /** @param {import("../../public/js/datafeed/types.js").Bar} bar */
  function update(bar) {
    const ok = widget.update(bar);
    return ok;
  }

  function tick(delta = 1) {
    const last = widget.getBars().at(-1);
    if (!last) return false;
    const close = last.close + delta;
    return update({
      time: last.time,
      open: last.open,
      high: Math.max(last.high, close),
      low: Math.min(last.low, close),
      close,
      ...(last.volume != null ? { volume: last.volume } : {}),
    });
  }

  /** @param {number} time bar open time (UTC sec) */
  function openBarAt(time) {
    const last = widget.getBars().at(-1);
    if (!last) return false;
    const ohlc = randomOhlcFromLast(last);
    return update({ time, ...ohlc });
  }

  function newBar() {
    const bars = widget.getBars();
    const last = bars.at(-1);
    if (!last) return false;
    const step = inferBarSec(bars, widget.getResolution());
    return openBarAt(last.time + step);
  }

  function bumpFormingBar() {
    const last = widget.getBars().at(-1);
    if (!last) return false;
    const tick = Math.max(Math.abs(last.close) * 0.0005, 0.1);
    const close = last.close + (Math.random() - 0.5) * tick * 2;
    return update({
      time: last.time,
      open: last.open,
      high: Math.max(last.high, close),
      low: Math.min(last.low, close),
      close,
      ...(last.volume != null ? { volume: last.volume } : {}),
    });
  }

  function livePoll() {
    const resolution = widget.getResolution?.() ?? "1";
    const barSec = resolutionSec(resolution) || 60;
    const barOpen = Math.floor(Date.now() / 1000 / barSec) * barSec;
    const last = widget.getBars().at(-1);
    if (!last) return;

    if (last.time < barOpen) {
      const nextTime = last.time + barSec;
      if (nextTime <= barOpen) {
        openBarAt(nextTime);
      }
      return;
    }

    if (last.time === barOpen) {
      bumpFormingBar();
    }
  }

  function scheduleLivePoll() {
    if (!liveRunning) return;
    const barSec = resolutionSec(widget.getResolution?.() ?? "1") || 60;
    liveTimer = window.setTimeout(() => {
      try {
        livePoll();
      } catch (err) {
        console.warn("[BWC:test] live poll failed", err);
      }
      scheduleLivePoll();
    }, pollIntervalMs(barSec));
  }

  function startLive() {
    if (liveRunning) return true;
    liveRunning = true;
    scheduleLivePoll();
    console.info("[BWC:test] live sim started", { resolution: widget.getResolution?.() });
    return true;
  }

  function stopLive() {
    liveRunning = false;
    if (liveTimer != null) {
      window.clearTimeout(liveTimer);
      liveTimer = null;
    }
    console.info("[BWC:test] live sim stopped");
    return true;
  }

  const api = {
    update,
    tick,
    newBar,
    openBarAt,
    bumpFormingBar,
    startLive,
    stopLive,
    inferBarSec: (bars) => inferBarSec(bars, widget.getResolution?.()),
    randomOhlcFromLast,
  };

  if (typeof window !== "undefined") {
    window.__BWC_TEST__ = api;
  }

  if (autoLive) {
    widget.onChartReady?.(() => startLive());
  }

  console.info(
    autoLive
      ? "[BWC:test] fake feed — live sim auto-starts; __BWC_TEST__.stopLive() | .newBar()"
      : "[BWC:test] fake feed helpers ready (live sim off); __BWC_TEST__.startLive()",
  );
  return api;
}

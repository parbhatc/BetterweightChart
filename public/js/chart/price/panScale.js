import { lwcPaneIndexAtY } from "../pane/studyScale.js";
import { viewportDebug, viewportDebugPaneState, viewportDebugThrottle } from "./viewportDebug.js";
export { capturePaneViewport, captureAllPaneViewports } from "./viewportCapture.js";

/** @param {import("lightweight-charts").IChartApi} chart @param {import("lightweight-charts").ISeriesApi} series @param {"left" | "right"} priceScaleId @param {object} opts */
export function applyPriceScaleOpts(chart, series, priceScaleId, opts) {
  series.priceScale().applyOptions(opts);
  try {
    chart.priceScale(priceScaleId).applyOptions(opts);
  } catch {
    /* ignore */
  }
  viewportDebugThrottle("applyScale", "applyPriceScaleOpts", { priceScaleId, opts }, 1500);
}

/** @param {import("lightweight-charts").IChartApi} chart @param {import("lightweight-charts").ISeriesApi} series */
function priceScaleReady(chart, series) {
  const paneH = chart.paneSize?.(0)?.height ?? chart.paneSize?.()?.height ?? 0;
  if (paneH <= 0) return false;
  const mid = series.coordinateToPrice(paneH / 2);
  return mid != null && Number.isFinite(mid);
}

/**
 * @param {object} pane
 * @param {{ scaleMargins?: { top: number, bottom: number }, logicalRange?: { from: number, to: number }, barSpacing?: number }} viewport
 * @param {"left" | "right"} [priceScaleId]
 * @param {{ autoScale?: boolean, lockPriceToBarRatio?: boolean }} [scalesSettings]
 */
export function applyPaneViewport(pane, viewport, priceScaleId = "right", scalesSettings = {}) {
  if (!pane?.chart || !pane?.series || !viewport) {
    viewportDebug("applyPaneViewport skipped", { pane: pane?.index, hasViewport: Boolean(viewport) });
    return;
  }

  viewportDebug("applyPaneViewport start", {
    pane: pane.index,
    viewport,
    scalesSettings: {
      autoScale: scalesSettings.autoScale,
      lockPriceToBarRatio: scalesSettings.lockPriceToBarRatio,
    },
  });

  const applyNow = () => {
    if (viewport.barSpacing != null && Number.isFinite(viewport.barSpacing)) {
      pane.chart.timeScale().applyOptions({ barSpacing: viewport.barSpacing });
    }

    const manual = !scalesSettings.autoScale && !scalesSettings.lockPriceToBarRatio;
    if (manual && viewport.scaleMargins) {
      applyPriceScaleOpts(pane.chart, pane.series, priceScaleId, {
        autoScale: false,
        scaleMargins: {
          top: viewport.scaleMargins.top ?? 0.08,
          bottom: viewport.scaleMargins.bottom ?? 0.12,
        },
      });
      pane._priceScalePanReady = true;
    }

    const range = viewport.logicalRange;
    if (range && Number.isFinite(range.from) && Number.isFinite(range.to)) {
      try {
        pane.chart.timeScale().setVisibleLogicalRange({ from: range.from, to: range.to });
        viewportDebug("logicalRange applied", { pane: pane.index, range });
      } catch (err) {
        viewportDebug("logicalRange failed", { pane: pane.index, range, err: String(err) });
      }
    }

    viewportDebugPaneState(pane, priceScaleId, "applyPaneViewport done");
  };

  requestAnimationFrame(() => requestAnimationFrame(applyNow));
}

/**
 * Fit the price scale once, then lock autoScale off so the chart body can be
 * dragged vertically (TradingView-style) without needing a price-axis click first.
 */
export function preparePriceScaleForPan(chart, series, priceScaleId = "right", scaleMargins) {
  const ps = series.priceScale();
  const margins = scaleMargins ?? ps.options().scaleMargins ?? { top: 0.08, bottom: 0.12 };
  viewportDebug("preparePriceScaleForPan start", { priceScaleId, margins });
  applyPriceScaleOpts(chart, series, priceScaleId, { autoScale: true, scaleMargins: margins });

  let attempts = 0;
  const lock = () => {
    attempts += 1;
    const ready = priceScaleReady(chart, series);
    if (!ready) {
      if (attempts < 30) requestAnimationFrame(lock);
      else viewportDebug("preparePriceScaleForPan gave up", { attempts });
      return;
    }
    const current = ps.options().scaleMargins ?? margins;
    applyPriceScaleOpts(chart, series, priceScaleId, {
      autoScale: false,
      scaleMargins: { top: current.top ?? margins.top, bottom: current.bottom ?? margins.bottom },
    });
    viewportDebug("preparePriceScaleForPan locked", {
      attempts,
      scaleMargins: { top: current.top ?? margins.top, bottom: current.bottom ?? margins.bottom },
    });
  };
  requestAnimationFrame(() => requestAnimationFrame(lock));
}

/**
 * @param {object} pane
 * @param {{ autoScale?: boolean, lockPriceToBarRatio?: boolean }} [scalesSettings]
 * @param {() => "left" | "right"} [activePriceScaleId]
 */
export function ensurePanePriceScaleForPan(pane, scalesSettings = {}, activePriceScaleId = () => "right") {
  if (scalesSettings.autoScale || scalesSettings.lockPriceToBarRatio) {
    viewportDebug("ensurePanePriceScaleForPan skip (auto/ratio lock)", {
      pane: pane?.index,
      autoScale: scalesSettings.autoScale,
      lockPriceToBarRatio: scalesSettings.lockPriceToBarRatio,
    });
    return;
  }
  if (!pane?.chart || !pane?.series || !pane.bars?.length) {
    viewportDebug("ensurePanePriceScaleForPan skip (no chart/bars)", { pane: pane?.index });
    return;
  }
  if (pane._priceScalePanReady) {
    viewportDebug("ensurePanePriceScaleForPan skip (already ready)", { pane: pane.index });
    return;
  }
  pane._priceScalePanReady = true;
  const ps = pane.series.priceScale();
  const margins = ps.options().scaleMargins ?? { top: 0.08, bottom: 0.12 };
  const priceScaleId = activePriceScaleId();
  applyPriceScaleOpts(pane.chart, pane.series, priceScaleId, {
    autoScale: false,
    scaleMargins: { top: margins.top ?? 0.08, bottom: margins.bottom ?? 0.12 },
  });
  const ready = priceScaleReady(pane.chart, pane.series);
  viewportDebug("ensurePanePriceScaleForPan init", {
    pane: pane.index,
    margins,
    priceScaleReady: ready,
  });
  if (!ready) {
    preparePriceScaleForPan(pane.chart, pane.series, priceScaleId, margins);
  }
}

/** @param {object} pane */
export function resetPanePriceScalePanReady(pane) {
  if (pane) pane._priceScalePanReady = false;
}

/**
 * TradingView-style vertical pan on the main chart body when autoScale is off.
 */
export function attachChartBodyVerticalPan(chartEl, chart, series, opts) {
  const {
    isRatioLocked = () => false,
    isBlocked = () => false,
    priceScaleId = () => "right",
    onManualScaleLock,
    onViewportChange,
  } = opts;

  let dragging = false;
  let startY = 0;
  let startTop = 0;
  let startBottom = 0;
  let moveCount = 0;

  function onPriceAxis(clientX, clientY) {
    const rect = chartEl.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (lwcPaneIndexAtY(chart, y) !== 0) return true;
    const rw = chart.priceScale("right").width();
    const lw = chart.priceScale("left").width();
    return (rw > 0 && x >= rect.width - rw) || (lw > 0 && x <= lw);
  }

  chartEl.addEventListener(
    "pointerdown",
    (ev) => {
      const blocked = isBlocked();
      const ratioLocked = isRatioLocked();
      const onAxis = onPriceAxis(ev.clientX, ev.clientY);
      if (ev.button !== 0) return;
      if (blocked || ratioLocked || onAxis) {
        const ps = series.priceScale();
        viewportDebugThrottle(
          "vpan-skip-down",
          "vertical pan pointerdown skipped",
          {
            blocked,
            ratioLocked,
            onAxis,
            chartAutoScale: ps.options().autoScale,
          },
          800,
        );
        return;
      }

      const ps = series.priceScale();
      const margins = ps.options().scaleMargins ?? { top: 0.08, bottom: 0.12 };
      if (ps.options().autoScale !== false) {
        applyPriceScaleOpts(chart, series, priceScaleId(), {
          autoScale: false,
          scaleMargins: { top: margins.top ?? 0.08, bottom: margins.bottom ?? 0.12 },
        });
        onManualScaleLock?.();
        viewportDebug("vertical pan locked manual scale", { margins });
      }

      startTop = margins.top ?? 0.08;
      startBottom = margins.bottom ?? 0.12;
      startY = ev.clientY;
      dragging = true;
      moveCount = 0;
      viewportDebug("vertical pan start", {
        startTop,
        startBottom,
        autoScale: series.priceScale().options().autoScale,
        priceReady: priceScaleReady(chart, series),
      });
    },
    { capture: true },
  );

  const endDrag = () => {
    if (dragging) {
      viewportDebug("vertical pan end", { moveCount, startTop, startBottom });
      onViewportChange?.();
    }
    dragging = false;
    moveCount = 0;
  };

  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);

  window.addEventListener(
    "pointermove",
    (ev) => {
      if (!dragging || (ev.buttons & 1) === 0) return;
      if (isRatioLocked() || series.priceScale().options().autoScale !== false) {
        dragging = false;
        return;
      }

      const paneH = chart.paneSize?.(0)?.height ?? chartEl.clientHeight;
      if (paneH <= 0) return;

      const dy = ev.clientY - startY;
      const visible = Math.max(0.04, 1 - startTop - startBottom);
      const shift = (dy / paneH) * visible;

      let top = startTop + shift;
      let bottom = startBottom - shift;
      const minPad = 0.02;
      const maxPad = 0.48;
      top = Math.max(minPad, Math.min(maxPad, top));
      bottom = Math.max(minPad, Math.min(maxPad, bottom));
      if (top + bottom > 0.96) {
        const excess = top + bottom - 0.96;
        top -= excess / 2;
        bottom -= excess / 2;
      }

      applyPriceScaleOpts(chart, series, priceScaleId(), {
        autoScale: false,
        scaleMargins: { top, bottom },
      });
      moveCount += 1;
      if (moveCount === 1 || moveCount % 12 === 0) {
        viewportDebugThrottle("vpan-move", "vertical pan move", { dy, top, bottom, moveCount }, 200);
      }
    },
    { passive: true },
  );

  return { destroy: () => endDrag() };
}

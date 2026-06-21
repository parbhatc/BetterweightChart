import {
  chartXAt,
  coordMapBars,
  safePriceToY,
} from "../../chart/coords/timeScale.js";
import { COARSE_POINTER_MQ } from "./state.js";

/** @param {import("./state.js").ControllerState} ctx */
export function attachCrosshair(ctx) {
  function coord() {
    return ctx.getContext().timeAdapter?.coord;
  }

  function shouldSyncDrawCrosshair(tool = ctx.activeTool) {
    if (ctx.isCursorTool(tool)) return false;
    if (tool === "eraser" || tool === "arrow") return false;
    return true;
  }

  function hideDrawCrosshairDot() {
    ctx.drawCrosshairDot.hidden = true;
  }

  function resolveCrosshairPointFromClient(clientX, clientY) {
    const c = coord();
    if (!c) return null;
    return c.fromClient(
      ctx.chart,
      ctx.series,
      ctx.container,
      clientX,
      clientY,
      ctx.magnetMode,
    );
  }

  function rememberNativeDrawCrosshairFromParam(param) {
    if (!param?.point || param.time == null) return;
    const price = ctx.series.coordinateToPrice(param.point.y);
    if (price == null || !Number.isFinite(price)) return;
    ctx.lastNativeDrawCrosshair = { price, time: param.time };
  }

  function getDrawCrosshairMedia() {
    return ctx.drawCrosshairMedia;
  }

  function resolveDrawCrosshairPoint() {
    if (!ctx.drawCrosshairMedia) return null;
    const c = coord();
    if (!c) return null;
    return c.fromMedia(
      ctx.chart,
      ctx.series,
      ctx.drawCrosshairMedia.x,
      ctx.drawCrosshairMedia.y,
    );
  }

  function syncDrawCrosshairDotFromChart(param = ctx.lastDrawCrosshairParam) {
    if (!COARSE_POINTER_MQ.matches || !shouldSyncDrawCrosshair()) {
      hideDrawCrosshairDot();
      return;
    }
    const dotPoint = ctx.drawCrosshairMedia ?? param?.point;
    if (dotPoint) {
      ctx.lastDrawCrosshairParam = { ...(param ?? {}), point: dotPoint };
    }
    if (!dotPoint) {
      hideDrawCrosshairDot();
      return;
    }
    ctx.drawCrosshairDot.style.left = `${dotPoint.x}px`;
    ctx.drawCrosshairDot.style.top = `${dotPoint.y}px`;
    ctx.drawCrosshairDot.hidden = false;
  }

  function syncDrawCrosshairDot() {
    if (COARSE_POINTER_MQ.matches) {
      syncDrawCrosshairDotFromChart();
      return;
    }
    if (!shouldSyncDrawCrosshair() || !ctx.pinnedDrawCrosshair) {
      hideDrawCrosshairDot();
      return;
    }
    const { barSec } = ctx.getContext();
    const mapBars = coordMapBars(ctx.getContext());
    const x = chartXAt(ctx.chart.timeScale(), mapBars, barSec, undefined, ctx.pinnedDrawCrosshair.time);
    const y = safePriceToY(ctx.series, ctx.pinnedDrawCrosshair.price);
    if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) {
      hideDrawCrosshairDot();
      return;
    }
    ctx.drawCrosshairDot.style.left = `${x}px`;
    ctx.drawCrosshairDot.style.top = `${y}px`;
    ctx.drawCrosshairDot.hidden = false;
  }

  function emitCrosshairSync() {
    if (ctx.draggingDrawing) return;
    ctx.emit("crosshairSync");
  }

  function getCrosshairSyncSnapshot() {
    const fromNative = ctx.lastNativeDrawCrosshair ?? ctx.pinnedDrawCrosshair;
    if (fromNative?.time != null && fromNative.price != null) {
      return {
        time: fromNative.time,
        price: fromNative.price,
        drawDot: COARSE_POINTER_MQ.matches && shouldSyncDrawCrosshair(),
      };
    }
    const pt = resolveDrawCrosshairPoint();
    if (pt) {
      return {
        time: pt.time,
        price: pt.price,
        drawDot: COARSE_POINTER_MQ.matches && shouldSyncDrawCrosshair(),
      };
    }
    return null;
  }

  /** @param {{ time?: number, price?: number, drawDot?: boolean } | null} snapshot */
  function applyCrosshairSyncSnapshot(snapshot) {
    if (snapshot?.time == null || snapshot.price == null) {
      const had = ctx.lastCrosshairSyncApplied != null;
      ctx.lastCrosshairSyncApplied = null;
      if (!had) return;
      ctx.applyingCrosshairSync = true;
      try {
        ctx.chart.clearCrosshairPosition();
        hideDrawCrosshairDot();
      } finally {
        ctx.applyingCrosshairSync = false;
      }
      return;
    }
    const last = ctx.lastCrosshairSyncApplied;
    if (last?.time === snapshot.time && last?.price === snapshot.price) return;
    ctx.lastCrosshairSyncApplied = { time: snapshot.time, price: snapshot.price };
    ctx.applyingCrosshairSync = true;
    try {
      ctx.chart.setCrosshairPosition(snapshot.price, snapshot.time, ctx.series);
    } catch {
      ctx.lastCrosshairSyncApplied = last ?? null;
      return;
    } finally {
      ctx.applyingCrosshairSync = false;
    }
    if (snapshot.drawDot) {
      const { barSec } = ctx.getContext();
      const mapBars = coordMapBars(ctx.getContext());
      const x = chartXAt(ctx.chart.timeScale(), mapBars, barSec, undefined, snapshot.time);
      const y = safePriceToY(ctx.series, snapshot.price);
      if (x != null && y != null) {
        ctx.drawCrosshairMedia = { x, y };
        ctx.drawCrosshairDot.style.left = `${x}px`;
        ctx.drawCrosshairDot.style.top = `${y}px`;
        ctx.drawCrosshairDot.hidden = false;
      }
    } else {
      hideDrawCrosshairDot();
    }
  }

  function isApplyingCrosshairSync() {
    return ctx.applyingCrosshairSync;
  }

  function syncDrawCrosshairAtMediaAnchor() {
    if (ctx.anchoringDrawCrosshair || !shouldSyncDrawCrosshair() || !ctx.drawCrosshairMedia) return;
    const c = coord();
    if (!c) return;
    const point = c.fromMedia(
      ctx.chart,
      ctx.series,
      ctx.drawCrosshairMedia.x,
      ctx.drawCrosshairMedia.y,
    );
    if (!point) return;
    ctx.lastNativeDrawCrosshair = { price: point.price, time: point.time };
    ctx.anchoringDrawCrosshair = true;
    try {
      ctx.chart.setCrosshairPosition(point.price, point.time, ctx.series);
    } finally {
      ctx.anchoringDrawCrosshair = false;
    }
    if (COARSE_POINTER_MQ.matches) {
      syncDrawCrosshairDotFromChart({ point: ctx.drawCrosshairMedia, time: point.time });
    } else {
      hideDrawCrosshairDot();
    }
    emitCrosshairSync();
  }

  function setDrawCrosshairAtClient(clientX, clientY) {
    if (!shouldSyncDrawCrosshair()) return;
    const rect = ctx.container.getBoundingClientRect();
    ctx.drawCrosshairMedia = { x: clientX - rect.left, y: clientY - rect.top };
    syncDrawCrosshairAtMediaAnchor();
  }

  function applyCrosshairScrollDelta(dx, dy, anchorX, anchorY) {
    if (!shouldSyncDrawCrosshair()) return;
    const c = coord();
    if (!c) return;
    const rect = ctx.container.getBoundingClientRect();
    const media = c.scrollMedia(
      ctx.chart,
      ctx.series,
      dx,
      dy,
      anchorX,
      anchorY,
      rect.width,
      rect.height,
    );
    if (!media) return;
    ctx.drawCrosshairMedia = media;
    syncDrawCrosshairAtMediaAnchor();
  }

  function bindDrawCrosshairDotSync() {
    ctx.unsubDrawCrosshairDotSync();
    const onMove = (param) => {
      if (ctx.applyingCrosshairSync) return;
      if (COARSE_POINTER_MQ.matches && shouldSyncDrawCrosshair()) {
        if (ctx.drawCrosshairMedia) {
          syncDrawCrosshairDotFromChart({
            point: ctx.drawCrosshairMedia,
            time: ctx.lastNativeDrawCrosshair?.time ?? param?.time,
          });
          return;
        }
        if (param?.point && param.time != null) {
          rememberNativeDrawCrosshairFromParam(param);
          syncDrawCrosshairDotFromChart(param);
        }
        return;
      }
      if (param?.point && param.time != null) rememberNativeDrawCrosshairFromParam(param);
    };
    const onRange = () => {
      if (ctx.drawCrosshairMedia && shouldSyncDrawCrosshair()) syncDrawCrosshairAtMediaAnchor();
    };
    ctx.chart.subscribeCrosshairMove(onMove);
    ctx.chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);
    ctx.unsubDrawCrosshairDotSync = () => {
      ctx.chart.unsubscribeCrosshairMove(onMove);
      ctx.chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
    };
  }

  function initDrawCrosshairAtCenter() {
    if (!shouldSyncDrawCrosshair()) return;
    const rect = ctx.container.getBoundingClientRect();
    setDrawCrosshairAtClient(rect.left + rect.width / 2, rect.top + rect.height / 2);
    if (!COARSE_POINTER_MQ.matches) {
      const point = resolveCrosshairPointFromClient(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      );
      if (point) ctx.pinnedDrawCrosshair = { price: point.price, time: point.time };
      syncDrawCrosshairDot();
    }
  }

  function syncDrawCrosshair(clientX, clientY) {
    if (!shouldSyncDrawCrosshair() || COARSE_POINTER_MQ.matches) return;
    const point = resolveCrosshairPointFromClient(clientX, clientY);
    if (!point) return;
    ctx.pinnedDrawCrosshair = { price: point.price, time: point.time };
    ctx.lastNativeDrawCrosshair = { price: point.price, time: point.time };
    ctx.chart.setCrosshairPosition(point.price, point.time, ctx.series);
    syncDrawCrosshairDot();
    emitCrosshairSync();
  }

  function repinDrawCrosshair() {
    if (!shouldSyncDrawCrosshair() || COARSE_POINTER_MQ.matches || !ctx.pinnedDrawCrosshair) return;
    ctx.chart.setCrosshairPosition(
      ctx.pinnedDrawCrosshair.price,
      ctx.pinnedDrawCrosshair.time,
      ctx.series,
    );
    syncDrawCrosshairDot();
  }

  function pinDrawCrosshairAt(clientX, clientY) {
    if (COARSE_POINTER_MQ.matches) return;
    syncDrawCrosshair(clientX, clientY);
    requestAnimationFrame(() => {
      repinDrawCrosshair();
      requestAnimationFrame(repinDrawCrosshair);
    });
  }

  function clearDrawCrosshair() {
    ctx.pinnedDrawCrosshair = null;
    ctx.lastNativeDrawCrosshair = null;
    ctx.drawCrosshairMedia = null;
    ctx.lastDrawCrosshairParam = null;
    ctx.lastCrosshairSyncApplied = null;
    ctx.chart.clearCrosshairPosition();
    hideDrawCrosshairDot();
    emitCrosshairSync();
  }

  function syncNativeCrosshairAt(clientX, clientY) {
    if (!ctx.isCursorTool()) return;
    const point = resolveCrosshairPointFromClient(clientX, clientY);
    if (!point) return;
    ctx.lastNativeDrawCrosshair = { price: point.price, time: point.time };
    ctx.chart.setCrosshairPosition(point.price, point.time, ctx.series);
    emitCrosshairSync();
  }

  Object.assign(ctx, {
    shouldSyncDrawCrosshair,
    getDrawCrosshairMedia,
    resolveDrawCrosshairPoint,
    syncDrawCrosshairAtMediaAnchor,
    setDrawCrosshairAtClient,
    applyCrosshairScrollDelta,
    bindDrawCrosshairDotSync,
    initDrawCrosshairAtCenter,
    syncDrawCrosshair,
    repinDrawCrosshair,
    pinDrawCrosshairAt,
    clearDrawCrosshair,
    syncNativeCrosshairAt,
    getCrosshairSyncSnapshot,
    applyCrosshairSyncSnapshot,
    isApplyingCrosshairSync,
  });
}

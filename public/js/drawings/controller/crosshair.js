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

  /** LWC series crosshairMarkerVisible handles the dot; never duplicate with a DOM overlay. */
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

  function emitCrosshairSync() {
    if (ctx.draggingDrawing) return;
    ctx.emit("crosshairSync");
  }

  function getCrosshairSyncSnapshot() {
    const fromNative = ctx.lastNativeDrawCrosshair ?? ctx.pinnedDrawCrosshair;
    if (fromNative?.time != null && fromNative.price != null) {
      return { time: fromNative.time, price: fromNative.price };
    }
    const pt = resolveDrawCrosshairPoint();
    if (pt) return { time: pt.time, price: pt.price };
    return null;
  }

  /** @param {{ time?: number, price?: number } | null} snapshot — chart-time only */
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
    hideDrawCrosshairDot();
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
    hideDrawCrosshairDot();
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
    }
  }

  function syncDrawCrosshair(clientX, clientY) {
    if (!shouldSyncDrawCrosshair() || COARSE_POINTER_MQ.matches) return;
    const point = resolveCrosshairPointFromClient(clientX, clientY);
    if (!point) return;
    ctx.pinnedDrawCrosshair = { price: point.price, time: point.time };
    ctx.lastNativeDrawCrosshair = { price: point.price, time: point.time };
    ctx.chart.setCrosshairPosition(point.price, point.time, ctx.series);
    hideDrawCrosshairDot();
    emitCrosshairSync();
  }

  function repinDrawCrosshair() {
    if (!shouldSyncDrawCrosshair() || COARSE_POINTER_MQ.matches || !ctx.pinnedDrawCrosshair) return;
    ctx.chart.setCrosshairPosition(
      ctx.pinnedDrawCrosshair.price,
      ctx.pinnedDrawCrosshair.time,
      ctx.series,
    );
    hideDrawCrosshairDot();
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

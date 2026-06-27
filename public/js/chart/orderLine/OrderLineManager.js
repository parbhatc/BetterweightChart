import { createOrderLineAdapter } from "./createOrderLineAdapter.js";
import {
  applyNativeOrderLinePatch,
  createOrderLinePriceLineSync,
  flushDeferredOrderLinePatches,
  orderLineOverlayState,
  setOrderLinePanHooks,
} from "./orderLinePriceLineSync.js";
import {
  layoutOrderLineGeometry,
  orderLineCenterY,
  ORDER_LINE_CANCEL_W,
  ORDER_LINE_ROW_H,
  plotPaneWidth,
} from "./rowLayout.js";

const ROW_HIT_PAD = 8;
const CLICK_DRAG_THRESHOLD_SQ = 36;

let nextId = 1;

/** @param {string} key @param {number} [n] */
function aurenPosPerfCount(key, n = 1) {
  try {
    globalThis.__AUREN_POS_PERF__?.count?.(key, n);
  } catch {
    //
  }
}

/**
 * Manages TradingView-style order lines on the active chart pane.
 * Rendering + pills via native series.createOrderLine(); pointer handlers for drag/cancel.
 */
export class OrderLineManager {
  /**
   * @param {() => object | null | undefined} getActivePane
   * @param {object} [opts]
   */
  constructor(getActivePane, opts = {}) {
    this._getActivePane = getActivePane;
    this._getIsPanning = opts.getIsPanning ?? (() => false);
    this._settingsStore = opts.settingsStore ?? null;
    setOrderLinePanHooks({ getIsPanning: () => this._getIsPanning() });
    /** @type {Map<string, ReturnType<typeof createOrderLineAdapter>>} */
    this._adapters = new Map();
    /** @type {object | null} */
    this._paneRef = null;
    /** @type {{ adapter: object, startY: number, startPrice: number } | null} */
    this._drag = null;
    /** @type {{ adapter: object, startX: number, startY: number, part: string } | null} */
    this._pendingModify = null;
    this._listenersBound = false;
    /** @type {HTMLElement | null} */
    this._mountEl = null;
    /** @type {boolean} */
    this._scrollLocked = false;
    /** @type {number} */
    this._refreshRaf = 0;
    /** @type {ResizeObserver | null} */
    this._resizeObs = null;
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onPointerLeave = this._onPointerLeave.bind(this);
    this._onContextMenu = this._onContextMenu.bind(this);

    this._priceLineSync = createOrderLinePriceLineSync(getActivePane);
    this._settingsStore?.onChange?.(() => this.requestRefresh());
  }

  /** @returns {import("./types.js").OrderLineState[]} */
  _activeStates() {
    /** @type {import("./types.js").OrderLineState[]} */
    const out = [];
    for (const adapter of this._adapters.values()) {
      const state = adapter._state;
      if (!state.removed) out.push(state);
    }
    return out;
  }

  /** @param {object} pane */
  _bindPane(pane) {
    if (this._paneRef === pane) return;
    this._teardown();
    this._paneRef = pane;
    this._ensureListeners(pane);
    this._observePaneResize(pane);
  }

  /** @param {object} pane */
  _observePaneResize(pane) {
    this._resizeObs?.disconnect();
    this._resizeObs = null;
    if (typeof ResizeObserver === "undefined") return;
    const mount = pane.el?.closest(".tv-chart-wrap__stage") ?? pane.el;
    if (!(mount instanceof HTMLElement)) return;
    this._resizeObs = new ResizeObserver(() => this.requestRefresh());
    this._resizeObs.observe(mount);
  }

  _teardown() {
    this._resizeObs?.disconnect();
    this._resizeObs = null;
    this._unlockChartScroll();
    this._removeListeners();
    this._paneRef = null;
    this._priceLineSync.destroy();
  }

  _removeListeners() {
    if (!this._listenersBound || !(this._mountEl instanceof HTMLElement)) return;
    const mount = this._mountEl;
    mount.removeEventListener("pointerdown", this._onPointerDown, true);
    mount.removeEventListener("pointermove", this._onPointerMove, true);
    mount.removeEventListener("pointerup", this._onPointerUp, true);
    mount.removeEventListener("pointercancel", this._onPointerUp, true);
    mount.removeEventListener("pointerleave", this._onPointerLeave, true);
    mount.removeEventListener("contextmenu", this._onContextMenu, true);
    this._listenersBound = false;
    this._mountEl = null;
  }

  /** @param {object} pane */
  _ensureListeners(pane) {
    if (this._listenersBound) return;
    const mount = pane.el?.closest(".tv-chart-wrap__stage") ?? pane.el;
    if (!(mount instanceof HTMLElement)) return;
    mount.addEventListener("pointerdown", this._onPointerDown, true);
    mount.addEventListener("pointermove", this._onPointerMove, true);
    mount.addEventListener("pointerup", this._onPointerUp, true);
    mount.addEventListener("pointercancel", this._onPointerUp, true);
    mount.addEventListener("pointerleave", this._onPointerLeave, true);
    mount.addEventListener("contextmenu", this._onContextMenu, true);
    this._listenersBound = true;
    this._mountEl = mount;
  }

  /** TradingView createOrderLine — async for Auren compatibility. */
  createOrderLine() {
    const pane = this._getActivePane();
    if (!pane?.series) return Promise.resolve(null);
    this._bindPane(pane);
    const id = `ol-${nextId++}`;
    const adapter = createOrderLineAdapter(this, id);
    this._adapters.set(id, adapter);
    this.requestRefresh();
    return Promise.resolve(adapter);
  }

  /** @param {ReturnType<typeof createOrderLineAdapter>} adapter */
  remove(adapter) {
    const state = adapter._state;
    if (state.removed) return;
    state.removed = true;
    this._adapters.delete(state.id);
    adapter.target = null;
    adapter.isMoving = false;
    if (!this._adapters.size) {
      this._teardown();
    } else {
      this.requestRefresh();
    }
  }

  requestRefresh() {
    if (!this._adapters.size) return;
    aurenPosPerfCount("bwc.orderLines.requestRefresh");
    if (this._getIsPanning()) {
      return;
    }
    if (this._refreshRaf) return;
    this._refreshRaf = requestAnimationFrame(() => {
      this._refreshRaf = 0;
      aurenPosPerfCount("bwc.orderLines.syncRaf");
      if (this._getIsPanning()) return;
      this._priceLineSync.sync(this._activeStates(), this._adapters);
    });
  }

  /** Apply live pill patches deferred while the chart was panning. */
  flushDeferredLivePatches() {
    flushDeferredOrderLinePatches(this._adapters);
  }

  /** Block chart pan while dragging an order line. */
  _lockChartScroll() {
    if (this._scrollLocked) return;
    const pane = this._paneRef ?? this._getActivePane();
    if (!pane?.chart) return;
    this._scrollLocked = true;
    pane.chart.applyOptions({
      handleScroll: {
        mouseWheel: false,
        pressedMouseMove: false,
        horzTouchDrag: false,
        vertTouchDrag: false,
      },
      kineticScroll: { mouse: false, touch: false },
      handleScale: {
        axisPressedMouseMove: { time: false, price: true },
      },
    });
    const stage = pane.el?.closest(".tv-chart-wrap__stage");
    if (stage instanceof HTMLElement) stage.style.touchAction = "none";
  }

  _unlockChartScroll() {
    if (!this._scrollLocked) return;
    this._scrollLocked = false;
    const pane = this._paneRef ?? this._getActivePane();
    if (!pane?.chart) return;
    pane.chart.applyOptions({
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      kineticScroll: { mouse: true, touch: true },
      handleScale: {
        axisPressedMouseMove: { time: true, price: true },
      },
    });
    const stage = pane.el?.closest(".tv-chart-wrap__stage");
    if (stage instanceof HTMLElement) stage.style.touchAction = "";
  }

  /** @param {PointerEvent} ev */
  _clientToPane(ev) {
    const pane = this._paneRef ?? this._getActivePane();
    if (!pane?.el) return null;
    const rect = pane.el.getBoundingClientRect();
    return { pane, x: ev.clientX - rect.left, y: ev.clientY - rect.top, rect };
  }

  /**
   * @param {import("./types.js").OrderLineState} state
   * @param {object} pane
   * @param {number} px
   * @param {number} py
   * @param {number} scaleW
   */
  _axisHit(state, pane, px, py, scaleW) {
    const series = pane.series;
    const y = series.priceToCoordinate(state.price);
    if (y == null) return null;

    const centerY = orderLineCenterY(y);
    const plotW = plotPaneWidth(pane.chart, pane.el);
    const { totalW, rowLeft } = layoutOrderLineGeometry(orderLineOverlayState(state), plotW, scaleW);
    const top = centerY - ORDER_LINE_ROW_H / 2;
    const cancelLeft = rowLeft + totalW - ORDER_LINE_CANCEL_W;
    const row = {
      left: rowLeft,
      top,
      width: totalW,
      height: ORDER_LINE_ROW_H,
      cancelLeft,
    };

    if (px < row.left || px > row.left + row.width || py < row.top - ROW_HIT_PAD || py > row.top + row.height + ROW_HIT_PAD) {
      return null;
    }

    if (px >= row.cancelLeft) {
      return { kind: "cancel", adapter: this._adapters.get(state.id), row };
    }
    return { kind: "pill", adapter: this._adapters.get(state.id), row };
  }

  /** @param {PointerEvent} ev */
  _onPointerDown(ev) {
    if (ev.button !== 0) return;

    const hit = this._hitTest(ev);
    if (!hit?.adapter) return;

    if (hit.kind === "cancel") {
      ev.preventDefault();
      ev.stopPropagation();
      this._pendingModify = {
        adapter: hit.adapter,
        startX: ev.clientX,
        startY: ev.clientY,
        part: "cancel",
      };
      return;
    }

    if (hit.kind === "pill") {
      ev.preventDefault();
      ev.stopPropagation();
      this._lockChartScroll();
      this._pendingModify = {
        adapter: hit.adapter,
        startX: ev.clientX,
        startY: ev.clientY,
        part: "body",
      };
      return;
    }
  }

  /** @param {object} adapter @param {PointerEvent} ev */
  _startDrag(adapter, ev) {
    this._pendingModify = null;
    this._lockChartScroll();
    this._drag = { adapter, startY: ev.clientY, startPrice: adapter.getPrice() };
    adapter.isMoving = true;
    adapter._state.isMoving = true;
    applyNativeOrderLinePatch(adapter._state, { pills: { moving: true } });
    try {
      (ev.target instanceof Element ? ev.target : this._mountEl)?.setPointerCapture?.(ev.pointerId);
    } catch {
      //
    }
  }

  /** @param {PointerEvent} ev */
  _onPointerMove(ev) {
    if (!this._adapters.size && !this._drag && !this._pendingModify) return;
    // Chart pan uses pressed mouse move — skip order-line hit tests while a button is down.
    if (ev.buttons !== 0 && !this._drag && !this._pendingModify) return;

    if (this._pendingModify && !this._drag) {
      const dx = ev.clientX - this._pendingModify.startX;
      const dy = ev.clientY - this._pendingModify.startY;
      if (this._pendingModify.part !== "cancel" && dx * dx + dy * dy >= CLICK_DRAG_THRESHOLD_SQ) {
        this._startDrag(this._pendingModify.adapter, ev);
      }
    }

    if (this._drag) {
      const pane = this._paneRef ?? this._getActivePane();
      if (!pane?.series) return;
      const rect = pane.el.getBoundingClientRect();
      const y = ev.clientY - rect.top;
      const price = pane.series.coordinateToPrice(y);
      if (price == null || !Number.isFinite(price)) return;
      ev.preventDefault();
      ev.stopPropagation();
      this._drag.adapter.setPrice(price);
      this._drag.adapter._handlers.moving?.();
      return;
    }

    this._updateHoverCursor(ev);
  }

  /** @param {PointerEvent} ev */
  _onPointerUp(ev) {
    if (this._pendingModify && !this._drag) {
      const dx = ev.clientX - this._pendingModify.startX;
      const dy = ev.clientY - this._pendingModify.startY;
      if (dx * dx + dy * dy < CLICK_DRAG_THRESHOLD_SQ) {
        const { adapter, part } = this._pendingModify;
        if (part === "cancel") adapter._handlers.cancel?.();
        else adapter._handlers.modify?.();
      }
      this._pendingModify = null;
      this._unlockChartScroll();
    }

    if (!this._drag) return;
    const adapter = this._drag.adapter;
    adapter.isMoving = false;
    adapter._state.isMoving = false;
    this._drag = null;
    this._unlockChartScroll();
    applyNativeOrderLinePatch(adapter._state, { pills: { moving: false } });
    adapter._handlers.move?.();
  }

  /** @param {PointerEvent} ev */
  _onPointerLeave(ev) {
    if (this._drag || this._pendingModify) return;
    if (this._mountEl) this._mountEl.style.cursor = "";
  }

  /** @param {PointerEvent | MouseEvent} ev */
  _updateHoverCursor(ev) {
    const mount = this._mountEl;
    if (!mount) return;
    const hit = this._hitTest(ev);
    if (!hit) {
      mount.style.cursor = "";
      return;
    }
    mount.style.cursor = hit.kind === "pill" ? "ns-resize" : "default";
  }

  /** @param {MouseEvent} ev */
  _onContextMenu(ev) {
    const hit = this._hitTest(ev);
    if (!hit?.adapter) return;
    const items = hit.adapter._handlers.contextMenu?.();
    if (items == null) return;
    ev.preventDefault();
    ev.stopPropagation();
  }

  /** @param {PointerEvent | MouseEvent} ev */
  _hitTest(ev) {
    const pane = this._paneRef ?? this._getActivePane();
    if (!pane?.series || !pane.el) return null;
    const pos = this._clientToPane(ev);
    if (!pos) return null;
    const scaleW = pane.chart.priceScale("right").width();
    if (scaleW <= 0) return null;

    const states = this._activeStates();
    for (let i = states.length - 1; i >= 0; i -= 1) {
      const hit = this._axisHit(states[i], pane, pos.x, pos.y, scaleW);
      if (hit) return hit;
    }
    return null;
  }
}

/** @param {() => object | null | undefined} getActivePane @param {object} [opts] */
export function createOrderLineManager(getActivePane, opts) {
  return new OrderLineManager(getActivePane, opts);
}

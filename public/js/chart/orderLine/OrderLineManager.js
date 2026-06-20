import { createOrderLineAdapter } from "./createOrderLineAdapter.js";
import { createOrderLineControlsOverlay } from "./orderLineControlsOverlay.js";
import { OrderLinesPrimitive } from "./OrderLinesPrimitive.js";
import {
  layoutOrderLineGeometry,
  ORDER_LINE_CANCEL_W,
  ORDER_LINE_ROW_H,
} from "./rowLayout.js";

const ROW_HIT_PAD = 8;
const CLICK_DRAG_THRESHOLD_SQ = 36;

let nextId = 1;

/**
 * Manages TradingView-style order lines on the active chart pane.
 */
export class OrderLineManager {
  /** @param {() => object | null | undefined} getActivePane */
  constructor(getActivePane) {
    this._getActivePane = getActivePane;
    /** @type {Map<string, ReturnType<typeof createOrderLineAdapter>>} */
    this._adapters = new Map();
    /** @type {import("./OrderLinesPrimitive.js").OrderLinesPrimitive | null} */
    this._primitive = null;
    /** @type {object | null} */
    this._paneRef = null;
    /** @type {{ adapter: object, startY: number, startPrice: number } | null} */
    this._drag = null;
    /** @type {{ adapter: object, startX: number, startY: number, part: string } | null} */
    this._pendingModify = null;
    this._listenersBound = false;
    /** @type {HTMLElement | null} */
    this._mountEl = null;
    /** @type {ReturnType<typeof createOrderLineControlsOverlay> | null} */
    this._overlay = null;
    /** @type {object | null} */
    this._overlayPane = null;
    /** @type {number} */
    this._overlayRaf = 0;
    /** @type {(() => void) | null} */
    this._rangeUnsub = null;
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onPointerLeave = this._onPointerLeave.bind(this);
    this._onContextMenu = this._onContextMenu.bind(this);
    this._onOverlayPointerDown = this._onOverlayPointerDown.bind(this);
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

  _ensurePrimitive(pane) {
    if (this._paneRef === pane && this._primitive) return;
    this._detachPrimitive();
    this._paneRef = pane;
    this._primitive = new OrderLinesPrimitive(() => this._activeStates());
    pane.series.attachPrimitive(this._primitive);
    this._ensureOverlay(pane);
    this._ensureListeners(pane);
    this._bindRangeSync(pane);
    this._scheduleOverlaySync();
  }

  _bindRangeSync(pane) {
    this._rangeUnsub?.();
    const ts = pane.chart.timeScale();
    const onRange = () => this._scheduleOverlaySync();
    ts.subscribeVisibleLogicalRangeChange(onRange);
    this._rangeUnsub = () => ts.unsubscribeVisibleLogicalRangeChange(onRange);
  }

  /** @param {object} pane */
  _ensureOverlay(pane) {
    if (this._overlayPane === pane && this._overlay) return;
    this._destroyOverlay();
    if (!(pane.el instanceof HTMLElement)) return;
    this._overlayPane = pane;
    this._overlay = createOrderLineControlsOverlay(pane.el);
    this._overlay.root.addEventListener("pointerdown", this._onOverlayPointerDown, true);
  }

  _destroyOverlay() {
    this._overlay?.root.removeEventListener("pointerdown", this._onOverlayPointerDown, true);
    this._overlay?.destroy();
    this._overlay = null;
    this._overlayPane = null;
  }

  _detachPrimitive() {
    this._rangeUnsub?.();
    this._rangeUnsub = null;
    if (this._primitive && this._paneRef?.series) {
      try {
        this._paneRef.series.detachPrimitive(this._primitive);
      } catch {
        //
      }
    }
    this._primitive = null;
    this._paneRef = null;
    this._destroyOverlay();
  }

  /** @param {object} pane */
  _ensureListeners(pane) {
    if (this._listenersBound) return;
    const mount = pane.el?.closest(".tv-chart-wrap__stage") ?? pane.el;
    if (!(mount instanceof HTMLElement)) return;
    mount.addEventListener("pointerdown", this._onPointerDown, true);
    mount.addEventListener("pointermove", this._onPointerMove, true);
    mount.addEventListener("pointerup", this._onPointerUp, true);
    mount.addEventListener("pointerleave", this._onPointerLeave, true);
    mount.addEventListener("contextmenu", this._onContextMenu, true);
    this._listenersBound = true;
    this._mountEl = mount;
  }

  /** TradingView createOrderLine — async for Auren compatibility. */
  createOrderLine() {
    const pane = this._getActivePane();
    if (!pane?.series) return Promise.resolve(null);
    this._ensurePrimitive(pane);
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
    if (!this._adapters.size) this._detachPrimitive();
    this.requestRefresh();
  }

  requestRefresh() {
    this._primitive?.requestRefresh();
    this._scheduleOverlaySync();
  }

  _scheduleOverlaySync() {
    if (this._overlayRaf) return;
    this._overlayRaf = requestAnimationFrame(() => {
      this._overlayRaf = 0;
      this._syncOverlay();
    });
  }

  _syncOverlay() {
    const overlay = this._overlay;
    const primitive = this._primitive;
    if (!overlay || !primitive) return;

    const layouts = primitive.layoutAll();
    overlay.sync(
      layouts.map((layout) => ({
        id: layout.state.id,
        left: layout.rowLeft,
        y: layout.y,
        state: layout.state,
      })),
    );
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

    const plotW = pane.el.getBoundingClientRect().width;
    const { totalW, rowLeft } = layoutOrderLineGeometry(state, plotW, scaleW);
    const top = y - ORDER_LINE_ROW_H / 2;
    const row = {
      left: rowLeft,
      top,
      width: totalW,
      height: ORDER_LINE_ROW_H,
      cancelLeft: rowLeft + totalW - ORDER_LINE_CANCEL_W,
    };

    if (px < row.left || px > row.left + row.width || py < row.top - ROW_HIT_PAD || py > row.top + row.height + ROW_HIT_PAD) {
      if (Math.abs(py - y) <= ROW_HIT_PAD && px >= 0 && px <= plotW) {
        return { kind: "line", adapter: this._adapters.get(state.id) };
      }
      return null;
    }

    if (px >= row.cancelLeft) {
      return { kind: "cancel", adapter: this._adapters.get(state.id), row };
    }
    return { kind: "pill", adapter: this._adapters.get(state.id), row };
  }

  /** @param {PointerEvent} ev */
  _onOverlayPointerDown(ev) {
    if (ev.button !== 0) return;
    const part = ev.target instanceof Element ? ev.target.closest("[data-ol-part]") : null;
    if (!part) return;
    const id = part.closest("[data-ol-id]")?.getAttribute("data-ol-id");
    if (!id) return;
    const adapter = this._adapters.get(id);
    if (!adapter) return;

    ev.preventDefault();
    ev.stopPropagation();
    this._pendingModify = {
      adapter,
      startX: ev.clientX,
      startY: ev.clientY,
      part: part.getAttribute("data-ol-part") || "body",
    };
  }

  /** @param {PointerEvent} ev */
  _onPointerDown(ev) {
    if (ev.button !== 0) return;
    if (ev.target instanceof Element && ev.target.closest(".order-line-control")) return;

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
      this._pendingModify = {
        adapter: hit.adapter,
        startX: ev.clientX,
        startY: ev.clientY,
        part: "body",
      };
      return;
    }

    const pane = this._paneRef ?? this._getActivePane();
    if (!pane) return;
    ev.preventDefault();
    ev.stopPropagation();
    this._startDrag(hit.adapter, ev);
  }

  /** @param {object} adapter @param {PointerEvent} ev */
  _startDrag(adapter, ev) {
    this._pendingModify = null;
    this._drag = { adapter, startY: ev.clientY, startPrice: adapter.getPrice() };
    adapter.isMoving = true;
    adapter._state.isMoving = true;
    this._scheduleOverlaySync();
    try {
      (ev.target instanceof Element ? ev.target : this._mountEl)?.setPointerCapture?.(ev.pointerId);
    } catch {
      //
    }
  }

  /** @param {PointerEvent} ev */
  _onPointerMove(ev) {
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
    }

    if (!this._drag) return;
    const adapter = this._drag.adapter;
    adapter.isMoving = false;
    adapter._state.isMoving = false;
    this._drag = null;
    this._scheduleOverlaySync();
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
    if (ev.target instanceof Element && ev.target.closest(".order-line-control")) {
      mount.style.cursor = "pointer";
      return;
    }
    const hit = this._hitTest(ev);
    if (!hit) {
      mount.style.cursor = "";
      return;
    }
    if (hit.kind === "line") mount.style.cursor = "ns-resize";
    else mount.style.cursor = "pointer";
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

/** @param {() => object | null | undefined} getActivePane */
export function createOrderLineManager(getActivePane) {
  return new OrderLineManager(getActivePane);
}

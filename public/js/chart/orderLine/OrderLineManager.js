import { createOrderLineAdapter } from "./createOrderLineAdapter.js";
import { OrderLinesPrimitive } from "./OrderLinesPrimitive.js";

const ROW_HIT_PAD = 8;
const CANCEL_W = 20;
const GAP = 2;
const PAD_X = 8;
const ROW_H = 20;
const FONT =
  "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif";

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
    this._listenersBound = false;
    /** @type {HTMLElement | null} */
    this._mountEl = null;
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onContextMenu = this._onContextMenu.bind(this);
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
    this._ensureListeners(pane);
  }

  _detachPrimitive() {
    if (this._primitive && this._paneRef?.series) {
      try {
        this._paneRef.series.detachPrimitive(this._primitive);
      } catch {
        //
      }
    }
    this._primitive = null;
    this._paneRef = null;
  }

  /** @param {object} pane */
  _ensureListeners(pane) {
    if (this._listenersBound) return;
    const mount = pane.el?.closest(".tv-chart-wrap__stage") ?? pane.el;
    if (!(mount instanceof HTMLElement)) return;
    mount.addEventListener("pointerdown", this._onPointerDown, true);
    mount.addEventListener("pointermove", this._onPointerMove, true);
    mount.addEventListener("pointerup", this._onPointerUp, true);
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
  }

  /** @param {PointerEvent} ev */
  _clientToPane(ev) {
    const pane = this._paneRef ?? this._getActivePane();
    if (!pane?.el) return null;
    const rect = pane.el.getBoundingClientRect();
    return { pane, x: ev.clientX - rect.left, y: ev.clientY - rect.top, rect };
  }

  /** @param {import("./types.js").OrderLineState} state @param {number} scaleW */
  _axisHit(state, pane, px, py, scaleW) {
    const series = pane.series;
    const y = series.priceToCoordinate(state.price);
    if (y == null) return null;

    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return null;
    ctx.font = `600 11px ${FONT}`;
    const bodyW = Math.max(36, ctx.measureText(state.text || " ").width + PAD_X * 2);
    const qtyW = state.quantity
      ? Math.max(28, ctx.measureText(state.quantity).width + PAD_X * 2)
      : 0;
    const totalW = bodyW + (qtyW ? GAP + qtyW : 0) + GAP + CANCEL_W;
    const plotW = pane.el.getBoundingClientRect().width;
    const left = plotW - scaleW;
    const top = y - ROW_H / 2;
    const row = { left, top, width: totalW, height: ROW_H, cancelLeft: left + totalW - CANCEL_W };

    if (px < row.left || px > row.left + row.width || py < row.top - ROW_HIT_PAD || py > row.top + row.height + ROW_HIT_PAD) {
      if (Math.abs(py - y) <= ROW_HIT_PAD && px >= 0 && px <= plotW - scaleW) {
        return { kind: "line", adapter: this._adapters.get(state.id) };
      }
      return null;
    }

    if (px >= row.cancelLeft) return { kind: "cancel", adapter: this._adapters.get(state.id) };
    return { kind: "line", adapter: this._adapters.get(state.id) };
  }

  /** @param {PointerEvent} ev */
  _onPointerDown(ev) {
    if (ev.button !== 0) return;
    const hit = this._hitTest(ev);
    if (!hit?.adapter) return;

    if (hit.kind === "cancel") {
      ev.preventDefault();
      ev.stopPropagation();
      hit.adapter._handlers.cancel?.();
      return;
    }

    const pane = this._paneRef ?? this._getActivePane();
    if (!pane) return;
    ev.preventDefault();
    ev.stopPropagation();
    const price = hit.adapter.getPrice();
    this._drag = { adapter: hit.adapter, startY: ev.clientY, startPrice: price };
    hit.adapter.isMoving = true;
    hit.adapter._state.isMoving = true;
    try {
      (ev.target instanceof Element ? ev.target : this._mountEl)?.setPointerCapture?.(ev.pointerId);
    } catch {
      //
    }
  }

  /** @param {PointerEvent} ev */
  _onPointerMove(ev) {
    if (!this._drag) return;
    const pane = this._paneRef ?? this._getActivePane();
    if (!pane?.series) return;
    const rect = pane.el.getBoundingClientRect();
    const y = ev.clientY - rect.top;
    const price = pane.series.coordinateToPrice(y);
    if (price == null || !Number.isFinite(price)) return;
    ev.preventDefault();
    this._drag.adapter.setPrice(price);
    this._drag.adapter._handlers.moving?.();
  }

  /** @param {PointerEvent} ev */
  _onPointerUp(ev) {
    if (!this._drag) return;
    const adapter = this._drag.adapter;
    adapter.isMoving = false;
    adapter._state.isMoving = false;
    this._drag = null;
    adapter._handlers.move?.();
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

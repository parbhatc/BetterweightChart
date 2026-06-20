import { createExecutionShapeAdapter } from "./createExecutionShapeAdapter.js";
import { ExecutionShapesPrimitive } from "./ExecutionShapesPrimitive.js";

let nextId = 1;

export class ExecutionShapeManager {
  /** @param {() => object | null | undefined} getActivePane */
  constructor(getActivePane) {
    this._getActivePane = getActivePane;
    /** @type {Map<string, ReturnType<typeof createExecutionShapeAdapter>>} */
    this._adapters = new Map();
    /** @type {import("./ExecutionShapesPrimitive.js").ExecutionShapesPrimitive | null} */
    this._primitive = null;
    /** @type {object | null} */
    this._paneRef = null;
  }

  /** @returns {import("./types.js").ExecutionShapeState[]} */
  _activeStates() {
    /** @type {import("./types.js").ExecutionShapeState[]} */
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
    this._primitive = new ExecutionShapesPrimitive(() => {
      const view = pane._chartView;
      return {
        states: this._activeStates(),
        utcBars: view?.utcBars ?? pane.bars ?? [],
        chartBars: view?.chartBars ?? pane.shiftedBars ?? pane.bars ?? [],
        timeAdapter: pane.timeAdapter ?? view?.timeAdapter ?? null,
      };
    });
    pane.series.attachPrimitive(this._primitive);
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

  createExecutionShape() {
    const pane = this._getActivePane();
    if (!pane?.series) return Promise.resolve(null);
    this._ensurePrimitive(pane);
    const id = `ex-${nextId++}`;
    const adapter = createExecutionShapeAdapter(this, id);
    this._adapters.set(id, adapter);
    this.requestRefresh();
    return Promise.resolve(adapter);
  }

  /** @param {ReturnType<typeof createExecutionShapeAdapter>} adapter */
  remove(adapter) {
    const state = adapter._state;
    if (state.removed) return;
    state.removed = true;
    this._adapters.delete(state.id);
    if (!this._adapters.size) this._detachPrimitive();
    this.requestRefresh();
  }

  requestRefresh() {
    this._primitive?.requestRefresh();
  }
}

/** @param {() => object | null | undefined} getActivePane */
export function createExecutionShapeManager(getActivePane) {
  return new ExecutionShapeManager(getActivePane);
}

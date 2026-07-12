import { listIndicators, getIndicatorClass } from "./catalog.js";

/**
 * Host-facing indicator helpers: `widget.indicators.add("ema")`, `.remove("ema")`, …
 *
 * @param {object} opts
 * @param {() => object | null | undefined} opts.getController
 * @param {() => object | undefined} opts.getActivePane
 * @param {() => void} [opts.ensureData]
 */
export function createIndicatorsApi(opts) {
  const { getController, getActivePane, ensureData } = opts;

  function controller() {
    return getController?.() ?? null;
  }

  /**
   * Add an indicator by catalog id (e.g. `"ema"`, `"rsi"`, `"volume"`).
   * @param {string} defId
   * @param {{ paneIndex?: number, inputs?: object, style?: object, visibility?: object }} [options]
   * @returns {string | null} instance id
   */
  function add(defId, options = {}) {
    const c = controller();
    if (!c) throw new Error("Indicators are not ready");
    const id = String(defId ?? "").trim();
    if (!id) throw new Error("Indicator id is required");
    if (!getIndicatorClass(id)) {
      throw new Error(`Unknown indicator "${id}". Use indicators.available() for ids.`);
    }
    const paneIndex =
      options.paneIndex != null
        ? Number(options.paneIndex)
        : (getActivePane()?.index ?? 0);
    const instanceId = c.addIndicator(id, paneIndex);
    if (!instanceId) return null;
    if (options.inputs || options.style || options.visibility) {
      c.patchIndicator(instanceId, {
        inputs: options.inputs,
        style: options.style,
        visibility: options.visibility,
      });
    }
    ensureData?.();
    return instanceId;
  }

  /**
   * Remove by instance id, or all instances of a catalog id.
   * @param {string} id instance id or catalog id (e.g. `"ema"`)
   * @returns {number} how many instances were removed
   */
  function remove(id) {
    const c = controller();
    if (!c || id == null || id === "") return 0;
    const key = String(id);
    if (c.getInstance?.(key)) {
      c.removeIndicator(key);
      return 1;
    }
    let n = 0;
    for (const inst of Object.values(c.getIndicatorsByPane?.() ?? {}).flat()) {
      if (inst.defId === key || inst.type === key) {
        c.removeIndicator(inst.instanceId);
        n += 1;
      }
    }
    return n;
  }

  /** @param {number} [paneIndex] */
  function clear(paneIndex) {
    const c = controller();
    if (!c) return;
    if (paneIndex == null) c.clearAll();
    else c.clearForPane(Number(paneIndex));
  }

  /** Active instances on the chart. */
  function list() {
    const c = controller();
    if (!c?.getIndicatorsByPane) return [];
    return Object.values(c.getIndicatorsByPane()).flat();
  }

  /** Catalog entries that can be passed to `add()`. */
  function available() {
    return listIndicators().map((Indicator) => ({
      id: Indicator.id,
      title: Indicator.title,
      shortTitle: Indicator.shortTitle,
    }));
  }

  /**
   * @param {string} instanceId
   * @param {{ inputs?: object, style?: object, visibility?: object, hidden?: boolean }} patch
   */
  function patch(instanceId, patchIn) {
    const c = controller();
    if (!c) return;
    if (patchIn.hidden != null) c.setHidden(instanceId, Boolean(patchIn.hidden));
    c.patchIndicator(instanceId, patchIn);
    ensureData?.();
  }

  return { add, remove, clear, list, available, patch, get: (id) => controller()?.getInstance?.(id) ?? null };
}

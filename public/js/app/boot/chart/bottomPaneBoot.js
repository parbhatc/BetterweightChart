import { getIndicatorClass } from "../../../indicators/catalog.js";
import { createBottomPanePanel } from "../../../ui/bottomPane/bottomPanePanel.js";
import { createBottomPaneReopenButton } from "../../../ui/bottomPane/reopenButton.js";

/**
 * @typedef {object} BottomPaneProvider
 * @property {(inst: import("../../../indicators/types.js").IndicatorInstance) => boolean} [isActive]
 * @property {(inst: import("../../../indicators/types.js").IndicatorInstance, contentEl: HTMLElement) => Promise<void>} sync
 * @property {(contentEl: HTMLElement) => void} [clear]
 */

/**
 * Global resizable bottom pane. Indicators opt in via `setUseBottomPane(true)` and
 * register content with `ctx.registerBottomPaneProvider(defId, provider)`.
 *
 * @param {import("./state.js").BootContext} ctx
 */
export function attachBottomPaneBoot(ctx) {
  /** @type {Map<string, BottomPaneProvider>} */
  const providers = new Map();

  const slot =
    document.getElementById("bottom-pane-slot") ?? document.querySelector(".tv-bottom-pane-slot");

  const panel = createBottomPanePanel({
    mountEl: slot instanceof HTMLElement ? slot : undefined,
    onSelect: (instanceId) => {
      selectedInstanceId = instanceId;
      void renderSelected();
    },
    onClose: () => syncBottomPane(),
  });

  const reopenBtn = createBottomPaneReopenButton({
    onReopen: () => {
      panel.reopen();
      syncBottomPane();
    },
  });

  /** @type {string | null} */
  let selectedInstanceId = null;

  /** @param {string} defId @param {BottomPaneProvider} provider */
  function registerBottomPaneProvider(defId, provider) {
    providers.set(defId, provider);
  }

  /** @param {number} paneIndex */
  function candidatesForPane(paneIndex) {
    const controller = ctx.indicatorController;
    if (!controller) return [];

    /** @type {import("../../../indicators/types.js").IndicatorInstance[]} */
    const out = [];
    for (const inst of controller.indicatorsForPane(paneIndex)) {
      if (inst.hidden) continue;
      const Indicator = getIndicatorClass(inst.defId);
      if (!Indicator?.useBottomPane) continue;
      const provider = providers.get(inst.defId);
      if (!provider) continue;
      if (provider.isActive && !provider.isActive(inst)) continue;
      out.push(inst);
    }
    return out;
  }

  /** @param {import("../../../indicators/types.js").IndicatorInstance} inst */
  function labelForInstance(inst) {
    const Indicator = getIndicatorClass(inst.defId);
    const base = Indicator?.title ?? inst.defId;
    const pane = ctx.getAllChartPanes?.().find((p) => p.index === inst.paneIndex);
    if ((ctx.getAllChartPanes?.().length ?? 1) > 1 && pane) {
      return `${base} · Pane ${pane.index + 1}`;
    }
    return base;
  }

  async function renderSelected() {
    const pane = ctx.getActivePane?.() ?? ctx.chartPanes?.get(0);
    if (!pane) return;

    const candidates = candidatesForPane(pane.index);
    const inst =
      candidates.find((c) => c.instanceId === selectedInstanceId) ?? candidates[0] ?? null;
    if (!inst) return;

    selectedInstanceId = inst.instanceId;
    panel.setOptions(
      candidates.map((c) => ({ instanceId: c.instanceId, label: labelForInstance(c) })),
      selectedInstanceId,
    );

    const provider = providers.get(inst.defId);
    panel.setLoading(true);
    try {
      if (provider) await provider.sync(inst, panel.contentEl);
    } finally {
      panel.setLoading(false);
    }
  }

  function syncBottomPane() {
    const pane = ctx.getActivePane?.() ?? ctx.chartPanes?.get(0);
    if (!pane) {
      panel.hide();
      reopenBtn.sync(null);
      return;
    }

    const candidates = candidatesForPane(pane.index);
    if (!candidates.length) {
      for (const provider of providers.values()) {
        provider.clear?.(panel.contentEl);
      }
      panel.hide();
      reopenBtn.sync(null);
      selectedInstanceId = null;
      return;
    }

    if (
      !selectedInstanceId ||
      !candidates.some((c) => c.instanceId === selectedInstanceId)
    ) {
      selectedInstanceId = candidates[0].instanceId;
    }

    const inst =
      candidates.find((c) => c.instanceId === selectedInstanceId) ?? candidates[0];
    const title = labelForInstance(inst);

    if (panel.isUserDismissed()) {
      reopenBtn.sync({ title, subtitle: "Bottom pane" });
      panel.hide();
      return;
    }

    reopenBtn.sync(null);
    panel.setOptions(
      candidates.map((c) => ({ instanceId: c.instanceId, label: labelForInstance(c) })),
      selectedInstanceId,
    );
    panel.show();
    void renderSelected();
  }

  /** @param {string} [instanceId] */
  function openBottomPane(instanceId) {
    if (instanceId) selectedInstanceId = instanceId;
    panel.reopen();
    syncBottomPane();
  }

  ctx.registerBottomPaneProvider = registerBottomPaneProvider;
  ctx.syncBottomPane = syncBottomPane;
  ctx.openBottomPane = openBottomPane;
  ctx.getBottomPaneContentEl = () => panel.contentEl;
}

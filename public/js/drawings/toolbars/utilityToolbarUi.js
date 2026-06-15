import { CHEVRON_RIGHT, drawToolIcon } from "../catalog/toolIcons.js";

/**
 * @param {object} ctx
 * @param {HTMLElement} ctx.toolbarEl
 * @param {ReturnType<import("../controller/drawingController.js").createDrawingController>} ctx.controller
 * @param {() => void} ctx.closeAllFlyouts
 * @param {import("./flyoutHost.js").createFlyoutHost} ctx.flyout
 * @param {(type: string) => void} ctx.selectCursorTool
 */
export function createUtilityToolbarUi(ctx) {
  const { toolbarEl, controller, closeAllFlyouts, flyout, selectCursorTool } = ctx;
  const { attachFlyoutToggle } = flyout;

  function buildUtilityFlyout(cluster, control, items, onItem) {
    cluster.classList.add("draw-tools__cluster--has-menu");
    const expandBtn = document.createElement("button");
    expandBtn.type = "button";
    expandBtn.className = "draw-tools__expand";
    expandBtn.setAttribute("aria-expanded", "false");
    expandBtn.innerHTML = CHEVRON_RIGHT;

    const flyoutEl = document.createElement("div");
    flyoutEl.className = "draw-tools__flyout draw-tools__flyout--utility";
    flyoutEl.hidden = true;
    flyoutEl.setAttribute("role", "menu");

    for (const item of items) {
      if (item.type === "divider") {
        const divider = document.createElement("div");
        divider.className = "draw-tools__flyout-divider";
        flyoutEl.appendChild(divider);
        continue;
      }
      if (item.type === "toggle") {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "draw-tools__flyout-item draw-tools__flyout-item--toggle";
        row.innerHTML = `<span class="draw-tools__flyout-label">${item.label}</span><span class="draw-tools__switch${item.checked ? " draw-tools__switch--on" : ""}" aria-hidden="true"><span class="draw-tools__switch-track"></span><span class="draw-tools__switch-thumb"></span></span>`;
        row.addEventListener("click", (ev) => {
          ev.stopPropagation();
          item.onToggle();
          syncUtilityUi();
        });
        flyoutEl.appendChild(row);
        continue;
      }
      const row = document.createElement("button");
      row.type = "button";
      row.className = "draw-tools__flyout-item";
      row.dataset.utilityAction = item.id;
      row.setAttribute("role", "menuitem");
      row.innerHTML = `<span class="draw-tools__flyout-label">${item.label}</span>`;
      row.addEventListener("click", () => {
        onItem(item.id);
        closeAllFlyouts();
      });
      flyoutEl.appendChild(row);
    }

    attachFlyoutToggle(cluster, expandBtn, flyoutEl);
    control.appendChild(expandBtn);
    return flyoutEl;
  }

  function syncUtilityUi() {
    const measureBtn = toolbarEl.querySelector('[data-draw-action="measure"]');
    if (measureBtn) {
      measureBtn.classList.toggle("draw-tools__tool--active", controller.getMeasureMode());
      measureBtn.setAttribute("aria-pressed", String(controller.getMeasureMode()));
    }
    const magnetBtn = toolbarEl.querySelector('[data-draw-action="magnet"]');
    if (magnetBtn) {
      const mode = controller.getMagnetMode();
      magnetBtn.classList.toggle("draw-tools__tool--active", mode !== "off");
      magnetBtn.innerHTML = drawToolIcon(mode === "strong" ? "magnet-strong" : "magnet");
    }
    const lockBtn = toolbarEl.querySelector('[data-draw-action="lock"]');
    if (lockBtn) {
      lockBtn.classList.toggle("draw-tools__tool--active", controller.getLockAllDrawings());
      lockBtn.setAttribute("aria-pressed", String(controller.getLockAllDrawings()));
    }
    const hideBtn = toolbarEl.querySelector('[data-draw-action="hide"]');
    if (hideBtn) {
      hideBtn.classList.toggle("draw-tools__tool--active", controller.getDrawingsHidden() || controller.getHideAll());
    }
    document.querySelectorAll("#draw-flyout-remove [data-utility-action]").forEach((el) => {
      const id = el.dataset.utilityAction;
      const labelEl = el.querySelector(".draw-tools__flyout-label");
      if (!id || !labelEl) return;
      if (id === "remove-drawings") {
        const n = controller.getCount();
        labelEl.textContent = n === 1 ? "Remove 1 drawing" : `Remove ${n} drawings`;
        el.toggleAttribute("disabled", n === 0);
      }
      if (id === "remove-all") {
        const d = controller.getCount();
        const i = controller.getIndicatorCount();
        labelEl.textContent =
          i > 0 ? `Remove ${d} drawings & ${i} indicators` : d === 1 ? "Remove 1 drawing" : `Remove ${d} drawings`;
        el.toggleAttribute("disabled", d === 0 && i === 0);
      }
    });
    document.querySelectorAll("#draw-flyout-magnet [data-magnet-mode]").forEach((el) => {
      el.classList.toggle("draw-tools__flyout-item--active", el.dataset.magnetMode === controller.getMagnetMode());
    });
    const toggle = document.querySelector('#draw-flyout-remove .draw-tools__switch[data-toggle="always-remove-locked"]');
    if (toggle) {
      toggle.classList.toggle("draw-tools__switch--on", controller.getAlwaysRemoveLocked());
    }
  }

  function buildRemoveFlyout(cluster, control) {
    const flyoutEl = buildUtilityFlyout(cluster, control, [], () => {});
    flyoutEl.id = "draw-flyout-remove";
    flyoutEl.innerHTML = "";

    const addRow = (id, label) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "draw-tools__flyout-item";
      row.dataset.utilityAction = id;
      row.setAttribute("role", "menuitem");
      row.innerHTML = `<span class="draw-tools__flyout-label">${label}</span>`;
      row.addEventListener("click", () => {
        if (id === "remove-drawings" || id === "remove-all") {
          controller.removeDrawings({ includeLocked: controller.getAlwaysRemoveLocked() });
          selectCursorTool("cursor");
        }
        closeAllFlyouts();
        syncUtilityUi();
      });
      flyoutEl.appendChild(row);
    };

    addRow("remove-drawings", "Remove drawings");
    addRow("remove-all", "Remove all");

    const divider = document.createElement("div");
    divider.className = "draw-tools__flyout-divider";
    flyoutEl.appendChild(divider);

    const toggleRow = document.createElement("button");
    toggleRow.type = "button";
    toggleRow.className = "draw-tools__flyout-item draw-tools__flyout-item--toggle";
    toggleRow.innerHTML = `<span class="draw-tools__flyout-label">Always remove locked drawings</span><span class="draw-tools__switch" data-toggle="always-remove-locked" aria-hidden="true"><span class="draw-tools__switch-track"></span><span class="draw-tools__switch-thumb"></span></span>`;
    toggleRow.addEventListener("click", (ev) => {
      ev.stopPropagation();
      controller.setAlwaysRemoveLocked(!controller.getAlwaysRemoveLocked());
      syncUtilityUi();
    });
    flyoutEl.appendChild(toggleRow);
  }

  function buildHideFlyout(cluster, control) {
    buildUtilityFlyout(cluster, control, [], () => {});
    const flyoutEl = cluster.querySelector(".draw-tools__flyout");
    if (!flyoutEl) return;
    flyoutEl.id = "draw-flyout-hide";
    flyoutEl.innerHTML = "";

    const addRow = (id, label, onClick) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "draw-tools__flyout-item";
      row.dataset.utilityAction = id;
      row.setAttribute("role", "menuitem");
      row.innerHTML = `<span class="draw-tools__flyout-label">${label}</span>`;
      row.addEventListener("click", () => {
        onClick();
        closeAllFlyouts();
        syncUtilityUi();
      });
      flyoutEl.appendChild(row);
    };

    addRow("hide-drawings", "Hide drawings", () => {
      controller.setDrawingsHidden(!controller.getDrawingsHidden());
      if (!controller.getDrawingsHidden()) controller.setHideAll(false);
    });
    addRow("hide-all", "Hide all", () => {
      controller.setHideAll(!controller.getHideAll());
    });
  }

  function buildMagnetFlyout(cluster, control) {
    buildUtilityFlyout(cluster, control, [], () => {});
    const flyoutEl = cluster.querySelector(".draw-tools__flyout");
    if (!flyoutEl) return;
    flyoutEl.id = "draw-flyout-magnet";
    flyoutEl.innerHTML = "";

    for (const item of [
      { id: "weak", label: "Weak magnet", icon: "magnet" },
      { id: "strong", label: "Strong magnet", icon: "magnet-strong" },
    ]) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "draw-tools__flyout-item";
      row.dataset.magnetMode = item.id;
      row.setAttribute("role", "menuitem");
      row.innerHTML = `${drawToolIcon(item.icon)}<span class="draw-tools__flyout-label">${item.label}</span>`;
      row.addEventListener("click", () => {
        controller.setMagnetMode(item.id);
        closeAllFlyouts();
        syncUtilityUi();
      });
      flyoutEl.appendChild(row);
    }
  }

  function buildUtilityCluster({ id, label, icon, withFlyout, onPrimaryClick }) {
    const cluster = document.createElement("div");
    cluster.className = "draw-tools__cluster";
    cluster.dataset.utilityGroup = id;

    const control = document.createElement("div");
    control.className = "draw-tools__control";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "draw-tools__tool draw-tools__tool--action";
    btn.dataset.drawAction = id;
    btn.title = label;
    btn.setAttribute("aria-label", label);
    btn.innerHTML = drawToolIcon(icon);
    btn.addEventListener("click", onPrimaryClick);
    control.appendChild(btn);
    cluster.appendChild(control);

    if (withFlyout) withFlyout(cluster, control);
    return cluster;
  }

  return {
    buildUtilityCluster,
    buildMagnetFlyout,
    buildHideFlyout,
    buildRemoveFlyout,
    syncUtilityUi,
  };
}

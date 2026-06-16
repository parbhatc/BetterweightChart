/**
 * Flyout positioning and open/close state for the drawing toolbar.
 * @param {HTMLElement} toolbarEl
 */
export function createFlyoutHost(toolbarEl) {
  /** @type {HTMLElement[]} */
  const flyouts = [];

  function clearFlyoutPlacement(flyout) {
    flyout.style.top = "";
    flyout.style.left = "";
    flyout.style.right = "";
    flyout.style.bottom = "";
    flyout.style.width = "";
    flyout.style.height = "";
    flyout.style.maxHeight = "";
  }

  function closeAllFlyouts() {
    flyouts.forEach((m) => {
      m.hidden = true;
      clearFlyoutPlacement(m);
    });
    toolbarEl.querySelectorAll(".draw-tools__expand").forEach((b) => {
      b.setAttribute("aria-expanded", "false");
    });
    toolbarEl.querySelectorAll(".draw-tools__cluster--open").forEach((c) => {
      c.classList.remove("draw-tools__cluster--open");
    });
  }

  function positionFlyout(flyout, cluster) {
    const control = cluster.querySelector(".draw-tools__control");
    if (!control) return;
    clearFlyoutPlacement(flyout);

    const pad = 8;
    const gap = 2;
    const rect = control.getBoundingClientRect();
    const toolbarRect = toolbarEl.getBoundingClientRect();
    const isMega = flyout.classList.contains("draw-tools__flyout--mega");
    const top = Math.max(pad, rect.top);

    flyout.style.top = `${top}px`;

    let left = isMega ? toolbarRect.right + gap : rect.right + gap;
    const maxLeft = window.innerWidth - pad - 160;
    if (left > maxLeft) left = Math.max(toolbarRect.right + gap, maxLeft);
    flyout.style.left = `${left}px`;
    flyout.style.height = "";
    flyout.style.maxHeight = "";

    if (isMega) {
      const toolbarRoot = toolbarEl.querySelector(".draw-tools") ?? toolbarEl;
      const footer = toolbarRoot.querySelector(".draw-tools__footer");
      const bottomBound = footer
        ? footer.getBoundingClientRect().top - pad
        : toolbarRoot.getBoundingClientRect().bottom - pad;
      const height = Math.max(180, bottomBound - top);
      flyout.style.height = `${height}px`;
      flyout.style.maxHeight = `${height}px`;
    }
  }

  function mountFlyout(flyout, cluster) {
    flyout.dataset.flyoutCluster = cluster.dataset.toolGroup ?? cluster.dataset.utilityGroup ?? "";
    document.body.appendChild(flyout);
    flyouts.push(flyout);
    flyout.addEventListener("mousedown", (ev) => ev.stopPropagation());
    flyout.addEventListener("click", (ev) => ev.stopPropagation());
    flyout.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    flyout.addEventListener("touchstart", (ev) => ev.stopPropagation(), { passive: true });
  }

  function attachFlyoutToggle(cluster, expandBtn, flyout, onOpen) {
    mountFlyout(flyout, cluster);
    expandBtn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const wasOpen = !flyout.hidden;
      closeAllFlyouts();
      if (wasOpen) return;
      expandBtn.setAttribute("aria-expanded", "true");
      cluster.classList.add("draw-tools__cluster--open");
      positionFlyout(flyout, cluster);
      flyout.hidden = false;
      onOpen?.();
    });
  }

  function repositionOpenFlyouts() {
    flyouts.forEach((flyout) => {
      if (flyout.hidden) return;
      const cluster =
        toolbarEl.querySelector(`[data-tool-group="${flyout.dataset.flyoutCluster}"]`) ??
        toolbarEl.querySelector(`[data-utility-group="${flyout.dataset.flyoutCluster}"]`);
      if (cluster) positionFlyout(flyout, cluster);
    });
  }

  return { flyouts, closeAllFlyouts, positionFlyout, mountFlyout, attachFlyoutToggle, repositionOpenFlyouts };
}

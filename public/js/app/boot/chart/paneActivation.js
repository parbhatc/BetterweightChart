/**
 * Select a layout pane on pointer/touch (mousedown alone misses many mobile taps on the canvas).
 * @param {HTMLElement} wrapEl
 * @param {number} paneIndex
 * @param {(index: number) => void} setActivePane
 */
export function wirePaneActivation(wrapEl, paneIndex, setActivePane) {
  if (!(wrapEl instanceof HTMLElement) || typeof setActivePane !== "function") return;

  const activate = (e) => {
    if (e.type === "mousedown" && e.button !== 0) return;
    setActivePane(paneIndex);
  };

  wrapEl.addEventListener("pointerdown", activate, { capture: true });
  wrapEl.addEventListener("mousedown", activate);
}

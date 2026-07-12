/**
 * Long-press → synthetic "contextmenu" for touch/pen pointers.
 * iOS Safari never fires contextmenu on long-press; Android Chrome sometimes does.
 * We synthesize one after LONG_PRESS_MS with movement under SLOP_PX, and suppress
 * a duplicate native contextmenu arriving right after ours.
 */

const LONG_PRESS_MS = 500;
const SLOP_PX = 8;
const NATIVE_DUP_WINDOW_MS = 700;

let installed = false;

export function installLongPressContextMenu() {
  if (installed) return;
  installed = true;

  let timer = 0;
  let startX = 0;
  let startY = 0;
  let target = null;
  let pointerId = null;
  let synthesizedAt = 0;

  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = 0;
    target = null;
    pointerId = null;
  };

  const fire = () => {
    timer = 0;
    const t = target;
    target = null;
    pointerId = null;
    if (!t || !t.isConnected) return;
    synthesizedAt = performance.now();
    const ev = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: startX,
      clientY: startY,
      button: 2,
      buttons: 2,
    });
    t.dispatchEvent(ev);
  };

  document.addEventListener(
    "pointerdown",
    (ev) => {
      if (ev.pointerType !== "touch" && ev.pointerType !== "pen") return;
      if (!ev.isPrimary) return;
      cancel();
      startX = ev.clientX;
      startY = ev.clientY;
      target = ev.target instanceof Element ? ev.target : null;
      pointerId = ev.pointerId;
      if (target) timer = setTimeout(fire, LONG_PRESS_MS);
    },
    true,
  );

  document.addEventListener(
    "pointermove",
    (ev) => {
      if (!timer || ev.pointerId !== pointerId) return;
      if (Math.abs(ev.clientX - startX) > SLOP_PX || Math.abs(ev.clientY - startY) > SLOP_PX) {
        cancel();
      }
    },
    true,
  );

  document.addEventListener("pointerup", cancel, true);
  document.addEventListener("pointercancel", cancel, true);

  // If the browser natively synthesizes contextmenu on long-press right after ours, drop it.
  document.addEventListener(
    "contextmenu",
    (ev) => {
      if (!ev.isTrusted) return;
      if (timer) cancel();
      if (performance.now() - synthesizedAt < NATIVE_DUP_WINDOW_MS) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
      }
    },
    true,
  );
}

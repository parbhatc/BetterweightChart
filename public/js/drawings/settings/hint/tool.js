let hintEl = null;

function toolbarHintsEnabled() {
  return window.matchMedia?.("(hover: hover)")?.matches ?? true;
}

function ensureHint() {
  if (hintEl) return hintEl;
  hintEl = document.createElement("div");
  hintEl.className = "tv-floating-toolbar__hint";
  hintEl.hidden = true;
  hintEl.setAttribute("role", "tooltip");
  document.body.appendChild(hintEl);
  return hintEl;
}

/** @param {HTMLElement} anchor */
function positionHint(anchor) {
  const hint = ensureHint();
  const rect = anchor.getBoundingClientRect();
  const pad = 6;
  hint.style.left = `${rect.left + rect.width / 2}px`;
  let top = rect.top - pad;
  hint.style.transform = "translate(-50%, -100%)";
  hint.style.top = `${top}px`;

  const hintRect = hint.getBoundingClientRect();
  if (hintRect.top < pad) {
    top = rect.bottom + pad;
    hint.style.top = `${top}px`;
    hint.style.transform = "translate(-50%, 0)";
  }
}

/** @param {HTMLElement} anchor @param {string} label */
export function showToolbarHint(anchor, label) {
  if (!toolbarHintsEnabled() || !label) return;
  const hint = ensureHint();
  hint.textContent = label;
  hint.hidden = false;
  positionHint(anchor);
}

export function hideToolbarHint() {
  if (hintEl) hintEl.hidden = true;
}

/**
 * @param {HTMLElement} root
 * @param {string} selector
 * @param {(el: HTMLElement) => string | null | undefined} resolveLabel
 */
export function wireToolbarHints(root, selector, resolveLabel) {
  if (!toolbarHintsEnabled()) return;

  root.addEventListener(
    "mouseover",
    (ev) => {
      const target = ev.target;
      if (!(target instanceof Element)) return;
      const el = target.closest(selector);
      if (!(el instanceof HTMLElement) || !root.contains(el)) return;
      const label = resolveLabel(el);
      if (label) showToolbarHint(el, label);
    },
    true,
  );

  root.addEventListener(
    "mouseout",
    (ev) => {
      const target = ev.target;
      if (!(target instanceof Element)) return;
      const el = target.closest(selector);
      if (!(el instanceof HTMLElement) || !root.contains(el)) return;
      const related = ev.relatedTarget;
      if (related instanceof Node && el.contains(related)) return;
      hideToolbarHint();
    },
    true,
  );
}

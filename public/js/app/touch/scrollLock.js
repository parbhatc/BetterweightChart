const COARSE_POINTER_MQ = window.matchMedia("(pointer: coarse)");
let touchFeedbackRulesGuarded = false;

/** Split a selector list at top-level commas (not commas inside :is/:not/etc.). */
function splitSelectorList(selectorText) {
  const out = [];
  let start = 0;
  let depth = 0;
  let quote = "";
  for (let i = 0; i < selectorText.length; i += 1) {
    const ch = selectorText[i];
    if (quote) {
      if (ch === quote && selectorText[i - 1] !== "\\") quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "(" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    else if (ch === "," && depth === 0) {
      out.push(selectorText.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(selectorText.slice(start).trim());
  return out.filter(Boolean);
}

/**
 * Disable authored :hover and :active selectors while the app is in touch
 * mode. This avoids iOS's latched hover behavior and removes the tap-time
 * background flash without changing selected/open component states.
 */
function guardTouchFeedbackRules() {
  if (touchFeedbackRulesGuarded) return;
  touchFeedbackRulesGuarded = true;
  const seenSheets = new Set();

  function visitSheet(sheet) {
    if (!sheet || seenSheets.has(sheet)) return;
    seenSheets.add(sheet);
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      return;
    }
    for (const rule of rules ?? []) {
      if (rule.styleSheet) visitSheet(rule.styleSheet);
      visitRule(rule);
    }
  }

  function visitRule(rule) {
    if (
      typeof rule?.selectorText === "string" &&
      (rule.selectorText.includes(":hover") || rule.selectorText.includes(":active"))
    ) {
      if (rule.selectorText.includes("html:not(.tv-app--touch)")) return;
      try {
        rule.selectorText = splitSelectorList(rule.selectorText)
          .map((selector) =>
            selector.includes(":hover") || selector.includes(":active")
              ? `html:not(.tv-app--touch) ${selector}`
              : selector,
          )
          .join(", ");
      } catch {
        // Ignore selectors the browser exposes as read-only.
      }
    }
    if (rule?.cssRules) {
      for (const nested of rule.cssRules) visitRule(nested);
    }
  }

  for (const sheet of document.styleSheets) visitSheet(sheet);
}

/** @param {EventTarget | null} target */
function findScrollableAncestor(target) {
  if (!(target instanceof Element)) return null;
  let node = target;
  while (node && node !== document.documentElement) {
    const style = getComputedStyle(node);
    const overflowY = style.overflowY;
    const overflowX = style.overflowX;
    const scrollableY =
      (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
      node.scrollHeight > node.clientHeight + 1;
    const scrollableX =
      (overflowX === "auto" || overflowX === "scroll" || overflowX === "overlay") &&
      node.scrollWidth > node.clientWidth + 1;
    if (scrollableY || scrollableX) return node;
    node = node.parentElement;
  }
  return null;
}

/**
 * A few pixels of finger drift are normal during an iOS tap. Cancelling that
 * touchmove also cancels Safari's later click, making buttons need 2–3 taps.
 * Let controls own their gesture; the page remains locked by the touch CSS.
 * @param {EventTarget | null} target
 */
function isInteractiveControl(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      'button, a[href], input, select, textarea, label, summary, [role="button"], [role="menuitem"], [role="option"], [role="tab"], [data-resolution]',
    ),
  );
}

/** @type {(() => void) | null} */
let activeTouchScrollRelease = null;

/** Stop Safari/page rubber-band while still allowing in-app scroll areas. */
export function mountAppTouchScrollLock() {
  if (!COARSE_POINTER_MQ.matches) return () => {};

  releaseAppTouchScrollLock();

  document.documentElement.classList.add("tv-app--touch");
  guardTouchFeedbackRules();

  /** @param {TouchEvent} ev */
  function onTouchMove(ev) {
    if (isInteractiveControl(ev.target)) return;
    if (findScrollableAncestor(ev.target)) return;
    ev.preventDefault();
  }

  document.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });

  const release = () => {
    document.documentElement.classList.remove("tv-app--touch");
    document.removeEventListener("touchmove", onTouchMove, { capture: true });
    if (activeTouchScrollRelease === release) activeTouchScrollRelease = null;
  };

  activeTouchScrollRelease = release;
  return release;
}

/** Release the active touch scroll lock (safe when host unmounts the chart). */
export function releaseAppTouchScrollLock() {
  activeTouchScrollRelease?.();
}

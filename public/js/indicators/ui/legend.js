import { ICON_DELETE, ICON_EYE, ICON_EYE_OFF, ICON_SETTINGS } from "./icons.js";
import { ensureLegendToggler, syncLegendToggler } from "./legendToggler.js";

/** @type {Set<{ statusEl: HTMLElement, dismiss: () => void }>} */
const mobileLegendRoots = new Set();

function isMobileLegendUi() {
  return window.matchMedia("(max-width: 768px), (hover: none), (pointer: coarse)").matches;
}

function useHoverLegendExpand() {
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

function isLegendInteractiveTarget(target) {
  return target instanceof Element && target.closest(".study-legend__item, .study-legend-toggler, .study-legend__action");
}

function isLegendDismissExcludedTarget(target) {
  return (
    target instanceof Element &&
    target.closest(
      ".tv-ind-settings, .tv-cpicker, .tv-menu-popover, .tv-ind-source-menu, .tv-ind-plot-menu, .tv-symbol-popover",
    )
  );
}

function legendHasExpandedItems() {
  return Boolean(
    document.querySelector(".study-legend__item.is-selected, .study-legend__item.is-expanded"),
  );
}

function shouldDismissLegendOnOutsidePress() {
  if (isMobileLegendUi() || !useHoverLegendExpand()) return true;
  return legendHasExpandedItems();
}

function dismissAllMobileLegends() {
  for (const entry of mobileLegendRoots) entry.dismiss();
}

function handleOutsideLegendPress(ev) {
  if (!(ev.target instanceof Node)) return;
  if (isLegendInteractiveTarget(ev.target)) return;
  if (isLegendDismissExcludedTarget(ev.target)) return;
  if (!shouldDismissLegendOnOutsidePress()) return;
  dismissAllMobileLegends();
}

if (!document.documentElement.dataset.legendMobileDismissWired) {
  document.documentElement.dataset.legendMobileDismissWired = "1";
  const outsideLegendOpts = { capture: true, passive: true };
  document.addEventListener("pointerdown", handleOutsideLegendPress, outsideLegendOpts);
  document.addEventListener("mousedown", handleOutsideLegendPress, outsideLegendOpts);
  document.addEventListener("touchstart", handleOutsideLegendPress, outsideLegendOpts);
}

/**
 * @param {HTMLElement} statusEl
 * @param {object} opts
 * @param {() => Array<object>} opts.getStudies
 * @param {(id: string) => void} opts.onSelect
 * @param {(id: string) => void} opts.onToggleHidden
 * @param {(id: string) => void} opts.onOpenSettings
 * @param {(id: string) => void} opts.onRemove
 * @param {() => void} [opts.onDeselect]
 * @param {() => boolean} [opts.getLegendCollapsed]
 * @param {(collapsed: boolean) => void} [opts.setLegendCollapsed]
 * @param {() => void} [opts.onLegendCollapsedChange]
 */
export function mountIndicatorLegend(statusEl, opts) {
  const {
    getStudies,
    onSelect,
    onToggleHidden,
    onOpenSettings,
    onRemove,
    onDeselect,
    getLegendCollapsed,
    setLegendCollapsed,
    onLegendCollapsedChange,
  } = opts;

  /** @type {string} */
  let lastStructureKey = "";
  /** @type {string} */
  let lastValuesKey = "";
  /** @type {string | null} */
  let hoverId = null;
  let suppressClickUntil = 0;

  function isLegendCollapsed() {
    return getLegendCollapsed?.() ?? false;
  }

  function toggleLegendCollapsed() {
    const { studiesEl, togglerEl } = ensureStudiesShell();
    const next = !isLegendCollapsed();
    setLegendCollapsed?.(next);
    syncLegendToggler(studiesEl, togglerEl, getStudies().length, next);
    onLegendCollapsedChange?.();
  }

  function ensureStudiesShell() {
    let studiesEl = statusEl.querySelector(".status-line__studies");
    if (!studiesEl) {
      studiesEl = document.createElement("div");
      studiesEl.className = "status-line__studies";
      statusEl.appendChild(studiesEl);
    }

    let legendEl = studiesEl.querySelector(".study-legend");
    if (!legendEl) {
      legendEl = document.createElement("div");
      legendEl.className = "study-legend";
      studiesEl.insertBefore(legendEl, studiesEl.firstChild);
    }

    const togglerEl = ensureLegendToggler(studiesEl);
    if (!togglerEl.dataset.wired) {
      togglerEl.dataset.wired = "1";
      togglerEl.addEventListener("click", (ev) => {
        if (Date.now() < suppressClickUntil) return;
        ev.preventDefault();
        ev.stopPropagation();
        toggleLegendCollapsed();
      });
    }

    return { studiesEl, legendEl, togglerEl };
  }

  /** @param {object[]} values */
  function valuesHtml(values) {
    return values
      .filter((v) => !v.hidden && v.value != null)
      .map(
        (v) =>
          `<span class="study-legend__value${v.value == null ? " is-empty" : ""}" style="color:${v.color}" title="${v.title}">${v.value ?? "∅"}</span>`,
      )
      .join("");
  }

  /** @param {object} s */
  function itemExpanded(s) {
    if (s.selected) return true;
    return useHoverLegendExpand() && hoverId === s.instanceId;
  }

  /** @param {HTMLElement} legendEl */
  function syncExpandedClass(legendEl) {
    const selectedId = getStudies().find((s) => s.selected)?.instanceId ?? null;
    legendEl.querySelectorAll(".study-legend__item").forEach((item) => {
      if (!(item instanceof HTMLElement) || !item.dataset.id) return;
      const selected = item.dataset.id === selectedId;
      item.classList.toggle("is-selected", selected);
      item.classList.toggle(
        "is-expanded",
        selected || (useHoverLegendExpand() && item.dataset.id === hoverId),
      );
    });
  }

  /** @param {object} s */
  function itemHtml(s) {
    const params = s.params?.length
      ? `<span class="study-legend__params">${s.params.map((p) => `<span class="study-legend__param">${p}</span>`).join("")}</span>`
      : "";
    const loader = s.loading
      ? `<span class="study-legend__loader" role="status" aria-label="Loading"></span>`
      : "";
    const visibleValues = (s.values ?? []).filter((v) => !v.hidden && v.value != null);
    const values = visibleValues.length ? `<span class="study-legend__values">${valuesHtml(s.values)}</span>` : "";
    const actions = `<span class="study-legend__actions">
      <button type="button" class="study-legend__action" data-action="toggle" data-id="${s.instanceId}" aria-label="${s.hidden ? "Show" : "Hide"}" title="${s.hidden ? "Show" : "Hide"}">${s.hidden ? ICON_EYE_OFF : ICON_EYE}</button>
      <button type="button" class="study-legend__action" data-action="settings" data-id="${s.instanceId}" aria-label="Settings" title="Settings">${ICON_SETTINGS}</button>
      <button type="button" class="study-legend__action" data-action="remove" data-id="${s.instanceId}" aria-label="Remove" title="Remove">${ICON_DELETE}</button>
    </span>`;
    const tail = values || actions ? `<span class="study-legend__tail">${values}${actions}</span>` : "";
    return `<div class="status-line__item study-legend__item${s.selected ? " is-selected" : ""}${itemExpanded(s) ? " is-expanded" : ""}${s.hidden ? " is-hidden" : ""}" data-id="${s.instanceId}" role="toolbar">
      <span class="study-legend__main">
        <span class="study-legend__title">${s.shortTitle}</span>
        ${loader}
        ${params}
      </span>
      ${tail}
    </div>`;
  }

  /** @param {HTMLElement} legendEl @param {object[]} studies */
  function fullRender(legendEl, studies) {
    legendEl.innerHTML = studies.map(itemHtml).join("");
  }

  /** @param {HTMLElement} legendEl @param {object[]} studies */
  function patchValues(legendEl, studies) {
    for (const s of studies) {
      const item = legendEl.querySelector(`.study-legend__item[data-id="${s.instanceId}"]`);
      if (!(item instanceof HTMLElement)) {
        fullRender(legendEl, studies);
        return;
      }
      item.classList.toggle("is-selected", Boolean(s.selected));
      item.classList.toggle("is-hidden", Boolean(s.hidden));
      item.classList.toggle("is-expanded", itemExpanded(s));

      const toggleBtn = item.querySelector('[data-action="toggle"]');
      if (toggleBtn instanceof HTMLElement) {
        toggleBtn.innerHTML = s.hidden ? ICON_EYE_OFF : ICON_EYE;
        toggleBtn.setAttribute("aria-label", s.hidden ? "Show" : "Hide");
        toggleBtn.title = s.hidden ? "Show" : "Hide";
      }

      const visibleValues = (s.values ?? []).filter((v) => !v.hidden && v.value != null);
      let valuesEl = item.querySelector(".study-legend__values");
      const tail = item.querySelector(".study-legend__tail");

      if (!visibleValues.length) {
        valuesEl?.remove();
        continue;
      }

      const html = valuesHtml(s.values);
      if (valuesEl instanceof HTMLElement) {
        valuesEl.innerHTML = html;
      } else if (tail instanceof HTMLElement) {
        valuesEl = document.createElement("span");
        valuesEl.className = "study-legend__values";
        valuesEl.innerHTML = html;
        tail.insertBefore(valuesEl, tail.firstChild);
      } else {
        const newTail = document.createElement("span");
        newTail.className = "study-legend__tail";
        newTail.innerHTML = `<span class="study-legend__values">${html}</span>${item.querySelector(".study-legend__actions")?.outerHTML ?? ""}`;
        item.appendChild(newTail);
      }
    }
  }

  function render() {
    const { studiesEl, legendEl, togglerEl } = ensureStudiesShell();
    const studies = getStudies();
    if (!studies.length) {
      legendEl.innerHTML = "";
      studiesEl.hidden = true;
      lastStructureKey = "";
      lastValuesKey = "";
      syncLegendToggler(studiesEl, togglerEl, 0, false);
      return;
    }
    studiesEl.hidden = false;
    syncLegendToggler(studiesEl, togglerEl, studies.length, isLegendCollapsed());

    const structureKey = studies
      .map(
        (s) =>
          `${s.instanceId}|${s.hidden ? 1 : 0}|${s.selected ? 1 : 0}|${s.loading ? 1 : 0}|${(s.params ?? []).join(",")}|${s.shortTitle}`,
      )
      .join(";");
    const valuesKey = studies
      .map((s) =>
        (s.values ?? [])
          .filter((v) => !v.hidden)
          .map((v) => v.value)
          .join(","),
      )
      .join(";");

    if (structureKey !== lastStructureKey || !legendEl.querySelector(".study-legend__item")) {
      lastStructureKey = structureKey;
      lastValuesKey = valuesKey;
      fullRender(legendEl, studies);
    } else if (valuesKey !== lastValuesKey) {
      lastValuesKey = valuesKey;
      patchValues(legendEl, studies);
    }

    syncExpandedClass(legendEl);
  }

  statusEl.addEventListener(
    "mouseenter",
    (ev) => {
      if (!useHoverLegendExpand()) return;
      const item = ev.target instanceof Element ? ev.target.closest(".study-legend__item") : null;
      if (!(item instanceof HTMLElement) || !item.dataset.id) return;
      if (hoverId === item.dataset.id) return;
      hoverId = item.dataset.id;
      syncExpandedClass(ensureStudiesShell().legendEl);
    },
    true,
  );

  statusEl.addEventListener("mouseleave", (ev) => {
    if (!useHoverLegendExpand()) return;
    const related = ev.relatedTarget;
    if (related instanceof Node && statusEl.contains(related)) return;
    if (hoverId == null) return;
    hoverId = null;
    syncExpandedClass(ensureStudiesShell().legendEl);
  });

  /** @param {EventTarget | null} target */
  function findActionBtn(target) {
    if (!(target instanceof Element)) return null;
    if (target.closest(".study-legend-toggler")) return null;
    if (!target.closest(".status-line__studies")) return null;
    const actionBtn = target.closest(".study-legend__action[data-action]");
    if (!(actionBtn instanceof HTMLElement)) return null;
    return actionBtn.dataset.id ? actionBtn : null;
  }

  let lastActionAt = 0;
  let lastActionKey = "";

  function dismissMobile() {
    const active = document.activeElement;
    if (active instanceof HTMLElement && statusEl.contains(active)) {
      active.blur();
    }
    let changed = false;
    if (hoverId != null) {
      hoverId = null;
      changed = true;
    }
    if (getStudies().some((s) => s.selected)) {
      onDeselect?.();
      syncExpandedClass(ensureStudiesShell().legendEl);
      return;
    }
    if (changed) syncExpandedClass(ensureStudiesShell().legendEl);
  }

  mobileLegendRoots.add({ statusEl, dismiss: dismissMobile });

  /** @param {HTMLElement} actionBtn */
  function runLegendAction(actionBtn) {
    const id = actionBtn.dataset.id;
    const action = actionBtn.dataset.action;
    if (!id || !action) return;
    const key = `${id}:${action}`;
    const now = Date.now();
    if (key === lastActionKey && now - lastActionAt < 450) return;
    lastActionKey = key;
    lastActionAt = now;
    hoverId = id;
    if (action === "toggle") onToggleHidden(id);
    else if (action === "settings") onOpenSettings(id);
    else if (action === "remove") onRemove(id);
  }

  if (!statusEl.dataset.legendWired) {
    statusEl.dataset.legendWired = "1";

    statusEl.addEventListener("click", (ev) => {
      if (Date.now() < suppressClickUntil) return;
      const actionBtn = findActionBtn(ev.target);
      if (actionBtn) {
        ev.preventDefault();
        ev.stopPropagation();
        runLegendAction(actionBtn);
        return;
      }
      const target = ev.target;
      if (!(target instanceof Element)) return;
      if (!target.closest(".status-line__studies")) return;
      if (target.closest(".study-legend-toggler")) return;
      const item = target.closest(".study-legend__item");
      if (item instanceof HTMLElement && item.dataset.id) {
        onSelect(item.dataset.id);
        render();
      }
    });

    /** Touch: handle on pointerdown before chart pan steals the gesture. */
    statusEl.addEventListener(
      "pointerdown",
      (ev) => {
        if (ev.pointerType === "mouse") return;
        const actionBtn = findActionBtn(ev.target);
        if (actionBtn) {
          ev.preventDefault();
          ev.stopPropagation();
          suppressClickUntil = Date.now() + 500;
          runLegendAction(actionBtn);
          return;
        }
        const target = ev.target;
        if (!(target instanceof Element)) return;
        if (!target.closest(".status-line__studies")) return;
        if (target.closest(".study-legend-toggler")) {
          ev.preventDefault();
          ev.stopPropagation();
          suppressClickUntil = Date.now() + 500;
          toggleLegendCollapsed();
          return;
        }
        const item = target.closest(".study-legend__item");
        if (item instanceof HTMLElement && item.dataset.id) {
          ev.stopPropagation();
          suppressClickUntil = Date.now() + 500;
          onSelect(item.dataset.id);
          render();
        }
      },
      { capture: true, passive: false },
    );

    /** Fallback when pointerdown target differs from the lifted finger. */
    statusEl.addEventListener(
      "touchend",
      (ev) => {
        const touch = ev.changedTouches[0];
        if (!touch) return;
        const hit = document.elementFromPoint(touch.clientX, touch.clientY);
        if (hit instanceof Element && hit.closest(".study-legend-toggler") && statusEl.contains(hit)) {
          ev.preventDefault();
          ev.stopPropagation();
          suppressClickUntil = Date.now() + 500;
          toggleLegendCollapsed();
          return;
        }
        const actionBtn = findActionBtn(hit);
        if (!actionBtn) return;
        ev.preventDefault();
        ev.stopPropagation();
        suppressClickUntil = Date.now() + 500;
        runLegendAction(actionBtn);
      },
      { capture: true, passive: false },
    );
  }

  return { render };
}

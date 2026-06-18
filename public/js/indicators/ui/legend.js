import { ICON_DELETE, ICON_EYE, ICON_EYE_OFF, ICON_SETTINGS } from "./icons.js";

/**
 * @param {HTMLElement} statusEl
 * @param {object} opts
 * @param {() => Array<object>} opts.getStudies
 * @param {(id: string) => void} opts.onSelect
 * @param {(id: string) => void} opts.onToggleHidden
 * @param {(id: string) => void} opts.onOpenSettings
 * @param {(id: string) => void} opts.onRemove
 */
export function mountIndicatorLegend(statusEl, opts) {
  const { getStudies, onSelect, onToggleHidden, onOpenSettings, onRemove } = opts;

  /** @type {string} */
  let lastStructureKey = "";
  /** @type {string} */
  let lastValuesKey = "";
  /** @type {string | null} */
  let hoverId = null;

  function ensureStudiesEl() {
    let studiesEl = statusEl.querySelector(".status-line__studies");
    if (!studiesEl) {
      studiesEl = document.createElement("div");
      studiesEl.className = "status-line__studies";
      statusEl.appendChild(studiesEl);
    }
    return studiesEl;
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
    return s.selected || hoverId === s.instanceId;
  }

  /** @param {HTMLElement} studiesEl */
  function syncExpandedClass(studiesEl) {
    studiesEl.querySelectorAll(".study-legend__item").forEach((item) => {
      if (!(item instanceof HTMLElement)) return;
      item.classList.toggle("is-expanded", item.dataset.id === hoverId || item.classList.contains("is-selected"));
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
    return `<div class="study-legend__item${s.selected ? " is-selected" : ""}${itemExpanded(s) ? " is-expanded" : ""}${s.hidden ? " is-hidden" : ""}" data-id="${s.instanceId}" role="toolbar">
      <span class="study-legend__main">
        <span class="study-legend__title">${s.shortTitle}</span>
        ${loader}
        ${params}
      </span>
      ${tail}
    </div>`;
  }

  /** @param {HTMLElement} studiesEl @param {object[]} studies */
  function fullRender(studiesEl, studies) {
    studiesEl.innerHTML = `<div class="study-legend">${studies.map(itemHtml).join("")}</div>`;
  }

  /** @param {HTMLElement} studiesEl @param {object[]} studies */
  function patchValues(studiesEl, studies) {
    for (const s of studies) {
      const item = studiesEl.querySelector(`.study-legend__item[data-id="${s.instanceId}"]`);
      if (!(item instanceof HTMLElement)) {
        fullRender(studiesEl, studies);
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
    const studiesEl = ensureStudiesEl();
    const studies = getStudies();
    if (!studies.length) {
      studiesEl.innerHTML = "";
      studiesEl.hidden = true;
      lastStructureKey = "";
      lastValuesKey = "";
      return;
    }
    studiesEl.hidden = false;

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

    if (structureKey !== lastStructureKey || !studiesEl.querySelector(".study-legend")) {
      lastStructureKey = structureKey;
      lastValuesKey = valuesKey;
      fullRender(studiesEl, studies);
    } else if (valuesKey !== lastValuesKey) {
      lastValuesKey = valuesKey;
      patchValues(studiesEl, studies);
    }

    syncExpandedClass(studiesEl);
  }

  statusEl.addEventListener(
    "mouseenter",
    (ev) => {
      const item = ev.target instanceof Element ? ev.target.closest(".study-legend__item") : null;
      if (!(item instanceof HTMLElement) || !item.dataset.id) return;
      if (hoverId === item.dataset.id) return;
      hoverId = item.dataset.id;
      syncExpandedClass(ensureStudiesEl());
    },
    true,
  );

  statusEl.addEventListener("mouseleave", (ev) => {
    const related = ev.relatedTarget;
    if (related instanceof Node && statusEl.contains(related)) return;
    if (hoverId == null) return;
    hoverId = null;
    syncExpandedClass(ensureStudiesEl());
  });

  statusEl.addEventListener("click", (ev) => {
    const target = ev.target;
    if (!(target instanceof Element)) return;
    if (!target.closest(".status-line__studies")) return;

    const actionBtn = target.closest("[data-action]");
    if (actionBtn instanceof HTMLElement) {
      ev.preventDefault();
      ev.stopPropagation();
      const id = actionBtn.dataset.id;
      if (!id) return;
      hoverId = id;
      const action = actionBtn.dataset.action;
      if (action === "toggle") onToggleHidden(id);
      else if (action === "settings") onOpenSettings(id);
      else if (action === "remove") onRemove(id);
      return;
    }
    const item = target.closest(".study-legend__item");
    if (item instanceof HTMLElement && item.dataset.id) {
      onSelect(item.dataset.id);
      render();
    }
  });

  return { render };
}

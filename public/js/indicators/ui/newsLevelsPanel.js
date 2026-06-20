import { CHECK_SVG } from "../../drawings/settings/dialog/utils.js";
import { ICON_CLOSE } from "./icons.js";
import { DEFAULT_NEWS_LEVELS, resolveNewsEventId, resolveNewsLevels } from "../../news/events.js";

/** @typedef {{ enabled: boolean, label: string, eventId: string }} NewsLevelRow */

/**
 * @param {import("../types.js").NewsLevelsInputDef} input
 * @param {object} draftInputs
 */
export function renderNewsLevelsPanel(input, draftInputs) {
  const disabled = input.disabled?.(draftInputs) ?? false;
  const rows = resolveNewsLevels(draftInputs);
  const disabledClass = disabled ? " is-disabled" : "";
  const disabledAttr = disabled ? ' disabled aria-disabled="true" tabindex="-1"' : "";

  const rowHtml = rows
    .map((row) => {
      const on = row.enabled !== false;
      return `<div class="tv-ind-settings__news-rule-row" data-news-level-row data-news-id="${escapeAttr(row.eventId ?? "ppi")}">
      <div class="tv-ind-settings__tf-rule-enable">
        <button type="button" class="tv-set__check${on ? " tv-set__check--on" : ""}" data-news-enabled role="checkbox" aria-checked="${on ? "true" : "false"}" aria-label="Enable"${disabledAttr}>
          <span class="tv-set__check-box">${on ? CHECK_SVG : ""}</span>
        </button>
      </div>
      <input type="text" class="tv-drawing-settings__input tv-ind-settings__tf-rule-label" data-news-label placeholder="Event type" value="${escapeAttr(row.label)}"${disabledAttr} />
      <button type="button" class="tv-ind-settings__tf-rule-remove" data-news-remove aria-label="Remove"${disabledAttr}>${ICON_CLOSE}</button>
    </div>`;
    })
    .join("");

  return `<div class="tv-ind-settings__tf-rules tv-ind-settings__news-rules${disabledClass}" data-news-levels-root data-news-levels-field="${input.id}">
    <div class="tv-ind-settings__tf-rules-head">
      <span class="tv-set__field-label">${input.title ?? "Event types"}</span>
      <button type="button" class="tv-ind-settings__tf-rule-add" data-news-add${disabledAttr}>
        <span class="tv-ind-settings__tf-rule-add-icon" aria-hidden="true">+</span>
        Add
      </button>
    </div>
    <div class="tv-ind-settings__news-cols" aria-hidden="true">
      <span></span><span>Label</span><span></span>
    </div>
    <div class="tv-ind-settings__tf-rules-list" data-news-levels-list>
      ${rowHtml || `<div class="tv-ind-settings__tf-rules-empty">No news event types configured.</div>`}
    </div>
  </div>`;
}

/** @param {HTMLElement} inputsPanel @param {string} fieldId */
export function readNewsLevelsFromPanel(inputsPanel, fieldId) {
  const root = inputsPanel.querySelector(`[data-news-levels-field="${fieldId}"]`);
  if (!root) return null;
  /** @type {NewsLevelRow[]} */
  const rows = [];
  root.querySelectorAll("[data-news-level-row]").forEach((row) => {
    if (!(row instanceof HTMLElement)) return;
    const labelEl = row.querySelector("[data-news-label]");
    const enabledBtn = row.querySelector("[data-news-enabled]");
    const label = labelEl instanceof HTMLInputElement ? labelEl.value.trim() : "";
    if (!label) return;
    const storedId = row.dataset.newsId;
    const eventId = resolveNewsEventId(label, storedId);
    const enabled =
      enabledBtn instanceof HTMLElement
        ? enabledBtn.classList.contains("tv-set__check--on")
        : true;
    rows.push({ enabled, label, eventId });
  });
  return rows;
}

/** @param {HTMLElement} list @param {Partial<NewsLevelRow>} [seed] */
export function appendNewsLevelRow(list, seed = {}) {
  const empty = list.querySelector(".tv-ind-settings__tf-rules-empty");
  empty?.remove();
  const eventId = seed.eventId ?? resolveNewsEventId(seed.label ?? "", seed.eventId);
  const on = seed.enabled !== false;
  const row = document.createElement("div");
  row.className = "tv-ind-settings__news-rule-row";
  row.dataset.newsLevelRow = "";
  row.dataset.newsId = eventId;
  row.innerHTML = `
    <div class="tv-ind-settings__tf-rule-enable">
      <button type="button" class="tv-set__check${on ? " tv-set__check--on" : ""}" data-news-enabled role="checkbox" aria-checked="${on ? "true" : "false"}" aria-label="Enable">
        <span class="tv-set__check-box">${on ? CHECK_SVG : ""}</span>
      </button>
    </div>
    <input type="text" class="tv-drawing-settings__input tv-ind-settings__tf-rule-label" data-news-label placeholder="Event type" value="${escapeAttr(seed.label ?? "")}" />
    <button type="button" class="tv-ind-settings__tf-rule-remove" data-news-remove aria-label="Remove">${ICON_CLOSE}</button>`;
  list.appendChild(row);
  row.querySelector("[data-news-label]")?.focus();
}

/** @param {string} s */
function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export { DEFAULT_NEWS_LEVELS, resolveNewsLevels };

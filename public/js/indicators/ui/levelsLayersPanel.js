import { CHECK_SVG, MENU_CHEVRON } from "../../drawings/settings/dialog/utils.js";
import { ICON_CLOSE } from "./icons.js";
import { normalizeResolutionId, resolutionDisplayTitle } from "../../chart/resolutionFormat.js";
import { SESSION_DEFS } from "../math/levelsEngine.js";

/** @typedef {{ enabled: boolean, label: string, layer: string }} TimeLevelRow */
/** @typedef {{ enabled: boolean, label: string, sessionId: string, startTime: string, endTime: string }} SessionLevelRow */

/** @type {TimeLevelRow[]} */
export const DEFAULT_TIME_LEVELS = [
  { enabled: true, label: "4H", layer: "240" },
  { enabled: true, label: "1H", layer: "60" },
  { enabled: true, label: "15m", layer: "15" },
];

/** @type {SessionLevelRow[]} */
export const DEFAULT_SESSION_LEVELS = [
  { enabled: true, label: "Asia", sessionId: "asia", startTime: "20:00", endTime: "00:00" },
  { enabled: true, label: "London", sessionId: "london", startTime: "02:00", endTime: "05:00" },
];

const SESSION_OPTIONS = [
  { id: "asia", label: "Asia" },
  { id: "london", label: "London" },
  { id: "ny_am", label: "New York AM" },
  { id: "ny_lunch", label: "New York Lunch" },
  { id: "ny_pm", label: "New York PM" },
];

/** @param {unknown} raw */
export function normalizeTimeLevels(raw) {
  if (!Array.isArray(raw)) return DEFAULT_TIME_LEVELS.map((r) => ({ ...r }));
  return raw
    .map((r) => ({
      enabled: r?.enabled !== false,
      label: String(r?.label ?? "").trim(),
      layer: String(r?.layer ?? "240").trim() || "240",
    }))
    .filter((r) => r.label);
}

/** @param {unknown} raw */
export function normalizeSessionLevels(raw) {
  if (!Array.isArray(raw)) return DEFAULT_SESSION_LEVELS.map((r) => ({ ...r }));
  return raw
    .map((r) => ({
      enabled: r?.enabled !== false,
      label: String(r?.label ?? "").trim(),
      sessionId: String(r?.sessionId ?? "asia").trim() || "asia",
      startTime: normalizeHm(r?.startTime, "20:00"),
      endTime: normalizeHm(r?.endTime, "00:00"),
    }))
    .filter((r) => r.label);
}

/** @param {unknown} v @param {string} fallback */
function normalizeHm(v, fallback) {
  const s = String(v ?? "").trim();
  return /^\d{1,2}:\d{2}$/.test(s) ? s : fallback;
}

/** Migrate legacy `levelLayers` into time + session rows. */
function migrateLegacyLevelLayers(inputs) {
  const raw = inputs.levelLayers;
  if (!Array.isArray(raw) || !raw.length) return null;
  /** @type {TimeLevelRow[]} */
  const timeLevels = [];
  /** @type {SessionLevelRow[]} */
  const sessionLevels = [];
  for (const row of raw) {
    const layer = String(row?.layer ?? "").trim();
    const label = String(row?.label ?? "").trim();
    if (!label) continue;
    const enabled = row?.enabled !== false;
    if (layer.startsWith("session:")) {
      const sid = layer.slice(8);
      const def = SESSION_DEFS[sid];
      sessionLevels.push({
        enabled,
        label,
        sessionId: sid,
        startTime: def ? fmtHm(def.startH, def.startM) : "20:00",
        endTime: def ? fmtHm(def.endH, def.endM) : "00:00",
      });
    } else {
      timeLevels.push({ enabled, label, layer: layer || "240" });
    }
  }
  return {
    timeLevels: timeLevels.length ? timeLevels : DEFAULT_TIME_LEVELS.map((r) => ({ ...r })),
    sessionLevels: sessionLevels.length ? sessionLevels : DEFAULT_SESSION_LEVELS.map((r) => ({ ...r })),
  };
}

/** @param {number} h @param {number} m */
function fmtHm(h, m) {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** @param {object} inputs @returns {TimeLevelRow[]} */
export function resolveTimeLevels(inputs) {
  if (Array.isArray(inputs.timeLevels) && inputs.timeLevels.length > 0) {
    return normalizeTimeLevels(inputs.timeLevels);
  }
  const migrated = migrateLegacyLevelLayers(inputs);
  if (migrated) return migrated.timeLevels;
  return DEFAULT_TIME_LEVELS.map((r) => ({ ...r }));
}

/** @param {object} inputs @returns {SessionLevelRow[]} */
export function resolveSessionLevels(inputs) {
  if (Array.isArray(inputs.sessionLevels) && inputs.sessionLevels.length > 0) {
    return normalizeSessionLevels(inputs.sessionLevels);
  }
  const migrated = migrateLegacyLevelLayers(inputs);
  if (migrated) return migrated.sessionLevels;
  return DEFAULT_SESSION_LEVELS.map((r) => ({ ...r }));
}

/** @param {{ id: string, label: string }[]} chartTfOptions */
export function timeLevelOptions(chartTfOptions) {
  const seen = new Set();
  /** @type {{ id: string, label: string }[]} */
  const out = [];
  for (const o of chartTfOptions) {
    const id = normalizeResolutionId(o.id);
    if (id === "chart" || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label: o.label ?? resolutionDisplayTitle(id) });
  }
  for (const id of ["240", "60", "15", "5", "10", "D"]) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label: resolutionDisplayTitle(id) });
  }
  return out;
}

/** @param {string} layerId @param {{ id: string, label: string }[]} options */
function layerOptionLabel(layerId, options) {
  const found = options.find((o) => o.id === layerId);
  return found?.label ?? resolutionDisplayTitle(layerId);
}

/** @param {string} sessionId */
function sessionOptionLabel(sessionId) {
  return SESSION_OPTIONS.find((o) => o.id === sessionId)?.label ?? sessionId;
}

/**
 * @param {import("../types.js").TimeLevelsInputDef} input
 * @param {object} draftInputs
 * @param {() => { id: string, label: string }[]} getTimeframeOptions
 */
export function renderTimeLevelsPanel(input, draftInputs, getTimeframeOptions) {
  const disabled = input.disabled?.(draftInputs) ?? false;
  const options = timeLevelOptions(getTimeframeOptions());
  const rows = resolveTimeLevels(draftInputs);
  const disabledClass = disabled ? " is-disabled" : "";
  const disabledAttr = disabled ? ' disabled aria-disabled="true" tabindex="-1"' : "";

  const rowHtml = rows
    .map((row) => {
      const layer = row.layer ?? "240";
      const layerLabel = layerOptionLabel(layer, options);
      const on = row.enabled !== false;
      return `<div class="tv-ind-settings__tf-rule-row" data-time-level-row>
      <div class="tv-ind-settings__tf-rule-enable">
        <button type="button" class="tv-set__check${on ? " tv-set__check--on" : ""}" data-time-level-enabled role="checkbox" aria-checked="${on ? "true" : "false"}" aria-label="Enable"${disabledAttr}>
          <span class="tv-set__check-box">${on ? CHECK_SVG : ""}</span>
        </button>
      </div>
      <input type="text" class="tv-drawing-settings__input tv-ind-settings__tf-rule-label" data-time-level-label placeholder="Label" value="${escapeAttr(row.label)}"${disabledAttr} />
      <button type="button" class="tv-drawing-settings__menu-btn tv-ind-settings__tf-rule-tf" data-time-level-tf data-value="${escapeAttr(layer)}" aria-haspopup="listbox"${disabledAttr}>
        <span data-time-level-tf-label>${escapeHtml(layerLabel)}</span>
        <span class="tv-set__select-chev">${MENU_CHEVRON}</span>
      </button>
      <button type="button" class="tv-ind-settings__tf-rule-remove" data-time-level-remove aria-label="Remove level"${disabledAttr}>${ICON_CLOSE}</button>
    </div>`;
    })
    .join("");

  return `<div class="tv-ind-settings__tf-rules${disabledClass}" data-time-levels-root data-time-levels-field="${input.id}">
    <div class="tv-ind-settings__tf-rules-head">
      <span class="tv-set__field-label">${input.title ?? "Time levels"}</span>
      <button type="button" class="tv-ind-settings__tf-rule-add" data-time-level-add${disabledAttr}>
        <span class="tv-ind-settings__tf-rule-add-icon" aria-hidden="true">+</span>
        Add timeframe
      </button>
    </div>
    <div class="tv-ind-settings__tf-rules-cols" aria-hidden="true">
      <span></span><span>Label</span><span>Timeframe</span><span></span>
    </div>
    <div class="tv-ind-settings__tf-rules-list" data-time-levels-list>
      ${rowHtml || `<div class="tv-ind-settings__tf-rules-empty">No time levels configured.</div>`}
    </div>
  </div>`;
}

/**
 * @param {import("../types.js").SessionLevelsInputDef} input
 * @param {object} draftInputs
 */
export function renderSessionLevelsPanel(input, draftInputs) {
  const disabled = input.disabled?.(draftInputs) ?? false;
  const rows = resolveSessionLevels(draftInputs);
  const disabledClass = disabled ? " is-disabled" : "";
  const disabledAttr = disabled ? ' disabled aria-disabled="true" tabindex="-1"' : "";

  const rowHtml = rows
    .map((row) => {
      const sid = row.sessionId ?? "asia";
      const on = row.enabled !== false;
      return `<div class="tv-ind-settings__session-rule-row" data-session-level-row>
      <div class="tv-ind-settings__tf-rule-enable">
        <button type="button" class="tv-set__check${on ? " tv-set__check--on" : ""}" data-session-enabled role="checkbox" aria-checked="${on ? "true" : "false"}" aria-label="Enable"${disabledAttr}>
          <span class="tv-set__check-box">${on ? CHECK_SVG : ""}</span>
        </button>
      </div>
      <input type="text" class="tv-drawing-settings__input tv-ind-settings__tf-rule-label" data-session-label placeholder="Label" value="${escapeAttr(row.label)}"${disabledAttr} />
      <button type="button" class="tv-drawing-settings__menu-btn tv-ind-settings__tf-rule-tf" data-session-id data-value="${escapeAttr(sid)}" aria-haspopup="listbox"${disabledAttr}>
        <span data-session-id-label>${escapeHtml(sessionOptionLabel(sid))}</span>
        <span class="tv-set__select-chev">${MENU_CHEVRON}</span>
      </button>
      <input type="text" class="tv-drawing-settings__input tv-ind-settings__session-time" data-session-start placeholder="20:00" value="${escapeAttr(row.startTime)}" inputmode="numeric"${disabledAttr} />
      <input type="text" class="tv-drawing-settings__input tv-ind-settings__session-time" data-session-end placeholder="00:00" value="${escapeAttr(row.endTime)}" inputmode="numeric"${disabledAttr} />
      <button type="button" class="tv-ind-settings__tf-rule-remove" data-session-remove aria-label="Remove session"${disabledAttr}>${ICON_CLOSE}</button>
    </div>`;
    })
    .join("");

  return `<div class="tv-ind-settings__tf-rules tv-ind-settings__session-rules${disabledClass}" data-session-levels-root data-session-levels-field="${input.id}">
    <div class="tv-ind-settings__tf-rules-head">
      <span class="tv-set__field-label">${input.title ?? "Sessions"}</span>
      <button type="button" class="tv-ind-settings__tf-rule-add" data-session-add${disabledAttr}>
        <span class="tv-ind-settings__tf-rule-add-icon" aria-hidden="true">+</span>
        Add session
      </button>
    </div>
    <div class="tv-ind-settings__session-cols" aria-hidden="true">
      <span></span><span>Label</span><span>Session</span><span>Start (ET)</span><span>End (ET)</span><span></span>
    </div>
    <div class="tv-ind-settings__tf-rules-list" data-session-levels-list>
      ${rowHtml || `<div class="tv-ind-settings__tf-rules-empty">No sessions configured.</div>`}
    </div>
  </div>`;
}

/** @param {HTMLElement} inputsPanel @param {string} fieldId */
export function readTimeLevelsFromPanel(inputsPanel, fieldId) {
  const root = inputsPanel.querySelector(`[data-time-levels-field="${fieldId}"]`);
  if (!root) return null;
  /** @type {TimeLevelRow[]} */
  const rows = [];
  root.querySelectorAll("[data-time-level-row]").forEach((row) => {
    if (!(row instanceof HTMLElement)) return;
    const labelEl = row.querySelector("[data-time-level-label]");
    const tfBtn = row.querySelector("[data-time-level-tf]");
    const enabledBtn = row.querySelector("[data-time-level-enabled]");
    const label = labelEl instanceof HTMLInputElement ? labelEl.value.trim() : "";
    if (!label) return;
    const layer = tfBtn instanceof HTMLElement ? String(tfBtn.dataset.value ?? "240") : "240";
    const enabled =
      enabledBtn instanceof HTMLElement
        ? enabledBtn.classList.contains("tv-set__check--on")
        : true;
    rows.push({ enabled, label, layer });
  });
  return rows;
}

/** @param {HTMLElement} inputsPanel @param {string} fieldId */
export function readSessionLevelsFromPanel(inputsPanel, fieldId) {
  const root = inputsPanel.querySelector(`[data-session-levels-field="${fieldId}"]`);
  if (!root) return null;
  /** @type {SessionLevelRow[]} */
  const rows = [];
  root.querySelectorAll("[data-session-level-row]").forEach((row) => {
    if (!(row instanceof HTMLElement)) return;
    const labelEl = row.querySelector("[data-session-label]");
    const idBtn = row.querySelector("[data-session-id]");
    const startEl = row.querySelector("[data-session-start]");
    const endEl = row.querySelector("[data-session-end]");
    const enabledBtn = row.querySelector("[data-session-enabled]");
    const label = labelEl instanceof HTMLInputElement ? labelEl.value.trim() : "";
    if (!label) return;
    const sessionId = idBtn instanceof HTMLElement ? String(idBtn.dataset.value ?? "asia") : "asia";
    const startTime = startEl instanceof HTMLInputElement ? normalizeHm(startEl.value, "20:00") : "20:00";
    const endTime = endEl instanceof HTMLInputElement ? normalizeHm(endEl.value, "00:00") : "00:00";
    const enabled =
      enabledBtn instanceof HTMLElement
        ? enabledBtn.classList.contains("tv-set__check--on")
        : true;
    rows.push({ enabled, label, sessionId, startTime, endTime });
  });
  return rows;
}

/** @param {HTMLElement} list @param {Partial<TimeLevelRow>} [seed] @param {{ id: string, label: string }[]} [options] */
export function appendTimeLevelRow(list, seed = {}, options = []) {
  const empty = list.querySelector(".tv-ind-settings__tf-rules-empty");
  empty?.remove();
  const layer = seed.layer ?? "240";
  const layerLabel = layerOptionLabel(layer, options);
  const on = seed.enabled !== false;
  const row = document.createElement("div");
  row.className = "tv-ind-settings__tf-rule-row";
  row.dataset.timeLevelRow = "";
  row.innerHTML = `
    <div class="tv-ind-settings__tf-rule-enable">
      <button type="button" class="tv-set__check${on ? " tv-set__check--on" : ""}" data-time-level-enabled role="checkbox" aria-checked="${on ? "true" : "false"}" aria-label="Enable">
        <span class="tv-set__check-box">${on ? CHECK_SVG : ""}</span>
      </button>
    </div>
    <input type="text" class="tv-drawing-settings__input tv-ind-settings__tf-rule-label" data-time-level-label placeholder="Label" value="${escapeAttr(seed.label ?? "")}" />
    <button type="button" class="tv-drawing-settings__menu-btn tv-ind-settings__tf-rule-tf" data-time-level-tf data-value="${escapeAttr(layer)}" aria-haspopup="listbox">
      <span data-time-level-tf-label>${escapeHtml(layerLabel)}</span>
      <span class="tv-set__select-chev">${MENU_CHEVRON}</span>
    </button>
    <button type="button" class="tv-ind-settings__tf-rule-remove" data-time-level-remove aria-label="Remove level">${ICON_CLOSE}</button>`;
  list.appendChild(row);
  row.querySelector("[data-time-level-label]")?.focus();
}

/** @param {HTMLElement} list @param {Partial<SessionLevelRow>} [seed] */
export function appendSessionLevelRow(list, seed = {}) {
  const empty = list.querySelector(".tv-ind-settings__tf-rules-empty");
  empty?.remove();
  const sid = seed.sessionId ?? "asia";
  const on = seed.enabled !== false;
  const row = document.createElement("div");
  row.className = "tv-ind-settings__session-rule-row";
  row.dataset.sessionLevelRow = "";
  row.innerHTML = `
    <div class="tv-ind-settings__tf-rule-enable">
      <button type="button" class="tv-set__check${on ? " tv-set__check--on" : ""}" data-session-enabled role="checkbox" aria-checked="${on ? "true" : "false"}" aria-label="Enable">
        <span class="tv-set__check-box">${on ? CHECK_SVG : ""}</span>
      </button>
    </div>
    <input type="text" class="tv-drawing-settings__input tv-ind-settings__tf-rule-label" data-session-label placeholder="Label" value="${escapeAttr(seed.label ?? "")}" />
    <button type="button" class="tv-drawing-settings__menu-btn tv-ind-settings__tf-rule-tf" data-session-id data-value="${escapeAttr(sid)}" aria-haspopup="listbox">
      <span data-session-id-label>${escapeHtml(sessionOptionLabel(sid))}</span>
      <span class="tv-set__select-chev">${MENU_CHEVRON}</span>
    </button>
    <input type="text" class="tv-drawing-settings__input tv-ind-settings__session-time" data-session-start placeholder="20:00" value="${escapeAttr(seed.startTime ?? "20:00")}" inputmode="numeric" />
    <input type="text" class="tv-drawing-settings__input tv-ind-settings__session-time" data-session-end placeholder="00:00" value="${escapeAttr(seed.endTime ?? "00:00")}" inputmode="numeric" />
    <button type="button" class="tv-ind-settings__tf-rule-remove" data-session-remove aria-label="Remove session">${ICON_CLOSE}</button>`;
  list.appendChild(row);
  row.querySelector("[data-session-label]")?.focus();
}

export { SESSION_OPTIONS };

/** @param {string} s */
function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** @param {string} s */
function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

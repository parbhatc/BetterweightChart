import { CHECK_SVG, MENU_CHEVRON } from "../../drawings/settings/dialog/utils.js";
import { ICON_CLOSE } from "./icons.js";
import { normalizeResolutionId, resolutionDisplayTitle } from "../../chart/resolutionFormat.js";
import { levelsSessionDefs } from "../definitions/levels/sessionDefs.js";

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
      sessionId: resolveSessionIdFromLabel(String(r?.label ?? "").trim(), String(r?.sessionId ?? "")),
      startTime: normalizeHm(r?.startTime, "20:00"),
      endTime: normalizeHm(r?.endTime, "00:00"),
    }))
    .filter((r) => r.label);
}

/** @param {unknown} v @param {string} fallback */
function normalizeHm(v, fallback) {
  const s = String(v ?? "").trim();
  const m24 = parseHm24(s);
  if (m24) return fmtHm(m24.h, m24.min);
  const m12 = s.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (m12) {
    let h = Number(m12[1]);
    const min = Number(m12[2]);
    if (!Number.isFinite(h) || !Number.isFinite(min) || h < 1 || h > 12 || min > 59) return fallback;
    const pm = m12[3].toLowerCase() === "pm";
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
    return fmtHm(h, min);
  }
  return fallback;
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
      const def = levelsSessionDefs.get(sid);
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

/** @param {unknown} raw */
function parseHm24(raw) {
  const m = String(raw ?? "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return { h, min };
}

/** @param {string} hm24 24-hour "HH:mm" */
export function formatSessionTimeLabel(hm24) {
  const parsed = parseHm24(hm24);
  if (!parsed) return String(hm24 ?? "");
  const { h, min } = parsed;
  const ampm = h < 12 ? "am" : "pm";
  const h12 = h % 12 || 12;
  return `${h12}:${String(min).padStart(2, "0")}${ampm}`;
}

/** @param {number} [stepMin] */
function buildSessionTimeOptions(stepMin = 30) {
  /** @type {{ id: string, label: string }[]} */
  const out = [];
  for (let total = 0; total < 24 * 60; total += stepMin) {
    const h = Math.floor(total / 60);
    const min = total % 60;
    const id = fmtHm(h, min);
    out.push({ id, label: formatSessionTimeLabel(id) });
  }
  return out;
}

export const SESSION_TIME_OPTIONS = buildSessionTimeOptions(30);

/** @param {string} hm24 */
export function sessionTimeOptionLabel(hm24) {
  const id = normalizeHm(hm24, hm24);
  return SESSION_TIME_OPTIONS.find((o) => o.id === id)?.label ?? formatSessionTimeLabel(id);
}

/** @param {string} attr e.g. data-session-start */
function renderSessionTimeButton(attr, value, disabledAttr) {
  const id = normalizeHm(value, "00:00");
  const label = sessionTimeOptionLabel(id);
  const labelAttr = `${attr}-label`;
  return `<button type="button" class="tv-drawing-settings__menu-btn tv-ind-settings__session-time" ${attr} data-value="${escapeAttr(id)}" aria-haspopup="listbox"${disabledAttr}>
    <span ${labelAttr}>${escapeHtml(label)}</span>
    <span class="tv-set__select-chev">${MENU_CHEVRON}</span>
  </button>`;
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

/** @param {string} label @param {string} [storedId] */
function resolveSessionIdFromLabel(label, storedId) {
  return levelsSessionDefs.resolveIdFromLabel(label, storedId);
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
      const on = row.enabled !== false;
      return `<div class="tv-ind-settings__session-rule-row" data-session-level-row data-session-id="${escapeAttr(row.sessionId ?? "asia")}">
      <div class="tv-ind-settings__tf-rule-enable">
        <button type="button" class="tv-set__check${on ? " tv-set__check--on" : ""}" data-session-enabled role="checkbox" aria-checked="${on ? "true" : "false"}" aria-label="Enable"${disabledAttr}>
          <span class="tv-set__check-box">${on ? CHECK_SVG : ""}</span>
        </button>
      </div>
      <input type="text" class="tv-drawing-settings__input tv-ind-settings__tf-rule-label" data-session-label placeholder="Label" value="${escapeAttr(row.label)}"${disabledAttr} />
      ${renderSessionTimeButton("data-session-start", row.startTime, disabledAttr)}
      ${renderSessionTimeButton("data-session-end", row.endTime, disabledAttr)}
      <button type="button" class="tv-ind-settings__tf-rule-remove" data-session-remove aria-label="Remove"${disabledAttr}>${ICON_CLOSE}</button>
    </div>`;
    })
    .join("");

  return `<div class="tv-ind-settings__tf-rules tv-ind-settings__session-rules${disabledClass}" data-session-levels-root data-session-levels-field="${input.id}">
    <div class="tv-ind-settings__tf-rules-head">
      <span class="tv-set__field-label">${input.title ?? "Sessions"}</span>
      <button type="button" class="tv-ind-settings__tf-rule-add" data-session-add${disabledAttr}>
        <span class="tv-ind-settings__tf-rule-add-icon" aria-hidden="true">+</span>
        Add
      </button>
    </div>
    <div class="tv-ind-settings__session-cols" aria-hidden="true">
      <span></span><span>Label</span><span>Start</span><span>End</span><span></span>
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
    const startBtn = row.querySelector("[data-session-start]");
    const endBtn = row.querySelector("[data-session-end]");
    const enabledBtn = row.querySelector("[data-session-enabled]");
    const label = labelEl instanceof HTMLInputElement ? labelEl.value.trim() : "";
    if (!label) return;
    const storedId = row instanceof HTMLElement ? row.dataset.sessionId : undefined;
    const sessionId = resolveSessionIdFromLabel(label, storedId);
    const startTime =
      startBtn instanceof HTMLElement ? normalizeHm(startBtn.dataset.value, "20:00") : "20:00";
    const endTime = endBtn instanceof HTMLElement ? normalizeHm(endBtn.dataset.value, "00:00") : "00:00";
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
  const sessionId = seed.sessionId ?? resolveSessionIdFromLabel(seed.label ?? "", seed.sessionId);
  const on = seed.enabled !== false;
  const row = document.createElement("div");
  row.className = "tv-ind-settings__session-rule-row";
  row.dataset.sessionLevelRow = "";
  row.dataset.sessionId = sessionId;
  row.innerHTML = `
    <div class="tv-ind-settings__tf-rule-enable">
      <button type="button" class="tv-set__check${on ? " tv-set__check--on" : ""}" data-session-enabled role="checkbox" aria-checked="${on ? "true" : "false"}" aria-label="Enable">
        <span class="tv-set__check-box">${on ? CHECK_SVG : ""}</span>
      </button>
    </div>
    <input type="text" class="tv-drawing-settings__input tv-ind-settings__tf-rule-label" data-session-label placeholder="Label" value="${escapeAttr(seed.label ?? "")}" />
    ${renderSessionTimeButton("data-session-start", seed.startTime ?? "20:00", "")}
    ${renderSessionTimeButton("data-session-end", seed.endTime ?? "00:00", "")}
    <button type="button" class="tv-ind-settings__tf-rule-remove" data-session-remove aria-label="Remove">${ICON_CLOSE}</button>`;
  list.appendChild(row);
  row.querySelector("[data-session-label]")?.focus();
}

/** @param {string} s */
function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** @param {string} s */
function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

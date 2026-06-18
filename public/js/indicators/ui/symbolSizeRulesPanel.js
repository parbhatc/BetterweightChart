import { symbolTicker } from "../../app/symbol/ticker.js";

/**
 * @param {import("../types.js").SymbolSizeRulesInputDef} input
 * @param {object} draftInputs
 */
export function renderSymbolSizeRulesPanel(input, draftInputs) {
  const disabled = input.disabled?.(draftInputs) ?? false;
  const rules = normalizeSizeFilterRules(draftInputs[input.id]);
  const disabledClass = disabled ? " is-disabled" : "";
  const disabledAttr = disabled ? ' disabled aria-disabled="true" tabindex="-1"' : "";

  const rows = rules
    .map(
      (rule, i) => `
    <div class="tv-ind-settings__size-rule-row" data-size-rule-row data-rule-index="${i}">
      <input type="text" class="tv-drawing-settings__input tv-ind-settings__size-rule-symbol" data-size-rule-symbol placeholder="Symbol" value="${escapeAttr(rule.symbol)}"${disabledAttr} />
      <input type="text" class="tv-drawing-settings__input tv-ind-settings__size-rule-num" data-size-rule-min placeholder="Min" value="${formatNum(rule.min)}" inputmode="decimal"${disabledAttr} />
      <input type="text" class="tv-drawing-settings__input tv-ind-settings__size-rule-num" data-size-rule-max placeholder="Max" value="${formatNum(rule.max)}" inputmode="decimal"${disabledAttr} />
      <button type="button" class="tv-ind-settings__size-rule-remove" data-size-rule-remove aria-label="Remove symbol"${disabledAttr}>×</button>
    </div>`,
    )
    .join("");

  return `<div class="tv-ind-settings__size-rules${disabledClass}" data-size-rules-root data-size-rules-field="${input.id}">
    <div class="tv-ind-settings__size-rules-head">
      <span class="tv-set__field-label">${input.title ?? "Per-symbol overrides"}</span>
      <button type="button" class="tv-ind-settings__size-rule-add" data-size-rule-add${disabledAttr}>Add symbol</button>
    </div>
    <div class="tv-ind-settings__size-rules-cols" aria-hidden="true">
      <span>Symbol</span><span>Min</span><span>Max</span><span></span>
    </div>
    <div class="tv-ind-settings__size-rules-list" data-size-rules-list>
      ${rows || `<div class="tv-ind-settings__size-rules-empty">No symbol overrides — global min/max applies.</div>`}
    </div>
  </div>`;
}

/** @param {unknown} raw */
export function normalizeSizeFilterRules(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => ({
      symbol: String(r?.symbol ?? "").trim(),
      min: Number(r?.min) || 0,
      max: Number(r?.max) || 0,
    }))
    .filter((r) => r.symbol);
}

/** @param {HTMLElement} inputsPanel @param {string} fieldId */
export function readSizeFilterRulesFromPanel(inputsPanel, fieldId) {
  const root = inputsPanel.querySelector(`[data-size-rules-field="${fieldId}"]`);
  if (!root) return null;
  /** @type {{ symbol: string, min: number, max: number }[]} */
  const rules = [];
  root.querySelectorAll("[data-size-rule-row]").forEach((row) => {
    if (!(row instanceof HTMLElement)) return;
    const symbol = row.querySelector("[data-size-rule-symbol]");
    const minEl = row.querySelector("[data-size-rule-min]");
    const maxEl = row.querySelector("[data-size-rule-max]");
    const sym = symbol instanceof HTMLInputElement ? symbol.value.trim() : "";
    if (!sym) return;
    const min = minEl instanceof HTMLInputElement ? Number(minEl.value) : 0;
    const max = maxEl instanceof HTMLInputElement ? Number(maxEl.value) : 0;
    rules.push({
      symbol: sym,
      min: Number.isFinite(min) ? min : 0,
      max: Number.isFinite(max) ? max : 0,
    });
  });
  return rules;
}

/** @param {HTMLElement} list @param {{ symbol?: string, min?: number, max?: number }} [seed] */
export function appendSizeRuleRow(list, seed = {}) {
  const empty = list.querySelector(".tv-ind-settings__size-rules-empty");
  empty?.remove();
  const row = document.createElement("div");
  row.className = "tv-ind-settings__size-rule-row";
  row.dataset.sizeRuleRow = "";
  row.innerHTML = `
    <input type="text" class="tv-drawing-settings__input tv-ind-settings__size-rule-symbol" data-size-rule-symbol placeholder="Symbol" value="${escapeAttr(seed.symbol ?? "")}" />
    <input type="text" class="tv-drawing-settings__input tv-ind-settings__size-rule-num" data-size-rule-min placeholder="Min" value="${formatNum(seed.min)}" inputmode="decimal" />
    <input type="text" class="tv-drawing-settings__input tv-ind-settings__size-rule-num" data-size-rule-max placeholder="Max" value="${formatNum(seed.max)}" inputmode="decimal" />
    <button type="button" class="tv-ind-settings__size-rule-remove" data-size-rule-remove aria-label="Remove symbol">×</button>`;
  list.appendChild(row);
  row.querySelector("[data-size-rule-symbol]")?.focus();
}

/** @param {string} s */
function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** @param {number | undefined} n */
function formatNum(n) {
  if (n == null || !Number.isFinite(n) || n === 0) return "";
  return String(n);
}

/** @param {unknown} unit */
function normalizeSizeFilterUnit(unit) {
  if (unit === "points" || unit === "ticks") return unit;
  return "none";
}

/** @param {string} chartSymbol @param {object} inputs */
export function resolveFvgSizeFilterLimits(chartSymbol, inputs) {
  if (inputs.sizeFilterOn !== true) return null;
  const unit = normalizeSizeFilterUnit(inputs.sizeFilterUnit);
  const bare = symbolTicker(String(chartSymbol ?? "")).toUpperCase();
  const rules = normalizeSizeFilterRules(inputs.sizeFilterRules);
  for (const rule of rules) {
    const sym = symbolTicker(rule.symbol).toUpperCase();
    if (!sym || sym !== bare) continue;
    const ruleUnit = unit === "none" ? "points" : unit;
    return { unit: ruleUnit, min: rule.min, max: rule.max };
  }
  if (unit === "none") return null;
  return {
    unit,
    min: Number(inputs.sizeFilterMin) || 0,
    max: Number(inputs.sizeFilterMax) || 0,
  };
}

/** @param {object} zone @param {string} format @param {object | null} symbolInfo */
export function formatFvgGapLabel(zone, format, symbolInfo) {
  const gap = Math.abs(zone.top - zone.bottom);
  if (!Number.isFinite(gap) || gap <= 0) return "";
  const scale = Number(symbolInfo?.pricescale) || 100;
  const minmov = Number(symbolInfo?.minmov) || 1;
  const tick = minmov / scale;
  const ptsStr = `${gap.toFixed(2)} pts`;
  const ticksStr = `${Math.round(tick > 0 ? gap / tick : 0)} ticks`;
  if (format === "points") return ptsStr;
  if (format === "ticks") return ticksStr;
  return `${ptsStr} / ${ticksStr}`;
}

/**
 * @param {{ showFvgNameOnLabel?: boolean, showSizeOnLabel?: boolean, sizeLabelFormat?: string }} cfg
 * @param {string} baseName
 * @param {object} zone
 * @param {object | null} symbolInfo
 */
export function buildFvgBoxLabel(cfg, baseName, zone, symbolInfo) {
  const showName = cfg.showFvgNameOnLabel !== false;
  const showSize = cfg.showSizeOnLabel === true;
  const namePart = showName && baseName ? String(baseName) : "";
  const sizePart = showSize
    ? formatFvgGapLabel(zone, cfg.sizeLabelFormat ?? "both", symbolInfo)
    : "";
  if (!namePart && !sizePart) return "";
  if (namePart && sizePart) return `${namePart}\n${sizePart}`;
  return namePart || sizePart;
}

/** @param {object} zone @param {{ unit: string, min: number, max: number } | null} limits @param {object | null} symbolInfo */
export function fvgZonePassesSizeFilter(zone, limits, symbolInfo) {
  if (!limits) return true;
  const gap = Math.abs(zone.top - zone.bottom);
  if (!Number.isFinite(gap) || gap <= 0) return false;
  const scale = Number(symbolInfo?.pricescale) || 100;
  const minmov = Number(symbolInfo?.minmov) || 1;
  const tick = minmov / scale;
  const value = limits.unit === "points" ? gap : tick > 0 ? gap / tick : gap;
  const minOk = limits.min <= 0 || value >= limits.min;
  const maxOk = limits.max <= 0 || value <= limits.max;
  return minOk && maxOk;
}

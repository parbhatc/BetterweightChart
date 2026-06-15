import { applyColorOpacity } from "../../../ui/color/picker.js";
import {
  defaultGannBoxLevels,
  defaultGannFanLevels,
  defaultGannSquareArcLevels,
  defaultGannSquareFanLevels,
  defaultGannSquareLevels,
  isGannTool,
  supportsGannStyleSettings,
} from "../../tools/gann/index.js";
import { CHECK_SVG, setTvCheck } from "../dialog/utils.js";

/** Re-export for normalize - need to export normalizeLevelList from gannTools or duplicate */
function normalizeGannLevels(levels, defaults) {
  const defs = defaults();
  if (!Array.isArray(levels) || !levels.length) return defs;
  return defs.map((def, i) => {
    const byOffset = levels.find((l) => l.offset === def.offset);
    const byLabel = def.label ? levels.find((l) => l.label === def.label) : null;
    const src = byOffset ?? byLabel ?? levels[i] ?? def;
    return {
      ...def,
      enabled: src.enabled !== undefined ? Boolean(src.enabled) : def.enabled,
      color: src.color ?? def.color,
      colorOpacity: src.colorOpacity ?? def.colorOpacity ?? 100,
    };
  });
}

/** @param {import("../../types.js").UserDrawing} drawing */
export function gannDraftFromDrawing(drawing) {
  return {
    gannPriceLevels: normalizeGannLevels(drawing.gannPriceLevels, defaultGannBoxLevels),
    gannTimeLevels: normalizeGannLevels(drawing.gannTimeLevels, defaultGannBoxLevels),
    gannLevels: normalizeGannLevels(drawing.gannLevels, defaultGannSquareLevels),
    gannFanLevels: normalizeGannLevels(drawing.gannFanLevels, defaultGannSquareFanLevels),
    gannFanLineLevels: normalizeGannLevels(drawing.gannFanLineLevels, defaultGannFanLevels),
    gannArcLevels: normalizeGannLevels(drawing.gannArcLevels, defaultGannSquareArcLevels),
    gannUseOneColor: Boolean(drawing.gannUseOneColor),
    showGannBackground: drawing.showGannBackground ?? true,
    gannBackgroundColor: drawing.gannBackgroundColor ?? drawing.color ?? "#2962FF",
    gannBackgroundOpacity: drawing.gannBackgroundOpacity ?? 20,
    gannReverse: Boolean(drawing.gannReverse),
    showGannAngles: Boolean(drawing.showGannAngles),
    gannAnglesColor: drawing.gannAnglesColor ?? "#9c9c9c",
    gannAnglesOpacity: drawing.gannAnglesOpacity ?? 100,
    showGannLeftLabels: drawing.showGannLeftLabels ?? true,
    showGannRightLabels: drawing.showGannRightLabels ?? true,
    showGannTopLabels: drawing.showGannTopLabels ?? true,
    showGannBottomLabels: drawing.showGannBottomLabels ?? true,
    showGannLabels: drawing.showGannLabels ?? true,
    showGannRangesText: drawing.showGannRangesText ?? true,
    gannLineWidth: drawing.gannLineWidth ?? 1,
    scaleRatio: drawing.scaleRatio ?? null,
  };
}

/**
 * @param {HTMLElement} list
 * @param {import("../../tools/gann/index.js").GannLevel[]} levels
 * @param {Record<string, unknown>} draft
 * @param {string} prefix
 * @param {boolean} [showOffset]
 */
function buildLevelsList(list, levels, draft, prefix, showOffset = true) {
  const baseColor = draft.color ?? "#2962FF";
  const baseOpacity = draft.colorOpacity ?? 100;
  const useOne = Boolean(draft.gannUseOneColor);

  list.innerHTML = levels
    .map((level, i) => {
      const previewColor = applyColorOpacity(
        useOne ? baseColor : level.color ?? baseColor,
        useOne ? baseOpacity : level.colorOpacity ?? baseOpacity,
      );
      const disabled = !level.enabled || useOne;
      const label = level.label ?? String(level.offset ?? "");
      const value = showOffset ? String(level.offset ?? "") : label;
      return `<div class="tv-fib-level-row" data-gann-level-row="${prefix}-${i}">
        <button type="button" class="tv-set__check${level.enabled ? " tv-set__check--on" : ""}" data-gann-level-enable="${prefix}-${i}" role="checkbox" aria-checked="${level.enabled ? "true" : "false"}" aria-label="Level ${label}">
          <span class="tv-set__check-box">${level.enabled ? CHECK_SVG : ""}</span>
        </button>
        ${showOffset ? `<input type="text" class="tv-drawing-settings__input tv-fib-level-offset" data-gann-level-offset="${prefix}-${i}" inputmode="decimal" value="${value}" ${disabled ? "disabled" : ""} />` : `<span class="tv-set__check-label tv-gann-level-title">${label}</span>`}
        <button type="button" class="tv-drawing-settings__color-btn tv-drawing-settings__color-btn--compact" data-gann-level-color="${prefix}-${i}" aria-label="Level color" ${disabled ? "disabled" : ""}>
          <span class="tv-drawing-settings__color-swatch" style="background-color:${previewColor}"></span>
        </button>
      </div>`;
    })
    .join("");
}

const GANN_SECTION_SELECTORS = [
  "[data-gann-box-price-section]",
  "[data-gann-box-time-section]",
  "[data-gann-box-labels-section]",
  "[data-gann-box-angles-section]",
  "[data-gann-square-levels-section]",
  "[data-gann-square-fans-section]",
  "[data-gann-square-arcs-section]",
  "[data-gann-fan-section]",
  "[data-gann-options-section]",
  "[data-gann-background-section]",
  "[data-gann-scale-section]",
];

/**
 * @param {HTMLElement} root
 * @param {Record<string, unknown>} draft
 */
export function syncGannDialogUi(root, draft) {
  const drawingType = String(draft.drawingType ?? "");
  const show = supportsGannStyleSettings(drawingType);
  const isBox = drawingType === "gann-box";
  const isFan = drawingType === "gann-fan";
  const isSquare = drawingType === "gann-square" || drawingType === "gann-square-fixed";

  for (const selector of GANN_SECTION_SELECTORS) {
    const section = root.querySelector(selector);
    if (section instanceof HTMLElement) section.hidden = !show;
  }

  const lineSection = root.querySelector("[data-line-section]");
  if (show && lineSection instanceof HTMLElement) lineSection.hidden = true;

  if (!show) return;

  const boxPrice = root.querySelector("[data-gann-box-price-section]");
  const boxTime = root.querySelector("[data-gann-box-time-section]");
  const boxLabels = root.querySelector("[data-gann-box-labels-section]");
  const boxAngles = root.querySelector("[data-gann-box-angles-section]");
  const sqLevels = root.querySelector("[data-gann-square-levels-section]");
  const sqFans = root.querySelector("[data-gann-square-fans-section]");
  const sqArcs = root.querySelector("[data-gann-square-arcs-section]");
  const fanSection = root.querySelector("[data-gann-fan-section]");
  const optionsSection = root.querySelector("[data-gann-options-section]");
  const scaleSection = root.querySelector("[data-gann-scale-section]");

  if (boxPrice instanceof HTMLElement) boxPrice.hidden = !isBox;
  if (boxTime instanceof HTMLElement) boxTime.hidden = !isBox;
  if (boxLabels instanceof HTMLElement) boxLabels.hidden = !isBox;
  if (boxAngles instanceof HTMLElement) boxAngles.hidden = !isBox;
  if (sqLevels instanceof HTMLElement) sqLevels.hidden = !isSquare;
  if (sqFans instanceof HTMLElement) sqFans.hidden = !isSquare;
  if (sqArcs instanceof HTMLElement) sqArcs.hidden = !isSquare;
  if (fanSection instanceof HTMLElement) fanSection.hidden = !isFan;
  if (scaleSection instanceof HTMLElement) scaleSection.hidden = drawingType !== "gann-square";

  const reverseRow = root.querySelector("[data-gann-reverse-btn]")?.closest(".tv-set__check-row");
  if (reverseRow instanceof HTMLElement) reverseRow.hidden = isFan;

  const labelsRow = root.querySelector("[data-gann-labels-btn]")?.closest(".tv-set__check-row");
  if (labelsRow instanceof HTMLElement) labelsRow.hidden = !isFan;

  const rangesRow = root.querySelector("[data-gann-ranges-btn]")?.closest(".tv-set__check-row");
  if (rangesRow instanceof HTMLElement) rangesRow.hidden = drawingType !== "gann-square";

  const priceList = root.querySelector("[data-gann-price-levels-list]");
  const timeList = root.querySelector("[data-gann-time-levels-list]");
  const sqList = root.querySelector("[data-gann-square-levels-list]");
  const fanList = root.querySelector("[data-gann-fan-levels-list]");
  const arcList = root.querySelector("[data-gann-arcs-levels-list]");
  const gannFanList = root.querySelector("[data-gann-fan-lines-list]");

  if (priceList instanceof HTMLElement) {
    buildLevelsList(priceList, normalizeGannLevels(draft.gannPriceLevels, defaultGannBoxLevels), draft, "price");
  }
  if (timeList instanceof HTMLElement) {
    buildLevelsList(timeList, normalizeGannLevels(draft.gannTimeLevels, defaultGannBoxLevels), draft, "time");
  }
  if (sqList instanceof HTMLElement) {
    buildLevelsList(sqList, normalizeGannLevels(draft.gannLevels, defaultGannSquareLevels), draft, "sq", false);
  }
  if (fanList instanceof HTMLElement) {
    buildLevelsList(fanList, normalizeGannLevels(draft.gannFanLevels, defaultGannSquareFanLevels), draft, "fan", false);
  }
  if (arcList instanceof HTMLElement) {
    buildLevelsList(arcList, normalizeGannLevels(draft.gannArcLevels, defaultGannSquareArcLevels), draft, "arc", false);
  }
  if (gannFanList instanceof HTMLElement) {
    buildLevelsList(gannFanList, normalizeGannLevels(draft.gannFanLineLevels, defaultGannFanLevels), draft, "gfan", false);
  }

  const useOneBtn = root.querySelector("[data-gann-use-one-color-btn]");
  const useOneSwatch = root.querySelector("[data-gann-use-one-swatch]");
  const useOneSwatchWrap = root.querySelector("[data-gann-use-one-swatch-wrap]");
  const bgBtn = root.querySelector("[data-gann-background-btn]");
  const bgSwatch = root.querySelector("[data-gann-background-swatch]");
  const reverseBtn = root.querySelector("[data-gann-reverse-btn]");
  const anglesBtn = root.querySelector("[data-gann-angles-btn]");
  const anglesSwatch = root.querySelector("[data-gann-angles-swatch]");
  const labelsBtn = root.querySelector("[data-gann-labels-btn]");
  const leftBtn = root.querySelector("[data-gann-left-labels-btn]");
  const rightBtn = root.querySelector("[data-gann-right-labels-btn]");
  const topBtn = root.querySelector("[data-gann-top-labels-btn]");
  const bottomBtn = root.querySelector("[data-gann-bottom-labels-btn]");
  const rangesBtn = root.querySelector("[data-gann-ranges-btn]");
  const scaleInput = root.querySelector("[data-gann-scale-ratio]");

  setTvCheck(useOneBtn, Boolean(draft.gannUseOneColor));
  if (useOneSwatchWrap instanceof HTMLElement) {
    useOneSwatchWrap.hidden = !draft.gannUseOneColor;
  }
  if (useOneSwatch instanceof HTMLElement) {
    useOneSwatch.style.backgroundColor = applyColorOpacity(draft.color ?? "#2962FF", draft.colorOpacity ?? 100);
  }

  setTvCheck(bgBtn, draft.showGannBackground !== false);
  if (bgSwatch instanceof HTMLElement) {
    bgSwatch.style.backgroundColor = applyColorOpacity(
      draft.gannBackgroundColor ?? draft.color ?? "#2962FF",
      draft.gannBackgroundOpacity ?? 20,
    );
  }

  setTvCheck(reverseBtn, Boolean(draft.gannReverse));
  setTvCheck(anglesBtn, Boolean(draft.showGannAngles));
  if (anglesSwatch instanceof HTMLElement) {
    anglesSwatch.style.backgroundColor = applyColorOpacity(
      draft.gannAnglesColor ?? "#9c9c9c",
      draft.gannAnglesOpacity ?? 100,
    );
  }

  setTvCheck(labelsBtn, draft.showGannLabels !== false);
  setTvCheck(leftBtn, draft.showGannLeftLabels !== false);
  setTvCheck(rightBtn, draft.showGannRightLabels !== false);
  setTvCheck(topBtn, draft.showGannTopLabels !== false);
  setTvCheck(bottomBtn, draft.showGannBottomLabels !== false);
  setTvCheck(rangesBtn, draft.showGannRangesText !== false);

  if (scaleInput instanceof HTMLInputElement) {
    scaleInput.value = draft.scaleRatio != null ? String(draft.scaleRatio) : "";
  }
}

/** @param {string} prefix @param {import("../../tools/gann/index.js").GannLevel[]} levels @param {HTMLElement} root */
function readLevelsFromUi(prefix, levels, root) {
  return levels.map((level, i) => {
    const enableBtn = root.querySelector(`[data-gann-level-enable="${prefix}-${i}"]`);
    const offsetInput = root.querySelector(`[data-gann-level-offset="${prefix}-${i}"]`);
    const enabled = enableBtn?.classList.contains("tv-set__check--on") ?? level.enabled;
    let offset = level.offset;
    if (offsetInput instanceof HTMLInputElement) {
      const n = Number(offsetInput.value);
      if (Number.isFinite(n)) offset = n;
    }
    return { ...level, enabled, offset };
  });
}

/**
 * @param {HTMLElement} root
 * @param {Record<string, unknown>} draft
 */
export function readGannDraftFromUi(root, draft) {
  const drawingType = String(draft.drawingType ?? "");
  if (!isGannTool(drawingType)) return {};

  const useOneBtn = root.querySelector("[data-gann-use-one-color-btn]");
  const bgBtn = root.querySelector("[data-gann-background-btn]");
  const reverseBtn = root.querySelector("[data-gann-reverse-btn]");
  const anglesBtn = root.querySelector("[data-gann-angles-btn]");
  const labelsBtn = root.querySelector("[data-gann-labels-btn]");
  const leftBtn = root.querySelector("[data-gann-left-labels-btn]");
  const rightBtn = root.querySelector("[data-gann-right-labels-btn]");
  const topBtn = root.querySelector("[data-gann-top-labels-btn]");
  const bottomBtn = root.querySelector("[data-gann-bottom-labels-btn]");
  const rangesBtn = root.querySelector("[data-gann-ranges-btn]");
  const scaleInput = root.querySelector("[data-gann-scale-ratio]");

  const scaleRaw = scaleInput instanceof HTMLInputElement ? scaleInput.value.trim() : "";
  const scaleRatio = scaleRaw === "" ? null : Number(scaleRaw);

  return {
    gannPriceLevels: readLevelsFromUi(
      "price",
      normalizeGannLevels(draft.gannPriceLevels, defaultGannBoxLevels),
      root,
    ),
    gannTimeLevels: readLevelsFromUi("time", normalizeGannLevels(draft.gannTimeLevels, defaultGannBoxLevels), root),
    gannLevels: readLevelsFromUi("sq", normalizeGannLevels(draft.gannLevels, defaultGannSquareLevels), root),
    gannFanLevels: readLevelsFromUi("fan", normalizeGannLevels(draft.gannFanLevels, defaultGannSquareFanLevels), root),
    gannArcLevels: readLevelsFromUi("arc", normalizeGannLevels(draft.gannArcLevels, defaultGannSquareArcLevels), root),
    gannFanLineLevels: readLevelsFromUi(
      "gfan",
      normalizeGannLevels(draft.gannFanLineLevels, defaultGannFanLevels),
      root,
    ),
    gannUseOneColor: useOneBtn?.classList.contains("tv-set__check--on") ?? false,
    showGannBackground: bgBtn?.classList.contains("tv-set__check--on") ?? true,
    gannReverse: reverseBtn?.classList.contains("tv-set__check--on") ?? false,
    showGannAngles: anglesBtn?.classList.contains("tv-set__check--on") ?? false,
    showGannLabels: labelsBtn?.classList.contains("tv-set__check--on") ?? true,
    showGannLeftLabels: leftBtn?.classList.contains("tv-set__check--on") ?? true,
    showGannRightLabels: rightBtn?.classList.contains("tv-set__check--on") ?? true,
    showGannTopLabels: topBtn?.classList.contains("tv-set__check--on") ?? true,
    showGannBottomLabels: bottomBtn?.classList.contains("tv-set__check--on") ?? true,
    showGannRangesText: rangesBtn?.classList.contains("tv-set__check--on") ?? true,
    scaleRatio: Number.isFinite(scaleRatio) ? scaleRatio : null,
  };
}

/**
 * @param {HTMLElement} root
 * @param {object} wireCtx
 */
export function wireGannSettings(root, wireCtx) {
  const { patchDrawing, colorPicker, syncUi, getDraft } = wireCtx;

  root.addEventListener("click", (ev) => {
    const target = ev.target;
    if (!(target instanceof Element)) return;

    const enableKey = target.closest("[data-gann-level-enable]")?.getAttribute("data-gann-level-enable");
    if (enableKey) {
      const [prefix, idxStr] = enableKey.split("-");
      const idx = Number(idxStr);
      const keyMap = {
        price: ["gannPriceLevels", defaultGannBoxLevels],
        time: ["gannTimeLevels", defaultGannBoxLevels],
        sq: ["gannLevels", defaultGannSquareLevels],
        fan: ["gannFanLevels", defaultGannSquareFanLevels],
        arc: ["gannArcLevels", defaultGannSquareArcLevels],
        gfan: ["gannFanLineLevels", defaultGannFanLevels],
      };
      const entry = keyMap[prefix];
      if (!entry) return;
      const [key, defaults] = entry;
      const draft = getDraft();
      const levels = normalizeGannLevels(draft[key], defaults);
      const next = levels.map((l, i) => (i === idx ? { ...l, enabled: !l.enabled } : l));
      patchDrawing({ [key]: next });
      syncUi();
      return;
    }

    const colorKey = target.closest("[data-gann-level-color]")?.getAttribute("data-gann-level-color");
    if (colorKey) {
      const btn = target.closest("[data-gann-level-color]");
      if (!(btn instanceof HTMLElement)) return;
      const [prefix, idxStr] = colorKey.split("-");
      const idx = Number(idxStr);
      const keyMap = {
        price: ["gannPriceLevels", defaultGannBoxLevels],
        time: ["gannTimeLevels", defaultGannBoxLevels],
        sq: ["gannLevels", defaultGannSquareLevels],
        fan: ["gannFanLevels", defaultGannSquareFanLevels],
        arc: ["gannArcLevels", defaultGannSquareArcLevels],
        gfan: ["gannFanLineLevels", defaultGannFanLevels],
      };
      const entry = keyMap[prefix];
      if (!entry) return;
      const [key, defaults] = entry;
      const draft = getDraft();
      const levels = normalizeGannLevels(draft[key], defaults);
      const level = levels[idx];
      if (!level) return;
      colorPicker.openSwatch(
        btn,
        { color: level.color ?? draft.color ?? "#2962FF", opacity: level.colorOpacity ?? 100 },
        {
          onChange: (value) => {
            const cur = normalizeGannLevels(getDraft()[key], defaults);
            const next = cur.map((l, i) =>
              i === idx ? { ...l, color: value.color, colorOpacity: value.opacity } : l,
            );
            patchDrawing({ [key]: next });
            syncUi();
          },
        },
      );
    }
  });

  const togglePairs = [
    ["[data-gann-use-one-color-btn]", "gannUseOneColor"],
    ["[data-gann-background-btn]", "showGannBackground"],
    ["[data-gann-reverse-btn]", "gannReverse"],
    ["[data-gann-angles-btn]", "showGannAngles"],
    ["[data-gann-labels-btn]", "showGannLabels"],
    ["[data-gann-left-labels-btn]", "showGannLeftLabels"],
    ["[data-gann-right-labels-btn]", "showGannRightLabels"],
    ["[data-gann-top-labels-btn]", "showGannTopLabels"],
    ["[data-gann-bottom-labels-btn]", "showGannBottomLabels"],
    ["[data-gann-ranges-btn]", "showGannRangesText"],
  ];

  for (const [selector, key] of togglePairs) {
    const btn = root.querySelector(selector);
    if (!(btn instanceof HTMLElement)) continue;
    btn.addEventListener("click", () => {
      const d = getDraft();
      patchDrawing({ [key]: !d[key] });
      syncUi();
    });
  }

  const bgColorBtn = root.querySelector("[data-gann-background-color]");
  if (bgColorBtn instanceof HTMLElement) {
    bgColorBtn.addEventListener("click", () => {
      const d = getDraft();
      colorPicker.openSwatch(
        bgColorBtn,
        { color: d.gannBackgroundColor ?? d.color ?? "#2962FF", opacity: d.gannBackgroundOpacity ?? 20 },
        {
          onChange: (value) => {
            patchDrawing({ gannBackgroundColor: value.color, gannBackgroundOpacity: value.opacity });
            syncUi();
          },
        },
      );
    });
  }

  const anglesColorBtn = root.querySelector("[data-gann-angles-color]");
  if (anglesColorBtn instanceof HTMLElement) {
    anglesColorBtn.addEventListener("click", () => {
      const d = getDraft();
      colorPicker.openSwatch(
        anglesColorBtn,
        { color: d.gannAnglesColor ?? "#9c9c9c", opacity: d.gannAnglesOpacity ?? 100 },
        {
          onChange: (value) => {
            patchDrawing({ gannAnglesColor: value.color, gannAnglesOpacity: value.opacity });
            syncUi();
          },
        },
      );
    });
  }

  const useOneSwatch = root.querySelector("[data-gann-use-one-swatch-wrap]");
  if (useOneSwatch instanceof HTMLElement) {
    useOneSwatch.addEventListener("click", () => {
      const d = getDraft();
      colorPicker.openSwatch(
        useOneSwatch,
        { color: d.color ?? "#2962FF", opacity: d.colorOpacity ?? 100 },
        {
          onChange: (value) => {
            patchDrawing({ color: value.color, colorOpacity: value.opacity });
            syncUi();
          },
        },
      );
    });
  }
}

export { isGannTool, supportsGannStyleSettings };

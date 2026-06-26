const PRESETS = [
  "#ffffff",
  "#e0e0e0",
  "#9e9e9e",
  "#616161",
  "#212121",
  "#000000",
  "#f23645",
  "#e91e63",
  "#9c27b0",
  "#673ab7",
  "#2962ff",
  "#2196f3",
  "#089981",
  "#4caf50",
  "#8bc34a",
  "#ffeb3b",
  "#ffc107",
  "#ff9800",
  "#ff5722",
  "#795548",
  "#607d8b",
  "#00bcd4",
  "#3f51b5",
  "#cddc39",
];

const TV_SWATCH_ROWS = [
  ["#ffffff", "#dbdbdb", "#b8b8b8", "#9c9c9c", "#808080", "#636363", "#4a4a4a", "#2e2e2e", "#0f0f0f", "#000000"],
  ["#f23645", "#ff9800", "#ffeb3b", "#4caf50", "#089981", "#00bcd4", "#2962ff", "#673ab7", "#9c27b0", "#e91e63"],
  ["#fccbcd", "#ffe0b2", "#fff9c4", "#c8e6c9", "#ace5dc", "#b2ebf2", "#bbd9fb", "#d1c4e9", "#e1bee7", "#f8bbd0"],
  ["#faa1a4", "#ffcc80", "#fff59d", "#a5d6a7", "#70ccbd", "#80deea", "#90bff9", "#b39ddb", "#ce93d8", "#f48fb1"],
  ["#f77c80", "#ffb74d", "#fff176", "#81c784", "#42bda8", "#4dd0e1", "#5b9cf6", "#9575cd", "#ba68c8", "#f06292"],
  ["#f7525f", "#ffa726", "#ffee58", "#66bb6a", "#22ab94", "#26c6da", "#3179f5", "#7e57c2", "#ab47bc", "#ec407a"],
  ["#b22833", "#f57c00", "#fbc02d", "#388e3c", "#056656", "#0097a7", "#1848cc", "#512da8", "#7b1fa2", "#c2185b"],
  ["#801922", "#e65100", "#f57f17", "#1b5e20", "#00332a", "#006064", "#0c3299", "#311b92", "#4a148c", "#880e4f"],
];

const LINE_THICKNESS = [1, 2, 3, 4];

const LINE_STYLES = [
  { value: 0, className: "solid" },
  { value: 2, className: "dashed" },
  { value: 1, className: "dotted" },
];

/** @param {string} color @param {number} opacityPercent */
export function applyColorOpacity(color, opacityPercent) {
  const pct = Number(opacityPercent);
  if (!Number.isFinite(pct) || pct >= 100) return color;
  const { r, g, b } = parseColor(color);
  return formatColor({ r, g, b, a: Math.max(0, Math.min(1, pct / 100)) }, true);
}

/** @param {number} h @param {number} s @param {number} l */
function hslToRgb(h, s, l) {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/** @param {number} r @param {number} g @param {number} b */
function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    switch (max) {
      case rn:
        h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
        break;
      case gn:
        h = ((bn - rn) / d + 2) * 60;
        break;
      default:
        h = ((rn - gn) / d + 4) * 60;
    }
  }
  return { h, s: s * 100, l: l * 100 };
}

/** @param {number} n */
function clampByte(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

/** @param {number} r @param {number} g @param {number} b */
function toHex(r, g, b) {
  const h = (n) => clampByte(n).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** @param {string} raw */
export function parseColor(raw) {
  if (!raw) return { r: 41, g: 98, b: 255, a: 1 };
  const hex = raw.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const rgb = raw.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/i);
  if (rgb) {
    return {
      r: Number(rgb[1]),
      g: Number(rgb[2]),
      b: Number(rgb[3]),
      a: rgb[4] != null ? Number(rgb[4]) : 1,
    };
  }
  return { r: 41, g: 98, b: 255, a: 1 };
}

/** @param {{ r: number, g: number, b: number, a?: number }} c @param {boolean} [withAlpha] */
export function formatColor(c, withAlpha = false) {
  if (withAlpha && c.a != null && c.a < 1) {
    return `rgba(${clampByte(c.r)}, ${clampByte(c.g)}, ${clampByte(c.b)}, ${Math.round(c.a * 100) / 100})`;
  }
  return toHex(c.r, c.g, c.b);
}

export function createColorPicker() {
  const root = document.createElement("div");
  root.className = "tv-cpicker";
  root.hidden = true;
  root.innerHTML = `<div class="tv-cpicker__panel" data-panel="classic" role="dialog" aria-label="Color picker">
    <div class="tv-cpicker__sl" data-sl>
      <div class="tv-cpicker__sl-cursor" data-sl-cursor></div>
    </div>
    <input type="range" class="tv-cpicker__hue" data-hue min="0" max="360" value="220" aria-label="Hue" />
    <div class="tv-cpicker__classic-opacity" data-alpha-wrap hidden>
      <div class="tv-cpicker__thickness-title">Opacity</div>
      <div class="tv-cpicker__line-opacity-row">
        <div class="tv-cpicker__line-opacity-slider-wrap tv-cpicker__line-opacity-slider-wrap--checker">
          <div class="tv-cpicker__line-opacity-gradient" data-alpha-gradient></div>
          <input type="range" class="tv-cpicker__line-opacity-slider" data-alpha min="0" max="100" value="100" aria-label="Opacity" />
        </div>
        <div class="tv-cpicker__line-opacity-input-wrap">
          <input type="text" class="tv-cpicker__line-opacity-input" data-alpha-text value="100" inputmode="numeric" aria-label="Opacity percent" />
          <span class="tv-cpicker__line-opacity-pct">%</span>
        </div>
      </div>
    </div>
    <div class="tv-cpicker__presets" data-presets></div>
    <div class="tv-cpicker__hex-row">
      <span class="tv-cpicker__preview" data-preview></span>
      <input type="text" class="tv-cpicker__hex" data-hex maxlength="9" spellcheck="false" aria-label="Hex color" />
    </div>
  </div>
  <div class="tv-cpicker__panel tv-cpicker__panel--line" data-panel="line" hidden role="dialog" aria-label="Line color picker">
    <div class="tv-cpicker__tv-swatches" data-tv-swatches></div>
    <div class="tv-cpicker__line-sep"></div>
    <button type="button" class="tv-cpicker__custom-btn" data-custom-color aria-label="Custom color">
      <span class="tv-cpicker__custom-btn-spectrum" aria-hidden="true"></span>
    </button>
    <div class="tv-cpicker__line-opacity" data-line-opacity-wrap hidden>
      <div class="tv-cpicker__thickness-title">Opacity</div>
      <div class="tv-cpicker__line-opacity-row">
        <div class="tv-cpicker__line-opacity-slider-wrap tv-cpicker__line-opacity-slider-wrap--checker">
          <div class="tv-cpicker__line-opacity-gradient" data-line-opacity-gradient></div>
          <input type="range" class="tv-cpicker__line-opacity-slider" data-line-opacity min="0" max="100" value="100" aria-label="Opacity" />
        </div>
        <div class="tv-cpicker__line-opacity-input-wrap">
          <input type="text" class="tv-cpicker__line-opacity-input" data-line-opacity-text value="100" inputmode="numeric" aria-label="Opacity percent" />
          <span class="tv-cpicker__line-opacity-pct">%</span>
        </div>
      </div>
    </div>
    <div class="tv-cpicker__thickness" data-line-thickness-wrap>
      <div class="tv-cpicker__thickness-title">Thickness</div>
      <div class="tv-cpicker__thickness-row" data-thickness-row></div>
    </div>
    <div class="tv-cpicker__line-style" data-line-style-wrap hidden>
      <div class="tv-cpicker__thickness-title">Line style</div>
      <div class="tv-cpicker__line-style-row" data-line-style-row></div>
    </div>
  </div>`;
  document.body.appendChild(root);

  const classicPanel = root.querySelector('[data-panel="classic"]');
  const linePanel = root.querySelector('[data-panel="line"]');
  const slEl = root.querySelector("[data-sl]");
  const slCursor = root.querySelector("[data-sl-cursor]");
  const hueEl = root.querySelector("[data-hue]");
  const alphaWrap = root.querySelector("[data-alpha-wrap]");
  const alphaGradient = root.querySelector("[data-alpha-gradient]");
  const alphaEl = root.querySelector("[data-alpha]");
  const alphaTextEl = root.querySelector("[data-alpha-text]");
  const presetsEl = root.querySelector("[data-presets]");
  const previewEl = root.querySelector("[data-preview]");
  const hexEl = root.querySelector("[data-hex]");
  const tvSwatchesEl = root.querySelector("[data-tv-swatches]");
  const lineColorSep = root.querySelector(".tv-cpicker__line-sep");
  const thicknessRowEl = root.querySelector("[data-thickness-row]");
  const customColorBtn = root.querySelector("[data-custom-color]");
  const lineOpacityWrap = root.querySelector("[data-line-opacity-wrap]");
  const lineOpacityGradient = root.querySelector("[data-line-opacity-gradient]");
  const lineOpacitySlider = root.querySelector("[data-line-opacity]");
  const lineOpacityText = root.querySelector("[data-line-opacity-text]");
  const lineStyleWrap = root.querySelector("[data-line-style-wrap]");
  const lineStyleRowEl = root.querySelector("[data-line-style-row]");
  const lineThicknessWrap = root.querySelector("[data-line-thickness-wrap]");

  if (
    !classicPanel ||
    !linePanel ||
    !slEl ||
    !slCursor ||
    !hueEl ||
    !alphaWrap ||
    !alphaGradient ||
    !alphaEl ||
    !alphaTextEl ||
    !presetsEl ||
    !previewEl ||
    !hexEl ||
    !tvSwatchesEl ||
    !lineColorSep ||
    !thicknessRowEl ||
    !customColorBtn ||
    !lineOpacityWrap ||
    !lineOpacityGradient ||
    !lineOpacitySlider ||
    !lineOpacityText ||
    !lineStyleWrap ||
    !lineStyleRowEl ||
    !lineThicknessWrap
  ) {
    throw new Error("Color picker markup missing");
  }

  tvSwatchesEl.innerHTML = TV_SWATCH_ROWS.map(
    (row) =>
      `<div class="tv-cpicker__tv-row">${row
        .map(
          (c) =>
            `<button type="button" class="tv-cpicker__tv-swatch${c.toLowerCase() === "#ffffff" ? " tv-cpicker__tv-swatch--white" : ""}" data-tv-swatch="${c}" style="--swatch:${c}" aria-label="${c}"></button>`,
        )
        .join("")}</div>`,
  ).join("");

  thicknessRowEl.innerHTML = LINE_THICKNESS.map(
    (w) =>
      `<label class="tv-cpicker__thickness-item">
        <input type="radio" name="tv-cpicker-thickness" value="${w}" data-thickness="${w}" />
        <span class="tv-cpicker__thickness-bar" style="--thickness:${w}px"></span>
      </label>`,
  ).join("");

  lineStyleRowEl.innerHTML = LINE_STYLES.map(
    ({ value, className }) =>
      `<label class="tv-cpicker__line-style-item">
        <input type="radio" name="tv-cpicker-style" value="${value}" data-line-style="${value}" />
        <span class="tv-cpicker__line-style-preview tv-cpicker__line-style-preview--${className}"></span>
      </label>`,
  ).join("");

  let h = 220;
  let s = 100;
  let l = 50;
  let a = 1;
  let withAlpha = false;
  /** @type {((value: string) => void) | null} */
  let onChange = null;
  /** @type {((value: { color: string, width: number, opacity: number, style: number }) => void) | null} */
  let onLineChange = null;
  /** @type {(() => void) | null} */
  let onClose = null;
  let draggingSl = false;
  let lineMode = false;
  let lineColor = "#9c9c9c";
  let lineWidth = 1;
  let lineOpacity = 100;
  let lineStyle = 2;
  let showLineOpacity = false;
  let showLineStyle = false;
  let showLineColor = true;
  let swatchOnlyMode = false;
  /** @type {HTMLElement | null} */
  let lineAnchor = null;

  presetsEl.innerHTML = PRESETS.map(
    (c) => `<button type="button" class="tv-cpicker__preset" data-preset="${c}" style="background:${c}" aria-label="${c}"></button>`,
  ).join("");

  function currentRgb() {
    const [r, g, b] = hslToRgb(h, s, l);
    return { r, g, b, a };
  }

  function syncAlphaUi() {
    const pct = Math.round(a * 100);
    alphaEl.value = String(pct);
    alphaTextEl.value = String(pct);
    const rgb = currentRgb();
    const hex = toHex(rgb.r, rgb.g, rgb.b);
    alphaGradient.style.setProperty("--line-opacity-color", hex);
    alphaGradient.style.backgroundImage = `linear-gradient(90deg, transparent, ${hex})`;
  }

  function syncFromHsl() {
    const rgb = currentRgb();
    const hex = toHex(rgb.r, rgb.g, rgb.b);
    slEl.style.setProperty("--cp-hue", String(h));
    slCursor.style.left = `${s}%`;
    slCursor.style.top = `${100 - l}%`;
    hueEl.value = String(Math.round(h));
    previewEl.style.background = withAlpha && a < 1 ? formatColor(rgb, true) : hex;
    hexEl.value = hex;
    if (withAlpha) syncAlphaUi();
  }

  function setFromRgb(r, g, b, alpha = a) {
    const hsl = rgbToHsl(r, g, b);
    h = hsl.h;
    s = hsl.s;
    l = hsl.l;
    a = alpha;
    syncFromHsl();
  }

  function emit() {
    onChange?.(formatColor(currentRgb(), withAlpha));
  }

  function setSlFromEvent(ev) {
    const rect = slEl.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, ev.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, ev.clientY - rect.top));
    s = (x / rect.width) * 100;
    l = 100 - (y / rect.height) * 100;
    syncFromHsl();
    emit();
  }

  slEl.addEventListener("pointerdown", (ev) => {
    draggingSl = true;
    slEl.setPointerCapture(ev.pointerId);
    setSlFromEvent(ev);
  });
  slEl.addEventListener("pointermove", (ev) => {
    if (!draggingSl) return;
    setSlFromEvent(ev);
  });
  slEl.addEventListener("pointerup", () => {
    draggingSl = false;
  });

  hueEl.addEventListener("input", () => {
    h = Number(hueEl.value);
    syncFromHsl();
    emit();
  });

  alphaEl.addEventListener("input", () => {
    a = Math.max(0, Math.min(1, Number(alphaEl.value) / 100));
    syncFromHsl();
    emit();
  });

  alphaTextEl.addEventListener("change", () => {
    a = Math.max(0, Math.min(1, Number(alphaTextEl.value) / 100));
    syncFromHsl();
    emit();
  });

  hexEl.addEventListener("change", () => {
    const parsed = parseColor(hexEl.value.trim());
    setFromRgb(parsed.r, parsed.g, parsed.b, parsed.a ?? a);
    emit();
  });

  presetsEl.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-preset]");
    if (!btn) return;
    const parsed = parseColor(btn.dataset.preset);
    setFromRgb(parsed.r, parsed.g, parsed.b, withAlpha ? a : 1);
    emit();
  });

  function syncLineUi() {
    thicknessRowEl.querySelectorAll("[data-thickness]").forEach((input) => {
      if (!(input instanceof HTMLInputElement)) return;
      input.checked = Number(input.value) === lineWidth;
    });
    lineStyleRowEl.querySelectorAll("[data-line-style]").forEach((input) => {
      if (!(input instanceof HTMLInputElement)) return;
      input.checked = Number(input.value) === lineStyle;
    });
    tvSwatchesEl.querySelectorAll("[data-tv-swatch]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.tvSwatch?.toLowerCase() === lineColor.toLowerCase());
    });
    if (showLineOpacity || swatchOnlyMode) {
      lineOpacitySlider.value = String(lineOpacity);
      lineOpacityText.value = String(lineOpacity);
      const { r, g, b } = parseColor(lineColor);
      const hex = toHex(r, g, b);
      lineOpacityGradient.style.setProperty("--line-opacity-color", hex);
      lineOpacityGradient.style.backgroundImage = `linear-gradient(90deg, transparent, ${hex})`;
    }
  }

  function emitLine() {
    if (swatchOnlyMode) {
      onLineChange?.({ color: lineColor, opacity: lineOpacity });
      return;
    }
    onLineChange?.({ color: lineColor, width: lineWidth, opacity: lineOpacity, style: lineStyle });
  }

  function applyLinePanelMode() {
    const swatch = swatchOnlyMode;
    const hideColor = !swatch && !showLineColor;
    tvSwatchesEl.hidden = hideColor;
    lineColorSep.hidden = hideColor;
    customColorBtn.hidden = hideColor;
    lineThicknessWrap.hidden = swatch;
    lineStyleWrap.hidden = swatch || !showLineStyle;
    lineOpacityWrap.hidden = !showLineOpacity && !swatch;
    if (swatch) lineOpacityWrap.hidden = false;
    root.classList.toggle("tv-cpicker--swatch-only", swatch);
    root.classList.toggle("tv-cpicker--style-width-only", !swatch && !showLineColor && showLineStyle);
  }

  tvSwatchesEl.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-tv-swatch]");
    if (!btn) return;
    lineColor = btn.dataset.tvSwatch ?? lineColor;
    syncLineUi();
    emitLine();
  });

  thicknessRowEl.addEventListener("change", (ev) => {
    const input = ev.target;
    if (!(input instanceof HTMLInputElement) || input.name !== "tv-cpicker-thickness") return;
    lineWidth = Number(input.value) || 1;
    syncLineUi();
    emitLine();
  });

  lineStyleRowEl.addEventListener("change", (ev) => {
    const input = ev.target;
    if (!(input instanceof HTMLInputElement) || input.name !== "tv-cpicker-style") return;
    lineStyle = Number(input.value);
    syncLineUi();
    emitLine();
  });

  lineOpacitySlider.addEventListener("input", () => {
    lineOpacity = Math.max(0, Math.min(100, Number(lineOpacitySlider.value) || 0));
    syncLineUi();
    emitLine();
  });

  lineOpacityText.addEventListener("change", () => {
    lineOpacity = Math.max(0, Math.min(100, Number(lineOpacityText.value) || 0));
    syncLineUi();
    emitLine();
  });

  customColorBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    linePanel.hidden = true;
    classicPanel.hidden = false;
    withAlpha = false;
    onChange = (value) => {
      lineColor = value;
      syncLineUi();
      emitLine();
      classicPanel.hidden = true;
      linePanel.hidden = false;
      onChange = null;
    };
    const parsed = parseColor(lineColor);
    setFromRgb(parsed.r, parsed.g, parsed.b, 1);
  });

  function activePanel() {
    return lineMode && !linePanel.hidden ? linePanel : classicPanel;
  }

  function position(anchor) {
    const rect = anchor.getBoundingClientRect();
    const pad = 8;
    let left = rect.left;
    let top = rect.bottom + 6;
    root.hidden = false;
    const panelRect = activePanel().getBoundingClientRect();
    if (left + panelRect.width > window.innerWidth - pad) {
      left = window.innerWidth - panelRect.width - pad;
    }
    if (top + panelRect.height > window.innerHeight - pad) {
      top = rect.top - panelRect.height - 6;
    }
    root.style.left = `${Math.max(pad, left)}px`;
    root.style.top = `${Math.max(pad, top)}px`;
  }

  function close() {
    root.hidden = true;
    classicPanel.hidden = false;
    linePanel.hidden = true;
    lineMode = false;
    swatchOnlyMode = false;
    root.classList.remove("tv-cpicker--swatch-only");
    lineAnchor = null;
    onChange = null;
    onLineChange = null;
    onClose?.();
    onClose = null;
  }

  /**
   * @param {HTMLElement} anchor
   * @param {string} value
   * @param {{ alpha?: boolean, onChange: (value: string) => void, onClose?: () => void }} opts
   */
  function open(anchor, value, opts) {
    lineMode = false;
    linePanel.hidden = true;
    classicPanel.hidden = false;
    withAlpha = Boolean(opts.alpha);
    onChange = opts.onChange;
    onLineChange = null;
    onClose = opts.onClose ?? null;
    alphaWrap.hidden = !withAlpha;
    const parsed = parseColor(value);
    setFromRgb(parsed.r, parsed.g, parsed.b, parsed.a ?? 1);
    position(anchor);
  }

  /**
   * @param {HTMLElement} anchor
   * @param {{ color: string, width: number, opacity?: number, style?: number }} value
   * @param {{ showOpacity?: boolean, showLineStyle?: boolean, showColor?: boolean, onChange: (value: { color: string, width: number, opacity: number, style: number }) => void, onClose?: () => void }} opts
   */
  function openLine(anchor, value, opts) {
    lineMode = true;
    swatchOnlyMode = false;
    lineAnchor = anchor;
    linePanel.hidden = false;
    classicPanel.hidden = true;
    lineColor = value.color;
    lineWidth = value.width;
    lineOpacity = value.opacity ?? 100;
    lineStyle = value.style ?? 2;
    showLineOpacity = Boolean(opts.showOpacity);
    showLineStyle = Boolean(opts.showLineStyle);
    showLineColor = opts.showColor !== false;
    onLineChange = opts.onChange;
    onChange = null;
    onClose = opts.onClose ?? null;
    applyLinePanelMode();
    syncLineUi();
    position(anchor);
  }

  /**
   * @param {HTMLElement} anchor
   * @param {{ color: string, opacity?: number }} value
   * @param {{ onChange: (value: { color: string, opacity: number }) => void, onClose?: () => void }} opts
   */
  function openSwatch(anchor, value, opts) {
    lineMode = true;
    swatchOnlyMode = true;
    lineAnchor = anchor;
    linePanel.hidden = false;
    classicPanel.hidden = true;
    lineColor = value.color;
    lineOpacity = value.opacity ?? 100;
    showLineOpacity = true;
    showLineStyle = false;
    showLineColor = true;
    onLineChange = opts.onChange;
    onChange = null;
    onClose = opts.onClose ?? null;
    applyLinePanelMode();
    syncLineUi();
    position(anchor);
  }

  document.addEventListener(
    "mousedown",
    (ev) => {
      if (root.hidden) return;
      const t = ev.target;
      if (!(t instanceof Node)) return;
      if (root.contains(t)) return;
      close();
    },
    true,
  );

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !root.hidden) close();
  });

  return { open, openLine, openSwatch, close, isOpen: () => !root.hidden };
}

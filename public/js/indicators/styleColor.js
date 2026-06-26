import { applyColorOpacity } from "../ui/color/picker.js";

/** @param {object} style @param {string} key @param {string} fallback */
export function styleColor(style, key, fallback) {
  const v = style[key];
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && v.color) return String(v.color);
  return fallback;
}

/** @param {unknown} v @param {string} fallback */
export function inputColorStr(v, fallback) {
  if (typeof v === "string" && v) return v;
  if (v && typeof v === "object" && v.color) return String(v.color);
  return fallback;
}

/** @param {object} style @param {string} key @param {string} fallback @param {number} [defaultOpacity] */
export function styleColorWithOpacity(style, key, fallback, defaultOpacity = 80) {
  const opacityKey = `${key}Opacity`;
  const storedOpacity =
    style[opacityKey] !== undefined && style[opacityKey] !== null
      ? Number(style[opacityKey])
      : defaultOpacity;
  const raw = style[key];
  if (raw && typeof raw === "object" && raw.color) {
    return applyColorOpacity(String(raw.color), Number(raw.opacity ?? storedOpacity));
  }
  return applyColorOpacity(styleColor(style, key, fallback), storedOpacity);
}

/** @param {unknown} input @param {string} fallback @param {number} [defaultOpacity] */
export function inputColorWithOpacity(input, fallback, defaultOpacity = 100) {
  if (input && typeof input === "object" && input.color) {
    return applyColorOpacity(String(input.color), Number(input.opacity ?? defaultOpacity));
  }
  const hex = inputColorStr(input, fallback);
  return applyColorOpacity(hex, defaultOpacity);
}

/**
 * Read a split color input (`colorKey` + `${colorKey}Opacity`) from indicator inputs.
 * @param {object} inputs
 * @param {string} colorKey
 * @param {string} fallback
 * @param {number} [defaultOpacity]
 */
export function inputsColorWithOpacity(inputs, colorKey, fallback, defaultOpacity = 100) {
  const opacityKey = `${colorKey}Opacity`;
  const storedOpacity =
    inputs[opacityKey] !== undefined && inputs[opacityKey] !== null
      ? Number(inputs[opacityKey])
      : defaultOpacity;
  return inputColorWithOpacity(inputs[colorKey], fallback, storedOpacity);
}

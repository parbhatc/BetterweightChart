/**
 * @param {Array<number | null>} values
 * @param {number} length
 * @param {"sma"|"ema"|"smma"|"wma"|"vwma"} type
 * @param {object[]} [bars] required for vwma
 */
export function smoothSeries(values, length, type, bars) {
  const len = Math.max(1, Math.floor(Number(length) || 1));
  if (type === "sma") return sma(values, len);
  if (type === "ema") return emaFromValues(values, len);
  if (type === "smma") return smma(values, len);
  if (type === "wma") return wma(values, len);
  if (type === "vwma") return vwma(values, len, bars);
  return values.slice();
}

/** @param {Array<number | null>} values @param {number} length */
function sma(values, length) {
  const out = /** @type {Array<number | null>} */ ([]);
  for (let i = 0; i < values.length; i++) {
    if (i + 1 < length) {
      out.push(null);
      continue;
    }
    let sum = 0;
    let count = 0;
    for (let j = i - length + 1; j <= i; j++) {
      const v = values[j];
      if (v == null || !Number.isFinite(v)) continue;
      sum += v;
      count++;
    }
    out.push(count === length ? sum / length : null);
  }
  return out;
}

/** @param {Array<number | null>} values @param {number} length */
function emaFromValues(values, length) {
  const out = /** @type {Array<number | null>} */ ([]);
  const k = 2 / (length + 1);
  let ema = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null || !Number.isFinite(v)) {
      out.push(null);
      continue;
    }
    if (ema == null) {
      if (i + 1 < length) {
        out.push(null);
        continue;
      }
      let sum = 0;
      for (let j = i - length + 1; j <= i; j++) sum += values[j] ?? 0;
      ema = sum / length;
    } else {
      ema = v * k + ema * (1 - k);
    }
    out.push(ema);
  }
  return out;
}

/** @param {Array<number | null>} values @param {number} length */
function smma(values, length) {
  const out = /** @type {Array<number | null>} */ ([]);
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null || !Number.isFinite(v)) {
      out.push(null);
      continue;
    }
    if (prev == null) {
      if (i + 1 < length) {
        out.push(null);
        continue;
      }
      let sum = 0;
      for (let j = i - length + 1; j <= i; j++) sum += values[j] ?? 0;
      prev = sum / length;
    } else {
      prev = (prev * (length - 1) + v) / length;
    }
    out.push(prev);
  }
  return out;
}

/** @param {Array<number | null>} values @param {number} length */
function wma(values, length) {
  const out = /** @type {Array<number | null>} */ ([]);
  const denom = (length * (length + 1)) / 2;
  for (let i = 0; i < values.length; i++) {
    if (i + 1 < length) {
      out.push(null);
      continue;
    }
    let sum = 0;
    for (let w = 1; w <= length; w++) {
      const v = values[i - length + w];
      if (v == null || !Number.isFinite(v)) {
        sum = NaN;
        break;
      }
      sum += v * w;
    }
    out.push(Number.isFinite(sum) ? sum / denom : null);
  }
  return out;
}

/** @param {Array<number | null>} values @param {number} length @param {object[]} bars */
function vwma(values, length, bars) {
  const out = /** @type {Array<number | null>} */ ([]);
  for (let i = 0; i < values.length; i++) {
    if (i + 1 < length) {
      out.push(null);
      continue;
    }
    let pv = 0;
    let vol = 0;
    for (let j = i - length + 1; j <= i; j++) {
      const v = values[j];
      const volume = Number(bars?.[j]?.volume) || 0;
      if (v == null || !Number.isFinite(v) || volume <= 0) {
        pv = NaN;
        break;
      }
      pv += v * volume;
      vol += volume;
    }
    out.push(Number.isFinite(pv) && vol > 0 ? pv / vol : null);
  }
  return out;
}

/** @param {Array<number | null>} values @param {number} length */
export function stdDev(values, length) {
  const out = /** @type {Array<number | null>} */ ([]);
  for (let i = 0; i < values.length; i++) {
    if (i + 1 < length) {
      out.push(null);
      continue;
    }
    const slice = values.slice(i - length + 1, i + 1);
    if (slice.some((v) => v == null || !Number.isFinite(v))) {
      out.push(null);
      continue;
    }
    const mean = slice.reduce((a, b) => a + (b ?? 0), 0) / length;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / length;
    out.push(Math.sqrt(variance));
  }
  return out;
}

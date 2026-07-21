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
  const out = /** @type {Array<number | null>} */ (new Array(values.length).fill(null));
  let sum = 0;
  let invalid = 0;
  for (let i = 0; i < values.length; i++) {
    const added = values[i];
    if (added == null || !Number.isFinite(added)) invalid += 1;
    else sum += added;
    if (i >= length) {
      const removed = values[i - length];
      if (removed == null || !Number.isFinite(removed)) invalid -= 1;
      else sum -= removed;
    }
    if (i + 1 >= length && invalid === 0) out[i] = sum / length;
  }
  return out;
}

/** @param {Array<number | null>} values @param {number} length */
function emaFromValues(values, length) {
  const out = /** @type {Array<number | null>} */ ([]);
  const k = 2 / (length + 1);
  let ema = null;
  let warmCount = 0;
  let warmSum = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null || !Number.isFinite(v)) {
      out.push(null);
      continue;
    }
    if (ema == null) {
      warmCount += 1;
      warmSum += v;
      if (warmCount < length) {
        out.push(null);
        continue;
      }
      ema = warmSum / length;
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
  let warmCount = 0;
  let warmSum = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null || !Number.isFinite(v)) {
      out.push(null);
      continue;
    }
    if (prev == null) {
      warmCount += 1;
      warmSum += v;
      if (warmCount < length) {
        out.push(null);
        continue;
      }
      prev = warmSum / length;
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
  const out = /** @type {Array<number | null>} */ (new Array(values.length).fill(null));
  let priceVolume = 0;
  let volumeSum = 0;
  let invalid = 0;
  for (let i = 0; i < values.length; i++) {
    const addedValue = values[i];
    const addedVolume = Number(bars?.[i]?.volume) || 0;
    if (addedValue == null || !Number.isFinite(addedValue) || addedVolume <= 0) invalid += 1;
    else {
      priceVolume += addedValue * addedVolume;
      volumeSum += addedVolume;
    }
    if (i >= length) {
      const removedValue = values[i - length];
      const removedVolume = Number(bars?.[i - length]?.volume) || 0;
      if (removedValue == null || !Number.isFinite(removedValue) || removedVolume <= 0) invalid -= 1;
      else {
        priceVolume -= removedValue * removedVolume;
        volumeSum -= removedVolume;
      }
    }
    if (i + 1 >= length && invalid === 0 && volumeSum > 0) out[i] = priceVolume / volumeSum;
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

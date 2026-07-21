/**
 * O(n) rolling mean and population standard deviation.
 *
 * Keeping running moments avoids the repeated window slices used by many
 * indicators. The occasional tiny negative variance is a floating-point
 * artifact and is clamped to zero before sqrt.
 *
 * @param {Array<number | null>} values
 * @param {number} length
 */
export function rollingMeanStdDev(values, length) {
  const len = Math.max(1, Math.floor(Number(length) || 1));
  const mean = new Array(values.length).fill(null);
  const stdDev = new Array(values.length).fill(null);
  let sum = 0;
  let sumSq = 0;
  let invalid = 0;

  for (let i = 0; i < values.length; i += 1) {
    const incoming = values[i];
    if (incoming == null || !Number.isFinite(incoming)) invalid += 1;
    else {
      sum += incoming;
      sumSq += incoming * incoming;
    }

    if (i >= len) {
      const outgoing = values[i - len];
      if (outgoing == null || !Number.isFinite(outgoing)) invalid -= 1;
      else {
        sum -= outgoing;
        sumSq -= outgoing * outgoing;
      }
    }

    if (i + 1 < len || invalid > 0) continue;
    const avg = sum / len;
    const variance = Math.max(0, sumSq / len - avg * avg);
    mean[i] = avg;
    stdDev[i] = Math.sqrt(variance);
  }

  return { mean, stdDev };
}

/** Shift plot values without changing the output array length. */
export function offsetSeries(values, offset) {
  const shift = Math.trunc(Number(offset) || 0);
  if (!shift) return values.slice();
  const out = new Array(values.length).fill(null);
  for (let i = 0; i < values.length; i += 1) {
    const target = i + shift;
    if (target >= 0 && target < out.length) out[target] = values[i];
  }
  return out;
}

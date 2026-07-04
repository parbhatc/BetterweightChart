/** Binary search: first bar index with time >= t. */
export function firstBarIndexAtOrAfter(bars, t) {
  let lo = 0;
  let hi = bars.length - 1;
  let out = bars.length;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].time >= t) {
      out = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return out;
}

/** Binary search: last bar index with time <= anchor. */
export function lastBarIndexAtOrBefore(bars, anchorUnix) {
  let endIdx = -1;
  let lo = 0;
  let hi = bars.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].time <= anchorUnix) {
      endIdx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return endIdx;
}

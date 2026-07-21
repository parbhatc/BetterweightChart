/** @typedef {{ priceBottom: number, priceTop: number, upVolume: number, downVolume: number, totalVolume: number, inValueArea: boolean }} VolumeProfileRow */

function finitePrice(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Pick a tick-aligned row height whose resulting row count is closest to the
 * requested TradingView-style "Number of Rows" value.
 */
function rowHeightForCount(span, requestedRows, tickSize) {
  const rawTicks = span / Math.max(tickSize, Number.EPSILON) / requestedRows;
  const floorTicks = Math.max(1, Math.floor(rawTicks));
  const ceilTicks = Math.max(1, Math.ceil(rawTicks));
  const floorRows = Math.ceil(span / (floorTicks * tickSize));
  const ceilRows = Math.ceil(span / (ceilTicks * tickSize));
  const ticks = Math.abs(floorRows - requestedRows) <= Math.abs(ceilRows - requestedRows)
    ? floorTicks
    : ceilTicks;
  return ticks * tickSize;
}

/**
 * Build an Up/Down volume profile from OHLCV bars.
 *
 * TradingView uses lower-timeframe bars when available. The chart runtime does
 * not always have those bars, so each chart bar's volume is distributed by its
 * overlap with the price rows. This preserves total volume and is substantially
 * more accurate than assigning an entire candle to its close price.
 *
 * @param {object[]} bars
 * @param {{ rows?: number, rowsLayout?: "number_of_rows"|"ticks_per_row", tickSize?: number, valueAreaPercent?: number }} [options]
 */
export function computeVolumeProfile(bars, options = {}) {
  const source = Array.isArray(bars) ? bars : [];
  const requestedRows = Math.max(1, Math.min(500, Math.floor(Number(options.rows) || 24)));
  const tickSize = Math.max(Number.EPSILON, Number(options.tickSize) || 0.01);
  const valueAreaPercent = Math.max(0, Math.min(100, Number(options.valueAreaPercent) || 70));

  if (!source.length) {
    return { rows: [], pocIndex: -1, valueAreaLowIndex: -1, valueAreaHighIndex: -1, totalVolume: 0 };
  }

  let low = Infinity;
  let high = -Infinity;
  for (const bar of source) {
    low = Math.min(low, finitePrice(bar.low, finitePrice(bar.close)));
    high = Math.max(high, finitePrice(bar.high, finitePrice(bar.close)));
  }
  if (!Number.isFinite(low) || !Number.isFinite(high)) {
    return { rows: [], pocIndex: -1, valueAreaLowIndex: -1, valueAreaHighIndex: -1, totalVolume: 0 };
  }

  const span = Math.max(tickSize, high - low);
  const rowHeight = options.rowsLayout === "ticks_per_row"
    ? Math.max(tickSize, requestedRows * tickSize)
    : rowHeightForCount(span, requestedRows, tickSize);
  const rowCount = Math.max(1, Math.min(2000, Math.ceil(span / rowHeight)));
  /** @type {VolumeProfileRow[]} */
  const rows = Array.from({ length: rowCount }, (_, i) => ({
    priceBottom: low + i * rowHeight,
    priceTop: i === rowCount - 1 ? Math.max(high, low + (i + 1) * rowHeight) : low + (i + 1) * rowHeight,
    upVolume: 0,
    downVolume: 0,
    totalVolume: 0,
    inValueArea: false,
  }));

  let totalVolume = 0;
  for (let barIndex = 0; barIndex < source.length; barIndex += 1) {
    const bar = source[barIndex];
    const volume = Math.max(0, finitePrice(bar.volume));
    if (!volume) continue;
    const barLow = Math.min(finitePrice(bar.low, bar.close), finitePrice(bar.high, bar.close));
    const barHigh = Math.max(finitePrice(bar.low, bar.close), finitePrice(bar.high, bar.close));
    const up = Number(bar.close) > Number(bar.open) ||
      (Number(bar.close) === Number(bar.open) && (barIndex === 0 || Number(bar.close) >= Number(source[barIndex - 1]?.close)));

    const first = Math.max(0, Math.min(rowCount - 1, Math.floor((barLow - low) / rowHeight)));
    const last = Math.max(first, Math.min(rowCount - 1, Math.floor((barHigh - low) / rowHeight)));
    const candleSpan = barHigh - barLow;

    if (candleSpan <= Number.EPSILON) {
      const row = rows[first];
      if (up) row.upVolume += volume;
      else row.downVolume += volume;
      row.totalVolume += volume;
    } else {
      for (let i = first; i <= last; i += 1) {
        const row = rows[i];
        const overlap = Math.max(0, Math.min(barHigh, row.priceTop) - Math.max(barLow, row.priceBottom));
        if (!overlap) continue;
        const allocated = volume * (overlap / candleSpan);
        if (up) row.upVolume += allocated;
        else row.downVolume += allocated;
        row.totalVolume += allocated;
      }
    }
    totalVolume += volume;
  }

  let pocIndex = 0;
  for (let i = 1; i < rows.length; i += 1) {
    if (rows[i].totalVolume > rows[pocIndex].totalVolume) pocIndex = i;
  }

  let valueAreaLowIndex = pocIndex;
  let valueAreaHighIndex = pocIndex;
  rows[pocIndex].inValueArea = true;
  let included = rows[pocIndex].totalVolume;
  const target = totalVolume * valueAreaPercent / 100;

  // Grow from POC, preferring the larger adjacent row; equal distances choose
  // the row above, matching TradingView's documented tie-break rule.
  while (included < target && (valueAreaLowIndex > 0 || valueAreaHighIndex < rows.length - 1)) {
    const below = valueAreaLowIndex > 0 ? rows[valueAreaLowIndex - 1].totalVolume : -1;
    const above = valueAreaHighIndex < rows.length - 1 ? rows[valueAreaHighIndex + 1].totalVolume : -1;
    if (above >= below) {
      valueAreaHighIndex += 1;
      rows[valueAreaHighIndex].inValueArea = true;
      included += rows[valueAreaHighIndex].totalVolume;
    } else {
      valueAreaLowIndex -= 1;
      rows[valueAreaLowIndex].inValueArea = true;
      included += rows[valueAreaLowIndex].totalVolume;
    }
  }

  return { rows, pocIndex, valueAreaLowIndex, valueAreaHighIndex, totalVolume, low, high, rowHeight };
}

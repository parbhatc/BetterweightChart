/** @typedef {typeof SMOOTHING_TYPE[keyof typeof SMOOTHING_TYPE]} SmoothingType */

export const SMOOTHING_TYPE = /** @type {const} */ ({
  NONE: "none",
  SMA: "sma",
  SMA_BOLLINGER_BAND: "sma_bb",
  EMA: "ema",
  SMMA: "smma",
  WMA: "wma",
  VWMA: "vwma",
});

export const SMOOTHING_TYPES = /** @type {const} */ ([
  { id: SMOOTHING_TYPE.NONE, label: "None" },
  { id: SMOOTHING_TYPE.SMA, label: "SMA" },
  { id: SMOOTHING_TYPE.SMA_BOLLINGER_BAND, label: "SMA + Bollinger Bands" },
  { id: SMOOTHING_TYPE.EMA, label: "EMA" },
  { id: SMOOTHING_TYPE.SMMA, label: "SMMA (RMA)" },
  { id: SMOOTHING_TYPE.WMA, label: "WMA" },
  { id: SMOOTHING_TYPE.VWMA, label: "VWMA" },
]);

/** Rolling buffers + smoothing for the EMA indicator. */
export class EmaRings {
  /**
   * @param {object} opts
   * @param {number} opts.length
   * @param {number} opts.offset
   * @param {string} opts.smoothingType
   * @param {string} opts.smoothType
   * @param {number} opts.smoothingLength
   * @param {number} opts.bbStdDev
   */
  constructor(opts) {
    this.length = opts.length;
    this.k = 2 / (opts.length + 1);
    this.offset = opts.offset;
    this.smoothingType = opts.smoothingType;
    this.smoothType = opts.smoothType;
    this.smoothingLength = opts.smoothingLength;
    this.bbStdDev = opts.bbStdDev;

    this.ema = null;
    this.warm = 0;
    this.warmSum = 0;
    this.rawEma = [];
    this.shiftedRing = [];
    this.smoothEma = null;
    this.smma = null;
    this.smoothWarm = 0;
    this.smoothWarmSum = 0;
    this.vwmaPvRing = [];
    this.vwmaVolRing = [];
  }

  /** @param {number | null} v @param {number} index */
  pushEma(v, index) {
    let ema = null;
    if (v != null && Number.isFinite(v)) {
      if (this.ema == null) {
        this.warmSum += v;
        this.warm += 1;
        if (this.warm >= this.length) {
          this.ema = this.warmSum / this.length;
        }
      } else {
        this.ema = v * this.k + this.ema * (1 - this.k);
      }
      ema = this.ema;
    }
    this.rawEma.push(ema);
    return this.shiftedAt(this.rawEma, index, this.offset);
  }

  /** @param {number | null} shifted @param {object} bar */
  smooth(shifted, bar) {
    const slen = this.smoothingLength;
    this.pushRing(this.shiftedRing, slen, shifted);

    if (this.smoothType === "sma") {
      return this.sma(this.shiftedRing, slen);
    }

    if (this.smoothType === "ema") {
      if (shifted == null || !Number.isFinite(shifted)) return null;
      if (this.smoothEma == null) {
        this.smoothWarmSum += shifted;
        this.smoothWarm += 1;
        if (this.smoothWarm >= slen) this.smoothEma = this.smoothWarmSum / slen;
      } else {
        const sk = 2 / (slen + 1);
        this.smoothEma = shifted * sk + this.smoothEma * (1 - sk);
      }
      return this.smoothEma;
    }

    if (this.smoothType === "smma") {
      if (shifted == null || !Number.isFinite(shifted)) return null;
      if (this.smma == null) {
        this.smoothWarmSum += shifted;
        this.smoothWarm += 1;
        if (this.smoothWarm >= slen) this.smma = this.smoothWarmSum / slen;
      } else {
        this.smma = (this.smma * (slen - 1) + shifted) / slen;
      }
      return this.smma;
    }

    if (this.smoothType === "wma") {
      return this.wma(this.shiftedRing, slen);
    }

    if (this.smoothType === "vwma") {
      const vol = Number(bar.volume) || 0;
      this.pushRing(this.vwmaPvRing, slen, shifted != null && vol > 0 ? shifted * vol : null);
      this.pushRing(this.vwmaVolRing, slen, vol > 0 ? vol : null);
      if (this.vwmaPvRing.length < slen) return null;
      let pv = 0;
      let vsum = 0;
      const pvSlice = this.vwmaPvRing.slice(-slen);
      const volSlice = this.vwmaVolRing.slice(-slen);
      for (let j = 0; j < slen; j++) {
        const p = pvSlice[j];
        const vv = volSlice[j];
        if (p == null || vv == null || vv <= 0) return null;
        pv += p;
        vsum += vv;
      }
      return vsum > 0 ? pv / vsum : null;
    }

    return null;
  }

  /** @param {number[]} ring @param {number} len */
  stdDev(ring = this.shiftedRing, len = this.smoothingLength) {
    if (ring.length < len) return null;
    const slice = ring.slice(-len);
    if (slice.some((v) => v == null || !Number.isFinite(v))) return null;
    const mean = slice.reduce((a, b) => a + b, 0) / len;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / len;
    return Math.sqrt(variance);
  }

  /** @param {Array<number | null>} buf @param {number} i @param {number} offset */
  shiftedAt(buf, i, offset) {
    if (!offset) return buf[i] ?? null;
    if (offset > 0) {
      const src = i - offset;
      return src >= 0 ? (buf[src] ?? null) : null;
    }
    const src = i + Math.abs(offset);
    return src < buf.length ? (buf[src] ?? null) : null;
  }

  /** @param {number[]} ring @param {number} len @param {number | null} val */
  pushRing(ring, len, val) {
    ring.push(val);
    while (ring.length > len) ring.shift();
  }

  /** @param {number[]} ring @param {number} len */
  sma(ring, len) {
    if (ring.length < len) return null;
    const slice = ring.slice(-len);
    if (slice.some((v) => v == null || !Number.isFinite(v))) return null;
    return slice.reduce((a, b) => a + b, 0) / len;
  }

  /** @param {number[]} ring @param {number} len */
  wma(ring, len) {
    if (ring.length < len) return null;
    const slice = ring.slice(-len);
    if (slice.some((v) => v == null || !Number.isFinite(v))) return null;
    const denom = (len * (len + 1)) / 2;
    let sum = 0;
    for (let w = 1; w <= len; w++) sum += slice[w - 1] * w;
    return sum / denom;
  }
}

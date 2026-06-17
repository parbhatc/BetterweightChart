/** @typedef {{ time: number, open: number, high: number, low: number, close: number }} Bar */

import { CHART_RESOLUTIONS, resolutionSec } from "./resolutions.mjs";

const SYMBOL_PROFILES = {
  NQ: { name: "Nasdaq 100", exchange: "CME", type: "futures", base: 21050, tick: 0.25, volatility: 0.0014, drift: 0.00002 },
  ES: { name: "S&P 500", exchange: "CME", type: "futures", base: 5525, tick: 0.25, volatility: 0.001, drift: 0.000015 },
  YM: { name: "Dow Jones", exchange: "CBOT", type: "futures", base: 39500, tick: 1, volatility: 0.0008, drift: 0.00001 },
  RTY: { name: "Russell 2000", exchange: "CME", type: "futures", base: 2100, tick: 0.1, volatility: 0.0012, drift: 0.00001 },
  CL: { name: "Crude Oil", exchange: "NYMEX", type: "futures", base: 72.5, tick: 0.01, volatility: 0.0018, drift: 0 },
  GC: { name: "Gold", exchange: "COMEX", type: "futures", base: 2350, tick: 0.1, volatility: 0.0009, drift: 0.00001 },
  BTC: { name: "Bitcoin", exchange: "CRYPTO", type: "crypto", base: 68500, tick: 1, volatility: 0.0025, drift: 0.00003 },
  ETH: { name: "Ethereum", exchange: "CRYPTO", type: "crypto", base: 3450, tick: 0.01, volatility: 0.0028, drift: 0.00002 },
  SOL: { name: "Solana", exchange: "CRYPTO", type: "crypto", base: 168, tick: 0.01, volatility: 0.0032, drift: 0.00001 },
  AAPL: { name: "Apple Inc.", exchange: "NASDAQ", type: "stock", base: 228, tick: 0.01, volatility: 0.0012, drift: 0.00001 },
  TSLA: { name: "Tesla Inc.", exchange: "NASDAQ", type: "stock", base: 245, tick: 0.01, volatility: 0.0022, drift: 0 },
  NVDA: { name: "NVIDIA Corp.", exchange: "NASDAQ", type: "stock", base: 132, tick: 0.01, volatility: 0.0018, drift: 0.00002 },
  MSFT: { name: "Microsoft", exchange: "NASDAQ", type: "stock", base: 420, tick: 0.01, volatility: 0.001, drift: 0.00001 },
  AMZN: { name: "Amazon.com", exchange: "NASDAQ", type: "stock", base: 198, tick: 0.01, volatility: 0.0014, drift: 0.00001 },
  META: { name: "Meta Platforms", exchange: "NASDAQ", type: "stock", base: 585, tick: 0.01, volatility: 0.0015, drift: 0.00001 },
  EURUSD: { name: "Euro / US Dollar", exchange: "FOREX", type: "forex", base: 1.085, tick: 0.00001, volatility: 0.0004, drift: 0 },
  GBPUSD: { name: "British Pound / USD", exchange: "FOREX", type: "forex", base: 1.265, tick: 0.00001, volatility: 0.0005, drift: 0 },
  USDJPY: { name: "US Dollar / Yen", exchange: "FOREX", type: "forex", base: 157.2, tick: 0.001, volatility: 0.0004, drift: 0 },
  SPY: { name: "SPDR S&P 500 ETF", exchange: "ARCA", type: "etf", base: 552, tick: 0.01, volatility: 0.0009, drift: 0.00001 },
  QQQ: { name: "Invesco QQQ Trust", exchange: "NASDAQ", type: "etf", base: 478, tick: 0.01, volatility: 0.0011, drift: 0.00001 },
};

/** Seeded PRNG (mulberry32). */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function roundTick(n, tick) {
  return Math.round(n / tick) * tick;
}

export const RESOLUTIONS = CHART_RESOLUTIONS;

/**
 * @param {string} symbol
 * @param {{ countback?: number, seed?: number, to?: number, resolution?: string }} [opts]
 * @returns {{ symbol: string, bars: Bar[], seed: number, countback: number, to: number, from: number, resolution: string }}
 */
export function generateFakeBars(symbol, opts = {}) {
  const sym = String(symbol || "NQ").toUpperCase();
  const profile = SYMBOL_PROFILES[sym] ?? SYMBOL_PROFILES.NQ;
  const resolution = String(opts.resolution || "1");
  const barSec = resolutionSec(resolution);
  const countback = Math.min(Math.max(Number(opts.countback) || 500, 10), 5000);
  const seed = Number(opts.seed) || 42;
  const rand = rng(seed ^ sym.length * 997 ^ barSec);

  const to = Number(opts.to) || Math.floor(Date.now() / 1000 / barSec) * barSec;
  const from = to - (countback - 1) * barSec;

  /** @type {Bar[]} */
  const bars = [];
  let price = profile.base;
  const volScale = Math.sqrt(barSec / 60);

  for (let i = 0; i < countback; i++) {
    const time = from + i * barSec;
    const shock = (rand() - 0.5) * 2 * profile.volatility * volScale;
    const trend = profile.drift * (i - countback / 2);
    const open = price;
    const close = roundTick(open * (1 + shock + trend), profile.tick);
    const wick = Math.abs(close - open) + profile.tick * (1 + rand() * 6 * volScale);
    const high = roundTick(Math.max(open, close) + wick * rand(), profile.tick);
    const low = roundTick(Math.min(open, close) - wick * rand(), profile.tick);
    const volume = Math.floor((800 + rand() * 48000) * volScale);
    bars.push({ time, open, high, low, close, volume });
    price = close;
  }

  return { symbol: sym, bars, seed, countback, to, from, resolution };
}

export function listSymbols() {
  return Object.entries(SYMBOL_PROFILES).map(([symbol, p]) => ({
    symbol,
    name: p.name,
    exchange: p.exchange,
    type: p.type,
    tick: p.tick,
    base: p.base,
  }));
}

/**
 * @param {string} query
 * @param {number} [limit]
 */
export function searchSymbols(query, limit = 25) {
  const q = String(query || "")
    .trim()
    .toLowerCase();
  const all = listSymbols();
  if (!q) return all.slice(0, limit);
  return all
    .filter(
      (s) =>
        s.symbol.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.exchange.toLowerCase().includes(q) ||
        s.type.toLowerCase().includes(q),
    )
    .slice(0, limit);
}

export function chartConfig() {
  return {
    version: "1",
    defaultSymbol: "NQ",
    defaultTheme: "dark",
    defaultResolution: "1",
    resolutions: RESOLUTIONS,
    themes: {
      dark: {
        bg: "#131722",
        text: "#d1d4dc",
        grid: "#1e222d",
        border: "#2a2e39",
        crosshair: "#758696",
        labelBg: "#363a45",
        up: "#089981",
        down: "#f23645",
      },
      light: {
        bg: "#ffffff",
        text: "#131722",
        grid: "#f0f3fa",
        border: "#e0e3eb",
        crosshair: "#9598a1",
        labelBg: "#131722",
        up: "#089981",
        down: "#f23645",
      },
    },
    symbols: Object.fromEntries(
      Object.entries(SYMBOL_PROFILES).map(([sym, p]) => [
        sym,
        { name: p.name, exchange: p.exchange, type: p.type, tick: p.tick, base: p.base },
      ]),
    ),
  };
}

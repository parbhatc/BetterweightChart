/** Map UI symbol → Tradesea production MDS/UDF ticker (e.g. NQ → CME:NQ). */
export function toTradeseaProdTicker(symbol) {
  const trimmed = String(symbol || "").trim();
  if (!trimmed) return "CME:NQ";
  if (trimmed.includes(":")) {
    const match = trimmed.match(/^([A-Za-z]+)-([Dd][Ee][Ll][Aa][Yy][Ee][Dd]):(.+)$/);
    if (match) return `${match[1].toUpperCase()}:${match[3].trim().toUpperCase()}`;
    return trimmed;
  }

  const upper = trimmed.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (/^MNQ/.test(upper)) return "CME:MNQ";
  if (/^MES/.test(upper)) return "CME:MES";
  if (/^M2K/.test(upper)) return "CME:M2K";
  if (/^MYM/.test(upper)) return "CBOT:MYM";
  if (/^YM/.test(upper)) return "CBOT:YM";
  if (/^GC/.test(upper) || /^MGC/.test(upper)) return `COMEX:${upper}`;
  if (/^SI/.test(upper) || /^SIL/.test(upper)) return `COMEX:${upper}`;
  if (/^CL/.test(upper) || /^MCL/.test(upper)) return `NYMEX:${upper}`;
  if (/^ES/.test(upper)) return "CME:ES";
  if (/^NQ/.test(upper)) return "CME:NQ";
  if (/^RTY/.test(upper)) return "CME:RTY";
  return `CME:${upper}`;
}

/** Map UI symbol → Tradesea delayed MDS/UDF ticker (e.g. NQ → CME-Delayed:NQ). */
export function toTradeseaDelayedTicker(symbol) {
  const trimmed = String(symbol || "").trim();
  if (!trimmed) return "CME-Delayed:NQ";
  if (trimmed.includes(":")) {
    const delayedMatch = trimmed.match(/^([A-Za-z]+)-([Dd][Ee][Ll][Aa][Yy][Ee][Dd]):(.+)$/);
    if (delayedMatch) {
      return `${delayedMatch[1].toUpperCase()}-Delayed:${delayedMatch[3].trim().toUpperCase()}`;
    }
    const prodMatch = trimmed.match(/^([A-Za-z]+):(.+)$/);
    if (prodMatch) {
      return `${prodMatch[1].toUpperCase()}-Delayed:${prodMatch[2].trim().toUpperCase()}`;
    }
    return trimmed;
  }

  const upper = trimmed.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (/^MNQ/.test(upper)) return "CME-Delayed:MNQ";
  if (/^MES/.test(upper)) return "CME-Delayed:MES";
  if (/^M2K/.test(upper)) return "CME-Delayed:M2K";
  if (/^MYM/.test(upper)) return "CBOT-Delayed:MYM";
  if (/^YM/.test(upper)) return "CBOT-Delayed:YM";
  if (/^GC/.test(upper) || /^MGC/.test(upper)) return `COMEX-Delayed:${upper}`;
  if (/^SI/.test(upper) || /^SIL/.test(upper)) return `COMEX-Delayed:${upper}`;
  if (/^CL/.test(upper) || /^MCL/.test(upper)) return `NYMEX-Delayed:${upper}`;
  if (/^ES/.test(upper)) return "CME-Delayed:ES";
  if (/^NQ/.test(upper)) return "CME-Delayed:NQ";
  if (/^RTY/.test(upper)) return "CME-Delayed:RTY";
  return `CME-Delayed:${upper}`;
}

/** MDS/UDF stream symbol — delayed sandbox uses CME-Delayed:MNQ, live uses CME:MNQ. */
export function normalizeTradeseaStreamSymbol(symbol, delayed = true) {
  const trimmed = String(symbol || "").trim();
  if (!trimmed) return delayed ? "CME-Delayed:NQ" : "CME:NQ";

  if (trimmed.includes(":")) {
    if (delayed) return toTradeseaDelayedTicker(trimmed);
    const delayedMatch = trimmed.match(/^([A-Za-z]+)-Delayed:(.+)$/i);
    if (delayedMatch) {
      return `${delayedMatch[1].toUpperCase()}:${delayedMatch[2].trim().toUpperCase()}`;
    }
    return toTradeseaProdTicker(trimmed);
  }

  return delayed ? toTradeseaDelayedTicker(trimmed) : toTradeseaProdTicker(trimmed);
}

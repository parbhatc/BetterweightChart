const TV_SEARCH =
  "https://symbol-search.tradingview.com/symbol_search/v3/";
const TV_LOGO = "https://s3-symbol-logo.tradingview.com";

const SEARCH_DEFAULTS = {
  hl: "1",
  exchange: "",
  lang: "en",
  search_type: "undefined",
  domain: "production",
  enable_grouping: "true",
  sort_by_country: "US",
  promo: "true",
};

/** @param {string} value */
export function stripTvHighlight(value) {
  return String(value ?? "")
    .replace(/<\/?em>/gi, "")
    .trim();
}

/** @param {string | undefined} logoid */
export function tvLogoUrl(logoid) {
  if (!logoid) return null;
  return `${TV_LOGO}/${logoid}--big.svg`;
}

/**
 * @param {object} item
 * @param {object} [contract]
 */
function tvSymbolId(item, contract) {
  const row = contract ?? item;
  const sym = stripTvHighlight(row.symbol ?? item.symbol);
  const prefix = row.prefix ?? item.source_id ?? item.exchange;
  return `${prefix}:${sym}`;
}

/**
 * @param {object} item
 * @param {object} [contract]
 */
function mapSearchRow(item, contract) {
  const sym = stripTvHighlight((contract ?? item).symbol ?? item.symbol);
  const tvId = tvSymbolId(item, contract);
  const logoid = item.logoid ?? item.logo?.logoid ?? contract?.logoid;
  const description =
    contract?.description ??
    stripTvHighlight(item.description ?? sym);
  return {
    symbol: tvId,
    name: description,
    description,
    exchange: item.exchange ?? item.source2?.name ?? "",
    type: item.type ?? "stock",
    ticker: sym,
    full_name: tvId,
    logoid,
    logoUrl: tvLogoUrl(logoid),
    country: item.country,
    currency: item.currency_code,
    sourceId: item.source_id,
    tvRaw: item,
  };
}

/**
 * Flatten TV search hits (futures contracts + grouped symbols).
 * @param {object[]} symbols
 * @param {number} limit
 */
export function flattenTvSearchResults(symbols, limit = 50) {
  /** @type {ReturnType<typeof mapSearchRow>[]} */
  const out = [];

  for (const item of symbols ?? []) {
    if (out.length >= limit) break;

    if (Array.isArray(item.contracts) && item.contracts.length) {
      const continuous =
        item.contracts.find((c) => c.typespecs?.includes("continuous")) ??
        item.contracts[0];
      out.push(mapSearchRow(item, continuous));
      continue;
    }

    out.push(mapSearchRow(item));
  }

  return out.slice(0, limit);
}

/**
 * @param {string} userInput
 * @param {number} [limit]
 * @param {string} [proxyBase] e.g. "/datafeed/tv"
 */
export async function searchTvSymbols(userInput, limit = 50, proxyBase) {
  const q = new URLSearchParams({
    ...SEARCH_DEFAULTS,
    text: userInput || "",
  });

  const directUrl = `${TV_SEARCH}?${q}`;
  const url = proxyBase ? `${proxyBase.replace(/\/$/, "")}/search?${q}` : directUrl;

  const res = await fetch(url, proxyBase ? undefined : {
    headers: { Accept: "*/*" },
    credentials: "omit",
  });

  if (!res.ok) {
    throw new Error(`Symbol search failed (${res.status})`);
  }

  const data = await res.json();
  return flattenTvSearchResults(data.symbols, limit);
}

/** @param {string} tvSymbol e.g. CME_MINI:NQ1! */
export function parseTvSymbolId(tvSymbol) {
  const raw = String(tvSymbol || "").trim();
  const idx = raw.indexOf(":");
  if (idx < 0) return { exchange: "", ticker: raw, full: raw };
  return {
    exchange: raw.slice(0, idx),
    ticker: raw.slice(idx + 1),
    full: raw,
  };
}

const SEARCH_BASE = "https://symbol-search.tradingview.com/symbol_search/v3/";
const LOGO_BASE = "https://s3-symbol-logo.tradingview.com";

const TV_HEADERS = {
  Accept: "*/*",
  Origin: "https://www.tradingview.com",
  Referer: "https://www.tradingview.com/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
};

/** @param {string} text */
function stripHighlight(text) {
  return String(text ?? "").replace(/<\/?em>/gi, "");
}

/** @param {string | undefined} logoid */
export function logoUrlFor(logoid) {
  if (!logoid) return null;
  return `${LOGO_BASE}/${logoid}--big.svg`;
}

/**
 * @param {object} row
 * @param {object} [contract]
 */
function mapSearchRow(row, contract) {
  const sourceId = contract?.prefix ?? row.source_id ?? row.exchange ?? "";
  const sym = stripHighlight(contract?.symbol ?? row.symbol);
  const tvSymbol = sourceId && sym ? `${sourceId}:${sym}` : sym;
  const logoid = row.logoid ?? row.logo?.logoid;
  return {
    symbol: tvSymbol,
    name: stripHighlight(row.description ?? sym),
    exchange: row.exchange ?? sourceId,
    type: row.type ?? "stock",
    ticker: sym,
    full_name: tvSymbol,
    logoid,
    logoUrl: logoUrlFor(logoid),
    source_id: sourceId,
    country: row.country,
    currency_code: row.currency_code,
    contractDescription: contract?.description ? stripHighlight(contract.description) : undefined,
    is_continuous: contract?.typespecs?.includes("continuous") ?? false,
  };
}

/**
 * @param {string} query
 * @param {number} [limit]
 */
export async function searchTradingViewSymbols(query, limit = 50) {
  const q = new URLSearchParams({
    text: query || "",
    hl: "1",
    exchange: "",
    lang: "en",
    search_type: "undefined",
    domain: "production",
    enable_grouping: "true",
    sort_by_country: "US",
    promo: "true",
  });

  const res = await fetch(`${SEARCH_BASE}?${q}`, { headers: TV_HEADERS });
  if (!res.ok) throw new Error(`TradingView search failed: HTTP ${res.status}`);
  const data = await res.json();
  const rows = Array.isArray(data.symbols) ? data.symbols : [];

  /** @type {object[]} */
  const results = [];
  for (const row of rows) {
    const contracts = Array.isArray(row.contracts) ? row.contracts : [];
    if (contracts.length) {
      const continuous = contracts.find((c) => c.typespecs?.includes("continuous"));
      const primary = continuous ?? contracts[0];
      results.push(mapSearchRow(row, primary));
      for (const c of contracts) {
        if (c === primary) continue;
        results.push(mapSearchRow(row, c));
      }
    } else {
      results.push(mapSearchRow(row));
      for (const grouped of row.grouped_symbols ?? []) {
        results.push(mapSearchRow(grouped));
      }
    }
    if (results.length >= limit) break;
  }

  const seen = new Set();
  return results.filter((r) => {
    if (!r.symbol || seen.has(r.symbol)) return false;
    seen.add(r.symbol);
    return true;
  }).slice(0, limit);
}

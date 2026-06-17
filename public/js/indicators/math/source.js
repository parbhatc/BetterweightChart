/** @typedef {"open"|"high"|"low"|"close"|"hl2"|"hlc3"|"ohlc4"|"hlcc4"} PriceSource */

export const PRICE_SOURCES = /** @type {const} */ ([
  { id: "open", label: "Open" },
  { id: "high", label: "High" },
  { id: "low", label: "Low" },
  { id: "close", label: "Close" },
  { id: "hl2", label: "(H + L)/2" },
  { id: "hlc3", label: "(H + L + C)/3" },
  { id: "ohlc4", label: "(O + H + L + C)/4" },
  { id: "hlcc4", label: "(H + L + C + C)/4" },
]);

/** @param {object} bar @param {PriceSource} source */
export function barSourceValue(bar, source) {
  if (!bar) return null;
  const o = Number(bar.open);
  const h = Number(bar.high);
  const l = Number(bar.low);
  const c = Number(bar.close);
  switch (source) {
    case "open":
      return o;
    case "high":
      return h;
    case "low":
      return l;
    case "close":
      return c;
    case "hl2":
      return (h + l) / 2;
    case "hlc3":
      return (h + l + c) / 3;
    case "ohlc4":
      return (o + h + l + c) / 4;
    case "hlcc4":
      return (h + l + c + c) / 4;
    default:
      return c;
  }
}

/** @param {PriceSource} source */
export function sourceLabel(source) {
  const entry = PRICE_SOURCES.find((s) => s.id === source);
  if (!entry) return "Close";
  if (source === "close") return "close";
  if (source === "open" || source === "high" || source === "low") return entry.label.toLowerCase();
  return entry.label;
}

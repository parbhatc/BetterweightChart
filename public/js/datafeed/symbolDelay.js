/**
 * Delay metadata from symbol resolve — never infer minutes from symbol type here.
 * @param {import("./types.js").SymbolInfo | object | null | undefined} symbolInfo
 */
export function symbolDelayFromInfo(symbolInfo) {
  if (!symbolInfo || symbolInfo.data_status === "streaming") {
    return { delayed: false, delayMinutes: 0 };
  }
  const minutes = Number(symbolInfo.delay_minutes);
  if (Number.isFinite(minutes) && minutes > 0) {
    return { delayed: true, delayMinutes: minutes };
  }
  if (symbolInfo.data_status === "delayed") {
    return { delayed: true, delayMinutes: 0 };
  }
  return { delayed: false, delayMinutes: 0 };
}

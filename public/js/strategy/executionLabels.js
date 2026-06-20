/**
 * TradingView-style entry/exit labels for strategy backtest trades.
 * @param {object[]} trades
 */
export function tradeExecutionLabels(trades) {
  if (!trades?.length) return [];

  const LONG_COLOR = "#089981";
  const SHORT_COLOR = "#f23645";
  /** @type {object[]} */
  const labels = [];

  for (const t of trades) {
    const size = t.size ?? 1;
    if (t.side === "long") {
      if (t.entryTime != null && t.entryPrice != null) {
        labels.push({
          time: t.entryTime,
          price: t.entryPrice,
          text: `Long +${size}`,
          bgColor: LONG_COLOR,
          textColor: "#ffffff",
          kind: "low",
        });
      }
      if (t.exitTime != null && t.exitPrice != null) {
        labels.push({
          time: t.exitTime,
          price: t.exitPrice,
          text: `Close −${size}`,
          bgColor: SHORT_COLOR,
          textColor: "#ffffff",
          kind: "high",
        });
      }
    } else {
      if (t.entryTime != null && t.entryPrice != null) {
        labels.push({
          time: t.entryTime,
          price: t.entryPrice,
          text: `Short −${size}`,
          bgColor: SHORT_COLOR,
          textColor: "#ffffff",
          kind: "high",
        });
      }
      if (t.exitTime != null && t.exitPrice != null) {
        labels.push({
          time: t.exitTime,
          price: t.exitPrice,
          text: `Close +${size}`,
          bgColor: LONG_COLOR,
          textColor: "#ffffff",
          kind: "low",
        });
      }
    }
  }

  return labels;
}

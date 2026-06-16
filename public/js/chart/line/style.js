import { LineStyle } from "lightweight-charts";

/** Same dash patterns as lightweight-charts getDashPattern(). */
export function lineStyleDashPattern(style, lineWidth) {
  const w = Math.max(1, Number(lineWidth) || 1);
  switch (style) {
    case LineStyle.Dotted:
      return [w, w];
    case LineStyle.Dashed:
      return [2 * w, 2 * w];
    case LineStyle.LargeDashed:
      return [6 * w, 6 * w];
    case LineStyle.SparseDotted:
      return [w, 4 * w];
    default:
      return [];
  }
}

/** Default style for symbol price lines (lightweight-charts). */
export const SYMBOL_PRICE_LINE_STYLE = LineStyle.Dashed;

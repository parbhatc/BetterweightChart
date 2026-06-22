/** Shell border is a divider outline, not a bordered-pill layout mode. */
export function hasShellBorder(state) {
  const border = state?.bodyBorderColor;
  return Boolean(border && border !== "transparent");
}

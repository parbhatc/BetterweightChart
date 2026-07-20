export function isStrictSmtDivergence(nextChart, lastChart, nextCompare, lastCompare) {
  return (nextChart - lastChart) * (nextCompare - lastCompare) < 0;
}

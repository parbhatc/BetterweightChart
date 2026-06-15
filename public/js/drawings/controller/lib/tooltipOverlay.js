import { VALUES_TOOLTIP_LONG_PRESS_MS, VALUES_TOOLTIP_MOVE_THRESHOLD } from "../../constants.js";
import { barPriceClass, candleValueColor, isBarUp } from "../../../chart/barStyle.js";

/**
 * @param {object} deps
 */
export function createTooltipOverlay(deps) {
  const { getContext, resolvePoint, valuesTooltip, overlayRoot } = deps;

  /** @type {ReturnType<typeof setTimeout> | null} */
  let longPressTimer = null;
  /** @type {{ x: number, y: number } | null} */
  let longPressOrigin = null;

  function nearestBar(time) {
    const { bars } = getContext();
    if (!bars.length || time == null) return { bar: null, prev: null };
    let bestIdx = 0;
    let bestDist = Math.abs(bars[0].time - time);
    for (let i = 1; i < bars.length; i += 1) {
      const dist = Math.abs(bars[i].time - time);
      if (dist < bestDist) {
        bestIdx = i;
        bestDist = dist;
      }
    }
    return {
      bar: bars[bestIdx],
      prev: bestIdx > 0 ? bars[bestIdx - 1] : null,
    };
  }

  function hideValuesTooltip() {
    valuesTooltip.hidden = true;
  }

  function showValuesTooltip(clientX, clientY) {
    const point = resolvePoint(clientX, clientY);
    if (!point) return;
    const { bar, prev } = nearestBar(point.time);
    if (!bar) return;

    const ctx = getContext();
    const precision = ctx.precision ?? 2;
    const fmt = (n) =>
      Number(n).toLocaleString(undefined, {
        minimumFractionDigits: precision,
        maximumFractionDigits: precision,
      });
    const fmtVol = (n) => {
      if (n == null) return "—";
      if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
      if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
      return String(Math.round(n));
    };

    const up = isBarUp(bar, prev ?? undefined, ctx.colorBarsOnPrevClose);
    const priceCls = barPriceClass(up);
    const priceColor = candleValueColor(ctx.symbol, up);
    const priceStyle = ` style="color:${priceColor}"`;

    const row = (lbl, val, colored = false) => {
      const cls = colored ? priceCls : "";
      const style = colored ? priceStyle : "";
      return `<span class="chart-values-tooltip__row"><span>${lbl}</span><span class="chart-values-tooltip__val ${cls}"${style}>${val}</span></span>`;
    };

    const rows = [
      row("Open", fmt(bar.open), true),
      row("High", fmt(bar.high), true),
      row("Low", fmt(bar.low), true),
      row("Close", fmt(bar.close), true),
    ];

    const chg = bar.close - bar.open;
    const chgPct = bar.open ? (chg / bar.open) * 100 : 0;
    const chgSign = chg >= 0 ? "+" : "";
    const chgUp = chg >= 0;
    const chgCls = barPriceClass(chgUp);
    const chgColor = candleValueColor(ctx.symbol, chgUp);
    rows.push(
      `<span class="chart-values-tooltip__row"><span>Change</span><span class="chart-values-tooltip__val ${chgCls}" style="color:${chgColor}">${chgSign}${fmt(chg)} (${chgSign}${chgPct.toFixed(2)}%)</span></span>`,
    );
    rows.push(row("Volume", fmtVol(bar.volume), true));

    valuesTooltip.innerHTML = rows.join("");

    const rect = overlayRoot.getBoundingClientRect();
    const x = clientX - rect.left + 12;
    const y = clientY - rect.top + 12;
    valuesTooltip.style.left = `${x}px`;
    valuesTooltip.style.top = `${y}px`;
    valuesTooltip.hidden = false;
  }

  function clearLongPress() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    longPressOrigin = null;
  }

  function scheduleLongPress(clientX, clientY) {
    clearLongPress();
    longPressOrigin = { x: clientX, y: clientY };
    longPressTimer = setTimeout(() => {
      if (!longPressOrigin) return;
      showValuesTooltip(longPressOrigin.x, longPressOrigin.y);
      clearLongPress();
    }, VALUES_TOOLTIP_LONG_PRESS_MS);
  }

  function cancelLongPressIfMoved(clientX, clientY) {
    if (!longPressOrigin || !longPressTimer) return;
    const moved = Math.hypot(clientX - longPressOrigin.x, clientY - longPressOrigin.y);
    if (moved > VALUES_TOOLTIP_MOVE_THRESHOLD) clearLongPress();
  }

  return {
    hideValuesTooltip,
    showValuesTooltip,
    clearLongPress,
    scheduleLongPress,
    cancelLongPressIfMoved,
  };
}

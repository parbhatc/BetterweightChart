import { VALUES_TOOLTIP_LONG_PRESS_MS, VALUES_TOOLTIP_MOVE_THRESHOLD } from "../../constants.js";
import { barPriceClass, candleValueColor, isBarUp, barChangeFromPrevClose } from "../../../chart/bar/style.js";

/**
 * @param {object} deps
 * @param {import("lightweight-charts").IChartApi} [deps.chart]
 * @param {import("lightweight-charts").ISeriesApi} [deps.series]
 * @param {(bar: object, prev: object | null) => void} [deps.onBarHover]
 * @param {(pinned: boolean) => void} [deps.onPinChange]
 */
export function createTooltipOverlay(deps) {
  const { getContext, resolvePoint, valuesTooltip, overlayRoot, chart, series, onBarHover, onPinChange } = deps;

  /** @type {ReturnType<typeof setTimeout> | null} */
  let longPressTimer = null;
  /** @type {{ x: number, y: number } | null} */
  let longPressOrigin = null;
  let pinned = false;
  let savedHorzCrosshairVisible = true;

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

  function buildTooltipHtml(bar, prev) {
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

    const { change: chg, pct: chgPct } = barChangeFromPrevClose(bar, prev ?? undefined);
    const chgSign = chg >= 0 ? "+" : "";
    const chgUp = chg >= 0;
    const chgCls = barPriceClass(chgUp);
    const chgColor = candleValueColor(ctx.symbol, chgUp);
    rows.push(
      `<span class="chart-values-tooltip__row"><span>Change</span><span class="chart-values-tooltip__val ${chgCls}" style="color:${chgColor}">${chgSign}${fmt(chg)} (${chgSign}${chgPct.toFixed(2)}%)</span></span>`,
    );
    rows.push(row("Volume", fmtVol(bar.volume), true));
    return rows.join("");
  }

  /** @param {number} clientX @param {number} clientY */
  function positionTooltip(clientX, clientY) {
    const rect = overlayRoot.getBoundingClientRect();
    valuesTooltip.style.left = `${clientX - rect.left + 12}px`;
    valuesTooltip.style.top = `${clientY - rect.top + 12}px`;
  }

  /** @param {object} bar */
  function syncCrosshairToBar(bar) {
    if (!chart || !series || !bar) return;
    const ta = getContext().timeAdapter;
    const chartTime = ta ? ta.time.toChart(bar.time) : bar.time;
    chart.setCrosshairPosition(bar.close, chartTime, series);
  }

  /**
   * @param {number} clientX
   * @param {number} clientY
   * @returns {{ bar: object, prev: object | null } | null}
   */
  function renderAt(clientX, clientY) {
    const point = resolvePoint(clientX, clientY);
    if (!point) return null;
    const { bar, prev } = nearestBar(point.time);
    if (!bar) return null;
    valuesTooltip.innerHTML = buildTooltipHtml(bar, prev);
    positionTooltip(clientX, clientY);
    valuesTooltip.hidden = false;
    syncCrosshairToBar(bar);
    onBarHover?.(bar, prev);
    return { bar, prev };
  }

  function hideValuesTooltip() {
    if (pinned) return;
    valuesTooltip.hidden = true;
    onBarHover?.(null, null);
  }

  function isValuesTooltipPinned() {
    return pinned;
  }

  function unpinValuesTooltip() {
    if (!pinned) {
      valuesTooltip.hidden = true;
      onBarHover?.(null, null);
      return;
    }
    pinned = false;
    valuesTooltip.hidden = true;
    if (chart) {
      chart.applyOptions({
        crosshair: { horzLine: { visible: savedHorzCrosshairVisible } },
      });
    }
    onPinChange?.(false);
    onBarHover?.(null, null);
  }

  function pinValuesTooltip(clientX, clientY) {
    const hit = renderAt(clientX, clientY);
    if (!hit) return;
    pinned = true;
    if (chart) {
      const horz = chart.options().crosshair?.horzLine;
      savedHorzCrosshairVisible = horz?.visible !== false;
      chart.applyOptions({
        crosshair: {
          horzLine: { visible: false },
          vertLine: { visible: true },
        },
      });
    }
    onPinChange?.(true);
  }

  /** @param {number} clientX @param {number} clientY */
  function updateValuesTooltipAt(clientX, clientY) {
    if (!pinned) return;
    renderAt(clientX, clientY);
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
      pinValuesTooltip(longPressOrigin.x, longPressOrigin.y);
      clearLongPress();
    }, VALUES_TOOLTIP_LONG_PRESS_MS);
  }

  function cancelLongPressIfMoved(clientX, clientY) {
    if (pinned || !longPressOrigin || !longPressTimer) return;
    const moved = Math.hypot(clientX - longPressOrigin.x, clientY - longPressOrigin.y);
    if (moved > VALUES_TOOLTIP_MOVE_THRESHOLD) clearLongPress();
  }

  return {
    hideValuesTooltip,
    unpinValuesTooltip,
    isValuesTooltipPinned,
    updateValuesTooltipAt,
    clearLongPress,
    scheduleLongPress,
    cancelLongPressIfMoved,
  };
}

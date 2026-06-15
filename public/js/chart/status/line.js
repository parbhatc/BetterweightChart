import { getMarketStatusDetails, renderMarketStatusIcons } from "../market/status.js";
import { barPriceClass, candleValueColor, isBarUp } from "../bar/style.js";
import { precisionFromSettings } from "../timezone/list.js";

/** @deprecated use getMarketStatusDetails */
export function getMarketStatus(symbolInfo, nowMs = Date.now()) {
  const s = getMarketStatusDetails(symbolInfo, nowMs);
  return { label: s.title, open: s.open };
}

function fmtNum(n, precision = 2) {
  return Number(n).toLocaleString(undefined, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
}

function fmtVol(n) {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

/** @param {object} sl */
function resolveTitleSettings(sl) {
  const showTitle = sl.showTitle ?? sl.showSymbol ?? true;
  let titleSource = sl.titleSource;
  if (titleSource === "ticker") titleSource = "symbol";
  if (titleSource === "ticker_name") titleSource = "symbol_name";
  if (!titleSource) {
    if (sl.showSymbol && sl.showDescription) titleSource = "symbol_name";
    else if (sl.showDescription) titleSource = "name";
    else titleSource = "symbol";
  }
  return { showTitle, titleSource };
}

/** @param {HTMLElement} el @param {object} settings */
export function applyStatusLineAppearance(el, settings) {
  const sl = settings?.statusLine ?? {};
  if (sl.showBackground) {
    const pct = Math.max(0, Math.min(100, Number(sl.backgroundOpacity) || 0));
    const mix = Math.round(100 - pct * 0.82);
    el.style.background = `color-mix(in srgb, var(--tv-bg) ${mix}%, transparent)`;
    el.style.border = `1px solid color-mix(in srgb, var(--tv-border) ${50 + pct * 0.25}%, transparent)`;
    el.style.boxShadow = "0 1px 4px color-mix(in srgb, #000 18%, transparent)";
    el.style.backdropFilter = "blur(6px)";
  } else {
    el.style.background = "transparent";
    el.style.border = "none";
    el.style.boxShadow = "none";
    el.style.backdropFilter = "none";
  }
}

/**
 * @param {HTMLElement} el
 * @param {object} opts
 * @param {string} opts.symbol
 * @param {string} [opts.resolution]
 * @param {object} [opts.symbolInfo]
 * @param {object} [opts.bar]
 * @param {object} [opts.prevBar]
 * @param {object} opts.settings
 */
export function renderStatusLine(el, opts) {
  const { symbol, symbolInfo, resolution, bar, prevBar, settings } = opts;
  const sl = settings.statusLine ?? {};
  const precision = precisionFromSettings(settings, symbolInfo);

  if (!bar) {
    el.innerHTML = "";
    return;
  }

  const parts = [];
  const market = getMarketStatusDetails(symbolInfo);
  const { showTitle, titleSource } = resolveTitleSettings(sl);

  if (showTitle) {
    let head = "";
    if (titleSource === "symbol") {
      head += `<span class="status-line__ticker">${symbol}</span>`;
    } else if (titleSource === "name" && symbolInfo?.description) {
      head += `<span class="status-line__name">${symbolInfo.description}</span>`;
    } else if (titleSource === "symbol_name") {
      head += `<span class="status-line__ticker">${symbol}</span>`;
      if (symbolInfo?.description) {
        head += `<span class="status-line__dot" aria-hidden="true">•</span><span class="status-line__name">${symbolInfo.description}</span>`;
      }
    }
    if (resolution) {
      head += `<span class="status-line__dot" aria-hidden="true">•</span><span class="status-line__res">${resolution}</span>`;
    }
    if (symbolInfo?.exchange) {
      head += `<span class="status-line__dot" aria-hidden="true">•</span><span class="status-line__exch">${symbolInfo.exchange}</span>`;
    }
    if (head) parts.push(`<span class="status-line__head">${head}</span>`);
  }
  if (sl.showMarketStatus) {
    parts.push(renderMarketStatusIcons(market));
  }
  const sym = settings.symbol ?? {};
  const colorOnPrev = Boolean(sym.colorBarsOnPrevClose);
  const barUp = isBarUp(bar, prevBar, colorOnPrev);
  const priceCls = barPriceClass(barUp);
  const priceColor = candleValueColor(sym, barUp);

  const pair = (lbl, val, { colored = false, extraPairCls = "" } = {}) => {
    const pairCls = extraPairCls ? ` status-line__pair ${extraPairCls}` : " status-line__pair";
    const valHtml = colored
      ? `<span class="status-line__val ${priceCls}" style="color:${priceColor}">${val}</span>`
      : `<span class="status-line__val">${val}</span>`;
    return `<span class="${pairCls.trim()}"><span class="status-line__lbl">${lbl}</span>${valHtml}</span>`;
  };

  if (sl.showOHLC) {
    parts.push(
      pair("O", fmtNum(bar.open, precision), { colored: true }),
      pair("H", fmtNum(bar.high, precision), { colored: true }),
      pair("L", fmtNum(bar.low, precision), { colored: true }),
      pair("C", fmtNum(bar.close, precision), { colored: true }),
    );
  }

  if (sl.showBarChange) {
    const barChg = bar.close - bar.open;
    const barPct = bar.open ? (barChg / bar.open) * 100 : 0;
    const sign = barChg >= 0 ? "+" : "";
    const chgUp = barChg >= 0;
    const chgCls = barPriceClass(chgUp);
    const chgColor = candleValueColor(sym, chgUp);
    parts.push(
      `<span class="status-line__chg status-line__chg--${chgUp ? "up" : "down"}"><span class="status-line__val ${chgCls}" style="color:${chgColor}">${sign}${fmtNum(barChg, precision)} (${sign}${barPct.toFixed(2)}%)</span></span>`,
    );
  }

  if (sl.showVolume !== false) {
    parts.push(pair("Vol", fmtVol(bar.volume), { colored: true, extraPairCls: "status-line__vol" }));
  }

  el.innerHTML = parts.join("");
  applyStatusLineAppearance(el, settings);
}

import { getMarketStatusDetails, renderMarketStatusIcons } from "../market/status.js";
import { barPriceClass, candleValueColor, isBarUp, barChangeFromPrevClose } from "../bar/style.js";
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

/** @param {string} symbol @param {object} [symbolInfo] */
function statusLineTicker(symbol, symbolInfo) {
  if (symbolInfo?.name) return String(symbolInfo.name);
  if (symbolInfo?.ticker) {
    const t = String(symbolInfo.ticker);
    const colon = t.lastIndexOf(":");
    if (colon >= 0) return t.slice(colon + 1);
    return t;
  }
  const raw = String(symbol ?? "");
  const colon = raw.lastIndexOf(":");
  if (colon >= 0) return raw.slice(colon + 1);
  return raw;
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
  el.style.boxShadow = "none";
  if (sl.showBackground) {
    const pct = Math.max(0, Math.min(100, Number(sl.backgroundOpacity) || 0));
    const mix = Math.round(100 - pct * 0.82);
    el.style.setProperty("--status-line-bg", `color-mix(in srgb, var(--tv-bg) ${mix}%, transparent)`);
    el.style.setProperty(
      "--status-line-border-color",
      `color-mix(in srgb, var(--tv-border) ${50 + pct * 0.25}%, transparent)`,
    );
    el.style.removeProperty("background");
    el.style.removeProperty("border");
    el.style.removeProperty("backdrop-filter");
    el.classList.add("status-line--bg");
  } else {
    el.style.removeProperty("--status-line-bg");
    el.style.removeProperty("--status-line-border-color");
    el.style.background = "transparent";
    el.style.border = "none";
    el.style.backdropFilter = "none";
    el.classList.remove("status-line--bg");
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

  let mainEl = el.querySelector(".status-line__main");
  let studiesEl = el.querySelector(".status-line__studies");
  if (!mainEl) {
    const preservedStudies = el.querySelector(".status-line__studies");
    el.textContent = "";
    mainEl = document.createElement("div");
    mainEl.className = "status-line__main";
    studiesEl = preservedStudies ?? document.createElement("div");
    studiesEl.className = "status-line__studies";
    el.append(mainEl, studiesEl);
  } else if (!studiesEl) {
    studiesEl = document.createElement("div");
    studiesEl.className = "status-line__studies";
    el.appendChild(studiesEl);
  } else if (!el.contains(studiesEl)) {
    el.appendChild(studiesEl);
  }

  if (!bar) {
    mainEl.innerHTML = "";
    return;
  }

  const parts = [];
  const market = getMarketStatusDetails(symbolInfo);
  const { showTitle, titleSource } = resolveTitleSettings(sl);
  const ticker = statusLineTicker(symbol, symbolInfo);

  let head = "";
  if (showTitle) {
    if (titleSource === "symbol") {
      head += `<span class="status-line__ticker">${ticker}</span>`;
    } else if (titleSource === "name") {
      if (symbolInfo?.description) {
        head += `<span class="status-line__name">${symbolInfo.description}</span>`;
      } else {
        head += `<span class="status-line__ticker">${ticker}</span>`;
      }
    } else if (titleSource === "symbol_name") {
      head += `<span class="status-line__ticker">${ticker}</span>`;
      if (symbolInfo?.description) {
        head += `<span class="status-line__dot status-line__dot--before-name" aria-hidden="true">·</span><span class="status-line__name">${symbolInfo.description}</span>`;
      }
    } else {
      head += `<span class="status-line__ticker">${ticker}</span>`;
    }
    if (resolution) {
      head += `<span class="status-line__dot" aria-hidden="true">·</span><span class="status-line__res">${resolution}</span>`;
    }
    if (symbolInfo?.exchange) {
      head += `<span class="status-line__dot" aria-hidden="true">·</span><span class="status-line__exch">${symbolInfo.exchange}</span>`;
    }
  }

  const metaParts = [];
  if (head) metaParts.push(`<span class="status-line__head">${head}</span>`);
  if (sl.showMarketStatus) metaParts.push(renderMarketStatusIcons(market));

  const sym = settings.symbol ?? {};
  const colorOnPrev = Boolean(sym.colorBarsOnPrevClose);
  const barUp = isBarUp(bar, prevBar, colorOnPrev);
  const priceCls = barPriceClass(barUp);
  const priceColor = candleValueColor(sym, barUp);

  const pair = (lbl, val, { colored = false, extraPairCls = "", minor = false } = {}) => {
    const minorCls = minor ? " status-line__pair--minor" : "";
    const pairCls = extraPairCls ? ` status-line__pair ${extraPairCls}${minorCls}` : ` status-line__pair${minorCls}`;
    const valHtml = colored
      ? `<span class="status-line__val ${priceCls}" style="color:${priceColor}">${val}</span>`
      : `<span class="status-line__val">${val}</span>`;
    return `<span class="${pairCls.trim()}"><span class="status-line__lbl">${lbl}</span>${valHtml}</span>`;
  };

  const valueParts = [];

  if (sl.showOHLC) {
    valueParts.push(
      pair("O", fmtNum(bar.open, precision), { colored: true, minor: true }),
      pair("H", fmtNum(bar.high, precision), { colored: true, minor: true }),
      pair("L", fmtNum(bar.low, precision), { colored: true, minor: true }),
      pair("C", fmtNum(bar.close, precision), { colored: true }),
    );
  }

  if (sl.showBarChange) {
    const { change: barChg, pct: barPct } = barChangeFromPrevClose(bar, prevBar);
    const sign = barChg >= 0 ? "+" : "−";
    const pctSign = barPct >= 0 ? "+" : "−";
    const chgUp = isBarUp(bar, prevBar, colorOnPrev);
    const chgCls = barPriceClass(chgUp);
    const chgColor = candleValueColor(sym, chgUp);
    valueParts.push(
      `<span class="status-line__pair status-line__chg status-line__chg--${chgUp ? "up" : "down"}"><span class="status-line__val ${chgCls}" style="color:${chgColor}">${sign}${fmtNum(Math.abs(barChg), precision)} (${pctSign}${Math.abs(barPct).toFixed(2)}%)</span></span>`,
    );
  }

  if (sl.showVolume !== false) {
    valueParts.push(pair("Vol", fmtVol(bar.volume), { colored: true, extraPairCls: "status-line__vol" }));
  }

  if (metaParts.length || valueParts.length) {
    const meta = metaParts.length ? `<span class="status-line__meta">${metaParts.join("")}</span>` : "";
    const flow = `${meta}${valueParts.join("")}`;
    parts.push(
      `<div class="status-line__item status-line__item--series"><div class="status-line__flow">${flow}</div></div>`,
    );
  }

  mainEl.innerHTML = parts.join("");
  applyStatusLineAppearance(el, settings);
}

/**
 * Chart position overlay — position line with live P&L plus draggable SL/TP brackets.
 *
 * @example
 * const pos = widget.positionOverlay;
 * await pos.buy();                    // market
 * await pos.buy(18450.25);            // fill at price (paper)
 * await pos.buy({ price: 18450, qty: 2 });
 * await pos.buy({ price: 18400, type: "limit" }); // pending limit
 *
 * pos.setStopLoss(18400);
 * pos.clearStopLoss();
 *
 * pos.onStopLossChanged((oldPrice, newPrice) => {});
 * pos.onTakeProfitChanged((oldPrice, newPrice) => {});
 * pos.onClose((snapshot) => {});
 * pos.onOpen((snapshot) => {});
 */

import { plotPaneWidth, resolveOrderLinePillOffset, resolveBracketPillOffset } from "./rowLayout.js";

/** @param {string} key @param {number} [n] */
function aurenPosPerfCount(key, n = 1) {
  try {
    globalThis.__AUREN_POS_PERF__?.count?.(key, n);
  } catch {
    //
  }
}

const DEFAULT_PILL_OFFSET = 10;
const DEFAULT_BRACKET_PILL_OFFSET = 96;
const BRACKET_LINE_LENGTH = 21;
const POSITION_TEXT_COLOR = "#ffffff";
const BRACKET_TEXT_COLOR = "#ffffff";
const BUY_COLOR = "#089981";
const SELL_COLOR = "#f23645";
const DEFAULT_QTY = 1;

/**
 * @param {number} pnl
 * @param {"both" | "+" | "-"} [signMode]
 */
function formatPnl(pnl, signMode = "both") {
  const showPlus = signMode === "+" || signMode === "both";
  const showMinus = signMode === "-" || signMode === "both";
  const abs = Math.abs(pnl).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (pnl >= 0) {
    return `${showPlus ? "+" : ""}$${abs}`;
  }
  return `${showMinus ? "-" : ""}$${abs}`;
}

/** @param {boolean} profit */
function lineColors(profit) {
  return { fill: profit ? BUY_COLOR : SELL_COLOR, text: POSITION_TEXT_COLOR };
}

/** @param {object | null | undefined} symbolInfo */
function resolveTickMeta(symbolInfo) {
  const pricescale = Number(symbolInfo?.pricescale) || 100;
  const minmov = Number(symbolInfo?.minmov) || 1;
  const tickSize = minmov / pricescale;
  const sym = String(symbolInfo?.ticker || symbolInfo?.name || symbolInfo?.symbol || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  let dollarsPerPoint = tickSize > 0 ? tickSize * 100 : 1;
  if (/^MNQ/.test(sym)) dollarsPerPoint = 2;
  else if (/^NQ/.test(sym)) dollarsPerPoint = 20;
  else if (/^MES/.test(sym)) dollarsPerPoint = 5;
  else if (/^ES/.test(sym)) dollarsPerPoint = 50;
  else if (/^MYM/.test(sym)) dollarsPerPoint = 0.5;
  else if (/^YM/.test(sym)) dollarsPerPoint = 5;
  else if (/^M2K/.test(sym)) dollarsPerPoint = 5;
  else if (/^RTY/.test(sym)) dollarsPerPoint = 50;

  const tickValue = tickSize > 0 ? (dollarsPerPoint * tickSize) : dollarsPerPoint;
  return { tickSize: tickSize > 0 ? tickSize : 0.01, tickValue };
}

/**
 * @param {number} entry
 * @param {number} mark
 * @param {number} qty signed contracts
 * @param {number} tickSize
 * @param {number} tickValue
 */
function calcPnl(entry, mark, qty, tickSize, tickValue) {
  return ((mark - entry) / tickSize) * tickValue * qty;
}

/**
 * NexusSyncPro-style drag classification (mark at open + live last close).
 *
 * @param {number} qty signed contracts
 * @param {number} targetPrice
 * @param {number} refMark mark when position line was opened
 * @param {number | null | undefined} lastClose live bar close
 * @returns {{ type: "stop_loss" | "limit_order" | "stop_profit" | "take_profit", label: string, profit: boolean }}
 */
function resolveBracketDrag(qty, targetPrice, refMark, lastClose) {
  if (qty > 0) {
    if (targetPrice <= refMark) {
      return { type: "stop_loss", label: "Set Stop Market", profit: false };
    }
    if (lastClose != null && targetPrice <= lastClose) {
      return { type: "stop_loss", label: "Set Stop Market", profit: false };
    }
    return { type: "limit_order", label: "Set Limit Order", profit: true };
  }

  if (qty < 0) {
    if (targetPrice >= refMark) {
      return { type: "stop_loss", label: "Set Stop Market", profit: false };
    }
    if (lastClose != null && targetPrice >= lastClose) {
      return { type: "stop_profit", label: "Set Stop Profit", profit: true };
    }
    return { type: "take_profit", label: "Set Take Profit", profit: true };
  }

  return { type: "stop_loss", label: "Set Stop Market", profit: false };
}

/** @param {"stop_loss" | "limit_order" | "stop_profit" | "take_profit"} dragType */
function bracketSlotForType(dragType) {
  return dragType === "stop_loss" ? "stopLoss" : "takeProfit";
}

/** @param {number | { price?: number, qty?: number, type?: "market" | "limit", pillOffset?: number } | null | undefined} priceOrOpts */
function normalizeOrderOpts(priceOrOpts) {
  if (typeof priceOrOpts === "number" && Number.isFinite(priceOrOpts)) {
    return { price: priceOrOpts };
  }
  if (priceOrOpts && typeof priceOrOpts === "object") {
    return priceOrOpts;
  }
  return {};
}

/**
 * @param {object} widget chart widget API (`onLiveBar`, `chart()`, `getSymbolInfo`, …)
 * @returns {PositionOverlayApi}
 */
export function createPositionOverlay(widget) {
  /** @type {{
   *   line: object,
   *   entry: number,
   *   qty: number,
   *   refMark: number,
   *   lastText: string,
   *   lastProfit: boolean,
   *   pillOffset: number,
   *   stopLoss: { line: object, price: number, lastText: string, lastProfit: boolean } | null,
   *   takeProfit: { line: object, price: number, lastText: string, lastProfit: boolean } | null,
   *   pendingBracket: { price: number, type: "stop_loss" | "limit_order" | "stop_profit" | "take_profit" } | null,
   * } | null} */
  let position = null;
  /** @type {{ line: object, side: "buy" | "sell", price: number, pillOffset: number, qty: number }[]} */
  const pending = [];
  /** @type {(() => void) | null} */
  let offLiveBar = null;
  /** @type {object | null} */
  let latestBar = null;
  let pillOffset = DEFAULT_PILL_OFFSET;
  let bracketPillOffset = DEFAULT_BRACKET_PILL_OFFSET;

  /** @type {Set<(oldPrice: number | null, newPrice: number | null) => void>} */
  const stopLossListeners = new Set();
  /** @type {Set<(oldPrice: number | null, newPrice: number | null) => void>} */
  const takeProfitListeners = new Set();
  /** @type {Set<(snapshot: PositionSnapshot) => void>} */
  const closeListeners = new Set();
  /** @type {Set<(snapshot: PositionSnapshot) => void>} */
  const openListeners = new Set();

  function positionSnapshot() {
    if (!position) return null;
    return {
      entry: position.entry,
      qty: position.qty,
      stopLoss: position.stopLoss?.price ?? null,
      takeProfit: position.takeProfit?.price ?? null,
    };
  }

  /**
   * @param {Set<Function>} listeners
   * @param {...*} args
   */
  function emit(listeners, ...args) {
    for (const cb of listeners) {
      try {
        cb(...args);
      } catch (err) {
        console.error("[BWC:positionOverlay] listener error:", err);
      }
    }
  }

  /** @param {number | null} oldPrice @param {number | null} newPrice */
  function emitStopLossChanged(oldPrice, newPrice) {
    if (oldPrice === newPrice) return;
    emit(stopLossListeners, oldPrice, newPrice);
  }

  /** @param {number | null} oldPrice @param {number | null} newPrice */
  function emitTakeProfitChanged(oldPrice, newPrice) {
    if (oldPrice === newPrice) return;
    emit(takeProfitListeners, oldPrice, newPrice);
  }

  /**
   * @param {(cb: (oldPrice: number | null, newPrice: number | null) => void) => void} cb
   * @returns {() => void}
   */
  function subscribe(listeners, cb) {
    if (typeof cb !== "function") return () => {};
    listeners.add(cb);
    return () => listeners.delete(cb);
  }

  function markPrice() {
    const bar = latestBar;
    if (bar) {
      const close = Number(bar.close);
      if (Number.isFinite(close)) return close;
      const open = Number(bar.open);
      if (Number.isFinite(open)) return open;
    }
    const bars = widget.getBars?.() ?? [];
    const last = bars.at(-1);
    if (!last) return null;
    latestBar = last;
    const close = Number(last.close);
    if (Number.isFinite(close)) return close;
    const open = Number(last.open);
    return Number.isFinite(open) ? open : null;
  }

  function tickMeta() {
    return resolveTickMeta(widget.getSymbolInfo?.());
  }

  function currentPlotWidth() {
    const chart = widget.lcChart;
    if (!chart) return 0;
    const el = typeof chart.chartElement === "function" ? chart.chartElement() : null;
    return plotPaneWidth(chart, el);
  }

  function syncLayoutOffsets() {
    if (!position?.line && !pending.length) return;
    const plotW = currentPlotWidth();
    const nextPos = resolveOrderLinePillOffset(plotW, DEFAULT_PILL_OFFSET);
    const nextBracket = resolveBracketPillOffset(plotW, DEFAULT_BRACKET_PILL_OFFSET);
    if (nextPos !== pillOffset) {
      pillOffset = nextPos;
      if (position?.line) position.line.setPillOffset(pillOffset);
      for (const row of pending) row.line.setPillOffset(pillOffset);
    }
    if (nextBracket !== bracketPillOffset) {
      bracketPillOffset = nextBracket;
      if (position?.stopLoss?.line) position.stopLoss.line.setPillOffset(bracketPillOffset);
      if (position?.takeProfit?.line) position.takeProfit.line.setPillOffset(bracketPillOffset);
    }
  }

  function ensureLiveHook() {
    if (offLiveBar || typeof widget.onLiveBar !== "function") return;
    offLiveBar = widget.onLiveBar((bar) => {
      aurenPosPerfCount("bwc.overlay.onLiveBar");
      latestBar = bar;
      onBarTick(bar);
    });
  }

  function dropLiveHook() {
    if (!offLiveBar) return;
    offLiveBar();
    offLiveBar = null;
    latestBar = null;
  }

  function positionSideColor(qty) {
    return qty > 0 ? BUY_COLOR : SELL_COLOR;
  }

  function refreshBracketSizes() {
    if (!position) return;
    if (position.stopLoss?.line) {
      position.stopLoss.line.setQuantity(String(-position.qty));
      applyBracketLineVisual(position.stopLoss, position.stopLoss.price);
    }
    if (position.takeProfit?.line) {
      position.takeProfit.line.setQuantity(String(-position.qty));
      applyBracketLineVisual(position.takeProfit, position.takeProfit.price);
    }
  }

  /**
   * Update entry/qty in place — keeps brackets and does not fire onClose/onOpen.
   * @param {number} entry
   * @param {number} qty signed contracts
   */
  async function modifyPositionAt(entry, qty) {
    if (!position?.line) return openPositionAt(entry, qty);
    const sameSign =
      (position.qty > 0 && qty > 0) || (position.qty < 0 && qty < 0);
    if (!sameSign || !Number.isFinite(entry) || !Number.isFinite(qty) || qty === 0) {
      return openPositionAt(entry, qty);
    }

    position.entry = entry;
    position.qty = qty;
    stylePositionLine(position.line, qty);
    position.line.setPrice(entry);
    refreshBracketSizes();

    const mark = markPrice();
    if (mark != null) refreshPositionPnl(mark);
    else {
      position.lastText = "";
      position.lastProfit = true;
      refreshPositionPnl(entry);
    }

    return position.line;
  }

  function canScaleIn(signedQty) {
    if (!position?.line || !signedQty) return false;
    return (
      (position.qty > 0 && signedQty > 0) || (position.qty < 0 && signedQty < 0)
    );
  }

  /**
   * @param {object} line
   * @param {number} qty signed
   */
  function stylePositionLine(line, qty) {
    const color = positionSideColor(qty);
    line
      .setText("")
      .setQuantity(String(Math.abs(qty)))
      .setLineColor(color)
      .setBodyBackgroundColor(color)
      .setQuantityBackgroundColor(color)
      .setBodyTextColor(POSITION_TEXT_COLOR)
      .setQuantityTextColor(POSITION_TEXT_COLOR)
      .setLineStyle(2)
      .setLineLength(8)
      .setPillSide("right")
      .setPillOffset(pillOffset);
    if (typeof line.setQuantityBorderColor === "function") {
      line.setQuantityBorderColor("transparent");
    }
    if (typeof line.setBodyBorderColor === "function") {
      line.setBodyBorderColor("transparent");
    }
    line.setCancelTooltip("Close position");
    return line;
  }

  /**
   * @param {object} line
   * @param {number} targetPrice drag preview price
   */
  function applyBracketDragPreview(line, targetPrice) {
    if (!position) return;
    const { tickSize, tickValue } = tickMeta();
    const pnl = calcPnl(position.entry, targetPrice, position.qty, tickSize, tickValue);
    const pnlText = formatPnl(pnl, "-");
    const drag = resolveBracketDrag(
      position.qty,
      targetPrice,
      position.refMark,
      markPrice(),
    );
    const text = `${drag.label} ${pnlText}`;
    const profit = drag.profit;
    const colors = lineColors(profit);

    position.lastText = text;
    position.lastProfit = profit;

    if (typeof line.applyAppearance === "function") {
      line.applyAppearance({
        text,
        profit,
        fill: colors.fill,
        textColor: BRACKET_TEXT_COLOR,
      });
    }
    line.setText(text);
    line
      .setLineColor(colors.fill)
      .setBodyBackgroundColor(colors.fill)
      .setQuantityBackgroundColor(colors.fill)
      .setBodyTextColor(BRACKET_TEXT_COLOR)
      .setQuantityTextColor(BRACKET_TEXT_COLOR);
  }

  /**
   * @param {{ line: object, price: number, lastText: string, lastProfit: boolean }} bracket
   * @param {number} price
   */
  function applyBracketLineVisual(bracket, price) {
    if (!position?.line || !bracket?.line) return;

    const { tickSize, tickValue } = tickMeta();
    const pnl = calcPnl(position.entry, price, position.qty, tickSize, tickValue);
    const profit = pnl >= 0;
    const text = formatPnl(pnl);
    if (text === bracket.lastText && profit === bracket.lastProfit) return;

    const colors = lineColors(profit);
    bracket.price = price;
    bracket.lastText = text;
    bracket.lastProfit = profit;

    if (typeof bracket.line.applyAppearance === "function") {
      bracket.line.applyAppearance({
        text,
        profit,
        fill: colors.fill,
        textColor: BRACKET_TEXT_COLOR,
      });
    }
    bracket.line.setText(text);
    bracket.line
      .setLineColor(colors.fill)
      .setBodyBackgroundColor(colors.fill)
      .setQuantityBackgroundColor(colors.fill)
      .setBodyTextColor(BRACKET_TEXT_COLOR)
      .setQuantityTextColor(BRACKET_TEXT_COLOR);
  }

  /**
   * @param {object} line
   */
  function styleBracketLine(line) {
    if (!position) return line;
    line
      .setQuantity(String(-position.qty))
      .setLineStyle(2)
      .setLineLength(BRACKET_LINE_LENGTH)
      .setPillSide("right")
      .setPillOffset(bracketPillOffset)
      .setBodyTextColor(BRACKET_TEXT_COLOR)
      .setQuantityTextColor(BRACKET_TEXT_COLOR);
    if (typeof line.setQuantityBorderColor === "function") {
      line.setQuantityBorderColor("transparent");
    }
    line.setCancelTooltip("Cancel order");
    return line;
  }

  /** @param {"stopLoss" | "takeProfit"} slot @param {{ emit?: boolean }} [opts] */
  function removeBracketSlot(slot, opts = {}) {
    const emitEvents = opts.emit !== false;
    if (!position) return null;
    const bracket = position[slot];
    if (!bracket) return null;
    const oldPrice = bracket.price;
    try {
      bracket.line.remove();
    } catch {
      //
    }
    position[slot] = null;
    if (emitEvents) {
      if (slot === "stopLoss") emitStopLossChanged(oldPrice, null);
      else emitTakeProfitChanged(oldPrice, null);
    }
    return oldPrice;
  }

  /**
   * @param {"stop_loss" | "limit_order" | "stop_profit" | "take_profit"} dragType
   * @param {number} price
   */
  async function upsertBracketLine(dragType, price) {
    if (!position || !Number.isFinite(price)) return null;

    const slot = bracketSlotForType(dragType);
    const existing = position[slot];
    const oldPrice = existing?.price ?? null;

    if (existing) {
      existing.line.setPrice(price);
      applyBracketLineVisual(existing, price);
      if (slot === "stopLoss") emitStopLossChanged(oldPrice, price);
      else emitTakeProfitChanged(oldPrice, price);
      return existing.line;
    }

    const line = await widget.chart().createOrderLine();
    if (!line) return null;

    styleBracketLine(line).setPrice(price);
    const bracket = { line, price, lastText: "", lastProfit: true };
    position[slot] = bracket;
    applyBracketLineVisual(bracket, price);

    if (slot === "stopLoss") emitStopLossChanged(null, price);
    else emitTakeProfitChanged(null, price);

    line.onCancel(() => removeBracketSlot(slot));
    line.onMoving(() => {
      if (!position?.[slot]) return;
      applyBracketLineVisual(position[slot], line.getPrice());
    });
    line.onMove(() => {
      if (!position?.[slot]) return;
      const prev = position[slot].price;
      const next = line.getPrice();
      applyBracketLineVisual(position[slot], next);
      if (slot === "stopLoss") emitStopLossChanged(prev, next);
      else emitTakeProfitChanged(prev, next);
    });

    return line;
  }

  /**
   * @param {object} line
   */
  function wirePositionDrag(line) {
    line.onMoving(() => {
      if (!position) return;
      const targetPrice = line.getPrice();
      const drag = resolveBracketDrag(
        position.qty,
        targetPrice,
        position.refMark,
        markPrice(),
      );
      position.pendingBracket = { price: targetPrice, type: drag.type };
      applyBracketDragPreview(line, targetPrice);
    });

    line.onMove(() => {
      if (!position) return;
      const pending = position.pendingBracket;
      position.pendingBracket = null;
      line.setPrice(position.entry);
      position.lastText = "";
      position.lastProfit = true;
      line
        .setBodyTextColor(POSITION_TEXT_COLOR)
        .setQuantityTextColor(POSITION_TEXT_COLOR);
      if (pending) void upsertBracketLine(pending.type, pending.price);
      const mark = markPrice();
      if (mark != null) refreshPositionPnl(mark);
    });
  }

  /**
   * @param {object} line
   * @param {"buy" | "sell"} side
   */
  function stylePendingLine(line, side) {
    const isBuy = side === "buy";
    const color = isBuy ? BUY_COLOR : SELL_COLOR;
    line
      .setText(isBuy ? "Limit Buy" : "Limit Sell")
      .setQuantity(String(DEFAULT_QTY))
      .setLineColor(color)
      .setBodyBackgroundColor(color)
      .setQuantityBackgroundColor(color)
      .setBodyTextColor(POSITION_TEXT_COLOR)
      .setQuantityTextColor(POSITION_TEXT_COLOR)
      .setPillSide("right")
      .setPillOffset(pillOffset)
      .setCancelTooltip("Cancel order");
    return line;
  }

  function closePosition(opts = {}) {
    const emitClose = opts.emitClose !== false;
    if (!position) return null;
    const snapshot = positionSnapshot();
    removeBracketSlot("stopLoss", { emit: false });
    removeBracketSlot("takeProfit", { emit: false });
    try {
      position.line.remove();
    } catch {
      //
    }
    position = null;
    if (!pending.length) dropLiveHook();
    if (emitClose && snapshot) emit(closeListeners, snapshot);
    return snapshot;
  }

  function clearPending() {
    for (const row of pending.splice(0)) {
      try {
        row.line.remove();
      } catch {
        //
      }
    }
    if (!position) dropLiveHook();
  }

  /**
   * @param {number} mark
   */
  function refreshPositionPnl(mark) {
    if (!position?.line || widget.isChartPanning?.()) return;
    if (position.line.isMoving) return;

    const { tickSize, tickValue } = tickMeta();
    const pnl = calcPnl(position.entry, mark, position.qty, tickSize, tickValue);
    const profit = pnl >= 0;
    const text = formatPnl(pnl);
    const colors = lineColors(profit);
    const sideColor = positionSideColor(position.qty);
    const textChanged = text !== position.lastText;
    const profitChanged = profit !== position.lastProfit;
    emitOverlayUpl(pnl);
    if (!textChanged && !profitChanged) {
      aurenPosPerfCount("bwc.overlay.pnlSkip");
      return;
    }

    const now = performance.now();
    if (now - lastPnlPaintAt < PNL_PAINT_MIN_MS) {
      aurenPosPerfCount("bwc.overlay.pnlThrottle");
      return;
    }
    lastPnlPaintAt = now;

    aurenPosPerfCount("bwc.overlay.pnlApply");

    position.lastText = text;
    position.lastProfit = profit;

    const patch = {
      text,
      quantityText: String(Math.abs(position.qty)),
      fill: colors.fill,
      quantityFill: sideColor,
      textColor: POSITION_TEXT_COLOR,
    };

    try {
      if (typeof position.line.applyAppearance === "function") {
        position.line.applyAppearance(patch);
        position.line.setLineColor(sideColor);
        return;
      }
      position.line.setText(text);
      position.line.setQuantity(String(Math.abs(position.qty)));
      position.line
        .setLineColor(sideColor)
        .setBodyBackgroundColor(colors.fill)
        .setBodyTextColor(POSITION_TEXT_COLOR)
        .setQuantityBackgroundColor(sideColor)
        .setQuantityTextColor(POSITION_TEXT_COLOR);
    } catch {
      closePosition();
    }
  }

  /** @type {number | null} */
  let pnlRefreshRaf = null;
  /** @type {number | null} */
  let pendingPnlMark = null;
  let lastPnlPaintAt = 0;
  const PNL_PAINT_MIN_MS = 120;

  function emitOverlayUpl(pnl) {
    if (typeof widget.emitPositionUpl === "function") {
      widget.emitPositionUpl(pnl);
    }
  }

  function scheduleRefreshPositionPnl(mark) {
    pendingPnlMark = mark;
    if (pnlRefreshRaf != null) return;
    pnlRefreshRaf = requestAnimationFrame(() => {
      pnlRefreshRaf = null;
      const m = pendingPnlMark;
      pendingPnlMark = null;
      if (m != null) refreshPositionPnl(m);
    });
  }

  /**
   * @param {object} bar
   */
  function onBarTick(bar) {
    const mark = Number.isFinite(bar?.close) ? bar.close : bar?.open;
    if (!Number.isFinite(mark)) return;

    for (let i = pending.length - 1; i >= 0; i -= 1) {
      const row = pending[i];
      const low = Number(bar.low ?? mark);
      const high = Number(bar.high ?? mark);
      const filled =
        row.side === "buy" ? low <= row.price : high >= row.price;
      if (!filled) continue;
      pending.splice(i, 1);
      try {
        row.line.remove();
      } catch {
        //
      }
      void openPositionAt(row.price, row.side === "buy" ? row.qty : -row.qty);
    }

    scheduleRefreshPositionPnl(mark);
  }

  /**
   * @param {number} entry
   * @param {number} qty signed contracts
   */
  async function openPositionAt(entry, qty) {
    closePosition();
    clearPending();
    syncLayoutOffsets();

    const line = await widget.chart().createOrderLine();
    if (!line) return null;

    stylePositionLine(line, qty);
    line.setPrice(entry);
    line.onCancel(() => closePosition());
    wirePositionDrag(line);

    const { tickSize, tickValue } = tickMeta();
    const pnl = calcPnl(entry, entry, qty, tickSize, tickValue);
    const profit = pnl >= 0;
    const text = formatPnl(pnl);
    const colors = lineColors(profit);

    const mark = markPrice();
    const refMark = mark != null ? mark : entry;
    const sideColor = positionSideColor(qty);

    position = {
      line,
      entry,
      qty,
      refMark,
      lastText: text,
      lastProfit: profit,
      pillOffset,
      stopLoss: null,
      takeProfit: null,
      pendingBracket: null,
    };

    if (typeof line.applyAppearance === "function") {
      line.applyAppearance({
        text,
        quantityText: String(Math.abs(qty)),
        fill: colors.fill,
        quantityFill: sideColor,
        textColor: POSITION_TEXT_COLOR,
      });
    }
    line.setText(text);
    line.setQuantity(String(Math.abs(qty)));
    line
      .setLineColor(sideColor)
      .setBodyBackgroundColor(colors.fill)
      .setBodyTextColor(POSITION_TEXT_COLOR)
      .setQuantityBackgroundColor(sideColor)
      .setQuantityTextColor(POSITION_TEXT_COLOR);

    ensureLiveHook();
    if (mark != null && mark !== entry) refreshPositionPnl(mark);

    const snapshot = positionSnapshot();
    if (snapshot) emit(openListeners, snapshot);

    console.info("[BWC:positionOverlay] filled", {
      side: qty > 0 ? "buy" : "sell",
      entry,
      qty,
    });
    return line;
  }

  /**
   * @param {"buy" | "sell"} side
   * @param {number | { price?: number, qty?: number, type?: "market" | "limit", pillOffset?: number } | null | undefined} priceOrOpts
   */
  async function placeOrder(side, priceOrOpts) {
    const opts = normalizeOrderOpts(priceOrOpts);
    const mark = markPrice();
    if (mark == null && opts.price == null) {
      console.warn("[BWC:positionOverlay] no bars loaded yet");
      return null;
    }

    if (opts.pillOffset != null) {
      pillOffset = Math.max(0, Number(opts.pillOffset) || DEFAULT_PILL_OFFSET);
    }

    const qtyAbs = Math.max(1, Math.abs(Number(opts.qty) || DEFAULT_QTY));
    const signedQty = side === "buy" ? qtyAbs : -qtyAbs;

    let limitPrice = null;
    if (opts.price != null && Number.isFinite(Number(opts.price))) {
      limitPrice = Number(opts.price);
    }

    const orderType = opts.type === "limit" ? "limit" : "market";

    if (limitPrice != null && orderType === "limit" && mark != null) {
      const marketable =
        side === "buy" ? limitPrice >= mark : limitPrice <= mark;
      if (!marketable) {
        clearPending();
        const line = await widget.chart().createOrderLine();
        if (!line) return null;

        stylePendingLine(line, side).setPrice(limitPrice);
        line.onCancel(() => {
          const idx = pending.findIndex((row) => row.line === line);
          if (idx >= 0) pending.splice(idx, 1);
          try {
            line.remove();
          } catch {
            //
          }
          if (!pending.length && !position) dropLiveHook();
        });

        pending.push({ line, side, price: limitPrice, pillOffset, qty: qtyAbs });
        ensureLiveHook();
        console.info(`[BWC:positionOverlay] pending ${side} @`, limitPrice);
        return line;
      }
    }

    const fill =
      limitPrice != null ? limitPrice : mark != null ? mark : limitPrice;
    if (fill == null || !Number.isFinite(fill)) {
      console.warn("[BWC:positionOverlay] no price available for fill");
      return null;
    }

    if (canScaleIn(signedQty)) {
      const addAbs = Math.abs(signedQty);
      const oldAbs = Math.abs(position.qty);
      const totalAbs = oldAbs + addAbs;
      const newEntry = (position.entry * oldAbs + fill * addAbs) / totalAbs;
      const newSigned = side === "buy" ? totalAbs : -totalAbs;
      return modifyPositionAt(newEntry, newSigned);
    }

    return openPositionAt(fill, signedQty);
  }

  return {
    /** Market buy, or paper fill at price: `buy()`, `buy(18450)`, `buy({ price, qty })`. */
    buy: (priceOrOpts) => placeOrder("buy", priceOrOpts),
    /** Market sell / short, same price options as buy. */
    sell: (priceOrOpts) => placeOrder("sell", priceOrOpts),
    /** Pending limit only — does not fill until price trades through. */
    buyLimit: (price, opts = {}) => placeOrder("buy", { ...opts, price, type: "limit" }),
    sellLimit: (price, opts = {}) => placeOrder("sell", { ...opts, price, type: "limit" }),
    /** Close position, remove brackets, cancel pending limits. */
    clear() {
      closePosition();
      clearPending();
    },
    /** Remove stop-loss line. Fires `onStopLossChanged(old, null)`. */
    clearStopLoss() {
      return removeBracketSlot("stopLoss") != null;
    },
    /** Remove take-profit line. Fires `onTakeProfitChanged(old, null)`. */
    clearTakeProfit() {
      return removeBracketSlot("takeProfit") != null;
    },
    /**
     * Set or update stop loss. Pass `null` to clear.
     * @param {number | null} price
     */
    async setStopLoss(price) {
      if (price == null) return removeBracketSlot("stopLoss") != null;
      if (!Number.isFinite(price)) return null;
      return upsertBracketLine("stop_loss", price);
    },
    /**
     * Set or update take profit. Pass `null` to clear.
     * @param {number | null} price
     */
    async setTakeProfit(price) {
      if (price == null) return removeBracketSlot("takeProfit") != null;
      if (!Number.isFinite(price)) return null;
      return upsertBracketLine("take_profit", price);
    },
    /** Pill inset (px) for the position line. */
    setPillOffset(offset) {
      pillOffset = Math.max(0, Number(offset) || 0);
      if (position?.line) position.line.setPillOffset(pillOffset);
      for (const row of pending) row.line.setPillOffset(pillOffset);
      return pillOffset;
    },
    /** Recompute pill offsets after viewport / chart resize (mobile). */
    refreshLayout() {
      aurenPosPerfCount("bwc.overlay.refreshLayout");
      syncLayoutOffsets();
      const mark = markPrice();
      if (position?.line && mark != null) refreshPositionPnl(mark);
      return pillOffset;
    },
    setBracketPillOffset(offset) {
      bracketPillOffset = Math.max(0, Number(offset) || 0);
      if (position?.stopLoss?.line) position.stopLoss.line.setPillOffset(bracketPillOffset);
      if (position?.takeProfit?.line) position.takeProfit.line.setPillOffset(bracketPillOffset);
      return bracketPillOffset;
    },
    getPosition() {
      return positionSnapshot();
    },
    /**
     * Scale or resize open position in place (avg entry + qty). Keeps brackets.
     * @param {{ entry: number, qty: number }} opts signed qty
     */
    modifyPosition(opts) {
      const entry = Number(opts?.entry);
      const qty = Number(opts?.qty);
      if (!Number.isFinite(entry) || !Number.isFinite(qty)) return null;
      return modifyPositionAt(entry, qty);
    },
    /**
     * @param {(oldPrice: number | null, newPrice: number | null) => void} cb
     * @returns {() => void} unsubscribe
     */
    onStopLossChanged(cb) {
      return subscribe(stopLossListeners, cb);
    },
    /**
     * @param {(oldPrice: number | null, newPrice: number | null) => void} cb
     * @returns {() => void} unsubscribe
     */
    onTakeProfitChanged(cb) {
      return subscribe(takeProfitListeners, cb);
    },
    /**
     * @param {(snapshot: { entry: number, qty: number, stopLoss: number | null, takeProfit: number | null }) => void} cb
     * @returns {() => void} unsubscribe
     */
    onClose(cb) {
      return subscribe(closeListeners, cb);
    },
    /**
     * @param {(snapshot: { entry: number, qty: number, stopLoss: number | null, takeProfit: number | null }) => void} cb
     * @returns {() => void} unsubscribe
     */
    onOpen(cb) {
      return subscribe(openListeners, cb);
    },
    destroy() {
      closePosition({ emitClose: false });
      clearPending();
      stopLossListeners.clear();
      takeProfitListeners.clear();
      closeListeners.clear();
      openListeners.clear();
    },
  };
}

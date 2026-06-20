/**
 * Pine-style strategy simulator (single position, 1 contract).
 */
export class BacktestBroker {
  /**
   * @param {object} properties
   * @param {number} [properties.initialCapital]
   * @param {number} [properties.commissionValue]
   * @param {number} [properties.pointValue]
   * @param {boolean} [properties.processOrdersOnClose]
   */
  constructor(properties = {}) {
    this.initialCapital = Number(properties.initialCapital) || 1_000_000;
    this.commissionValue = Number(properties.commissionValue) || 0.2;
    this.pointValue = Number(properties.pointValue) || 1;
    this.processOnClose = properties.processOrdersOnClose !== false;

    this.cash = this.initialCapital;
    this.position = 0;
    this.avgPrice = 0;
    this.prevPosition = 0;

    /** @type {object | null} */
    this.activeExit = null;
    /** @type {object | null} */
    this.pendingEntry = null;

    /** @type {object[]} */
    this.trades = [];
    /** @type {object[]} */
    this.equity = [];
    /** @type {object | null} */
    this.openTrade = null;

    this.totalCommission = 0;
    this.peakEquity = this.initialCapital;
    this.maxDrawdown = 0;
  }

  get position_size() {
    return this.position;
  }

  get position_avg_price() {
    return this.avgPrice;
  }

  /** @param {number} qty @param {number} priceDiff */
  grossPnl(qty, priceDiff) {
    return qty * priceDiff * this.pointValue;
  }

  /**
   * @param {string} _id
   * @param {"long"|"short"} direction
   * @param {object} [opts]
   */
  entry(_id, direction, opts = {}) {
    if (this.position !== 0) return;
    const qty = direction === "long" ? 1 : -1;
    this.pendingEntry = { qty, comment: opts.comment ?? "" };
  }

  /**
   * @param {string} _id
   * @param {object} opts
   */
  exit(_id, opts = {}) {
    if (this.position === 0) return;
    this.activeExit = {
      stop: opts.stop,
      limit: opts.limit,
      commentLoss: opts.comment_loss ?? opts.commentLoss ?? "",
      commentProfit: opts.comment_profit ?? opts.commentProfit ?? "",
    };
  }

  /** @param {object} bar @param {number} index @param {number} time */
  beginBar(bar, index, time) {
    this.prevPosition = this.position;
    this._bar = bar;
    this._index = index;
    this._time = time;
    this.pendingEntry = null;
  }

  endBar() {
    const bar = this._bar;
    const index = this._index;
    const time = this._time;
    if (!bar) return;

    if (this.pendingEntry && this.position === 0) {
      const price = this.processOnClose ? bar.close : bar.open;
      this.openPosition(this.pendingEntry.qty, price, this.pendingEntry.comment, time, index);
    }

    if (this.position !== 0 && this.activeExit) {
      const exit = this.tryExitIntrabar(bar);
      if (exit) this.closePosition(exit.price, exit.reason, time, index);
    }

    const mark = bar.close;
    const unrealized = this.position ? this.grossPnl(this.position, mark - this.avgPrice) : 0;
    const equity = this.cash + unrealized;
    this.equity.push({ time, index, equity, openPnl: unrealized });
    this.peakEquity = Math.max(this.peakEquity, equity);
    this.maxDrawdown = Math.max(this.maxDrawdown, this.peakEquity - equity);
  }

  /** @param {object} bar */
  tryExitIntrabar(bar) {
    const exit = this.activeExit;
    if (!exit || this.position === 0) return null;

    if (this.position > 0) {
      const stop = exit.stop;
      const limit = exit.limit;
      const stopHit = stop != null && Number.isFinite(stop) && bar.low <= stop;
      const limitHit = limit != null && Number.isFinite(limit) && bar.high >= limit;
      if (stopHit && limitHit) return { price: stop, reason: exit.commentLoss || "SL" };
      if (stopHit) return { price: stop, reason: exit.commentLoss || "SL" };
      if (limitHit) return { price: limit, reason: exit.commentProfit || "TP" };
    } else {
      const stop = exit.stop;
      const limit = exit.limit;
      const stopHit = stop != null && Number.isFinite(stop) && bar.high >= stop;
      const limitHit = limit != null && Number.isFinite(limit) && bar.low <= limit;
      if (stopHit && limitHit) return { price: stop, reason: exit.commentLoss || "SL" };
      if (stopHit) return { price: stop, reason: exit.commentLoss || "SL" };
      if (limitHit) return { price: limit, reason: exit.commentProfit || "TP" };
    }
    return null;
  }

  /**
   * @param {number} qty
   * @param {number} price
   * @param {string} comment
   * @param {number} time
   * @param {number} index
   */
  openPosition(qty, price, comment, time, index) {
    const commission = this.commissionValue;
    this.totalCommission += commission;
    this.cash -= commission;
    this.position = qty;
    this.avgPrice = price;
    this.openTrade = {
      id: this.trades.length + 1,
      side: qty > 0 ? "long" : "short",
      size: Math.abs(qty),
      entryTime: time,
      entryIndex: index,
      entryPrice: price,
      comment,
    };
  }

  /**
   * @param {number} price
   * @param {string} reason
   * @param {number} time
   * @param {number} index
   */
  closePosition(price, reason, time, index) {
    if (!this.openTrade || this.position === 0) return;
    const qty = this.position;
    const pnl = this.grossPnl(qty, price - this.avgPrice);
    const commission = this.commissionValue;
    this.totalCommission += commission;
    this.cash += pnl - commission;

    this.trades.push({
      ...this.openTrade,
      size: Math.abs(qty),
      exitTime: time,
      exitIndex: index,
      exitPrice: price,
      exitReason: reason,
      pnl,
      netPnl: pnl - commission,
      commission: commission * 2,
      barsHeld: index - this.openTrade.entryIndex,
    });

    this.position = 0;
    this.avgPrice = 0;
    this.openTrade = null;
    this.activeExit = null;
  }

  /** Close any open position at last bar (end of test range). */
  closeOpenAtEnd(bar, time, index) {
    if (this.position === 0 || !bar) return;
    this.closePosition(bar.close, "End of range", time, index);
  }

  /** @returns {object} */
  report() {
    const closed = this.trades;
    const wins = closed.filter((t) => t.pnl > 0);
    const losses = closed.filter((t) => t.pnl < 0);
    const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
    const grossLoss = losses.reduce((s, t) => s + Math.abs(t.pnl), 0);
    const lastEquity = this.equity.length ? this.equity[this.equity.length - 1].equity : this.initialCapital;
    const totalPnl = lastEquity - this.initialCapital;
    const openPnl = this.position
      ? this.grossPnl(this.position, (this._bar?.close ?? this.avgPrice) - this.avgPrice)
      : 0;

    return {
      initialCapital: this.initialCapital,
      totalPnl,
      totalPnlPct: (totalPnl / this.initialCapital) * 100,
      openPnl,
      maxDrawdown: this.maxDrawdown,
      maxDrawdownPct: (this.maxDrawdown / this.initialCapital) * 100,
      profitablePct: closed.length ? (wins.length / closed.length) * 100 : 0,
      profitableCount: `${wins.length}/${closed.length}`,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
      expectedPayoff: closed.length ? closed.reduce((s, t) => s + t.pnl, 0) / closed.length : 0,
      totalTrades: closed.length,
      grossProfit,
      grossLoss,
      commission: this.totalCommission,
      netProfit: totalPnl,
      finalEquity: lastEquity,
      equity: this.equity,
      trades: closed,
      pointValue: this.pointValue,
    };
  }
}

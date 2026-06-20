import { registerTradeContextActions } from "/chart/sdk.js";

const DEMO_QTY = 1;
/** @type {Array<{ side: string; price: number; time: number }>} */
const demoLog = [];

function logTrade(side, price, time) {
  demoLog.unshift({ side, price, time: time ?? 0 });
  if (demoLog.length > 8) demoLog.pop();
  console.info(`[tradeDemo] ${side} qty=${DEMO_QTY} @ ${price}`, time != null ? `(t=${time})` : "");
}

function toast(side, price) {
  const el = document.getElementById("trade-demo-toast");
  if (!el) return;
  el.textContent = `${side} ${DEMO_QTY} @ ${Number(price).toFixed(2)}`;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    el.hidden = true;
  }, 2500);
}

/**
 * Demo order lines, execution arrows, trade context menu, and keyboard shortcuts.
 * @param {ReturnType<import("/chart/sdk.js").bootChart>} widget
 */
export function mountTradeDemo(widget) {
  registerTradeContextActions({
    onMarketBuy(qty, price, time) {
      logTrade("Market Buy", price, time);
      toast("Market Buy", price);
      void placeDemoOrderLine(widget, "buy", price);
    },
    onMarketSell(qty, price, time) {
      logTrade("Market Sell", price, time);
      toast("Market Sell", price);
      void placeDemoOrderLine(widget, "sell", price);
    },
    onLimitBuy(qty, limitPrice, price, time) {
      logTrade("Limit Buy", limitPrice, time);
      toast("Limit Buy", limitPrice);
      void placeDemoOrderLine(widget, "buy", limitPrice, "Limit");
    },
    onStopSell(qty, stopPrice, price, time) {
      logTrade("Stop Sell", stopPrice, time);
      toast("Stop Sell", stopPrice);
      void placeDemoOrderLine(widget, "sell", stopPrice, "Stop");
    },
  });

  widget.onChartReady(async () => {
    widget.onShortcut(["ctrl", 66], () => {
      const price = lastClose(widget);
      if (price == null) return;
      logTrade("Shortcut Buy (Ctrl+B)", price);
      toast("Shortcut Buy", price);
      void paintDemoExecution(widget, "buy", price);
    });
    widget.onShortcut(["ctrl", 83], () => {
      const price = lastClose(widget);
      if (price == null) return;
      logTrade("Shortcut Sell (Ctrl+S)", price);
      toast("Shortcut Sell", price);
      void paintDemoExecution(widget, "sell", price);
    });

    await seedDemoOrderLines(widget);
    await seedDemoExecutions(widget);
  });
}

/** @param {object} widget */
function lastBar(widget) {
  const bars = widget.getBars?.() ?? widget.visibleBars?.() ?? [];
  return bars.at(-1) ?? null;
}

/** @param {object} widget */
function lastClose(widget) {
  const bar = lastBar(widget);
  return bar?.close ?? bar?.value ?? null;
}

/**
 * @param {object} widget
 * @param {"buy" | "sell"} side
 * @param {number} price
 * @param {string} [label]
 */
async function placeDemoOrderLine(widget, side, price, label = "Market") {
  const chart = widget.chart?.();
  if (!chart?.createOrderLine) return;
  const line = await chart.createOrderLine();
  if (!line) return;
  const isBuy = side === "buy";
  const color = isBuy ? "#089981" : "#f23645";
  line
    .setPrice(price)
    .setText(side === "buy" ? "Buy" : "Sell")
    .setQuantity(String(DEMO_QTY))
    .setLineColor(color)
    .setBodyBackgroundColor(color)
    .setQuantityBackgroundColor(color)
    .setBodyTooltip(`${label} ${side} — click to modify`)
    .setCancelTooltip("Cancel order")
    .onModify(() => toast(`Modify ${side}`, line.getPrice()))
    .onCancel(() => {
      toast(`Cancel ${side}`, line.getPrice());
      line.remove();
    })
    .onMove(() => toast(`Moved ${side}`, line.getPrice()));
}

/** @param {object} widget */
async function seedDemoOrderLines(widget) {
  const bar = lastBar(widget);
  if (!bar || !Number.isFinite(bar.close)) return;
  const step = Math.max(Math.abs(bar.close) * 0.002, 1);
    await placeDemoOrderLine(widget, "buy", bar.close - step, "Buy");
  await placeDemoOrderLine(widget, "sell", bar.close + step, "Sell");
}

/**
 * @param {object} widget
 * @param {"buy" | "sell"} direction
 * @param {number} price
 */
async function paintDemoExecution(widget, direction, price) {
  const chart = widget.chart?.();
  if (!chart?.createExecutionShape) return;
  const bar = lastBar(widget);
  const time = bar?.time;
  if (time == null) return;
  const shape = await chart.createExecutionShape();
  if (!shape) return;
  const color = direction === "buy" ? "#22c55e" : "#ef4444";
  shape
    .setDirection(direction)
    .setTime(time)
    .setPrice(price)
    .setText("")
    .setTooltip(`${direction.toUpperCase()} ${DEMO_QTY} @ ${price}`)
    .setArrowColor(color)
    .setTextColor("rgba(0,0,0,0)")
    .setArrowHeight(10)
    .setArrowSpacing(2);
}

/** @param {object} widget */
async function seedDemoExecutions(widget) {
  const bars = widget.getBars?.() ?? widget.visibleBars?.() ?? [];
  const recent = bars.slice(-6, -1);
  for (let i = 0; i < recent.length; i += 2) {
    const bar = recent[i];
    if (!bar?.time || !Number.isFinite(bar.close)) continue;
    await paintDemoExecution(widget, i % 4 === 0 ? "buy" : "sell", bar.close);
  }
}

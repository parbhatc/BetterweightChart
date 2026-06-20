import { createBarScriptContext } from "../indicators/pineRuntime.js";
import { BacktestBroker } from "./broker.js";

/**
 * Run a per-bar strategy script and collect backtest results.
 *
 * @param {object} opts
 * @param {object[]} opts.utcBars
 * @param {object[]} opts.chartBars
 * @param {object} opts.inputs
 * @param {object} opts.style
 * @param {object} opts.properties
 * @param {string[]} opts.plotIds
 * @param {object | null} [opts.symbolInfo]
 * @param {object | null} [opts.overlayCtx]
 * @param {import("../indicators/types.js").IndicatorInstance} [opts.instance]
 * @param {() => void} [opts.init]
 * @param {(this: object, bar: object, index: number) => void} opts.onBar
 */
export function runStrategyScript(opts) {
  const { utcBars, chartBars, init, onBar, properties, instance } = opts;
  const broker = new BacktestBroker(properties);
  const { ctx, plots, labels, boxes, lines } = createBarScriptContext({
    utcBars,
    chartBars,
    inputs: opts.inputs,
    style: opts.style,
    plotIds: opts.plotIds,
    symbolInfo: opts.symbolInfo ?? null,
    overlayCtx: opts.overlayCtx ?? null,
    instance,
  });

  ctx.strategy = {
    get position_size() {
      return broker.position_size;
    },
    get position_avg_price() {
      return broker.position_avg_price;
    },
    get prev_position_size() {
      return broker.prevPosition;
    },
    entry: (id, direction, entryOpts) => broker.entry(id, direction, entryOpts),
    exit: (id, exitOpts) => broker.exit(id, exitOpts),
    long: "long",
    short: "short",
  };

  ctx.ta = {
    change(series) {
      if (typeof series === "function") {
        const cur = series();
        const prev = ctx.index > 0 ? series(ctx.index - 1) : null;
        return cur !== prev ? cur : 0;
      }
      return 0;
    },
    valueWhen(cond, value, occurrence = 0) {
      if (!cond) return null;
      if (occurrence !== 0) return null;
      return value;
    },
  };

  ctx.time = (frame) => {
    if (frame !== "D") return ctx.bar.time;
    const d = new Date(ctx.bar.time * 1000);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000;
  };

  init?.call(ctx);
  if (instance && init) {
    instance._initPending = ctx.state?.loading === true;
  }

  for (let i = 0; i < utcBars.length; i++) {
    ctx.index = i;
    ctx.bar = utcBars[i];
    const chartTime = chartBars[i]?.time ?? utcBars[i].time;

    for (const id of opts.plotIds) {
      if (!plots[id]) plots[id] = [];
      if (plots[id].length <= i) plots[id].length = i + 1;
      if (plots[id][i] === undefined) plots[id][i] = null;
    }

    broker.beginBar(utcBars[i], i, chartTime);
    onBar.call(ctx, utcBars[i], i);
    broker.endBar();
  }

  if (utcBars.length) {
    const last = utcBars.length - 1;
    const lastBar = utcBars[last];
    const lastTime = chartBars[last]?.time ?? lastBar.time;
    broker.closeOpenAtEnd(lastBar, lastTime, last);
    if (broker.equity.length) {
      const tail = broker.equity[broker.equity.length - 1];
      tail.equity = broker.cash;
      tail.openPnl = 0;
    }
  }

  for (const id of opts.plotIds) {
    while (plots[id].length < utcBars.length) plots[id].push(null);
  }

  const report = broker.report();
  return { plots, labels, boxes, lines, report, broker };
}

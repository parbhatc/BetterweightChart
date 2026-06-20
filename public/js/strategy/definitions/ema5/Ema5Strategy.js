import { BaseStrategy } from "../../BaseStrategy.js";
import {
  createBool,
  createFloat,
  createInt,
  createSelect,
  createSource,
  plot,
} from "../../../indicators/builders.js";
import { EmaRings, SMOOTHING_TYPE } from "../../../indicators/math/ema.js";

const TRADE_DIR = [
  { id: "Long", label: "Long" },
  { id: "Short", label: "Short" },
  { id: "Both", label: "Both" },
];

class Ema5Strategy extends BaseStrategy {
  constructor() {
    super("ema5_strategy", "5 EMA", "5 ema strategy");
    this.setPrimaryPlot("ma");
    this.setPlots([
      plot("ma", "MA", "#ffffff"),
      plot("buyStop", "St green Stop", "#26a69a"),
      plot("sellStop", "St red Stop", "#ef5350"),
      plot("buyTp", "take profit buy", "#2196f3"),
      plot("sellTp", "take profit sell", "#ff9800"),
    ]);
    this.setInputs([
      createSelect("t_dir", "Trade Direction", "Both", TRADE_DIR, {
        section: "Trade Direction Set",
      }),
      createInt("mx_num", "number Of trade", 4, { section: "Maximum Number Of Trade", min: 1 }),
      createBool("on_ma", "Enable EMa 1 Plot On/Off", true, { section: "Ema Set" }),
      createInt("ma_len", "Ema Length", 5, { section: "Ema Set", min: 1 }),
      createSource("ma_src", "Ema Source", "close", { section: "Ema Set" }),
      createFloat("tpnew", "take profit", 1.5, { section: "Tp/SL", min: 0.1 }),
    ]);
    this.setProperties([
      createFloat("initialCapital", "Initial capital", 1_000_000, { section: "General", min: 1 }),
      createFloat("commissionValue", "Commission", 0.2, { section: "General", min: 0 }),
      createBool("processOrdersOnClose", "Process orders on close", true, { section: "General" }),
    ]);
  }

  init() {
    this.state.rings = new EmaRings({
      length: this.getInt("ma_len", 5),
      offset: 0,
      smoothingType: SMOOTHING_TYPE.NONE,
      smoothType: SMOOTHING_TYPE.NONE,
      smoothingLength: 14,
      bbStdDev: 2,
    });
    this.state.hi = null;
    this.state.lo = null;
    this.state.hiLag = null;
    this.state.loLag = null;
    this.state.buyp_sl = null;
    this.state.sellp_sl = null;
    this.state.activeBuySl = null;
    this.state.activeSellSl = null;
    this.state.count_buysell = 0;
    this.state.dayKey = null;
  }

  onBar(bar) {
    const ma_out = this.state.rings.pushEma(this.source("ma_src"), this.index);
    if (this.getBool("on_ma", true)) this.plot("ma", ma_out);

    const { open, high, low, close } = bar;
    const prevBar = this.bars[this.index - 1];

    if (ma_out != null) {
      if (close > ma_out && open > ma_out && low > ma_out && high > ma_out) {
        this.state.lo = low;
      }
      if (close < ma_out && open < ma_out && low < ma_out && high < ma_out) {
        this.state.hi = high;
      }
    }

    const t_dir = this.getString("t_dir", "Both");
    const long_side = t_dir === "Long" || t_dir === "Both";
    const short_side = t_dir === "Short" || t_dir === "Both";
    const mx_num = this.getInt("mx_num", 4);
    const hiPrev = this.state.hiLag;
    const loPrev = this.state.loLag;

    if (hiPrev != null && high > hiPrev) {
      if (this.strategy.position_size === 0 && this.state.count_buysell < mx_num && long_side) {
        this.strategy.entry("El", this.strategy.long, { comment: "Long" });
        this.state.count_buysell += 1;
        this.state.buyp_sl = Math.min(low, prevBar?.low ?? low);
        this.state.activeBuySl = this.state.buyp_sl;
      }
      this.state.hi = null;
    }

    if (loPrev != null && low < loPrev) {
      if (this.strategy.position_size === 0 && this.state.count_buysell < mx_num && short_side) {
        this.strategy.entry("Es", this.strategy.short, { comment: "short" });
        this.state.count_buysell += 1;
        this.state.sellp_sl = Math.max(high, prevBar?.high ?? high);
        this.state.activeSellSl = this.state.sellp_sl;
      }
      this.state.lo = null;
    }

    const tpnew = this.getFloat("tpnew", 1.5);
    const buy_sl = this.state.activeBuySl;
    const sell_sl = this.state.activeSellSl;
    const avg = this.strategy.position_avg_price;

    const takeProfit_buy =
      avg != null && buy_sl != null ? avg - (buy_sl - avg) * tpnew : null;
    const takeProfit_sell =
      avg != null && sell_sl != null ? avg - (sell_sl - avg) * tpnew : null;

    if (this.strategy.position_size > 0) {
      this.strategy.exit("XL", {
        stop: buy_sl,
        limit: takeProfit_buy,
        comment_loss: "Long Sl",
        comment_profit: "Long Tp",
      });
    }
    if (this.strategy.position_size < 0) {
      this.strategy.exit("XS", {
        stop: sell_sl,
        limit: takeProfit_sell,
        comment_loss: "Short Sl",
        comment_profit: "Short Tp",
      });
    }

    this.plot("sellStop", this.strategy.position_size < 0 ? sell_sl : null);
    this.plot("buyStop", this.strategy.position_size > 0 ? buy_sl : null);
    this.plot("sellTp", this.strategy.position_size < 0 ? takeProfit_sell : null);
    this.plot("buyTp", this.strategy.position_size > 0 ? takeProfit_buy : null);

    const dayKey = this.time("D");
    if (this.state.dayKey != null && dayKey !== this.state.dayKey) {
      this.state.count_buysell = 0;
    }
    this.state.dayKey = dayKey;

    this.state.hiLag = this.state.hi;
    this.state.loLag = this.state.lo;
  }

  legendParams(instance) {
    return [instance.inputs.t_dir ?? "Both", String(instance.inputs.ma_len ?? 5)];
  }
}

BaseStrategy.define(Ema5Strategy);
export default Ema5Strategy;

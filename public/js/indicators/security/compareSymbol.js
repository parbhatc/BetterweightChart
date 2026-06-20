export class CompareSymbol {
  /** @param {object} inputs @param {string} primary */
  resolve(inputs, primary) {
    if (inputs.autoCompare !== false) {
      return this.defaultFor(primary);
    }
    const manual = String(inputs.compareSymbol ?? "").trim();
    return manual || "ES";
  }

  /** @param {string} primary */
  defaultFor(primary) {
    const raw = String(primary ?? "");
    const colon = raw.indexOf(":");
    const prefix = colon >= 0 ? raw.slice(0, colon + 1) : "";
    const sym = (colon >= 0 ? raw.slice(colon + 1) : raw).toUpperCase().replace(/!$/, "");

    const pairs = {
      NQ: "ES1!",
      ES: "NQ1!",
      NQ1: "ES1!",
      ES1: "NQ1!",
      MES: "MNQ1!",
      MNQ: "MES1!",
      GC: "SI1!",
      SI: "GC1!",
      GC1: "SI1!",
      SI1: "GC1!",
      CL: "RB1!",
      RB: "CL1!",
      BTC: "ETH",
      ETH: "BTC",
    };
    return `${prefix}${pairs[sym] ?? "NQ1!"}`;
  }
}

export const compareSymbol = new CompareSymbol();

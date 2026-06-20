import { resolutionDisplayTitle } from "/js/chart/resolutionFormat.js";

/** @typedef {{ tag?: string; hi: string; lo: string }} HtfStyle */

export class LevelsHtfStyles {
  /** @returns {Record<string, HtfStyle>} */
  all() {
    return {
      "240": { tag: "4H", hi: "#007fff", lo: "#ff7644" },
      "60": { tag: "1H", hi: "#00ffcc", lo: "#ff4d4d" },
      "15": { tag: "15m", hi: "#ffed4a", lo: "#e046ff" },
      "5": { tag: "5m", hi: "#ffed4a", lo: "#e046ff" },
      "10": { tag: "10m", hi: "#ffed4a", lo: "#e046ff" },
    };
  }

  /** @param {string} tfId */
  get(tfId) {
    return this.all()[tfId];
  }

  /** @param {string} tfId */
  resolve(tfId) {
    return this.get(tfId) ?? { tag: resolutionDisplayTitle(tfId), hi: "#007fff", lo: "#ff7644" };
  }
}

export const levelsHtfStyles = new LevelsHtfStyles();

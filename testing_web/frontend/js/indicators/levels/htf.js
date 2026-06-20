import { resolutionSec } from "/js/chart/resolutions.js";
import { normalizeResolutionId } from "/js/chart/resolutionFormat.js";
import { resolveTimeLevels } from "../ui/levelsLayersPanel.js";
import { htfPendingForLayers, requiredChartBarsWhenNoHtf, requiredHtfBars } from "/js/indicators/security/htfPolicy.js";

export class LevelsHtf {
  /** @param {object} inputs @param {string} [chartResolution] */
  enabledResolutions(inputs, chartResolution = "1") {
    const chartSec = resolutionSec(chartResolution ?? "1");
    /** @type {{ tfId: string, tfSec: number }[]} */
    const out = [];
    for (const row of resolveTimeLevels(inputs)) {
      if (!row.enabled) continue;
      const tfId = normalizeResolutionId(row.layer ?? "240");
      const tfSec = resolutionSec(tfId);
      if (!tfSec || tfSec <= chartSec) continue;
      out.push({ tfId, tfSec });
    }
    return out;
  }

  /** @param {object} inputs */
  requiredHtfBars(inputs) {
    return requiredHtfBars(inputs);
  }

  /** @param {object} inputs @param {object} [ctx] */
  htfPending(inputs, ctx = {}) {
    const htfs = this.enabledResolutions(inputs, ctx.chartResolution ?? "1");
    if (!htfs.length) return false;
    const symbol = ctx.primarySymbol ?? ctx.symbol;
    return htfPendingForLayers(
      ctx,
      symbol,
      htfs.map(({ tfId }) => tfId),
      this.requiredHtfBars(inputs),
    );
  }

  /** @param {object} inputs @param {string} [chartResolution] */
  requiredChartBars(inputs, chartResolution) {
    return requiredChartBarsWhenNoHtf(this.enabledResolutions(inputs, chartResolution), inputs);
  }
}

export const levelsHtf = new LevelsHtf();

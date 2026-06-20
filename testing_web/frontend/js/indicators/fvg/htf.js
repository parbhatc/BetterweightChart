import { resolutionSec } from "/js/chart/resolutions.js";
import { normalizeResolutionId, resolutionDisplayTitle } from "/js/chart/resolutionFormat.js";
import { resolveFvgLayers, resolveFvgTimeframeRows } from "../ui/fvgTimeframesPanel.js";
import { requiredChartBarsWhenNoHtf, requiredHtfBars } from "/js/indicators/security/htfPolicy.js";

export class FvgHtf {
  /** @param {object} inputs @param {string} [chartResolution] @returns {{ tfId: string, tfSec: number }[]} */
  enabledResolutions(inputs, chartResolution) {
    const chartSec = resolutionSec(chartResolution ?? "1");
    let out = resolveFvgLayers(inputs, chartSec).filter((l) => l.tfSec > chartSec);
    if (inputs.hideLowerTf !== false && out.length) {
      const maxSec = Math.max(...out.map((l) => l.tfSec));
      out = out.filter((l) => l.tfSec === maxSec);
    }
    return out.map(({ tfId, tfSec }) => ({ tfId, tfSec }));
  }

  /** @param {object} inputs */
  requiredHtfBars(inputs) {
    return requiredHtfBars(inputs);
  }

  /** @param {object} inputs @param {string} [chartResolution] */
  requiredChartBars(inputs, chartResolution) {
    return requiredChartBarsWhenNoHtf(this.enabledResolutions(inputs, chartResolution), inputs);
  }

  /** @param {object} inputs */
  requiresCorrelatedCompare(inputs) {
    return inputs.requireCorrelatedFvg === true;
  }

  /**
   * @param {object} inputs
   * @param {string} [chartResolution]
   * @returns {{ id: string, label: string }[]}
   */
  correlatedTfOptions(inputs, chartResolution = "1") {
    /** @type {{ id: string, label: string }[]} */
    const options = [
      { id: "all", label: "All" },
      { id: "chart", label: `Chart (${resolutionDisplayTitle(chartResolution)})` },
    ];
    const seen = new Set(["all", "chart"]);

    for (const row of resolveFvgTimeframeRows(inputs)) {
      if (!row.enabled) continue;
      const tfId = row.timeframe ?? "chart";
      if (tfId === "chart") continue;
      const key = normalizeResolutionId(tfId);
      if (seen.has(key)) continue;
      seen.add(key);
      options.push({ id: key, label: resolutionDisplayTitle(tfId) });
    }
    return options;
  }
}

export const fvgHtf = new FvgHtf();

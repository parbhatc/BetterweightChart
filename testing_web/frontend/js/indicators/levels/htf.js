import { resolutionSec } from "/js/chart/resolutions.js";
import { normalizeResolutionId } from "/js/chart/resolutionFormat.js";
import { resolveTimeLevels, resolveSessionLevels } from "../ui/levelsLayersPanel.js";
import { htfPendingForLayers, requiredChartBarsForSessions, requiredChartBarsWhenNoHtf, requiredHtfBars, requiredHtfBarsForLayer, requiredHtfBarsForViewport } from "/js/indicators/security/htfPolicy.js";

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

  /** @param {object} inputs @param {number} chartBarCount @param {string} [chartResolution] @param {number} tfSec */
  requiredHtfBarsForLayer(inputs, chartBarCount, chartResolution, tfSec) {
    return requiredHtfBarsForLayer(inputs, chartBarCount, chartResolution, tfSec);
  }

  /**
   * HTF bars to fetch — viewport depth AND maxBarsBack pivot scan (confluence needs both).
   * @param {object} inputs @param {number} chartBarCount @param {string} [chartResolution] @param {number} tfSec
   */
  requiredHtfCountForLayer(inputs, chartBarCount, chartResolution, tfSec) {
    const pivotBack = this.requiredHtfBars(inputs);
    const viewport =
      chartBarCount > 0
        ? this.requiredHtfBarsForLayer(inputs, chartBarCount, chartResolution, tfSec)
        : pivotBack;
    return Math.max(pivotBack, viewport);
  }

  /** @param {object} inputs @param {number} chartBarCount @param {string} [chartResolution] */
  requiredHtfBarsForViewport(inputs, chartBarCount, chartResolution = "1") {
    const htfs = this.enabledResolutions(inputs, chartResolution);
    return requiredHtfBarsForViewport(inputs, chartBarCount, chartResolution, htfs);
  }

  /** @param {object} inputs @param {object} [ctx] */
  htfPending(inputs, ctx = {}) {
    const chartResolution = ctx.chartResolution ?? "1";
    const htfs = this.enabledResolutions(inputs, chartResolution);
    if (!htfs.length) return false;
    const symbol = ctx.primarySymbol ?? ctx.symbol;
    const chartBarCount = ctx.chartBarCount ?? ctx.utcBars?.length ?? ctx.bars?.length ?? 0;
    /** @type {Record<string, number>} */
    const perTfWant = {};
    for (const { tfId, tfSec } of htfs) {
      perTfWant[tfId] = this.requiredHtfCountForLayer(
        inputs,
        chartBarCount,
        chartResolution,
        tfSec,
      );
    }
    return htfPendingForLayers(
      ctx,
      symbol,
      htfs.map(({ tfId }) => tfId),
      this.requiredHtfBars(inputs),
      // Replay intentionally keeps initial history responses compact. Waiting
      // for every requested HTF bar can therefore leave Levels in a permanent
      // loading state even though each layer already has enough history to
      // compute stable pivots. The shared non-strict gate still waits for a
      // meaningful minimum and continues extending caches at HTF boundaries.
      { strict: false, perTfWant },
    );
  }

  /** @param {object} inputs @param {string} [chartResolution] */
  requiredChartBars(inputs, chartResolution) {
    const htf = this.enabledResolutions(inputs, chartResolution);
    const sessions = resolveSessionLevels(inputs).some((r) => r.enabled);
    return Math.max(
      requiredChartBarsWhenNoHtf(htf, inputs),
      requiredChartBarsForSessions(inputs, sessions, chartResolution),
    );
  }
}

export const levelsHtf = new LevelsHtf();

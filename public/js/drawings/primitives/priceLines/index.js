import { applyColorOpacity } from "../../../ui/color/picker.js";
import { DEFAULT_DRAWING_COLOR } from "../../constants.js";
import { isTrendLineFamilyType } from "../../tools/line/trendStats.js";
import { drawingUsesPriceAxisLabel } from "../../tools/axis/lines.js";
import { supportsChannelLineStyleSettings } from "../../tools/channel/family.js";
import { isPositionTool } from "../../registry/tools.js";
import { positionPriceAxisLabels } from "../../tools/position/barrel.js";

/** @typedef {import("../../types.js").UserDrawing} UserDrawing */

export class DrawingPriceLinesSync {
  constructor() {
    /** @type {import("lightweight-charts").ISeriesApi | null} */
    this._series = null;
    /** @type {Map<string, import("lightweight-charts").IPriceLine>} */
    this._lines = new Map();
  }

  /** @param {import("lightweight-charts").ISeriesApi | null} series */
  setSeries(series) {
    if (series === this._series) return;
    this.clear();
    this._series = series;
  }

  clear() {
    if (!this._series) {
      this._lines.clear();
      return;
    }
    for (const line of this._lines.values()) {
      try {
        this._series.removePriceLine(line);
      } catch {
        //
      }
    }
    this._lines.clear();
  }

  /**
   * @param {UserDrawing[]} drawings
   * @param {{ hidden?: boolean, selectedId?: string | null, hoveredId?: string | null }} [opts]
   */
  sync(drawings, opts = {}) {
    if (!this._series || opts.hidden) {
      this.clear();
      return;
    }

    /** @type {Set<string>} */
    const needed = new Set();

    for (const drawing of drawings) {
      const useTrendLineLabels = isTrendLineFamilyType(drawing.type) && drawing.showPriceLabels;
      const useChannelPriceLabels = supportsChannelLineStyleSettings(drawing.type) && drawing.showPriceLabels;
      const useAxisPriceLabel = drawingUsesPriceAxisLabel(drawing);
      const usePositionPriceLabels = isPositionTool(drawing.type);

      if (usePositionPriceLabels) {
        const labelState = {
          isSelected: drawing.id === opts.selectedId,
          isHovered: drawing.id === opts.hoveredId,
          hoveredDrawingId: opts.hoveredId ?? null,
        };
        for (const label of positionPriceAxisLabels(drawing, labelState)) {
          const price = Number(label.price);
          if (!Number.isFinite(price)) continue;
          const key = `${drawing.id}:${label.id}`;
          needed.add(key);
          const options = {
            price,
            color: label.color,
            lineVisible: false,
            axisLabelVisible: true,
            axisLabelColor: label.color,
            axisLabelTextColor: "#ffffff",
            lineWidth: 0,
            title: "",
          };
          const existing = this._lines.get(key);
          if (existing) {
            existing.applyOptions(options);
          } else {
            const line = this._series.createPriceLine(options);
            this._lines.set(key, line);
          }
        }
      }

      if (!useTrendLineLabels && !useChannelPriceLabels && !useAxisPriceLabel) continue;

      const color = applyColorOpacity(
        useChannelPriceLabels
          ? drawing.textColor ?? drawing.color ?? DEFAULT_DRAWING_COLOR
          : drawing.color ?? DEFAULT_DRAWING_COLOR,
        useChannelPriceLabels
          ? drawing.textColorOpacity ?? drawing.colorOpacity ?? 100
          : drawing.colorOpacity ?? 100,
      );
      const points = useAxisPriceLabel ? drawing.points.slice(0, 1) : drawing.points;
      points.forEach((point, index) => {
        const price = Number(point.price);
        if (!Number.isFinite(price)) return;
        const key = `${drawing.id}:${index}`;
        needed.add(key);
        const options = {
          price,
          color,
          lineVisible: false,
          axisLabelVisible: true,
          axisLabelColor: color,
          axisLabelTextColor: "#ffffff",
          lineWidth: 1,
          title: "",
        };
        const existing = this._lines.get(key);
        if (existing) {
          existing.applyOptions(options);
        } else {
          const line = this._series.createPriceLine(options);
          this._lines.set(key, line);
        }
      });
    }

    for (const [key, line] of this._lines) {
      if (needed.has(key)) continue;
      try {
        this._series.removePriceLine(line);
      } catch {
        //
      }
      this._lines.delete(key);
    }
  }
}

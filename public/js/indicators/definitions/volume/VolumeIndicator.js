import { BaseIndicator } from "../../BaseIndicator.js";
import { ComputeIndicator } from "../../ComputeIndicator.js";
import { createBool, createInt } from "../../builders.js";
import { smoothSeries } from "../../math/smooth.js";
import { applyColorOpacity } from "../../../ui/color/picker.js";
import { plotStyleKeys } from "../../schema.js";

const COLORS = {
  growing: "#26a69a",
  falling: "#ef5350",
  ma: "#2962ff",
};

class VolumeIndicator extends ComputeIndicator {

  constructor() {
    super("volume", "Vol", "Volume");
    this.setPrimaryPlot("vol");
    this.setVolumeScaleId("volume-overlay");
    this.setPlots([
      {
        id: "vol",
        type: "histogram",
        title: "Volume",
        overlay: true,
        priceLine: false,
        when: (_inputs, style) => style.volVisible !== false,
      },
      {
        id: "ma",
        type: "line",
        title: "Volume MA",
        color: COLORS.ma,
        overlay: true,
        priceLine: false,
        when: (_inputs, style) => style.maVisible === true,
      },
    ]);
    this.setInputs([
      createInt("maLength", "MA Length", 20),
      createBool("colorBasedOnPrevClose", "Color based on previous close", false),
    ]);
  }

  defaultStyle() {
    return {
      ...BaseIndicator.defaultStyle(),
      volVisible: true,
      volPriceLine: false,
      volPlotType: "columns",
      growingColor: COLORS.growing,
      growingOpacity: 50,
      fallingColor: COLORS.falling,
      fallingOpacity: 50,
      maVisible: false,
      maColor: COLORS.ma,
      maWidth: 1,
      maStyle: 0,
      maPriceLine: false,
      maPlotType: "line",
    };
  }

  computeSeries(bars, inputs, style) {
    const maLength = Math.max(1, Math.floor(Number(inputs.maLength) || 20));
    const vol = bars.map((b) => {
      const v = Number(b.volume);
      return Number.isFinite(v) ? v : 0;
    });
    const ma = smoothSeries(vol, maLength, "sma");
    const usePrevClose = Boolean(inputs.colorBasedOnPrevClose);
    const growing = applyColorOpacity(
      String(style.growingColor ?? COLORS.growing),
      Number(style.growingOpacity ?? 50),
    );
    const falling = applyColorOpacity(
      String(style.fallingColor ?? COLORS.falling),
      Number(style.fallingOpacity ?? 50),
    );
    /** @type {string[]} */
    const volColors = bars.map((b, i) => {
      const prev = bars[i - 1];
      let up;
      if (usePrevClose && prev) {
        up = Number(b.close) >= Number(prev.close);
      } else {
        up = Number(b.close) >= Number(b.open);
      }
      return up ? growing : falling;
    });
    return { vol, ma, volColors };
  }

  formatPlotValue(plotKey, raw) {
    if (plotKey !== "vol" || raw == null || !Number.isFinite(raw)) return null;
    const n = Number(raw);
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(Math.round(n));
  }

  legendParams(instance) {
    return [String(instance.inputs.maLength ?? 20)];
  }

  plotStyle(instance, plotKey) {
    if (plotKey === "vol") {
      return {
        visible: instance.style.volVisible !== false,
        color: COLORS.growing,
        width: 1,
        lineStyle: 0,
        priceLine: instance.style.volPriceLine === true,
        title: "",
      };
    }
    const plot = this.constructor.getPlotDef(plotKey);
    if (!plot || plot.type !== "line") return BaseIndicator.hiddenPlot();
    return BaseIndicator.linePlotStyle(instance, plotKey, {
      ...plotStyleKeys("ma"),
      label: plot.title,
    });
  }

  valueLabels(instance) {
    /** @type {{ key: string, title: string }[]} */
    const labels = [{ key: "vol", title: "Volume" }];
    if (instance.style.maVisible === true) {
      labels.push({ key: "ma", title: "Volume MA" });
    }
    return labels;
  }

  stylePlotRows(_inputValues, _style) {
    const maKeys = plotStyleKeys("ma");
    return [
      { type: "toggle", visibleKey: "volVisible", label: "Volume" },
      {
        type: "histogramColor",
        label: "Growing",
        colorKey: "growingColor",
        opacityKey: "growingOpacity",
        plotTypeKey: "volPlotType",
        priceLineKey: "volPriceLine",
      },
      {
        type: "histogramColor",
        label: "Falling",
        colorKey: "fallingColor",
        opacityKey: "fallingOpacity",
      },
      { type: "separator" },
      {
        type: "line",
        plotKey: "ma",
        visibleKey: "maVisible",
        label: "Volume MA",
        ...maKeys,
      },
    ];
  }
}

ComputeIndicator.define(VolumeIndicator);

export default VolumeIndicator;

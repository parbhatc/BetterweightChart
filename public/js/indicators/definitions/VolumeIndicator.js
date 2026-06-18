import { defineIndicator } from "../defineIndicator.js";
import { BaseIndicator } from "../BaseIndicator.js";
import { plotStyleKeys } from "../schema.js";
import { computeVolumeIndicator } from "../math/volume.js";

export const VOL_TV_COLORS = {
  growing: "#26a69a",
  falling: "#ef5350",
  ma: "#2962ff",
};

export const VolumeIndicator = defineIndicator(class VolumeIndicator {
  constructor() {}

  static id = "Volume@tv-basicstudies";
  static type = "volume";
  static title = "Volume";
  static shortTitle = "Vol";
  static primaryPlot = "vol";
  static studyPaneIndex = null;
  static volumeScaleId = "volume-overlay";

  static plots = [
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
      color: VOL_TV_COLORS.ma,
      overlay: true,
      priceLine: false,
      when: (_inputs, style) => style.maVisible === true,
    },
  ];

  static inputs = [
    { id: "maLength", type: "int", title: "MA Length", defval: 20 },
    {
      id: "colorBasedOnPrevClose",
      type: "bool",
      title: "Color based on previous close",
      defval: false,
    },
  ];

  static defaultStyle() {
    return {
      ...BaseIndicator.defaultStyle(),
      volVisible: true,
      volPriceLine: false,
      volPlotType: "columns",
      growingColor: VOL_TV_COLORS.growing,
      growingOpacity: 50,
      fallingColor: VOL_TV_COLORS.falling,
      fallingOpacity: 50,
      maVisible: false,
      maColor: VOL_TV_COLORS.ma,
      maWidth: 1,
      maStyle: 0,
      maPriceLine: false,
      maPlotType: "line",
    };
  }

  static compute(bars, inputs, style) {
    return computeVolumeIndicator(bars, inputs, style);
  }

  static formatPlotValue(plotKey, raw) {
    if (plotKey !== "vol" || raw == null || !Number.isFinite(raw)) return null;
    const n = Number(raw);
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(Math.round(n));
  }

  static legendParams(instance) {
    return [String(instance.inputs.maLength ?? 20)];
  }

  static plotStyle(instance, plotKey) {
    if (plotKey === "vol") {
      return {
        visible: instance.style.volVisible !== false,
        color: VOL_TV_COLORS.growing,
        width: 1,
        lineStyle: 0,
        priceLine: instance.style.volPriceLine === true,
        title: "",
      };
    }
    const plot = this.getPlotDef(plotKey);
    if (!plot || plot.type !== "line") return BaseIndicator.hiddenPlot();
    return BaseIndicator.linePlotStyle(instance, plotKey, {
      ...plotStyleKeys("ma"),
      label: plot.title,
    });
  }

  static valueLabels(instance) {
    /** @type {{ key: string, title: string }[]} */
    const labels = [{ key: "vol", title: "Volume" }];
    if (instance.style.maVisible === true) {
      labels.push({ key: "ma", title: "Volume MA" });
    }
    return labels;
  }

  static stylePlotRows(_inputValues, _style) {
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
});

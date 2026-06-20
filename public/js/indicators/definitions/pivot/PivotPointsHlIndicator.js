import { BarScriptIndicator } from "../../BarScriptIndicator.js";
import { pivotLens } from "../../math/pivots.js";
import { createInt } from "../../builders.js";

const LABEL_STYLE = {
  textColorH: "#131722",
  labelColorH: "#ffffff",
  textColorL: "#131722",
  labelColorL: "#ffffff",
};

class PivotPointsHlIndicator extends BarScriptIndicator {

  constructor() {
    super("pivot_points_hl", "Pivots HL", "Pivot Points High Low");
    this.setOverlayPrimitive("labels");
    this.setGraphicObjects([{ styleKey: "paneLabels", label: "Pane labels", overlay: "labels" }]);
    this.setInputs([
      createInt("leftLenH", "Pivot High", 10, { section: "LENGTH LEFT / RIGHT", inline: true }),
      createInt("rightLenH", "/", 10, { section: "LENGTH LEFT / RIGHT", inline: true }),
      createInt("leftLenL", "Pivot Low", 10, { section: "LENGTH LEFT / RIGHT", inline: true }),
      createInt("rightLenL", "/", 10, { section: "LENGTH LEFT / RIGHT", inline: true }),
    ]);
  }

  mergeStyleDefaults(style) {
    return {
      ...style,
      textColorH: style.textColorH ?? LABEL_STYLE.textColorH,
      labelColorH: style.labelColorH ?? LABEL_STYLE.labelColorH,
      textColorL: style.textColorL ?? LABEL_STYLE.textColorL,
      labelColorL: style.labelColorL ?? LABEL_STYLE.labelColorL,
    };
  }

  legendParams(instance) {
    return [
      `${instance.inputs.leftLenH ?? 10}/${instance.inputs.rightLenH ?? 10}`,
      `${instance.inputs.leftLenL ?? 10}/${instance.inputs.rightLenL ?? 10}`,
    ];
  }

  onBar() {
    const [leftH, rightH] = pivotLens(this.inputs, "leftLenH", "rightLenH");
    const [leftL, rightL] = pivotLens(this.inputs, "leftLenL", "rightLenL");

    const ph = this.math.pivotHigh(leftH, rightH);
    if (ph != null) {
      this.drawLabel({
        barIndex: this.index - rightH,
        price: ph,
        kind: "high",
        text: this.format.price(ph),
        textColor: this.style.textColorH ?? LABEL_STYLE.textColorH,
        bgColor: this.style.labelColorH ?? LABEL_STYLE.labelColorH,
      });
    }

    const pl = this.math.pivotLow(leftL, rightL);
    if (pl != null) {
      this.drawLabel({
        barIndex: this.index - rightL,
        price: pl,
        kind: "low",
        text: this.format.price(pl),
        textColor: this.style.textColorL ?? LABEL_STYLE.textColorL,
        bgColor: this.style.labelColorL ?? LABEL_STYLE.labelColorL,
      });
    }
  }
}

BarScriptIndicator.define(PivotPointsHlIndicator);

export default PivotPointsHlIndicator;

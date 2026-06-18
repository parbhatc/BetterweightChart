import { safePriceToY, safeTimeToX } from "../../chart/coords/timeScale.js";

const LABEL_FONT_FAMILY =
  `-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif`;
const FONT_SIZE = 12;

/** @param {number} [size] */
function labelFont(size = FONT_SIZE) {
  return `${size}px ${LABEL_FONT_FAMILY}`;
}

/** @param {CanvasRenderingContext2D} ctx @param {string} text @param {number} [fontSize] */
function measureLabelBox(ctx, text, fontSize = FONT_SIZE) {
  ctx.font = labelFont(fontSize);
  const verticalPadding = fontSize / 6 | 0;
  const textImageWidth = Math.ceil(ctx.measureText(text).width) + 1;
  const textImageHeight = fontSize + verticalPadding;
  const stepX = Math.round(fontSize / 1.5);
  const stepY = Math.round(fontSize / 2) - 1;
  return {
    shapeWidth: textImageWidth + 2 * stepX,
    shapeHeight: textImageHeight + 2 * stepY,
    arrowSize: stepX,
  };
}

const CORNER = {
  rightUp: { px: 1, py: 0, nx: 0, ny: 1 },
  rightDown: { px: 0, py: 1, nx: -1, ny: 0 },
  leftDown: { px: -1, py: 0, nx: 0, ny: -1 },
  leftUp: { px: 0, py: -1, nx: 1, ny: 0 },
};

/** @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {typeof CORNER.rightUp} c @param {number} r */
function drawCorner(ctx, x, y, c, r) {
  ctx.lineTo(x - r * c.px, y - r * c.py);
  ctx.arcTo(x, y, x + r * c.nx, y + r * c.ny, r);
}

/** label down — box above anchor, pointer down. */
function drawLabelDown(ctx, cx, tipY, shapeWidth, shapeHeight, arrowSize, bgColor, borderColor) {
  const r = 2;
  const halfW = shapeWidth / 2;
  const leftX = cx - halfW;
  const rightX = cx + halfW;
  const arrowBaseY = tipY - arrowSize;
  const boxTopY = tipY - shapeHeight - arrowSize;
  const leftWingX = cx - arrowSize;
  const rightWingX = cx + arrowSize;

  ctx.beginPath();
  ctx.moveTo(leftWingX, arrowBaseY);
  ctx.lineTo(cx, tipY);
  ctx.lineTo(rightWingX, arrowBaseY);

  if (shapeWidth <= 2 * arrowSize) {
    ctx.lineTo(leftX, arrowBaseY);
    drawCorner(ctx, leftX, boxTopY, CORNER.leftUp, r);
    drawCorner(ctx, rightX, boxTopY, CORNER.rightUp, r);
    ctx.lineTo(rightX, arrowBaseY);
  } else {
    drawCorner(ctx, leftX, arrowBaseY, CORNER.leftDown, r);
    drawCorner(ctx, leftX, boxTopY, CORNER.leftUp, r);
    drawCorner(ctx, rightX, boxTopY, CORNER.rightUp, r);
    drawCorner(ctx, rightX, arrowBaseY, CORNER.rightDown, r);
  }
  ctx.lineTo(leftWingX, arrowBaseY);
  ctx.closePath();

  ctx.fillStyle = bgColor;
  ctx.fill();
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  ctx.lineJoin = "round";
  ctx.lineCap = "butt";
  ctx.stroke();
}

/** label up — box below anchor, pointer up. */
function drawLabelUp(ctx, cx, tipY, shapeWidth, shapeHeight, arrowSize, bgColor, borderColor) {
  const r = 2;
  const halfW = shapeWidth / 2;
  const leftX = cx - halfW;
  const rightX = cx + halfW;
  const arrowBaseY = tipY + arrowSize;
  const boxBottomY = tipY + shapeHeight + arrowSize;
  const leftWingX = cx - arrowSize;
  const rightWingX = cx + arrowSize;

  ctx.beginPath();
  ctx.moveTo(leftWingX, arrowBaseY);
  ctx.lineTo(cx, tipY);
  ctx.lineTo(rightWingX, arrowBaseY);

  if (shapeWidth <= 2 * arrowSize) {
    ctx.lineTo(rightX, arrowBaseY);
    drawCorner(ctx, rightX, boxBottomY, CORNER.rightDown, r);
    drawCorner(ctx, leftX, boxBottomY, CORNER.leftDown, r);
    ctx.lineTo(leftX, arrowBaseY);
  } else {
    drawCorner(ctx, rightX, arrowBaseY, CORNER.rightUp, r);
    drawCorner(ctx, rightX, boxBottomY, CORNER.rightDown, r);
    drawCorner(ctx, leftX, boxBottomY, CORNER.leftDown, r);
    drawCorner(ctx, leftX, arrowBaseY, CORNER.leftUp, r);
  }
  ctx.lineTo(leftWingX, arrowBaseY);
  ctx.closePath();

  ctx.fillStyle = bgColor;
  ctx.fill();
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  ctx.lineJoin = "round";
  ctx.lineCap = "butt";
  ctx.stroke();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} anchorX
 * @param {number} anchorY
 * @param {string} text
 * @param {string} bgColor
 * @param {string} textColor
 * @param {"high"|"low"} kind
 */
function drawLabelCallout(ctx, anchorX, anchorY, text, bgColor, textColor, kind) {
  const { shapeWidth, shapeHeight, arrowSize } = measureLabelBox(ctx, text);
  const cx = Math.round(anchorX);
  const tipY = Math.round(anchorY);
  const isHigh = kind === "high";
  const borderColor = bgColor;

  if (isHigh) {
    drawLabelDown(ctx, cx, tipY, shapeWidth, shapeHeight, arrowSize, bgColor, borderColor);
  } else {
    drawLabelUp(ctx, cx, tipY, shapeWidth, shapeHeight, arrowSize, bgColor, borderColor);
  }

  const textY = isHigh
    ? tipY - arrowSize - shapeHeight / 2
    : tipY + arrowSize + shapeHeight / 2;

  ctx.font = labelFont(FONT_SIZE);
  ctx.fillStyle = textColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, Math.floor(textY));
}

class LabelsPaneRenderer {
  /** @param {() => object} getData */
  constructor(getData) {
    this._getData = getData;
  }

  /** @param {import("fancy-canvas").CanvasRenderingTarget2D} target */
  draw(target) {
    const { labels, timeToX, priceToY } = this._getData();
    if (!labels?.length) return;

    target.useMediaCoordinateSpace(({ context: ctx }) => {
      for (const lbl of labels) {
        const x = timeToX(lbl.time);
        const y = priceToY(lbl.price);
        if (x == null || y == null) continue;

        ctx.save();
        drawLabelCallout(
          ctx,
          x,
          y,
          String(lbl.text ?? ""),
          lbl.bgColor ?? "#ffffff",
          lbl.textColor ?? "#131722",
          lbl.kind === "low" ? "low" : "high",
        );
        ctx.restore();
      }
    });
  }
}

class LabelsPaneView {
  /** @param {LabelsPrimitive} source */
  constructor(source) {
    this._source = source;
  }

  zOrder() {
    return "top";
  }

  renderer() {
    return new LabelsPaneRenderer(() => this._source.drawData());
  }
}

class LabelsPrimitive {
  constructor() {
    /** @type {object[]} */
    this._labels = [];
    /** @type {import("lightweight-charts").IChartApi | null} */
    this._chart = null;
    /** @type {import("lightweight-charts").ISeriesApi | null} */
    this._series = null;
    /** @type {(() => void) | null} */
    this._requestUpdate = null;
    /** @type {(() => void) | null} */
    this._unsub = null;
    this._paneView = new LabelsPaneView(this);
  }

  /** @param {object[]} labels */
  setLabels(labels) {
    this._labels = labels ?? [];
    this._requestUpdate?.();
  }

  requestRefresh() {
    this._requestUpdate?.();
  }

  /** @param {import("lightweight-charts").SeriesAttachedParameter} param */
  attached(param) {
    this._chart = param.chart;
    this._series = param.series;
    this._requestUpdate = param.requestUpdate;
    const ts = this._chart.timeScale();
    const handler = () => this._requestUpdate?.();
    ts.subscribeVisibleLogicalRangeChange(handler);
    this._unsub = () => {
      try {
        ts.unsubscribeVisibleLogicalRangeChange(handler);
      } catch {
        /* ignore */
      }
    };
  }

  detached() {
    this._unsub?.();
    this._unsub = null;
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
  }

  updateAllViews() {}

  paneViews() {
    return [this._paneView];
  }

  drawData() {
    const chart = this._chart;
    const series = this._series;
    if (!chart || !series) {
      return { labels: [], timeToX: () => null, priceToY: () => null };
    }
    const ts = chart.timeScale();
    return {
      labels: this._labels,
      timeToX: (t) => safeTimeToX(ts, t),
      priceToY: (p) => safePriceToY(series, p),
    };
  }
}

/** @param {{ series: import("lightweight-charts").ISeriesApi }} opts */
export function attachLabelsPrimitive(opts) {
  const primitive = new LabelsPrimitive();
  opts.series.attachPrimitive(primitive);
  return {
    setLabels: (labels) => primitive.setLabels(labels),
    requestRefresh: () => primitive.requestRefresh(),
    destroy: () => {
      try {
        opts.series.detachPrimitive(primitive);
      } catch {
        /* ignore */
      }
    },
  };
}

const LABEL_FONT_FAMILY =
  `-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif`;
const FONT_SIZE = 12;

/** @param {number} [paneW] */
function calloutFontSize(paneW) {
  if (!paneW || !Number.isFinite(paneW)) return 10;
  if (paneW < 400) return 8;
  if (paneW < 640) return 9;
  if (paneW < 1024) return 10;
  return 11;
}

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

/** label down — box above anchor, pointer down. @param {number} [cornerR] */
function drawLabelDown(ctx, cx, tipY, shapeWidth, shapeHeight, arrowSize, bgColor, borderColor, cornerR = 2) {
  const r = cornerR;
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

/** label up — box below anchor, pointer up. @param {number} [cornerR] */
function drawLabelUp(ctx, cx, tipY, shapeWidth, shapeHeight, arrowSize, bgColor, borderColor, cornerR = 2) {
  const r = cornerR;
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
 * @param {{ angle?: number, paneW?: number }} [opts]
 */
export function drawLabelCallout(ctx, anchorX, anchorY, text, bgColor, textColor, kind, opts = {}) {
  const angle = opts.angle;
  if (angle != null && Number.isFinite(angle)) {
    drawRotatedLabelCallout(ctx, anchorX, anchorY, text, bgColor, textColor, angle, kind, opts.paneW);
    return;
  }

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

/** @param {number} angle */
function uprightLabelAngle(angle) {
  let a = angle;
  if (a > Math.PI / 2) a -= Math.PI;
  else if (a < -Math.PI / 2) a += Math.PI;
  return a;
}

/**
 * Label box + text rotated parallel to a chart line (SMT-style).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} anchorX
 * @param {number} anchorY
 * @param {string} text
 * @param {string} bgColor
 * @param {string} textColor
 * @param {"high"|"low"} kind
 * @param {number} angle
 * @param {number} [paneW]
 */
function drawRotatedLabelCallout(ctx, anchorX, anchorY, text, bgColor, textColor, angle, kind, paneW) {
  const fontSize = calloutFontSize(paneW);
  const { shapeWidth, shapeHeight, arrowSize } = measureLabelBox(ctx, text, fontSize);
  const a = uprightLabelAngle(angle);
  const isHigh = kind === "high";
  const cornerR = Math.max(2, Math.round(fontSize * 0.22));
  const wing = Math.max(arrowSize, Math.round(fontSize * 0.42));

  ctx.save();
  ctx.translate(Math.round(anchorX), Math.round(anchorY));
  ctx.rotate(a);

  if (isHigh) {
    drawLabelDown(ctx, 0, 0, shapeWidth, shapeHeight, wing, bgColor, bgColor, cornerR);
  } else {
    drawLabelUp(ctx, 0, 0, shapeWidth, shapeHeight, wing, bgColor, bgColor, cornerR);
  }

  const textY = isHigh ? -wing - shapeHeight / 2 : wing + shapeHeight / 2;

  ctx.font = `600 ${fontSize}px ${LABEL_FONT_FAMILY}`;
  ctx.fillStyle = textColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 0, Math.floor(textY));
  ctx.restore();
}

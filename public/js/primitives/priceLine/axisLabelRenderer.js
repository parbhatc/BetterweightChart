/**
 * Faithful port of lightweight-charts PriceAxisViewRenderer
 * (src/renderers/price-axis-view-renderer.ts) + renderer options provider.
 */

const DEFAULT_FONT_FAMILY =
  "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif";

/** Matches symbol price-line label (`priceLineLabel/index.js`). */
export const SCALE_LABEL_H = 18;
export const SCALE_LABEL_FONT_SIZE = 12;
export const SCALE_LABEL_TITLE_FONT_SIZE = 11;
export const STACKED_LABEL_TOP_PAD = 2;
export const STACKED_LABEL_LINE_GAP = 0;
export const STACKED_LABEL_BOTTOM_PAD = 2;

/** @see RendererConstants.TickLength */
export const PRICE_AXIS_TICK_LENGTH = 5;
/** @see RendererConstants.BorderSize */
export const PRICE_AXIS_BORDER_SIZE = 1;

class TextWidthCache {
  constructor() {
    /** @type {Map<string, number>} */
    this._widths = new Map();
  }

  /** @param {CanvasRenderingContext2D} ctx @param {string} text */
  measureText(ctx, text) {
    const key = `${ctx.font}\0${text}`;
    let w = this._widths.get(key);
    if (w == null) {
      w = Math.ceil(ctx.measureText(text).width);
      this._widths.set(key, w);
    }
    return w;
  }

  /** @param {CanvasRenderingContext2D} ctx @param {string} text */
  yMidCorrection(ctx, text) {
    const m = ctx.measureText(text);
    if (!m.actualBoundingBoxAscent && !m.actualBoundingBoxDescent) return 0;
    return (m.actualBoundingBoxDescent - m.actualBoundingBoxAscent) / 2;
  }

  reset() {
    this._widths.clear();
  }
}

const textWidthCache = new TextWidthCache();

/**
 * @param {import("lightweight-charts").IChartApi} chart
 */
export function createPriceAxisRendererOptions(chart) {
  const layout = chart.options().layout;
  const fontSize = layout.fontSize ?? 12;
  const fontFamily = layout.fontFamily ?? DEFAULT_FONT_FAMILY;
  const tickLength = PRICE_AXIS_TICK_LENGTH;

  if (textWidthCache._lastFontSize !== fontSize || textWidthCache._lastFamily !== fontFamily) {
    textWidthCache._lastFontSize = fontSize;
    textWidthCache._lastFamily = fontFamily;
    textWidthCache.reset();
  }

  return {
    borderSize: PRICE_AXIS_BORDER_SIZE,
    tickLength,
    fontSize,
    font: `${fontSize}px ${fontFamily}`,
    fontFamily,
    paddingTop: (2.5 / 12) * fontSize,
    paddingBottom: (2.5 / 12) * fontSize,
    paddingInner: (fontSize / 12) * tickLength,
    paddingOuter: (fontSize / 12) * tickLength,
    paneBackgroundColor: paneBackgroundColor(chart),
  };
}

/** @param {import("lightweight-charts").IChartApi} chart */
function paneBackgroundColor(chart) {
  const bg = chart.options()?.layout?.background;
  if (!bg) return "#ffffff";
  if (bg.type === "solid") return bg.color;
  if (bg.type === "gradient") return bg.topColor ?? "#ffffff";
  return "#ffffff";
}

/** @param {ReturnType<typeof createPriceAxisRendererOptions>} opts */
export function axisLabelHeight(opts) {
  return opts.fontSize + opts.paddingTop + opts.paddingBottom;
}

/** @param {ReturnType<typeof createPriceAxisRendererOptions>} ro @param {boolean} [hasSubtitle] */
export function stackedAxisLabelTotalHeight(ro, hasSubtitle = false) {
  if (!hasSubtitle) return axisLabelHeight(ro);
  return (
    STACKED_LABEL_TOP_PAD +
    SCALE_LABEL_FONT_SIZE +
    STACKED_LABEL_LINE_GAP +
    SCALE_LABEL_TITLE_FONT_SIZE +
    STACKED_LABEL_BOTTOM_PAD
  );
}

/** Distance from stacked block center to close-price text center (price sits on the line). */
export function stackedLabelCenterOffset() {
  const totalH = stackedAxisLabelTotalHeight(
    { fontSize: SCALE_LABEL_FONT_SIZE, paddingTop: 0, paddingBottom: 0 },
    true,
  );
  const priceCenterFromTop = STACKED_LABEL_TOP_PAD + SCALE_LABEL_FONT_SIZE / 2;
  return totalH / 2 - priceCenterFromTop;
}

/**
 * @typedef {object} PriceAxisLabelData
 * @property {string} text
 * @property {boolean} visible
 * @property {boolean} [tickVisible]
 * @property {boolean} [moveTextToInvisibleTick]
 * @property {boolean} [borderVisible]
 * @property {boolean} [separatorVisible]
 * @property {string} color
 */

/**
 * @typedef {object} PriceAxisLabelCommon
 * @property {number} coordinate
 * @property {string} background
 * @property {number} [additionalPaddingTop]
 * @property {number} [additionalPaddingBottom]
 * @property {number} [fixedCoordinate]
 */

/**
 * Draw one price-axis label chip — matches LWC PriceAxisViewRenderer.draw().
 * @param {import("fancy-canvas").CanvasRenderingTarget2D} target
 * @param {PriceAxisLabelData} data
 * @param {PriceAxisLabelCommon} common
 * @param {ReturnType<typeof createPriceAxisRendererOptions>} rendererOptions
 * @param {"left" | "right"} align
 * @param {{ edgeWidth?: number, fillScaleWidth?: boolean }} [opts]
 */
export function drawPriceAxisLabel(target, data, common, rendererOptions, align, opts = {}) {
  if (!data.visible || !data.text.length) return;

  const textColor = data.color;
  const backgroundColor = common.background;
  const tickVisible = data.tickVisible ?? false;
  const moveTextToInvisibleTick = data.moveTextToInvisibleTick ?? false;
  const borderVisible = data.borderVisible ?? false;
  const separatorVisible = data.separatorVisible ?? false;

  const geometry = target.useBitmapCoordinateSpace((scope) => {
    const ctx = scope.context;
    ctx.font = rendererOptions.font;
    const geom = calculateLabelGeometry(scope, {
      text: data.text,
      tickVisible,
      moveTextToInvisibleTick,
      separatorVisible,
      coordinate:
        common.fixedCoordinate ?? common.coordinate,
      additionalPaddingTop: common.additionalPaddingTop ?? 0,
      additionalPaddingBottom: common.additionalPaddingBottom ?? 0,
      rendererOptions,
      align,
      edgeWidth: opts.edgeWidth,
      fillScaleWidth: opts.fillScaleWidth,
    });
    const gb = geom.bitmap;

    if (geom.alignRight) {
      drawRoundRectWithBorder(
        ctx,
        gb.xOutside,
        gb.yTop,
        gb.totalWidth,
        gb.totalHeight,
        backgroundColor,
        gb.horzBorder,
        [gb.radius, 0, 0, gb.radius],
        backgroundColor,
      );
    } else {
      drawRoundRectWithBorder(
        ctx,
        gb.xInside,
        gb.yTop,
        gb.totalWidth,
        gb.totalHeight,
        backgroundColor,
        gb.horzBorder,
        [0, gb.radius, gb.radius, 0],
        backgroundColor,
      );
    }

    if (tickVisible) {
      ctx.fillStyle = textColor;
      ctx.fillRect(gb.xInside, gb.yMid, gb.xTick - gb.xInside, gb.tickHeight);
    }

    if (borderVisible) {
      ctx.fillStyle = rendererOptions.paneBackgroundColor;
      ctx.fillRect(
        geom.alignRight ? gb.right - gb.horzBorder : 0,
        gb.yTop,
        gb.horzBorder,
        gb.yBottom - gb.yTop,
      );
    }

    return geom;
  });

  target.useMediaCoordinateSpace(({ context: ctx }) => {
    const gm = geometry.media;
    const yMid = common.fixedCoordinate ?? common.coordinate;
    ctx.font = rendererOptions.font;
    ctx.textAlign = geometry.alignRight ? "right" : "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = textColor;
    const textY = tickVisible
      ? (gm.yTop + gm.yBottom) / 2 + gm.textMidCorrection
      : yMid;
    ctx.fillText(data.text, gm.xText, textY);
  });
}

/**
 * Price + subtitle as one axis block (same width as price chip, two centered rows).
 * @param {import("fancy-canvas").CanvasRenderingTarget2D} target
 * @param {object} p
 * @param {string} p.priceText
 * @param {string} p.subtitleText
 * @param {number} p.coordinate
 * @param {number} [p.fixedCoordinate]
 * @param {string} p.background
 * @param {string} p.textColor
 * @param {ReturnType<typeof createPriceAxisRendererOptions>} p.rendererOptions
 * @param {"left" | "right"} p.align
 * @param {number} [p.edgeWidth]
 */
export function drawStackedPriceAxisLabel(target, p) {
  if (!p.priceText || !p.subtitleText) return;

  const ro = p.rendererOptions;
  const centerY = p.fixedCoordinate ?? p.coordinate;
  const totalH = stackedAxisLabelTotalHeight(ro, true);
  const topY = centerY - totalH / 2;
  const priceTop = topY + STACKED_LABEL_TOP_PAD;
  const subTop = priceTop + SCALE_LABEL_FONT_SIZE + STACKED_LABEL_LINE_GAP;
  const priceY = priceTop + SCALE_LABEL_FONT_SIZE / 2;
  const alignRight = p.align === "right";

  const layout = target.useBitmapCoordinateSpace((scope) => {
    const { context: ctx, horizontalPixelRatio, verticalPixelRatio } = scope;

    ctx.font = ro.font;
    const priceGeom = calculateLabelGeometry(scope, {
      text: p.priceText,
      tickVisible: false,
      moveTextToInvisibleTick: false,
      separatorVisible: false,
      coordinate: priceY,
      rendererOptions: ro,
      align: p.align,
      edgeWidth: p.edgeWidth,
    });

    const gb = priceGeom.bitmap;
    const blockTopBitmap = Math.round(topY * verticalPixelRatio);
    const blockHeightBitmap = Math.round(totalH * verticalPixelRatio);
    const cornerRadii = alignRight ? [gb.radius, 0, 0, gb.radius] : [0, gb.radius, gb.radius, 0];

    drawRoundRectWithBorder(
      ctx,
      gb.xOutside,
      blockTopBitmap,
      gb.totalWidth,
      blockHeightBitmap,
      p.background,
      0,
      cornerRadii,
      p.background,
    );

    const blockLeft = gb.xOutside / horizontalPixelRatio;
    const blockRight = blockLeft + gb.totalWidth / horizontalPixelRatio;

    return {
      blockCenterX: (blockLeft + blockRight) / 2,
      priceTop,
      subTop,
    };
  });

  target.useMediaCoordinateSpace(({ context: ctx }) => {
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = p.textColor;

    ctx.font = scaleLabelFont(ro.fontFamily, SCALE_LABEL_FONT_SIZE);
    ctx.fillText(p.priceText, layout.blockCenterX, layout.priceTop);

    ctx.font = scaleLabelFont(ro.fontFamily, SCALE_LABEL_TITLE_FONT_SIZE);
    ctx.fillText(p.subtitleText, layout.blockCenterX, layout.subTop);
  });
}

/**
 * Title + price as one adjacent pair on the price scale (LWC custom price line look).
 * @param {import("fancy-canvas").CanvasRenderingTarget2D} target
 * @param {object} p
 * @param {string} [p.title]
 * @param {string} p.priceText
 * @param {number} p.coordinate
 * @param {number} [p.fixedCoordinate]
 * @param {string} p.background
 * @param {string} p.textColor
 * @param {ReturnType<typeof createPriceAxisRendererOptions>} p.rendererOptions
 * @param {"left" | "right"} p.align
 */
export function drawCompositePriceAxisLabel(target, p) {
  if (!p.priceText) return;

  const coordinate = p.fixedCoordinate ?? p.coordinate;
  const ro = p.rendererOptions;
  const alignRight = p.align === "right";
  const title = p.title ?? "";

  if (!title) {
    drawPriceAxisLabel(
      target,
      {
        text: p.priceText,
        visible: true,
        tickVisible: true,
        moveTextToInvisibleTick: false,
        color: p.textColor,
      },
      { coordinate: p.coordinate, fixedCoordinate: p.fixedCoordinate, background: p.background },
      ro,
      p.align,
    );
    return;
  }

  const geometry = target.useBitmapCoordinateSpace((scope) => {
    const { context: ctx, horizontalPixelRatio, verticalPixelRatio, mediaSize } = scope;
    ctx.font = ro.font;

    const priceW = measureChipWidth(ctx, p.priceText, ro, false);
    const titleW = measureChipWidth(ctx, title, ro, false);

    let priceLeft;
    let priceRight;
    let titleLeft;
    let titleRight;

    if (alignRight) {
      priceRight = mediaSize.width;
      priceLeft = priceRight - priceW;
      titleRight = priceLeft;
      titleLeft = titleRight - titleW;
    } else {
      priceLeft = 0;
      priceRight = priceW;
      titleLeft = priceRight;
      titleRight = titleLeft + titleW;
    }

    const priceGeom = geometryForChipBounds(scope, {
      text: p.priceText,
      left: priceLeft,
      right: priceRight,
      coordinate,
      separatorVisible: false,
      rendererOptions: ro,
      align: p.align,
    });

    const titleGeom = geometryForChipBounds(scope, {
      text: title,
      left: titleLeft,
      right: titleRight,
      coordinate,
      separatorVisible: true,
      rendererOptions: ro,
      align: p.align,
    });

    drawChipBackground(ctx, priceGeom, p.background, alignRight, false);
    drawChipBackground(ctx, titleGeom, p.background, alignRight, true, ro.paneBackgroundColor);

    return { priceGeom, titleGeom };
  });

  target.useMediaCoordinateSpace(({ context: ctx }) => {
    ctx.font = ro.font;
    ctx.textBaseline = "middle";
    ctx.fillStyle = p.textColor;

    ctx.textAlign = alignRight ? "right" : "left";
    const pg = geometry.priceGeom.media;
    ctx.fillText(
      geometry.priceGeom.text,
      pg.xText,
      (pg.yTop + pg.yBottom) / 2 + pg.textMidCorrection,
    );

    const tg = geometry.titleGeom.media;
    ctx.fillText(
      geometry.titleGeom.text,
      tg.xText,
      (tg.yTop + tg.yBottom) / 2 + tg.textMidCorrection,
    );
  });
}

/** @param {CanvasRenderingContext2D} ctx @param {string} text @param {ReturnType<typeof createPriceAxisRendererOptions>} ro @param {boolean} withSeparator */
function measureChipWidth(ctx, text, ro, withSeparator) {
  const tickSize = 0;
  const horzBorder = withSeparator ? ro.borderSize : 0;
  const textWidth = textWidthCache.measureText(ctx, text);
  return ro.borderSize + ro.paddingInner + ro.paddingOuter + textWidth + tickSize + horzBorder;
}

/**
 * @param {import("fancy-canvas").BitmapCoordinatesRenderingScope} scope
 * @param {object} p
 */
function geometryForChipBounds(scope, p) {
  const { context: ctx, horizontalPixelRatio, verticalPixelRatio } = scope;
  const ro = p.rendererOptions;
  const text = p.text;
  const chipW = p.right - p.left;
  const tickHeightBitmap = Math.max(1, Math.floor(verticalPixelRatio));
  const paddingTop = ro.paddingTop;
  const paddingBottom = ro.paddingBottom;
  const paddingInner = ro.paddingInner;
  const totalHeight = ro.fontSize + paddingTop + paddingBottom;
  let totalHeightBitmap = Math.round(totalHeight * verticalPixelRatio);
  if (totalHeightBitmap % 2 !== tickHeightBitmap % 2) totalHeightBitmap += 1;

  const yMid = p.coordinate;
  const yMidBitmap = Math.round(yMid * verticalPixelRatio) - Math.floor(verticalPixelRatio * 0.5);
  const yTopBitmap = Math.floor(yMidBitmap + tickHeightBitmap / 2 - totalHeightBitmap / 2);
  const yBottomBitmap = yTopBitmap + totalHeightBitmap;

  const xLeftBitmap = Math.round(p.left * horizontalPixelRatio);
  const xRightBitmap = Math.round(p.right * horizontalPixelRatio);
  const totalWidthBitmap = xRightBitmap - xLeftBitmap;
  const radius = 2 * horizontalPixelRatio;
  const horzBorderBitmap =
    p.separatorVisible && ro.borderSize > 0
      ? Math.max(1, Math.floor(ro.borderSize * horizontalPixelRatio))
      : 0;
  const textMidCorrection = textWidthCache.yMidCorrection(ctx, text);
  const alignRight = p.align === "right";

  const xText = alignRight
    ? p.right - ro.paddingInner - (p.separatorVisible ? ro.borderSize : 0)
    : p.left + ro.paddingInner + (p.separatorVisible ? ro.borderSize : 0);

  return {
    text,
    bitmap: {
      xLeft: xLeftBitmap,
      yTop: yTopBitmap,
      yBottom: yBottomBitmap,
      totalWidth: totalWidthBitmap,
      totalHeight: totalHeightBitmap,
      radius,
      horzBorder: horzBorderBitmap,
      alignRight,
      separatorVisible: p.separatorVisible,
    },
    media: {
      yTop: yTopBitmap / verticalPixelRatio,
      yBottom: yBottomBitmap / verticalPixelRatio,
      xText,
      textMidCorrection,
    },
  };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {ReturnType<typeof geometryForChipBounds>} geom
 * @param {string} background
 * @param {boolean} alignRight
 * @param {boolean} isTitle
 * @param {string} [separatorColor]
 */
function drawChipBackground(ctx, geom, background, alignRight, isTitle, separatorColor) {
  const gb = geom.bitmap;
  const cornerRadii = isTitle
    ? alignRight
      ? [gb.radius, 0, 0, gb.radius]
      : [0, gb.radius, gb.radius, 0]
    : alignRight
      ? [0, gb.radius, gb.radius, 0]
      : [gb.radius, 0, 0, gb.radius];

  drawRoundRectWithBorder(
    ctx,
    gb.xLeft,
    gb.yTop,
    gb.totalWidth,
    gb.totalHeight,
    background,
    0,
    cornerRadii,
    background,
  );

  if (isTitle && geom.bitmap.separatorVisible && separatorColor) {
    const sepX = alignRight
      ? gb.xLeft + gb.totalWidth - gb.horzBorder
      : gb.xLeft;
    ctx.fillStyle = separatorColor;
    ctx.fillRect(sepX, gb.yTop, gb.horzBorder, gb.yBottom - gb.yTop);
  }
}

/**
 * @param {import("fancy-canvas").BitmapCoordinatesRenderingScope} scope
 * @param {object} p
 */
function calculateLabelGeometry(scope, p) {
  const { context: ctx, bitmapSize, mediaSize, horizontalPixelRatio, verticalPixelRatio } =
    scope;
  const ro = p.rendererOptions;
  const tickSize =
    p.tickVisible || !p.moveTextToInvisibleTick ? ro.tickLength : 0;
  const horzBorder = p.separatorVisible ? ro.borderSize : 0;
  const paddingTop = ro.paddingTop + p.additionalPaddingTop;
  const paddingBottom = ro.paddingBottom + p.additionalPaddingBottom;
  const paddingInner = ro.paddingInner;
  const paddingOuter = ro.paddingOuter;
  const text = p.text;
  const actualTextHeight = ro.fontSize;
  const textMidCorrection = textWidthCache.yMidCorrection(ctx, text);
  const textWidth = textWidthCache.measureText(ctx, text);
  const totalHeight = actualTextHeight + paddingTop + paddingBottom;
  let totalWidth = ro.borderSize + paddingInner + paddingOuter + textWidth + tickSize;
  const useTickLayout = tickSize > 0;
  const tickHeightBitmap = useTickLayout ? Math.max(1, Math.floor(verticalPixelRatio)) : 0;
  let totalHeightBitmap = Math.round(totalHeight * verticalPixelRatio);
  if (tickHeightBitmap > 0 && totalHeightBitmap % 2 !== tickHeightBitmap % 2) {
    totalHeightBitmap += 1;
  }
  const horzBorderBitmap =
    horzBorder > 0 ? Math.max(1, Math.floor(horzBorder * horizontalPixelRatio)) : 0;
  const tickSizeBitmap = Math.round(tickSize * horizontalPixelRatio);
  const yMid = p.coordinate;
  const yMidBitmap = useTickLayout
    ? Math.round(yMid * verticalPixelRatio) - Math.floor(verticalPixelRatio * 0.5)
    : Math.round(yMid * verticalPixelRatio);
  const yTopBitmap = useTickLayout
    ? Math.floor(yMidBitmap + tickHeightBitmap / 2 - totalHeightBitmap / 2)
    : Math.round(yMid * verticalPixelRatio - totalHeightBitmap / 2);
  const yBottomBitmap = yTopBitmap + totalHeightBitmap;
  const alignRight = p.align === "right";
  const mediaW = p.edgeWidth ?? mediaSize.width;
  const edgeBitmap = Math.round(mediaW * horizontalPixelRatio);

  const xInside = alignRight ? mediaW - horzBorder : horzBorder;
  const xInsideBitmap = alignRight ? edgeBitmap - horzBorderBitmap : horzBorderBitmap;

  let xOutsideBitmap;
  let xTickBitmap;
  let xText;
  let totalWidthBitmap;

  if (p.fillScaleWidth && alignRight) {
    xOutsideBitmap = 0;
    totalWidthBitmap = Math.max(1, xInsideBitmap - xOutsideBitmap);
    xTickBitmap = xInsideBitmap;
    xText = xInside - tickSize - paddingInner - horzBorder;
  } else if (p.fillScaleWidth && !alignRight) {
    xOutsideBitmap = xInsideBitmap;
    totalWidthBitmap = Math.max(1, edgeBitmap - xOutsideBitmap);
    xTickBitmap = xInsideBitmap + tickSizeBitmap;
    xText = xInside + tickSize + paddingInner;
  } else {
    totalWidthBitmap = Math.round(totalWidth * horizontalPixelRatio);
    if (alignRight) {
      xOutsideBitmap = xInsideBitmap - totalWidthBitmap;
      xTickBitmap = xInsideBitmap - tickSizeBitmap;
      xText = xInside - tickSize - paddingInner - horzBorder;
    } else {
      xOutsideBitmap = xInsideBitmap;
      xTickBitmap = xInsideBitmap + tickSizeBitmap;
      xText = xInside + tickSize + paddingInner;
    }
  }

  return {
    alignRight,
    bitmap: {
      yTop: yTopBitmap,
      yMid: yMidBitmap,
      yBottom: yBottomBitmap,
      totalWidth: totalWidthBitmap,
      totalHeight: totalHeightBitmap,
      radius: 2 * horizontalPixelRatio,
      horzBorder: horzBorderBitmap,
      xOutside: xOutsideBitmap,
      xInside: xInsideBitmap,
      xTick: xTickBitmap,
      tickHeight: tickHeightBitmap,
      right: edgeBitmap,
    },
    media: {
      yTop: yTopBitmap / verticalPixelRatio,
      yBottom: yBottomBitmap / verticalPixelRatio,
      xText,
      textMidCorrection,
    },
  };
}

/** @param {[number, number, number, number]} radii @param {number} offset */
function changeBorderRadius(radii, offset) {
  return radii.map((x) => (x === 0 ? x : x + offset));
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} left
 * @param {number} top
 * @param {number} width
 * @param {number} height
 * @param {string} backgroundColor
 * @param {number} [borderWidth]
 * @param {[number, number, number, number]} [outerBorderRadius]
 * @param {string} [borderColor]
 */
function drawRoundRectWithBorder(
  ctx,
  left,
  top,
  width,
  height,
  backgroundColor,
  borderWidth = 0,
  outerBorderRadius = [0, 0, 0, 0],
  borderColor = "",
) {
  ctx.save();

  if (!borderWidth || !borderColor || borderColor === backgroundColor) {
    drawRoundRect(ctx, left, top, width, height, outerBorderRadius);
    ctx.fillStyle = backgroundColor;
    ctx.fill();
    ctx.restore();
    return;
  }

  const halfBorderWidth = borderWidth / 2;
  const radii = changeBorderRadius(outerBorderRadius, -halfBorderWidth);

  drawRoundRect(
    ctx,
    left + halfBorderWidth,
    top + halfBorderWidth,
    width - borderWidth,
    height - borderWidth,
    radii,
  );

  if (backgroundColor !== "transparent") {
    ctx.fillStyle = backgroundColor;
    ctx.fill();
  }

  if (borderColor !== "transparent") {
    ctx.lineWidth = borderWidth;
    ctx.strokeStyle = borderColor;
    ctx.closePath();
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {[number, number, number, number]} radii
 */
function drawRoundRect(ctx, x, y, w, h, radii) {
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, radii);
    return;
  }
  const [rtl, rtr, rbr, rbl] = radii;
  ctx.lineTo(x + w - rtr, y);
  if (rtr !== 0) ctx.arcTo(x + w, y, x + w, y + rtr, rtr);
  ctx.lineTo(x + w, y + h - rbr);
  if (rbr !== 0) ctx.arcTo(x + w, y + h, x + w - rbr, y + h, rbr);
  ctx.lineTo(x + rbl, y + h);
  if (rbl !== 0) ctx.arcTo(x, y + h, x, y + h - rbl, rbl);
  ctx.lineTo(x, y + rtl);
  if (rtl !== 0) ctx.arcTo(x, y, x + rtl, y, rtl);
}

/** @param {typeof DEFAULT_FONT_FAMILY} [fontFamily] @param {number} [size] */
export function scaleLabelFont(fontFamily = DEFAULT_FONT_FAMILY, size = SCALE_LABEL_FONT_SIZE) {
  return `600 ${size}px ${fontFamily}`;
}

/**
 * Full-width price-scale badge — same visual language as the symbol price label.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} p
 * @param {number} p.top
 * @param {number} p.width
 * @param {string} p.color
 * @param {string} p.priceText
 * @param {boolean} p.onRight
 * @param {string} [p.title]
 * @param {string} [p.textColor]
 */
export function drawFullWidthScaleLabel(ctx, p) {
  const {
    top,
    width,
    color,
    priceText,
    onRight,
    title = "",
    textColor = "#ffffff",
  } = p;
  const h = SCALE_LABEL_H;
  const midY = top + h / 2;
  const rtl = onRight ? 2 : 0;
  const rtr = onRight ? 0 : 2;
  const rbr = onRight ? 0 : 2;
  const rbl = onRight ? 2 : 0;

  if (!title) {
    drawRoundRect(ctx, 0, top, width, h, [rtl, rtr, rbr, rbl]);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.fillStyle = textColor;
    ctx.font = scaleLabelFont();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(priceText, width / 2, midY);
    return h;
  }

  ctx.font = scaleLabelFont(DEFAULT_FONT_FAMILY, SCALE_LABEL_TITLE_FONT_SIZE);
  const minTitleW = Math.ceil(ctx.measureText(title).width) + 12;
  const titleW = Math.min(Math.max(minTitleW, 34), Math.max(34, width - 48));
  const priceW = width - titleW;
  const titleX = onRight ? 0 : priceW;
  const priceX = onRight ? titleW : 0;

  drawRoundRect(ctx, titleX, top, titleW, h, [rtl, rtr, rbr, rbl]);
  ctx.fillStyle = color;
  ctx.fill();

  drawRoundRect(
    ctx,
    priceX,
    top,
    priceW,
    h,
    onRight ? [0, rtr, rbr, 0] : [rtl, 0, 0, rbl],
  );
  ctx.fillStyle = color;
  ctx.fill();

  const dividerX = onRight ? titleW : priceW;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(dividerX + 0.5, top + 3);
  ctx.lineTo(dividerX + 0.5, top + h - 3);
  ctx.stroke();

  ctx.fillStyle = textColor;
  ctx.textBaseline = "middle";
  ctx.font = scaleLabelFont(DEFAULT_FONT_FAMILY, SCALE_LABEL_TITLE_FONT_SIZE);
  ctx.textAlign = "center";
  ctx.fillText(title, titleX + titleW / 2, midY);
  ctx.font = scaleLabelFont();
  ctx.fillText(priceText, priceX + priceW / 2, midY);

  return h;
}

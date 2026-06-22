import { safePriceToY } from "../../chart/coords/timeScale.js";

const LABEL_H = 18;
const LABEL_GAP = 2;
const FONT =
  "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif";

/**
 * @param {number} aTop
 * @param {number} aBottom
 * @param {number} bTop
 * @param {number} bBottom
 */
function rectsOverlap(aTop, aBottom, bTop, bBottom) {
  return aTop < bBottom + LABEL_GAP && aBottom + LABEL_GAP > bTop;
}

/**
 * @param {import("lightweight-charts").ISeriesApi} series
 * @param {{ price: number, color: string, text: string }[]} labels
 * @param {{ price: number, labelHeight?: number }[]} reserved
 */
export function resolveStudyLabelPositions(series, labels, reserved) {
  /** @type {{ top: number, bottom: number, anchorPrice?: number, fixed?: boolean }[]} */
  const placed = [];
  const symbolPrice = reserved[0]?.price;

  for (const anchor of reserved) {
    const y = safePriceToY(series, anchor.price);
    if (y == null || !Number.isFinite(y)) continue;
    const h = anchor.labelHeight ?? LABEL_H;
    placed.push({
      top: y - h / 2,
      bottom: y + h / 2,
      anchorPrice: anchor.price,
      fixed: true,
    });
  }

  const items = labels
    .map((label) => ({ ...label, naturalY: safePriceToY(series, label.price) }))
    .filter((item) => item.naturalY != null && Number.isFinite(item.naturalY))
    .sort((a, b) => a.naturalY - b.naturalY);

  /** @type {{ price: number, color: string, text: string, centerY: number }[]} */
  const out = [];
  for (const item of items) {
    let top = item.naturalY - LABEL_H / 2;

    for (let pass = 0; pass < placed.length + 8; pass += 1) {
      const overlap = placed.find((slot) =>
        rectsOverlap(top, top + LABEL_H, slot.top, slot.bottom),
      );
      if (!overlap) break;

      const refPrice = overlap.anchorPrice ?? symbolPrice;
      if (refPrice != null && Number.isFinite(refPrice)) {
        if (item.price > refPrice) {
          top = overlap.top - LABEL_H - LABEL_GAP;
        } else if (item.price < refPrice) {
          top = overlap.bottom + LABEL_GAP;
        } else {
          top = overlap.top - LABEL_H - LABEL_GAP;
        }
        continue;
      }

      const naturalCenter = item.naturalY;
      const slotCenter = (overlap.top + overlap.bottom) / 2;
      top =
        naturalCenter <= slotCenter
          ? overlap.top - LABEL_H - LABEL_GAP
          : overlap.bottom + LABEL_GAP;
    }

    placed.push({ top, bottom: top + LABEL_H });
    out.push({ ...item, centerY: top + LABEL_H / 2 });
  }
  return out;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number} rtl
 * @param {number} rtr
 * @param {number} rbr
 * @param {number} rbl
 */
function roundRect(ctx, x, y, w, h, rtl, rtr, rbr, rbl) {
  const maxR = Math.min(w / 2, h / 2);
  const tl = Math.min(rtl, maxR);
  const tr = Math.min(rtr, maxR);
  const br = Math.min(rbr, maxR);
  const bl = Math.min(rbl, maxR);
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
  ctx.lineTo(x + bl, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
  ctx.lineTo(x, y + tl);
  ctx.quadraticCurveTo(x, y, x + tl, y);
  ctx.closePath();
}

class StudyScaleLabelsPrimitive {
  /** @param {() => object} getConfig */
  constructor(getConfig) {
    /** @type {import("lightweight-charts").IChartApi | null} */
    this._chart = null;
    /** @type {import("lightweight-charts").ISeriesApi | null} */
    this._series = null;
    /** @type {(() => void) | null} */
    this._requestUpdate = null;
    this._getConfig = getConfig;
    this._axisPaneView = new StudyScaleLabelsAxisPaneView(this);
    /** @type {(() => void) | null} */
    this._unsub = null;
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
    const onRange = () => this._requestUpdate?.();
    ts.subscribeVisibleLogicalRangeChange(onRange);
    this._unsub = () => ts.unsubscribeVisibleLogicalRangeChange(onRange);
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
    return [];
  }

  priceAxisPaneViews() {
    return [this._axisPaneView];
  }

  layoutData() {
    const config = this._getConfig();
    const chart = this._chart;
    const series = this._series;
    if (!config?.enabled || !chart || !series) return { visible: false, items: [] };

    const scaleId = config.scaleId ?? "right";
    const scaleW = chart.priceScale(scaleId).width();
    if (scaleW <= 0) return { visible: false, items: [] };

    const labels = config.getLabels?.() ?? [];
    if (!labels.length) return { visible: false, items: [] };

    const reserved = config.getReservedAnchors?.() ?? [];
    const items = resolveStudyLabelPositions(series, labels, reserved);
    if (!items.length) return { visible: false, items: [] };

    return { visible: true, scaleId, items };
  }
}

class StudyScaleLabelsAxisPaneView {
  /** @param {StudyScaleLabelsPrimitive} source */
  constructor(source) {
    this._source = source;
  }

  zOrder() {
    return "top";
  }

  renderer() {
    return new StudyScaleLabelsAxisPaneRenderer(this._source);
  }
}

class StudyScaleLabelsAxisPaneRenderer {
  /** @param {StudyScaleLabelsPrimitive} source */
  constructor(source) {
    this._source = source;
  }

  draw(target) {
    const data = this._source.layoutData();
    if (!data.visible || !data.items?.length) return;

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const width = mediaSize.width;
      const onRight = data.scaleId !== "left";
      const rtl = onRight ? 2 : 0;
      const rtr = onRight ? 0 : 2;
      const rbr = onRight ? 0 : 2;
      const rbl = onRight ? 2 : 0;

      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `600 12px ${FONT}`;

      for (const item of data.items) {
        const top = Math.round(item.centerY - LABEL_H / 2);
        ctx.fillStyle = item.color;
        roundRect(ctx, 0, top, width, LABEL_H, rtl, rtr, rbr, rbl);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.fillText(item.text, width / 2, top + LABEL_H / 2);
      }

      ctx.restore();
    });
  }
}

/**
 * @param {object} opts
 * @param {import("lightweight-charts").ISeriesApi} opts.series
 * @param {() => object} opts.getConfig
 */
export function attachStudyScaleLabelsPrimitive(opts) {
  const primitive = new StudyScaleLabelsPrimitive(opts.getConfig);
  opts.series.attachPrimitive(primitive);
  return {
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

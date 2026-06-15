import { timeToBarIndex, barIndexToTime } from "../../../../chart/coords/timeScale.js";
import {
  chartAngleFromPoints,
  normalizeAngleDeg,
  resolveTrendAngleDeg,
  retargetEndFromAngle,
  secondPointForAngle,
} from "../../../tools/line/trendAngle.js";
import {
  axisLineCoordFields,
  supportsAxisLineStyleSettings,
} from "../../../tools/axis/lines.js";
import {
  isParallelChannelTool,
  resolvePriceOffset,
  widthAnchorPoint,
} from "../../../tools/channel/parallel.js";
import { isFibRetracementTool, supportsFibStyleSettings } from "../../../tools/fib/retracement.js";
import { isRegressionTrendTool } from "../../../tools/regression/trend.js";
import { finalizeDisjointChannelDrawing, isDisjointChannelTool } from "../../../tools/channel/disjoint.js";
import { isTrendAngleTool } from "../../../registry/tools.js";
import { defaultVisibility } from "../utils.js";

/**
 * @param {import("../../../types.js").UserDrawing} drawing
 * @param {() => { bars: { time: number }[], barSec?: number, precision?: number }} getContext
 */
export function pointsFromDrawing(drawing, getContext) {
  if (isDisjointChannelTool(drawing.type)) {
    return (finalizeDisjointChannelDrawing(drawing).points ?? drawing.points).map((p) => ({ ...p }));
  }
  const pts = drawing.points.map((p) => ({ ...p }));
  if (!isTrendAngleTool(drawing.type) || pts.length >= 2 || !pts[0]) return pts;
  const { barSec = 60 } = getContext();
  return [pts[0], secondPointForAngle(pts[0], resolveTrendAngleDeg(drawing), barSec * 5)];
}

/**
 * @param {HTMLElement} coordsPanel
 * @param {string | undefined} drawingType
 * @param {import("../../../types.js").DrawPoint[]} points
 * @param {number | undefined} angle
 * @param {number | undefined} priceOffset
 * @param {() => { bars: { time: number }[], barSec?: number, precision?: number }} getContext
 */
export function buildCoordsPanel(coordsPanel, drawingType, points, angle, priceOffset, getContext) {
  const { bars, barSec = 60 } = getContext();
  const precision = getContext().precision ?? 2;
  const type = String(drawingType ?? "");
  const trendAngle = isTrendAngleTool(type);
  const parallelChannel = isParallelChannelTool(type);
  const regressionTrend = isRegressionTrendTool(type);
  const fibRetracement = supportsFibStyleSettings(type);
  const fibThreePoint =
    type === "fib-extension" ||
    type === "fib-channel" ||
    type === "trend-based-fib-time" ||
    type === "fib-wedge";
  const disjointChannel = isDisjointChannelTool(type);
  const axisFields = supportsAxisLineStyleSettings(type) ? axisLineCoordFields(type) : null;
  const coordPoints = trendAngle
    ? points.slice(0, 1)
    : parallelChannel || regressionTrend || fibThreePoint
      ? points.slice(0, 3)
      : fibRetracement
        ? points.slice(0, 2)
        : disjointChannel
          ? points.slice(0, 4)
          : points;

  let html = coordPoints
    .map((p, i) => {
      const barIdx = timeToBarIndex(p.time, bars, barSec);
      let head = `#${i + 1}`;
      if (trendAngle) head = "#1 (price, bar)";
      else if (parallelChannel || fibRetracement || fibThreePoint) head = `#${i + 1} (price, bar)`;
      else if (disjointChannel) head = `#${i + 1}`;
      else if (regressionTrend) head = `#${i + 1}`;
      else if (axisFields) head = axisFields.head;

      if (regressionTrend) {
        return `<div class="tv-set__section">
          <div class="tv-set__section-head">${head}</div>
          <div class="tv-set__section-body tv-set__section-body--fields">
            <div class="tv-set__field-row">
              <span class="tv-set__field-label">Bar</span>
              <input type="text" class="tv-drawing-settings__input" data-coord-bar="${i}" inputmode="numeric" value="${barIdx}" />
            </div>
          </div>
        </div>`;
      }

      const priceRow =
        !axisFields || axisFields.price
          ? axisFields && axisFields.price && !axisFields.bar
            ? `<input type="text" class="tv-drawing-settings__input" data-coord-price="${i}" inputmode="decimal" value="${Number(p.price).toFixed(precision)}" />`
            : `<div class="tv-set__field-row">
              <span class="tv-set__field-label">Price</span>
              <input type="text" class="tv-drawing-settings__input" data-coord-price="${i}" inputmode="decimal" value="${Number(p.price).toFixed(precision)}" />
            </div>`
          : "";
      const barRow =
        !axisFields || axisFields.bar
          ? axisFields && axisFields.bar && !axisFields.price
            ? `<input type="text" class="tv-drawing-settings__input" data-coord-bar="${i}" inputmode="numeric" value="${barIdx}" />`
            : `<div class="tv-set__field-row">
              <span class="tv-set__field-label">Bar</span>
              <input type="text" class="tv-drawing-settings__input" data-coord-bar="${i}" inputmode="numeric" value="${barIdx}" />
            </div>`
          : "";

      if (axisFields && !axisFields.price && axisFields.bar) {
        return `<div class="tv-set__section">
          <div class="tv-set__section-head">${head}</div>
          <div class="tv-set__section-body tv-set__section-body--fields">
            ${barRow}
          </div>
        </div>`;
      }

      if (axisFields && axisFields.price && !axisFields.bar) {
        return `<div class="tv-set__section">
          <div class="tv-set__section-head">${head}</div>
          <div class="tv-set__section-body tv-set__section-body--fields">
            ${priceRow}
          </div>
        </div>`;
      }

      return `<div class="tv-set__section">
          <div class="tv-set__section-head">${head}</div>
          <div class="tv-set__section-body tv-set__section-body--fields">
            ${priceRow}
            ${barRow}
          </div>
        </div>`;
    })
    .join("");

  if (trendAngle) {
    const angleValue = normalizeAngleDeg(Number(angle ?? 0));
    html += `<div class="tv-set__section">
        <div class="tv-set__section-head">Angle</div>
        <div class="tv-set__section-body tv-set__section-body--fields">
          <div class="tv-set__field-row">
            <span class="tv-set__field-label">Angle</span>
            <input type="text" class="tv-drawing-settings__input" data-coord-angle inputmode="decimal" value="${angleValue.toFixed(2)}" />
          </div>
        </div>
      </div>`;
  }

  if (parallelChannel) {
    const offsetValue = resolvePriceOffset({ points, priceOffset });
    html += `<div class="tv-set__section">
        <div class="tv-set__section-head">Price offset</div>
        <div class="tv-set__section-body tv-set__section-body--fields">
          <input type="text" class="tv-drawing-settings__input" data-coord-price-offset inputmode="decimal" value="${offsetValue.toFixed(precision)}" />
        </div>
      </div>`;
  }

  coordsPanel.innerHTML = html;
}

/**
 * @param {HTMLElement} coordsPanel
 * @param {HTMLElement} visibilityList
 * @param {Record<string, unknown>} draft
 * @param {() => { bars: { time: number }[], barSec?: number, precision?: number }} getContext
 */
export function readCoordsFromUi(coordsPanel, visibilityList, draft, getContext) {
  const points = [...(draft.points ?? [])];
  coordsPanel.querySelectorAll("[data-coord-price]").forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return;
    const i = Number(input.dataset.coordPrice);
    const price = Number(input.value);
    if (points[i] && Number.isFinite(price)) points[i] = { ...points[i], price };
  });
  coordsPanel.querySelectorAll("[data-coord-bar]").forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return;
    const i = Number(input.dataset.coordBar);
    const barIdx = Number(input.value);
    const { bars, barSec = 60 } = getContext();
    const time = barIndexToTime(barIdx, bars, barSec);
    if (points[i] && time != null && Number.isFinite(time)) {
      points[i] = { ...points[i], time };
    }
  });

  const visibility = { ...defaultVisibility({ visibility: draft.visibility }) };
  visibilityList.querySelectorAll("[data-vis-btn]").forEach((btn) => {
    if (!(btn instanceof HTMLButtonElement)) return;
    const key = btn.dataset.visBtn;
    if (key) visibility[key] = btn.classList.contains("tv-set__check--on");
  });

  const drawingType = String(draft.drawingType ?? "");
  const trendAngle = isTrendAngleTool(drawingType);
  const parallelChannel = isParallelChannelTool(drawingType);
  const angleInput = coordsPanel.querySelector("[data-coord-angle]");
  let angle = draft.angle;
  if (angleInput instanceof HTMLInputElement) {
    const parsed = Number(angleInput.value);
    if (Number.isFinite(parsed)) angle = normalizeAngleDeg(parsed);
  }

  let nextPoints = [...points];
  if (trendAngle && nextPoints[0]) {
    const prevAnchor = draft.points?.[0];
    const prevEnd = draft.points?.[1];
    if (prevAnchor && prevEnd) {
      const dt = nextPoints[0].time - prevAnchor.time;
      const dp = nextPoints[0].price - prevAnchor.price;
      nextPoints = [
        nextPoints[0],
        { time: prevEnd.time + dt, price: prevEnd.price + dp },
      ];
    }
    const endRef = nextPoints[1] ?? prevEnd;
    if (endRef) {
      nextPoints[1] = retargetEndFromAngle(nextPoints[0], angle, endRef);
      angle = chartAngleFromPoints(nextPoints[0], nextPoints[1]);
    }
  }

  let priceOffset = draft.priceOffset;
  if (parallelChannel && nextPoints[0] && nextPoints[1]) {
    const offsetInput = coordsPanel.querySelector("[data-coord-price-offset]");
    if (offsetInput instanceof HTMLInputElement) {
      const parsed = Number(offsetInput.value);
      if (Number.isFinite(parsed)) priceOffset = parsed;
    }
    const p2 = widthAnchorPoint(nextPoints[0], nextPoints[1], Number(priceOffset ?? 0));
    nextPoints = [nextPoints[0], nextPoints[1], p2];
  }

  return {
    points: trendAngle ? nextPoints : parallelChannel ? nextPoints : points,
    angle: trendAngle ? angle : draft.angle,
    priceOffset: parallelChannel ? priceOffset : draft.priceOffset,
    visibility,
  };
}

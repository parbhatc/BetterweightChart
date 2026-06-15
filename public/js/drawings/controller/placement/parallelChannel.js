import {
  buildParallelChannelPreview,
  parallelChannelDraft,
  priceOffsetFromVerticalCursor,
} from "../../tools/channel/parallel.js";
/**
 * @param {import("../../types.js").DrawPoint[]} staged
 * @param {import("../../types.js").DrawPoint} point
 * @param {string} toolType
 */
export function parallelChannelPointerDown(staged, point, toolType) {
  if (staged.length === 0) {
    staged.push(point);
    return { preview: buildParallelChannelPreview(toolType, staged, point) };
  }
  if (staged.length === 1) {
    staged.push(point);
    return {
      preview: parallelChannelDraft(toolType, [staged[0], point], { priceOffset: 0 }),
    };
  }
  const p0 = staged[0];
  const p1 = staged[1];
  const priceOffset = priceOffsetFromVerticalCursor(p0, p1, point);
  return {
    commit: parallelChannelDraft(toolType, [p0, p1], { priceOffset }),
  };
}

/**
 * @param {import("../../types.js").DrawPoint[]} staged
 * @param {import("../../types.js").DrawPoint} point
 * @param {string} toolType
 */
export function parallelChannelPointerMove(staged, point, toolType) {
  if (!staged.length) return null;
  return buildParallelChannelPreview(toolType, staged, point);
}

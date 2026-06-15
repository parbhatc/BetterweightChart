import {
  buildFlatTopBottomPreview,
  flatPriceFromVerticalCursor,
  flatTopBottomDraft,
} from "../../tools/channel/flatTopBottom.js";

/**
 * @param {import("../../types.js").DrawPoint[]} staged
 * @param {import("../../types.js").DrawPoint} point
 * @param {string} toolType
 */
export function flatTopBottomPointerDown(staged, point, toolType) {
  if (staged.length === 0) {
    staged.push(point);
    return { preview: buildFlatTopBottomPreview(toolType, staged, point) };
  }
  if (staged.length === 1) {
    staged.push(point);
    return {
      preview: flatTopBottomDraft(toolType, [staged[0], point], { flatPrice: point.price }),
    };
  }
  const p0 = staged[0];
  const p1 = staged[1];
  const flatPrice = flatPriceFromVerticalCursor(point);
  return {
    commit: flatTopBottomDraft(toolType, [p0, p1], { flatPrice }),
  };
}

/**
 * @param {import("../../types.js").DrawPoint[]} staged
 * @param {import("../../types.js").DrawPoint} point
 * @param {string} toolType
 */
export function flatTopBottomPointerMove(staged, point, toolType) {
  if (!staged.length) return null;
  return buildFlatTopBottomPreview(toolType, staged, point);
}

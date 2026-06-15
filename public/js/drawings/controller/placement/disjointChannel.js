import {
  buildDisjointChannelPreview,
  disjointChannelDraft,
  disjointChannelPointsFromGeometry,
} from "../../tools/channel/disjoint.js";

/**
 * @param {import("../../types.js").DrawPoint[]} staged
 * @param {import("../../types.js").DrawPoint} point
 * @param {string} toolType
 */
export function disjointChannelPointerDown(staged, point, toolType) {
  if (staged.length === 0) {
    staged.push(point);
    return { preview: buildDisjointChannelPreview(toolType, staged, point) };
  }
  if (staged.length === 1) {
    staged.push(point);
    return { preview: disjointChannelDraft(toolType, [staged[0], point]) };
  }
  const p0 = staged[0];
  const p1 = staged[1];
  return {
    commit: disjointChannelDraft(toolType, disjointChannelPointsFromGeometry(p0, p1, point)),
  };
}

/**
 * @param {import("../../types.js").DrawPoint[]} staged
 * @param {import("../../types.js").DrawPoint} point
 * @param {string} toolType
 */
export function disjointChannelPointerMove(staged, point, toolType) {
  if (!staged.length) return null;
  return buildDisjointChannelPreview(toolType, staged, point);
}

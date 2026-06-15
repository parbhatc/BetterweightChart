import { newDrawingStyleDefaults } from "../../toolbars/drawingDefaultsStore.js";

let idSeq = 1;

/** @param {string} type @param {import("../types.js").DrawPoint[]} points */
export function newDrawing(type, points) {
  /** @type {Record<string, unknown>} */
  const extendDefaults =
    type === "extended-line"
      ? { extendLeft: true, extendRight: true }
      : type === "ray"
        ? { extendLeft: false, extendRight: true }
        : type === "trend-line" || type === "info-line"
          ? { extendLeft: false, extendRight: false }
          : type === "text" || type === "text-annotation"
            ? { label: "Text" }
            : type === "note"
              ? { label: "Note" }
              : type === "callout" || type === "comment"
                ? { label: "Comment" }
                : {};
  return {
    id: `d${idSeq++}`,
    type,
    points,
    locked: false,
    ...newDrawingStyleDefaults(type),
    ...extendDefaults,
  };
}

/** Pine color.new(rgb, transparency) — 0 = opaque, 100 = invisible. */
export class PineColors {
  static rgb(r, g, b, transparency = 0) {
    const a = Math.max(0, Math.min(1, (100 - transparency) / 100));
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  static fvgStyle(r, g, b, transparency) {
    const c = PineColors.rgb(r, g, b, transparency);
    return { fill: c, border: c, label: PineColors.rgb(r, g, b, 0) };
  }

  static htfStyle(r, g, b, bgTransparency, borderTransparency) {
    return {
      fill: PineColors.rgb(r, g, b, bgTransparency),
      border: PineColors.rgb(r, g, b, borderTransparency),
      label: PineColors.rgb(r, g, b, 0),
    };
  }

  /** TradingView built-in color RGB values. */
  static tv = {
    green: [0, 128, 0],
    red: [255, 0, 0],
    teal: [0, 128, 128],
    maroon: [128, 0, 0],
    orange: [255, 165, 0],
  };
}

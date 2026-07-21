import { BaseIndicator } from "../../BaseIndicator.js";

/** Indicator-library entry backed by an internal two-anchor range overlay. */
class FixedRangeVolumeProfileIndicator extends BaseIndicator {
  static placementTool = "fixed-range-volume-profile";

  constructor() {
    super("fixed_range_volume_profile", "FRVP", "Fixed Range Volume Profile");
  }

  static createInstance() {
    return null;
  }
}

BaseIndicator.define(FixedRangeVolumeProfileIndicator);

export default FixedRangeVolumeProfileIndicator;

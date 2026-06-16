/** Chart feature ids (`disabled_features` / `enabled_features` at boot). */
export const CHART_FEATURES = {
  FUTURE_WHITESPACE: "future_whitespace",
};

/** Features off unless listed in `enabled_features`. */
const DEFAULT_OFF = new Set();

/**
 * @typedef {object} FeatureFlags
 * @property {(name: string) => boolean} isEnabled
 * @property {(name: string) => boolean} isDisabled
 */

/** @type {FeatureFlags | null} */
let bootFeatureFlags = null;

/** @param {FeatureFlags | null} flags */
export function setBootFeatureFlags(flags) {
  bootFeatureFlags = flags;
}

/** @returns {FeatureFlags | null} */
export function getBootFeatureFlags() {
  return bootFeatureFlags;
}

/** @param {string} name */
export function isFeatureEnabled(name) {
  if (!bootFeatureFlags) return !DEFAULT_OFF.has(name);
  return bootFeatureFlags.isEnabled(name);
}

/**
 * @param {object} [opts]
 * @param {string[]} [opts.disabled_features]
 * @param {string[]} [opts.enabled_features]
 * @returns {FeatureFlags}
 */
export function createFeatureFlags(opts = {}) {
  const disabled = new Set(
    Array.isArray(opts.disabled_features) ? opts.disabled_features.map(String) : [],
  );
  const enabled = Array.isArray(opts.enabled_features)
    ? new Set(opts.enabled_features.map(String))
    : null;

  return {
    isEnabled(name) {
      if (disabled.has(name)) return false;
      if (DEFAULT_OFF.has(name)) return enabled?.has(name) ?? false;
      return true;
    },
    isDisabled(name) {
      return !this.isEnabled(name);
    },
  };
}

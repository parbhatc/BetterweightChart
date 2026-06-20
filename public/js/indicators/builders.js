/** @typedef {import("./types.js").InputDef} InputDef */
/** @typedef {import("./types.js").PlotDef} PlotDef */
/** @typedef {import("./types.js").FillDef} FillDef */
/** @typedef {import("./types.js").InputFieldDef} InputFieldDef */

/** @param {string} id @param {string} title @param {string} color @param {Partial<PlotDef>} [extra] */
export function plot(id, title, color, extra = {}) {
  return {
    id,
    title,
    color,
    priceLine: false,
    ...extra,
  };
}

/** @param {string} id @param {string} upper @param {string} lower @param {string} title @param {string} color @param {Partial<FillDef>} [extra] */
export function fill(id, upper, lower, title, color, extra = {}) {
  return {
    id,
    upper,
    lower,
    title,
    color,
    opacity: 10,
    ...extra,
  };
}

/**
 * @param {InputDef["type"] | string} type
 * @param {string} id
 * @param {string} [title]
 * @param {InputDef["defval"]} [defval]
 * @param {Partial<InputDef>} [extra]
 */
export function createInput(type, id, title, defval, extra = {}) {
  return { id, type, ...(title != null ? { title } : {}), ...(defval !== undefined ? { defval } : {}), ...extra };
}

/** @param {string} id @param {string} title @param {number} defval @param {Partial<InputFieldDef>} [extra] */
export function createInt(id, title, defval, extra = {}) {
  return createInput("int", id, title, defval, extra);
}

/** @param {string} id @param {string} title @param {number} defval @param {Partial<InputFieldDef>} [extra] */
export function createFloat(id, title, defval, extra = {}) {
  return createInput("float", id, title, defval, extra);
}

/** @param {string} id @param {string} title @param {boolean} [defval] @param {Partial<InputFieldDef>} [extra] */
export function createBool(id, title, defval = false, extra = {}) {
  return createInput("bool", id, title, defval, extra);
}

/**
 * @param {string} id
 * @param {string} title
 * @param {string} defval
 * @param {{ id: string, label: string }[]} options
 * @param {Partial<InputFieldDef>} [extra]
 */
export function createSelect(id, title, defval, options, extra = {}) {
  return createInput("select", id, title, defval, { options, ...extra });
}

/** @param {string} id @param {string} title @param {string} [defval] @param {Partial<InputFieldDef>} [extra] */
export function createSource(id, title, defval = "close", extra = {}) {
  return createInput("source", id, title, defval, extra);
}

/** @param {string} id @param {string} title @param {string} [defval] @param {Partial<InputFieldDef>} [extra] */
export function createText(id, title, defval = "", extra = {}) {
  return createInput("text", id, title, defval, extra);
}

/** @param {string} id @param {string} title @param {{ color: string, opacity?: number } | string} defval @param {Partial<InputFieldDef>} [extra] */
export function createColor(id, title, defval, extra = {}) {
  return createInput("color", id, title, defval, extra);
}

/** @param {string} id @param {string} title @param {string} [defval] @param {Partial<InputFieldDef>} [extra] */
export function createTimeframe(id, title, defval = "chart", extra = {}) {
  return createInput("timeframe", id, title, defval, extra);
}

/** @param {string} id @param {string} title @param {string} [defval] @param {Partial<InputFieldDef>} [extra] */
export function createSymbol(id, title, defval = "", extra = {}) {
  return createInput("symbol", id, title, defval, extra);
}

/**
 * @param {string} section
 * @param {InputFieldDef} left
 * @param {InputFieldDef} right
 * @param {{ header?: string } & Partial<InputDef>} [extra]
 */
export function inlinePair(section, left, right, extra = {}) {
  return { type: "inlinePair", section, left, right, ...extra };
}

/** @param {string} type @param {string} id @param {InputDef["defval"]} defval @param {Partial<InputDef>} [extra] */
export function createField(type, id, defval, extra = {}) {
  return { type, id, defval, ...extra };
}

/** @param {InputDef[]} [more] */
export function calcInputs(more = []) {
  return [
    createTimeframe("timeframe", "Timeframe", "chart", { section: "Calculation" }),
    createBool("waitForClose", "Wait for timeframe closes", true, { section: "Calculation" }),
    ...more,
  ];
}

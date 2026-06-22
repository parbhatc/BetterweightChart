/**
 * Order-line demos (testing site, localhost + fake feed only).
 *
 * Console:
 *   __BWC_TEST_ORDER__.createDefaultOrderline()       — pill on right, offset 20
 *   __BWC_TEST_ORDER__.createDefaultOrderline(40)     — offset 40px from right
 *   __BWC_TEST_ORDER__.setPillOffset(60)              — move active lines
 *   __BWC_TEST_ORDER__.clear()
 */

/** @type {object[]} */
const activeLines = [];

const DEFAULT_PILL_OFFSET = 20;

/** @param {object[]} bars */
function lastPrice(bars) {
  const last = bars.at(-1);
  if (!last) return null;
  return Number.isFinite(last.close) ? last.close : last.open;
}

function clear() {
  for (const line of activeLines.splice(0)) {
    try {
      line.remove();
    } catch {
      //
    }
  }
}

/**
 * @param {number | { pillOffset?: number } | undefined} offsetOrOpts
 */
function resolvePillOffset(offsetOrOpts) {
  if (typeof offsetOrOpts === "number" && Number.isFinite(offsetOrOpts)) {
    return Math.max(0, offsetOrOpts);
  }
  if (offsetOrOpts && typeof offsetOrOpts === "object" && offsetOrOpts.pillOffset != null) {
    const n = Number(offsetOrOpts.pillOffset);
    return Number.isFinite(n) ? Math.max(0, n) : DEFAULT_PILL_OFFSET;
  }
  return DEFAULT_PILL_OFFSET;
}

/**
 * @param {object} widget
 * @param {number | { pillOffset?: number } | undefined} [offsetOrOpts]
 */
async function createDefaultOrderline(widget, offsetOrOpts) {
  const price = lastPrice(widget.getBars());
  if (price == null) return null;

  const line = await widget.chart().createOrderLine();
  if (!line) return null;

  const pillOffset = resolvePillOffset(offsetOrOpts);

  line
    .setPrice(price)
    .setText("Limit Buy")
    .setQuantity("1")
    .setPillSide("right")
    .setPillOffset(pillOffset)
    .setCancelTooltip("Cancel order");

  line.onCancel(() => {
    line.remove();
    const i = activeLines.indexOf(line);
    if (i >= 0) activeLines.splice(i, 1);
  });

  activeLines.push(line);
  console.info("[BWC:test-order] default order line @", price, { pillOffset });
  return line;
}

/** @param {number} offset */
function setPillOffset(offset) {
  const pillOffset = Math.max(0, Number(offset) || 0);
  for (const line of activeLines) {
    line.setPillOffset(pillOffset);
  }
  return pillOffset;
}

/**
 * @param {object} widget
 * @param {{ auto?: boolean }} [opts]
 */
export function mountOrderTestDev(widget, opts = {}) {
  const auto = opts.auto !== false;

  const api = {
    createDefaultOrderline: (offsetOrOpts) => createDefaultOrderline(widget, offsetOrOpts),
    setPillOffset: (offset) => setPillOffset(offset),
    clear,
  };

  if (typeof window !== "undefined") {
    window.__BWC_TEST_ORDER__ = api;
  }

  if (auto) {
    widget.onChartReady?.(() => {
      void createDefaultOrderline(widget);
    });
  }

  console.info(
    "[BWC:test-order] .createDefaultOrderline() | .createDefaultOrderline(40) | .setPillOffset(n)",
  );
  return api;
}

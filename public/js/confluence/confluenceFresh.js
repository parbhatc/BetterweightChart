/** Default max age when callers omit an explicit limit (setup engines pass per-setup values). */
const DEFAULT_MAX_AGE_SEC = 3600;

export class ConfluenceFresh {
  /**
   * @param {number | null | undefined} eventTime unix
   * @param {number | null | undefined} anchorUnix unix
   * @param {number} [maxAgeSec]
   */
  static isFresh(eventTime, anchorUnix, maxAgeSec = DEFAULT_MAX_AGE_SEC) {
    if (anchorUnix == null || eventTime == null || !Number.isFinite(eventTime)) return true;
    return anchorUnix - eventTime < maxAgeSec;
  }

  /**
   * @param {Array<{ time: number }>} items
   * @param {number | null | undefined} anchorUnix
   * @param {number} [maxAgeSec]
   */
  static filterFresh(items, anchorUnix, maxAgeSec = DEFAULT_MAX_AGE_SEC) {
    if (anchorUnix == null) return items ?? [];
    return (items ?? []).filter((item) => ConfluenceFresh.isFresh(item.time, anchorUnix, maxAgeSec));
  }
}

export const isConfluenceFresh = (...a) => ConfluenceFresh.isFresh(...a);
export const filterFreshConfluences = (...a) => ConfluenceFresh.filterFresh(...a);

/** @param {object} msg */
export function packTvMessage(msg) {
  const json = JSON.stringify(msg);
  return `~m~${json.length}~m~${json}`;
}

/** @param {string | number} id */
export function packTvHeartbeat(id) {
  const body = `~h~${id}`;
  return `~m~${body.length}~m~${body}`;
}

/**
 * @param {string} raw
 * @returns {Array<{ type: "json", data: object } | { type: "heartbeat", id: number }>}
 */
export function unpackTvFrames(raw) {
  /** @type {Array<{ type: "json", data: object } | { type: "heartbeat", id: number }>} */
  const out = [];
  const re = /~m~(\d+)~m~/g;
  let match;
  while ((match = re.exec(raw)) !== null) {
    const len = Number(match[1]);
    const start = match.index + match[0].length;
    const chunk = raw.slice(start, start + len);
    if (chunk.startsWith("~h~")) {
      out.push({ type: "heartbeat", id: Number(chunk.slice(3)) });
      continue;
    }
    try {
      out.push({ type: "json", data: JSON.parse(chunk) });
    } catch {
      // ignore partial/invalid frames
    }
  }
  return out;
}

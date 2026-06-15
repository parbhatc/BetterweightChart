/**
 * TradingView ~m~ frame codec (from TradingViewWS messageUtils).
 * @see https://github.com/parbhatc/TradingViewWS
 */

/** @param {object} message */
export function encodeMessage(message) {
  const jsonString = JSON.stringify(message);
  return `~m~${jsonString.length}~m~${jsonString}`;
}

/** @param {number} timestamp */
export function encodeHeartbeat(timestamp) {
  const heartbeatData = `~h~${timestamp}`;
  return `~m~${heartbeatData.length}~m~${heartbeatData}`;
}

/** @param {string} rawMessage */
export function decodeMessage(rawMessage) {
  /** @type {object[]} */
  const messages = [];
  const parts = rawMessage.split("~m~").filter((p) => p.length > 0);

  for (let i = 0; i < parts.length; i += 2) {
    const lengthStr = parts[i];
    const data = parts[i + 1];
    if (!data) continue;

    const expectedLength = parseInt(lengthStr, 10);

    if (data.startsWith("~h~")) {
      messages.push({
        heartbeat: true,
        timestamp: parseInt(data.replace("~h~", ""), 10),
        raw: `~m~${lengthStr}~m~${data}`,
      });
      continue;
    }

    try {
      const parsed = JSON.parse(data);
      messages.push({
        ...parsed,
        m: parsed.m,
        p: parsed.p ?? [],
        raw: `~m~${lengthStr}~m~${data}`,
        decoded: true,
        warning: data.length !== expectedLength ? `len ${data.length} != ${expectedLength}` : undefined,
      });
    } catch (e) {
      messages.push({
        error: "Failed to parse JSON",
        errorMessage: e instanceof Error ? e.message : String(e),
        raw: `~m~${lengthStr}~m~${data.substring(0, 120)}`,
        decoded: false,
      });
    }
  }

  return messages;
}

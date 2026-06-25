import { tradeseaConfig, tradeseaConfigured } from "./config.mjs";

const APP_ORIGIN = "https://app.tradesea.ai";

/** @type {import("./types.mjs").TradeseaServerConfig | null} */
let cachedConfig = null;

function cfg() {
  if (!cachedConfig) cachedConfig = tradeseaConfig();
  return cachedConfig;
}

/** @param {import("./types.mjs").TradeseaServerConfig} config */
function authCookie(config) {
  const parts = [];
  if (config.accessToken) parts.push(`access_token=${config.accessToken}`);
  if (config.refreshToken) parts.push(`refresh_token=${config.refreshToken}`);
  return parts.join("; ");
}

/** @param {import("./types.mjs").TradeseaServerConfig} config */
function upstreamHeaders(config, extra = {}) {
  const headers = {
    accept: "application/json",
    origin: APP_ORIGIN,
    referer: `${APP_ORIGIN}/`,
    ...extra,
  };
  const cookie = authCookie(config);
  if (cookie) headers.cookie = cookie;
  return headers;
}

/**
 * @param {string} subPath e.g. `history` or `symbols`
 * @param {URLSearchParams} params
 */
async function fetchAurenUdf(subPath, params) {
  const config = cfg();
  const q = new URLSearchParams(params);
  if (config.accountId) q.set("accountId", config.accountId);
  const url = `${config.aurenApi}/tradesea/proxy/udf/${subPath}?${q}`;
  const res = await fetch(url, {
    headers: {
      ...upstreamHeaders(config),
      authorization: `Bearer ${config.aurenJwt}`,
    },
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(
      res.ok
        ? "Invalid JSON from Auren Tradesea proxy"
        : `Auren Tradesea proxy failed (${res.status})`,
    );
  }
  if (!res.ok) {
    const err = data?.error || data?.message || data?.errmsg;
    throw new Error(err || `Auren Tradesea proxy failed (${res.status})`);
  }
  return data;
}

/**
 * @param {string} instrumentsPath e.g. `/v1/all/symbols`
 * @param {URLSearchParams} [params]
 */
async function fetchAurenInstruments(instrumentsPath, params = new URLSearchParams()) {
  const config = cfg();
  const q = new URLSearchParams(params);
  if (config.accountId) q.set("accountId", config.accountId);
  const path = instrumentsPath.startsWith("/") ? instrumentsPath.slice(1) : instrumentsPath;
  const query = q.toString();
  const url = `${config.aurenApi}/tradesea/proxy/instruments/${path}${query ? `?${query}` : ""}`;
  const res = await fetch(url, {
    headers: {
      ...upstreamHeaders(config),
      authorization: `Bearer ${config.aurenJwt}`,
    },
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Invalid JSON from Auren instruments proxy (${res.status})`);
  }
  if (!res.ok) {
    throw new Error(data?.error || data?.message || `Instruments proxy failed (${res.status})`);
  }
  return data;
}

/**
 * @param {string} subPath
 * @param {URLSearchParams} params
 */
async function fetchDirectUdf(subPath, params) {
  const config = cfg();
  const q = new URLSearchParams(params);
  q.set("connection-user-id", config.connectionUserId);
  q.set("connection-group-id", config.connectionGroupId);
  const url = `${config.udfOrigin}/${subPath}?${q}`;
  const res = await fetch(url, { headers: upstreamHeaders(config) });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Invalid JSON from Tradesea UDF (${res.status})`);
  }
  if (!res.ok) {
    throw new Error(data?.errmsg || data?.message || `Tradesea UDF failed (${res.status})`);
  }
  return data;
}

/** @param {string} path @param {URLSearchParams} [params] */
async function fetchDirectInstruments(path, params = new URLSearchParams()) {
  const config = cfg();
  const q = params.toString();
  const url = `${config.instrumentsOrigin}${path}${q ? `?${q}` : ""}`;
  const res = await fetch(url, { headers: upstreamHeaders(config) });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Invalid JSON from Tradesea instruments (${res.status})`);
  }
  if (!res.ok) {
    throw new Error(data?.message || `Tradesea instruments failed (${res.status})`);
  }
  return data;
}

/** @param {string} subPath @param {URLSearchParams} params */
export async function fetchTradeseaUdf(subPath, params) {
  const config = cfg();
  if (!tradeseaConfigured(config)) {
    throw new Error(
      "Tradesea not configured — set AUREN_JWT + TRADESEA_ACCOUNT_ID (Auren proxy) or TRADESEA_ACCESS_TOKEN + connection ids (direct).",
    );
  }
  if (config.mode === "auren") return fetchAurenUdf(subPath, params);
  return fetchDirectUdf(subPath, params);
}

/** @param {string} path @param {URLSearchParams} [params] */
export async function fetchTradeseaInstruments(path, params) {
  const config = cfg();
  if (!tradeseaConfigured(config)) {
    throw new Error("Tradesea not configured");
  }
  if (config.mode === "auren") return fetchAurenInstruments(path, params);
  return fetchDirectInstruments(path, params);
}

export function getTradeseaRuntimeConfig() {
  const config = cfg();
  return {
    configured: tradeseaConfigured(config),
    mode: config.mode,
    delayed: config.delayed,
    hasAccountId: Boolean(config.accountId),
  };
}

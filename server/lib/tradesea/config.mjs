/** Tradesea delayed market-data origins (sandbox / RD accounts). */
export const TRADESEA_DELAYED = {
  MDS_STREAM: "wss://api-mds-stream-delayed.tradesea.ai/v1/wss",
  UDF: "https://api-udf-delayed.tradesea.ai/v1",
  INSTRUMENTS: "https://api-instruments-delayed.tradesea.ai",
};

/** Tradesea live / prod market-data origins. */
export const TRADESEA_PROD = {
  MDS_STREAM: "wss://prod-market-data.tradesea.ai/v1/wss",
  UDF: "https://prod-market-data.tradesea.ai/v1",
  INSTRUMENTS: "https://api-instruments-delayed.tradesea.ai",
};

/** @returns {import("./types.mjs").TradeseaServerConfig} */
export function tradeseaConfig() {
  const aurenApi = (
    process.env.AUREN_API_URL ||
    process.env.BWC_AUREN_API_URL ||
    "http://127.0.0.1:3001/api"
  ).replace(/\/$/, "");
  const aurenJwt = process.env.AUREN_JWT || process.env.BWC_AUREN_JWT || "";
  const accountId = process.env.TRADESEA_ACCOUNT_ID || process.env.BWC_TRADESEA_ACCOUNT_ID || "";
  const hasDirect =
    Boolean(process.env.TRADESEA_ACCESS_TOKEN) &&
    Boolean(process.env.TRADESEA_CONNECTION_USER_ID) &&
    Boolean(process.env.TRADESEA_CONNECTION_GROUP_ID);
  const mode =
    process.env.BWC_TRADESEA_MODE ||
    (aurenJwt && accountId ? "auren" : hasDirect ? "direct" : aurenJwt ? "auren" : "direct");

  const delayed =
    process.env.TRADESEA_DELAYED === "1" || process.env.TRADESEA_DELAYED === "true";
  const origins = delayed ? TRADESEA_DELAYED : TRADESEA_PROD;

  return {
    mode,
    aurenApi,
    aurenJwt,
    accountId,
    accessToken: process.env.TRADESEA_ACCESS_TOKEN || "",
    refreshToken: process.env.TRADESEA_REFRESH_TOKEN || "",
    connectionUserId: process.env.TRADESEA_CONNECTION_USER_ID || "",
    connectionGroupId: process.env.TRADESEA_CONNECTION_GROUP_ID || "",
    udfOrigin: (process.env.TRADESEA_UDF_ORIGIN || origins.UDF).replace(/\/$/, ""),
    instrumentsOrigin: (process.env.TRADESEA_INSTRUMENTS_ORIGIN || origins.INSTRUMENTS).replace(
      /\/$/,
      "",
    ),
    mdsStreamBase: (process.env.TRADESEA_MDS_ORIGIN || origins.MDS_STREAM).replace(/\/$/, ""),
    connectionGroupId: process.env.TRADESEA_CONNECTION_GROUP_ID || "",
    delayed,
  };
}

/** @param {import("./types.mjs").TradeseaServerConfig} cfg */
export function tradeseaConfigured(cfg) {
  if (cfg.mode === "auren") {
    return Boolean(cfg.aurenJwt && cfg.accountId);
  }
  return Boolean(
    cfg.accessToken && cfg.connectionUserId && cfg.connectionGroupId,
  );
}

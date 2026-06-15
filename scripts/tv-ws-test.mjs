const date = new Date().toISOString().replace(/\.\d{3}Z$/, "");
const url = `wss://widgetdata.tradingview.com/socket.io/websocket?from=embed-widget%2Ftradingview-datafeed%2F&date=${encodeURIComponent(date)}&page-uri=charting-library.tradingview-widget.com%2F&ancestor-origin=charting-library.tradingview-widget.com`;

function pack(msg) {
  const s = JSON.stringify(msg);
  return `~m~${s.length}~m~${s}`;
}

const ws = new WebSocket(url, {
  headers: {
    Origin: "https://www.tradingview.com",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  },
});
const chartSession = `cs_${Math.random().toString(36).slice(2, 10)}`;
let gotBars = false;

ws.addEventListener("open", () => {
  console.log("OPEN");
  ws.send(pack({ m: "set_auth_token", p: ["unauthorized_user_token"] }));
  ws.send(pack({ m: "set_locale", p: ["en", "US"] }));
  ws.send(pack({ m: "chart_create_session", p: [chartSession, ""] }));
  const sym = '={"adjustment":"splits","symbol":"NASDAQ:AAPL"}';
  ws.send(pack({ m: "resolve_symbol", p: [chartSession, "sds_sym_1", sym] }));
  ws.send(pack({ m: "create_series", p: [chartSession, "sds_1", "s1", "sds_sym_1", "5", 50, ""] }));
});

ws.addEventListener("message", (ev) => {
  const raw = String(ev.data);
  const parts = raw.split(/~m~\d+~m~/).filter(Boolean);
  for (const part of parts) {
    if (part.startsWith("~h~")) continue;
    try {
      const msg = JSON.parse(part);
      if (msg.m === "symbol_resolved") console.log("FULL", JSON.stringify(msg.p[2], null, 2).slice(0, 2000));
      else if (msg.m) console.log(msg.m, JSON.stringify(msg).slice(0, 200));
      if (msg.m === "timescale_update" || msg.m === "du") gotBars = true;
    } catch {
      // ignore
    }
  }
});

setTimeout(() => {
  console.log("done", gotBars);
  ws.close();
  process.exit(0);
}, 10000);

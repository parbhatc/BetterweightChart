import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chartConfig } from "./lib/fakeBars.mjs";
import {
  allSymbols,
  datafeedConfig,
  historyBars,
  resolveSymbol,
  searchDatafeed,
} from "./lib/datafeed.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PUBLIC = path.resolve(ROOT, "public");
const PORT = Number(process.env.PORT) || 3460;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

const HDR = { "X-Chart-Api": "custom-lightweight-chart" };

function json(res, status, body) {
  res.writeHead(status, { ...HDR, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

function safePublic(relPath) {
  const rel = path.normalize(decodeURIComponent(relPath)).replace(/^(\.\.(\/|\\|$))+/, "");
  const full = path.resolve(PUBLIC, rel);
  if (!full.startsWith(PUBLIC + path.sep) && full !== PUBLIC) return null;
  return full;
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath);
  const cacheable = ext === ".mjs" || ext === ".js" || ext === ".css";
  res.writeHead(200, {
    ...HDR,
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": cacheable ? "public, max-age=86400" : "no-store",
  });
  fs.createReadStream(filePath).pipe(res);
}

function parseUrl(req) {
  const u = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  return { pathname: u.pathname.replace(/\/+$/, "") || "/", searchParams: u.searchParams };
}

async function handleDatafeed(pathname, sp, res) {
  if (pathname === "/datafeed/config") {
    json(res, 200, datafeedConfig());
    return true;
  }

  if (pathname === "/datafeed/search") {
    const query = sp.get("query") || "";
    const limit = sp.get("limit");
    json(res, 200, searchDatafeed(query, limit != null ? Number(limit) : 25));
    return true;
  }

  if (pathname === "/datafeed/symbols") {
    const symbol = sp.get("symbol") || "";
    const info = resolveSymbol(symbol);
    if (!info) {
      json(res, 200, { s: "error", errmsg: `Unknown symbol: ${symbol}` });
      return true;
    }
    json(res, 200, info);
    return true;
  }

  if (pathname === "/datafeed/history") {
    const payload = historyBars({
      symbol: sp.get("symbol") || "NQ",
      resolution: sp.get("resolution") || "1",
      from: sp.get("from"),
      to: sp.get("to"),
      countback: sp.get("countback"),
    });
    const { bars, meta, ...udf } = payload;
    void bars;
    void meta;
    json(res, 200, udf);
    return true;
  }

  if (pathname.startsWith("/datafeed/")) {
    json(res, 404, { s: "error", errmsg: "Unknown datafeed route" });
    return true;
  }

  return false;
}

async function handleApi(pathname, sp, res) {
  if (pathname === "/api/health") {
    json(res, 200, {
      ok: true,
      service: "custom-lightweight-chart",
      version: "1.0.0",
      datafeed: "/datafeed/config",
      endpoints: {
        config: "/datafeed/config",
        search: "/datafeed/search?query=nq",
        symbols: "/datafeed/symbols?symbol=NQ",
        history: "/datafeed/history?symbol=NQ&resolution=1&countback=500",
      },
      pages: { chart: "/", embed: "/embed?symbol=NQ&theme=dark&drawings=1" },
    });
    return true;
  }

  if (pathname === "/api/v1/config") {
    json(res, 200, chartConfig());
    return true;
  }

  if (pathname === "/api/v1/symbols") {
    json(res, 200, { symbols: allSymbols() });
    return true;
  }

  if (pathname.startsWith("/api/")) {
    json(res, 404, { error: "Unknown API route", path: pathname });
    return true;
  }

  return false;
}

function handleRequest(req, res) {
  const { pathname, searchParams } = parseUrl(req);

  if (req.method !== "GET" && req.method !== "HEAD") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  void handleDatafeed(pathname, searchParams, res).then((handled) => {
    if (handled) return;

    void handleApi(pathname, searchParams, res).then((apiHandled) => {
      if (apiHandled) return;

      let filePathname = pathname === "/" ? "/index.html" : pathname;
      if (!path.extname(filePathname)) {
        const asHtml = safePublic(`${filePathname.slice(1)}.html`);
        const asIndex = safePublic(path.join(filePathname.slice(1), "index.html"));
        filePathname = asHtml && fs.existsSync(asHtml) ? `${filePathname}.html` : filePathname;
        if (!path.extname(filePathname) && asIndex && fs.existsSync(asIndex)) {
          filePathname = path.join(filePathname, "index.html");
        }
      }

      const filePath = safePublic(filePathname.startsWith("/") ? filePathname.slice(1) : filePathname);
      if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        res.writeHead(404, HDR);
        res.end("Not found");
        return;
      }

      if (req.method === "HEAD") {
        res.writeHead(200, HDR);
        res.end();
        return;
      }

      serveFile(res, filePath);
    });
  });
}

http.createServer(handleRequest).listen(PORT, () => {
  console.log(`Chart UI:  http://127.0.0.1:${PORT}/`);
  console.log(`Embed:     http://127.0.0.1:${PORT}/embed?symbol=NQ&theme=dark`);
  console.log(`Datafeed:  http://127.0.0.1:${PORT}/datafeed/config`);
});

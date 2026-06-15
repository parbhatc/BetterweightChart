# BetterweightChart

Standalone TradingView-style chart on [lightweight-charts](https://github.com/tradingview/lightweight-charts) v5 with 68 drawing tools. Uses **fake OHLC data** — no live feed. Use on any site via **ES modules** (like lightweight-charts) or iframe embed.

## Quick start

```bash
npm install
npm start
```

| URL | Description |
|-----|-------------|
| http://127.0.0.1:3460/ | Full chart UI |
| http://127.0.0.1:3460/embed?symbol=NQ&theme=dark&drawings=1 | Minimal embed |
| http://127.0.0.1:3460/api/health | API index |

## Project layout

```
public/
├── chart/              # Stable public API URLs (CDN-style shims)
│   ├── sdk.js          # Full SDK (bootChart, drawings, datafeed)
│   ├── api.js          # ChartApi HTTP client
│   └── app.js          # bootChart()
├── js/
│   ├── sdk.js          # SDK entry (same exports as chart/sdk.js)
│   ├── app/            # Widget orchestration
│   │   ├── bootChart.js
│   │   ├── barLoader.js
│   │   ├── cursorMode.js
│   │   ├── layoutSync.js
│   │   ├── symbolLineStyle.js
│   │   └── wireContextMenus.js
│   ├── api/
│   │   └── chartApi.js # ChartApi + re-exports
│   ├── chart/          # Chart core helpers
│   │   ├── chartView.js
│   │   ├── constants.js
│   │   ├── paneData.js
│   │   └── settingsApplier.js
│   ├── datafeed/
│   │   └── client.js   # UDF-style browser client
│   ├── drawings/       # Drawing tools module
│   │   ├── index.js    # mountDrawings() — main API
│   │   ├── controller/
│   │   ├── geometry/
│   │   ├── primitives/
│   │   └── toolbars/
│   └── ui/             # Chrome: settings, menus, header
│       └── settings/   # Settings defaults + store
server/                 # Static host + fake datafeed
```

**Target:** keep modules under ~300–400 lines; large files are split into `app/`, `chart/`, and `drawings/controller/lib/` helpers.

## Use on another website

Host this repo (or deploy to your server), then import ES modules from stable paths — same pattern as lightweight-charts:

```html
<div id="chart" style="width:100%;height:480px"></div>
<script type="module">
  import { bootChart } from "https://YOUR_HOST/chart/sdk.js";

  const widget = await bootChart({
    mount: document.getElementById("chart"),
    symbol: "NQ",
    theme: "dark",
    drawings: true,
    chrome: false,
  });
</script>
```

| Import path | Exports |
|-------------|---------|
| `/chart/sdk.js` | `bootChart`, `ChartApi`, `mountDrawings`, `createMultiPaneDrawingHub`, `createDatafeed` |
| `/chart/app.js` | `bootChart`, `readPageOptions` |
| `/chart/api.js` | `ChartApi`, `createDatafeed` |

**npm** (when published or linked locally):

```javascript
import { bootChart, ChartApi } from "betterweightchart";
```

Point `ChartApi` at your hosted backend for bars/config:

```javascript
import { ChartApi } from "https://YOUR_HOST/chart/api.js";
const api = new ChartApi("https://YOUR_HOST");
```

## JS API

### HTTP client

```javascript
import { ChartApi } from "http://127.0.0.1:3460/chart/api.js";

const api = new ChartApi("http://127.0.0.1:3460");
const health = await api.health();
const { bars } = await api.bars("NQ", { countback: 200, seed: 7 });
const config = await api.config();
```

### Boot the widget

```javascript
import { bootChart } from "http://127.0.0.1:3460/chart/app.js";

const widget = await bootChart({
  symbol: "NQ",
  theme: "dark",
  drawings: true,
  chrome: false,
  countBack: 500,
});

// widget.chart, widget.series, widget.settings, widget.reload(), widget.setTheme()
```

### Drawings only

```javascript
import { mountDrawings, createDrawingController } from "/js/drawings/index.js";

const { controller } = mountDrawings({
  chart,
  series,
  container: document.getElementById("chart"),
  toolbarEl: document.getElementById("drawing-toolbar"),
  getContext: () => ({ bars, barSec: 60 }),
});

controller.setActiveTool("trend-line");
controller.on("change", () => console.log(controller.getDrawings()));
```

## REST API

| Route | Description |
|-------|-------------|
| `GET /api/health` | Service info |
| `GET /api/v1/config` | Themes, symbols, defaults |
| `GET /api/v1/symbols` | `["NQ","ES","BTC"]` |
| `GET /api/v1/bars?symbol=NQ&countback=500` | Fake 1m OHLC |
| `GET /datafeed/config` | UDF config (used by in-browser datafeed) |
| `GET /datafeed/history?...` | UDF history |

## Embed query params

| Param | Default | Description |
|-------|---------|-------------|
| `symbol` | `NQ` | `NQ`, `ES`, or `BTC` |
| `theme` | `dark` | `dark` or `light` |
| `drawings` | `1` | `0` hides drawing toolbar |
| `chrome` | `1` | `0` hides top toolbar |
| `countback` | `500` | Number of bars to load |

```html
<iframe
  src="http://127.0.0.1:3460/embed?symbol=ES&theme=dark&drawings=1"
  width="100%"
  height="480"
></iframe>
```

## Development

```bash
npm run dev          # nodemon server
npm run sync-vendor  # copy lightweight-charts to public/vendor/
```

# BetterweightChart

Standalone chart widget on [lightweight-charts](https://github.com/tradingview/lightweight-charts) v5 with 68 drawing tools. Uses **fake OHLC data** — no live feed. Use on any site via **ES modules** (like lightweight-charts) or iframe embed.

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
│   │   ├── client.js   # HTTP UDF datafeed (default)
│   │   ├── custom.js   # createCustomDatafeed, createStaticDatafeed
│   │   └── index.js    # resolveDatafeed()
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
| `/chart/sdk.js` | `bootChart`, `ChartApi`, `mountDrawings`, `createDatafeed`, `CHART_FEATURES`, … |
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

// Feature flags — set at chart creation
await bootChart({
  symbol: "ES",
  disabled_features: ["future_whitespace"], // opt out of future whitespace (on by default)
});

// widget.chart, widget.series, widget.settings — see Widget API below
```

### Widget API (`bootChart` return value)

```javascript
const widget = await bootChart({ mount: el, symbol: "NQ", bars: myBars });

// Live updates
widget.update({ time: 1710000060, open: 100, high: 101, low: 99, close: 100.5 });

// History (getBars-style)
const { bars } = await widget.fetchBars({ countBack: 200 });
const { bars: older } = await widget.fetchBars({ to: bars[0].time - 60, countBack: 100 });
await widget.loadMoreHistory(); // auto-prepends when panning left, or call manually

// Navigation
widget.setSymbol("ES");
widget.setResolution("5");
widget.reload();
widget.reset();           // price + time + scroll to latest
widget.reset({ price: false }); // time scale only

widget.getBars();
widget.getSymbol();
widget.setBars(allBars);  // static/simple feeds
widget.setTheme("light");
widget.openSettings("symbol");
```

### Simple datafeed (easiest custom data)

```javascript
import { bootChart, createSimpleDatafeed } from "https://YOUR_HOST/chart/sdk.js";

const feed = createSimpleDatafeed({
  symbol: "BTC",
  bars: myBars,
  resolution: "5",
  tick: 0.01,
});

const widget = await bootChart({ mount: el, datafeed: feed, symbol: "BTC" });

// Live — updates chart if subscribed, or use widget.update()
feed.push({ time: 1710000300, open: 64000, high: 64100, low: 63900, close: 64050 });

// Or bypass feed stream:
widget.update({ time: 1710000300, open: 64000, high: 64100, low: 63900, close: 64050 });
```

### Custom datafeed (your own candles)

Three ways to supply data — no fake server required for options 1–2.

**1. Pass bars directly** (simplest):

```javascript
import { bootChart } from "https://YOUR_HOST/chart/sdk.js";

const myBars = [
  { time: 1710000000, open: 100, high: 101, low: 99.5, close: 100.5, volume: 1200 },
  // time = Unix seconds (ms also accepted)
];

await bootChart({
  mount: document.getElementById("chart"),
  symbol: "MY",
  bars: myBars,
  tick: 0.01,
  chrome: false,
});
```

**2. Static in-memory feed** (multiple symbols, live updates):

```javascript
import { bootChart, createStaticDatafeed } from "https://YOUR_HOST/chart/sdk.js";

const datafeed = createStaticDatafeed({
  symbol: "BTC",
  name: "Bitcoin",
  tick: 1,
  bars: myBtcBars,
});

const widget = await bootChart({ mount: el, datafeed, symbol: "BTC" });

// Push new candles later
datafeed.setBars("BTC", [...datafeed.getBarsFor("BTC"), newBar]);
await widget.setBars(datafeed.getBarsFor("BTC"));
```

**3. Full custom feed** (fetch from your API):

```javascript
import { bootChart, createCustomDatafeed } from "https://YOUR_HOST/chart/sdk.js";

const datafeed = createCustomDatafeed({
  onReady: () => ({
    resolutions: [{ id: "1", label: "1m", sec: 60 }],
    default_resolution: "1",
  }),
  resolveSymbol: (name) => ({
    name,
    ticker: name,
    pricescale: 100,
    minmov: 1,
  }),
  getBars: async (symbolInfo, resolution, { countBack }) => {
    const res = await fetch(`/api/candles?symbol=${symbolInfo.ticker}&limit=${countBack}`);
    const bars = await res.json();
    return { bars }; // { time, open, high, low, close, volume? }
  },
  searchSymbols: async (q) => [{ symbol: "AAPL", name: "Apple", exchange: "NASDAQ", ticker: "AAPL" }],
});

await bootChart({ mount: el, datafeed, symbol: "AAPL" });
```

**4. HTTP UDF backend** (default — uses bundled fake feed):

```javascript
await bootChart({ datafeedUrl: "https://YOUR_HOST/datafeed" });
```

Live example: `/examples/custom-bars.html`

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

## Datafeed API

| Feature | Status |
|---------|--------|
| `onReady` | Implemented |
| `resolveSymbol` | Implemented |
| `getBars` (countBack / from / to) | Implemented on feed + `widget.fetchBars()` |
| `searchSymbols` | Implemented (UI + feed) |
| `subscribeBars` / live stream | Proxy + static/simple `pushBar`; HTTP fake feed has no stream |
| Scroll-back history (`loadMoreHistory`) | Implemented — prepends older bars when panning left |
| `firstDataRequest` flag | Passed through types; server may ignore |
| Quotes (`getQuotes`, `subscribeQuotes`) | Not implemented |
| Timescale marks / chart marks | Not implemented |
| Server time (`getServerTime`) | Not implemented |
| Symbol info fields (expiry, units, etc.) | Partial — basics only |
| Studies / indicators API | Not implemented (drawings only) |
| Full UDF symbol group / currency | Partial |

Your `getBars` handler receives `{ from, to, countBack, firstDataRequest }`. Return `{ bars, noData?: true }`.

### Chart features

| Feature | Status |
|---------|--------|
| Measure tool (A→B stats, click to dismiss) | Implemented |
| Drawing copy/paste (Ctrl+C / Ctrl+V, context menu) | Implemented |
| Multi-pane future whitespace growth | Implemented per pane |
| Future whitespace | On by default; disable with `disabled_features: ['future_whitespace']` at boot (not user-configurable) |
| Drawing style templates (named save/apply/reset) | Implemented on edit toolbar |
| Chart timezone (bar-shift + time adapter) | Implemented — UTC logic vs chart-time render |
| Countdown to bar close (price axis) | Implemented |

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

### Feature flags

Pass at chart creation via `disabled_features` / `enabled_features`:

```javascript
import { bootChart, CHART_FEATURES } from "https://YOUR_HOST/chart/sdk.js";

await bootChart({
  mount: el,
  symbol: "NQ",
  disabled_features: [CHART_FEATURES.FUTURE_WHITESPACE],
});
```

| Feature id | Default | Description |
|------------|---------|-------------|
| `future_whitespace` | **on** | Appends empty bars to the series so you can pan/scroll into future time. **Drawing in future time works without this** — coords extrapolate past the last bar. Disable with `disabled_features`. |

```javascript
await bootChart({
  mount: el,
  symbol: "NQ",
  disabled_features: ["future_whitespace"],
});
```

Whitespace is controlled only at chart creation — there is no settings toggle.

## Chart settings

Open **Settings** (gear) → **Scales and lines** → **Time Scale** for date/time label options.

## Drawing templates

Select any drawing to open the floating edit toolbar. The **Templates** button (grid icon) supports:

| Action | Behavior |
|--------|----------|
| **Save as template** | Prompt for a name; confirms before overwriting an existing name |
| **Apply template** | Pick a saved template for that tool type and apply its styles to the selected drawing |
| **Reset template** | Restore factory defaults for that tool type |

Templates are saved with the layout (autosave / Save layout) and restored when you load that layout. The button shows a dot when templates exist for the current tool type.

## Timezone model

Lightweight Charts has no native timezone support. This app uses a three-layer model:

1. **UTC (logic)** — bar storage, drawings, indicators, session math
2. **View cache** — `public/js/chart/pane/viewCache.js` rebuilds on data/timezone/session change
3. **Chart-time (render)** — bars shifted for display; crosshair and drawings map through `timeAdapter`

Set the display timezone under **Settings → Symbol → Timezone**.

## Development

```bash
npm run dev          # nodemon server
npm run sync-vendor  # copy lightweight-charts to public/vendor/
```

### Debug console (lag / perf)

Add `?debug=1` to the URL, or in the browser console:

```javascript
window.__BWC_DEBUG__.enable();   // persists in localStorage
location.reload();
```

While enabled you get:

- **Pan FPS** — `[BWC:pan] fps …` while dragging the chart
- **Slow ops** — warnings when handlers take >8ms (`visibleRangeHandler`, `setData`, etc.)
- **Counters** — crosshair skips during pan, session cache hits/misses, whitespace growth

Useful commands:

```javascript
window.__BWC_DEBUG__.stats()      // counters + slow op log
window.__BWC_DEBUG__.clear()      // reset stats
window.__BWC_DEBUG__.setVerbose(true)
window.__BWC_DEBUG__.setSlowMs(4) // lower threshold
window.__BWC_DEBUG__.disable()
```

Filter tags: `?debug=perf,pan,data` (categories: `boot`, `pan`, `perf`, `data`, `crosshair`, `session`, `whitespace`).

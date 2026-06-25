# Position overlay API

Chart position lines with live P&L, draggable stop-loss / take-profit brackets, and event hooks. Available on every widget as `widget.positionOverlay` after `bootChart()`.

Standalone import:

```javascript
import { createPositionOverlay } from "https://YOUR_HOST/chart/sdk.js";
// or
import { bootChart, createPositionOverlay } from "betterweightchart";
```

## Quick example

```javascript
const widget = await bootChart({ mount: el, symbol: "NQ" });
const pos = widget.positionOverlay;

pos.onOpen((p) => console.log("opened", p));
pos.onClose((p) => console.log("closed", p));
pos.onStopLossChanged((oldPrice, newPrice) => console.log("SL", oldPrice, newPrice));
pos.onTakeProfitChanged((oldPrice, newPrice) => console.log("TP", oldPrice, newPrice));

await pos.buy();                    // market fill at last price
await pos.buy(18450.25);            // paper fill at price
await pos.buy({ price: 18450, qty: 2 });

await pos.setStopLoss(18400);
await pos.setTakeProfit(18600);
```

## Orders

| Method | Description |
|--------|-------------|
| `buy(priceOrOpts?)` | Long. Market if no price; otherwise paper-fills at `price` immediately. |
| `sell(priceOrOpts?)` | Short. Same options as `buy`. |
| `buyLimit(price, opts?)` | Pending buy limit until price trades through. |
| `sellLimit(price, opts?)` | Pending sell limit until price trades through. |
| `clear()` | Close position, remove SL/TP lines, cancel pending limits. |

### Price options

```javascript
pos.buy();                         // market @ last bar close
pos.buy(18450.25);                 // fill at 18450.25 now
pos.buy({ price: 18450 });         // same
pos.buy({ price: 18450, qty: 3 }); // size (default 1)
pos.buy({ price: 18400, type: "limit" }); // pending limit
pos.buyLimit(18400, { qty: 2 });   // shorthand for limit
```

Paper semantics: when a `price` is given without `type: "limit"`, the overlay opens the position at that price immediately (no wait for market touch). Use `buyLimit` / `sellLimit` or `type: "limit"` for working limits.

## Brackets (stop loss / take profit)

| Method | Description |
|--------|-------------|
| `setStopLoss(price)` | Create or move stop-loss line. |
| `setTakeProfit(price)` | Create or move take-profit line. |
| `setStopLoss(null)` / `clearStopLoss()` | Remove stop-loss line. |
| `setTakeProfit(null)` / `clearTakeProfit()` | Remove take-profit line. |

Brackets can also be set by dragging the position line (Nexus-style labels: `Set Stop Market`, `Set Limit Order`, etc.). Bracket lines show static exit P&L at their price; they update only when dragged or set via API.

## State

```javascript
pos.getPosition();
// {
//   entry: 18450.25,
//   qty: 1,              // negative = short
//   stopLoss: 18400,     // null if none
//   takeProfit: 18600    // null if none
// } | null
```

## Events

All listeners return an unsubscribe function.

```javascript
const off = pos.onStopLossChanged((oldPrice, newPrice) => {
  // oldPrice / newPrice: number | null
});

off(); // unsubscribe
```

| Event | Callback | When |
|-------|----------|------|
| `onOpen(snapshot)` | `(snapshot) => void` | Position filled (`buy` / `sell`). |
| `onClose(snapshot)` | `(snapshot) => void` | Position closed (`clear`, cancel button). |
| `onStopLossChanged(old, new)` | `(number \| null, number \| null) => void` | SL created, moved, or removed. |
| `onTakeProfitChanged(old, new)` | `(number \| null, number \| null) => void` | TP created, moved, or removed. |

`onClose` receives the final snapshot including bracket prices at close time. Individual bracket `on*Changed` events are **not** fired when the whole position closes (use `onClose` instead).

## Layout

| Method | Default | Description |
|--------|---------|-------------|
| `setPillOffset(px)` | `140` | Position line pill inset from right edge. |
| `setBracketPillOffset(px)` | `200` | SL/TP pill inset (further left than position). |

## Lifecycle

```javascript
widget.positionOverlay.destroy(); // tear down lines + listeners (also called from widget.destroy())
```

## Dev console (testing route)

On `/testing/`, `mountOrderTestDev()` exposes the same API as `window.__BWC_TEST_ORDER__` (alias of `widget.positionOverlay`).

## Requirements

- Widget must have bars loaded (`widget.getBars()` or live feed) before market orders.
- Uses `widget.onLiveBar()` for live position P&L.
- Uses `widget.chart().createOrderLine()` for chart lines (LWC fork order pills).

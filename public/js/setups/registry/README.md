# Setup registry

Setups are registered at startup from **`data/setups/*.json`**. Global defaults come from **`data/settings.json`**.

## Layout

```
data/
  settings.json              Trading window, release gate, default session
  setups/
    manifest.json            [1, 2, …]
    N.json                   Per-setup checklist + cycle
frontend/lib/setups/
  setupGlobal.js             Loads settings.json
  registry/
    loadSetups.js            Imports manifest + setup JSON, registers all
    setupEngines.js          JSON → registerSetup()
    setupEngineRegistry.js   htfSweep / fvgTap / lastCandleSweep engine bundles
    registerSetup.js         Wires UI, history, live engine
  engines/
    checklistEngine.js       HTF sweep flow
    checklistCycleLive.js    FVG tap cycle live
    fvgTapHistory.js           FVG tap history cache
```

Full JSON schema: [`data/setups/README.md`](../../../../data/setups/README.md).

## Adding Setup #4

1. Create `data/setups/4.json`.
2. Add `4` to `data/setups/manifest.json`.
3. Import in `loadSetups.js` and add to `BY_ID`.
4. Restart chart server.

For a new backbone (not HTF-first, FVG-first, or ref-15m sweep), add a bundle in `setupEngineRegistry.js`.

## Classes

| Class | Role |
|-------|------|
| `SetupRegistry` | `register`, `list`, `get`, `byKey` |
| `SetupHistory` | `resetAll`, `resolve`, `buildAll`, `toPayload` |
| `SetupView` | Panel HTML helpers |

## Engines

| Key | When used | History module |
|-----|-----------|----------------|
| `htfSweep` | Checklist starts with `sweep` | `checklistEngine.js` |
| `fvgTap` | FVG tap + internal sweep backbone | `fvgTapHistory.js` |
| `lastCandleSweep` | `last_candle_sweep` + `accept` TF (Setup #3) | `lastCandleSweepEngine.js` |

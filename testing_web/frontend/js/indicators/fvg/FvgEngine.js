export { fvgAtBar } from "./detect.js";
import { emitAllBoxes } from "./emit.js";
import { initFvgEngine } from "./init.js";
import { refreshHtfLayersForLive } from "./layers.js";
import { runAppendBar, runHtfRefresh, runLiveTick } from "./live.js";
import { captureFvgSnapshot } from "./snapshot.js";
import { onBarLayer } from "./zones.js";

/** Thin Pine-style facade — init/onBar + incremental patches in fvg/*.js modules. */
export class FvgEngine {
  /** @param {import("../../pineRuntime.js").BarScriptContext} script */
  constructor(script) {
    this.script = script;
  }

  init() {
    initFvgEngine(this.script);
  }

  onBar() {
    if (this.script.state.skip) return;
    for (const entry of this.script.state.chartLayers) {
      onBarLayer(this.script, entry.layer, entry.series, entry.startIdx, this.script.index);
    }
    if (this.script.index !== this.script.bars.length - 1) return;
    emitAllBoxes(this.script);
    if (this.script.instance) {
      this.script.instance._overlaySnapshot = captureFvgSnapshot(this.script);
    }
  }

  captureSnapshot() {
    return captureFvgSnapshot(this.script);
  }

  runLiveTick(snapshot, previousBoxes = []) {
    return runLiveTick(this.script, snapshot, previousBoxes);
  }

  runAppendBar(snapshot, previousBoxes = []) {
    return runAppendBar(this.script, snapshot, previousBoxes);
  }

  runHtfRefresh(snapshot, previousBoxes = []) {
    return runHtfRefresh(this.script, snapshot, previousBoxes);
  }

  /** @deprecated use refreshHtfLayersForLive */
  refreshHtfLayersForReplay(snapshot, mode = "tick") {
    refreshHtfLayersForLive(this.script, snapshot, mode);
  }
}

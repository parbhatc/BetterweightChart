import { createBarScriptContext } from "../pineRuntime.js";

/**
 * Pine-style overlay engine helper — init once, onBar per candle, optional incremental patches.
 * Future overlay indicators: extend a small engine class and wire via bindOverlayEngine.
 *
 * @param {new (script: object) => object} EngineClass
 */
export function bindOverlayEngine(EngineClass) {
  return {
    /** @param {object[]} utcBars @param {object[]} chartBars @param {object} instance @param {object} ctx */
    createScript(utcBars, chartBars, instance, ctx) {
      const { ctx: script } = createBarScriptContext({
        utcBars,
        chartBars,
        inputs: instance.inputs,
        style: instance.style,
        plotIds: ["overlay"],
        symbolInfo: ctx.symbolInfo ?? null,
        overlayCtx: ctx,
        instance,
      });
      return script;
    },

    /** @param {object[]} utcBars @param {object[]} chartBars @param {object} instance @param {object} ctx */
    runFull(utcBars, chartBars, instance, ctx) {
      const script = this.createScript(utcBars, chartBars, instance, ctx);
      const engine = new EngineClass(script);
      engine.init();
      for (let i = 0; i < utcBars.length; i++) {
        script.index = i;
        script.bar = utcBars[i];
        engine.onBar();
      }
      return script;
    },

    /** @param {object[]} utcBars @param {object[]} chartBars @param {object} instance @param {object} ctx @param {object} snapshot @param {object[]} [previous] @param {string} method */
    runPatch(utcBars, chartBars, instance, ctx, snapshot, previous, method) {
      const script = this.createScript(utcBars, chartBars, instance, ctx);
      const engine = new EngineClass(script);
      const fn = engine[method];
      if (typeof fn !== "function") return null;
      return fn.call(engine, snapshot, previous);
    },
  };
}

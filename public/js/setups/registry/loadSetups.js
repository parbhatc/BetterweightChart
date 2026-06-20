/**
 * Loads setup definitions from data/setups/*.json and registers them.
 * Per-instance enable toggles live on the Levels indicator — all defs register here.
 */
import manifest from "../../../data/setups/manifest.json" with { type: "json" };
import setup1 from "../../../data/setups/1.json" with { type: "json" };
import setup2 from "../../../data/setups/2.json" with { type: "json" };
import setup3 from "../../../data/setups/3.json" with { type: "json" };
import { registerSetupFromJson } from "./setupEngines.js";

/** @type {Record<number, import("./setupEngines.js").SetupJsonDef>} */
const BY_ID = {
  1: setup1,
  2: setup2,
  3: setup3,
};

for (const id of manifest) {
  const def = BY_ID[id];
  if (!def) throw new Error(`data/setups/manifest.json lists ${id} but data/setups/${id}.json is not imported`);
  registerSetupFromJson(def);
}

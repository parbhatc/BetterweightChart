import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "testing_web/frontend/js/indicators");

const REPLACEMENTS = [
  [/from "\.\.\/\.\.\/BarScriptIndicator\.js"/g, 'from "/js/indicators/BarScriptIndicator.js"'],
  [/from "\.\.\/\.\.\/builders\.js"/g, 'from "/js/indicators/builders.js"'],
  [/from "\.\.\/\.\.\/schema\.js"/g, 'from "/js/indicators/schema.js"'],
  [/from "\.\.\/\.\.\/styleColor\.js"/g, 'from "/js/indicators/styleColor.js"'],
  [/from "\.\.\/\.\.\/security\//g, 'from "/js/indicators/security/'],
  [/from "\.\.\/\.\.\/\.\.\/app\//g, 'from "/js/app/'],
  [/from "\.\.\/\.\.\/\.\.\/debug\//g, 'from "/js/debug/'],
  [/from "\.\.\/\.\.\/\.\.\/core\//g, 'from "/js/core/'],
  [/from "\.\.\/\.\.\/\.\.\/news\//g, 'from "/js/news/'],
  [/from "\.\.\/\.\.\/\.\.\/chart\//g, 'from "/js/chart/'],
  [/from "\.\.\/\.\.\/ui\/fvgTimeframesPanel\.js"/g, 'from "../ui/fvgTimeframesPanel.js"'],
  [/from "\.\.\/\.\.\/ui\/levelsLayersPanel\.js"/g, 'from "../ui/levelsLayersPanel.js"'],
  [/from "\.\.\/\.\.\/ui\/newsLevelsPanel\.js"/g, 'from "../ui/newsLevelsPanel.js"'],
  [/from "\.\.\/\.\.\/ui\/symbolSizeRulesPanel\.js"/g, 'from "../ui/symbolSizeRulesPanel.js"'],
  [/from "\.\.\/\.\.\/math\/levelsDebug\.js"/g, 'from "../math/levelsDebug.js"'],
  [/from "\.\.\/definitions\/levels\/sessionDefs\.js"/g, 'from "../levels/sessionDefs.js"'],
  [/from "\.\.\/\.\.\/\.\.\/utils\//g, 'from "/js/utils/'],
  [/from "\.\.\/\.\.\/math\/source\.js"/g, 'from "/js/indicators/math/source.js"'],
  [/from "\.\.\/\.\.\/math\/pivots\.js"/g, 'from "/js/indicators/math/pivots.js"'],
];

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (name.endsWith(".js")) {
      let text = fs.readFileSync(full, "utf8");
      let changed = false;
      for (const [re, rep] of REPLACEMENTS) {
        if (re.test(text)) {
          text = text.replace(re, rep);
          changed = true;
        }
        re.lastIndex = 0;
      }
      if (changed) fs.writeFileSync(full, text);
    }
  }
}

walk(DIR);
console.log("Fixed testing indicator imports");

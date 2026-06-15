/**
 * Restructure project: move files to feature-based folders and rewrite relative imports.
 * Usage: node scripts/restructure-project.mjs [--dry-run]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DRY_RUN = process.argv.includes("--dry-run");

/** @type {Record<string, string>} old relative path (posix) -> new relative path (posix) */
const MOVE_MAP = {
  // ── app ──────────────────────────────────────────────────────────────────
  "public/js/app/bootChart.js": "public/js/app/boot/chart.js",
  "public/js/app/barLoader.js": "public/js/app/bar/loader.js",
  "public/js/app/cursorMode.js": "public/js/app/cursor/mode.js",
  "public/js/app/layoutSync.js": "public/js/app/layout/sync.js",
  "public/js/app/symbolLineStyle.js": "public/js/app/symbol/lineStyle.js",
  "public/js/app/wireContextMenus.js": "public/js/app/wire/contextMenus.js",

  // ── api ──────────────────────────────────────────────────────────────────
  "public/js/api/chartApi.js": "public/js/api/chart/index.js",

  // ── chart ────────────────────────────────────────────────────────────────
  "public/js/chart/chartView.js": "public/js/chart/view/index.js",
  "public/js/chart/barStyle.js": "public/js/chart/bar/style.js",
  "public/js/chart/candleData.js": "public/js/chart/bar/data.js",
  "public/js/chart/canvasSettings.js": "public/js/chart/canvas/settings.js",
  "public/js/chart/timeScaleCoords.js": "public/js/chart/coords/timeScale.js",
  "public/js/chart/futureWhitespace.js": "public/js/chart/future/whitespace.js",
  "public/js/chart/marketStatus.js": "public/js/chart/market/status.js",
  "public/js/chart/paneData.js": "public/js/chart/pane/data.js",
  "public/js/chart/panPerf.js": "public/js/chart/pan/perf.js",
  "public/js/chart/priceBarRatio.js": "public/js/chart/price/barRatio.js",
  "public/js/chart/scaleSettings.js": "public/js/chart/scale/settings.js",
  "public/js/chart/settingsApplier.js": "public/js/chart/settings/applier.js",
  "public/js/chart/statusLine.js": "public/js/chart/status/line.js",
  "public/js/chart/timezones.js": "public/js/chart/timezone/list.js",

  // ── datafeed ─────────────────────────────────────────────────────────────
  "public/js/datafeed/tradingview.js": "public/js/datafeed/tradingview/index.js",
  "public/js/datafeed/tradingview/messageUtils.js": "public/js/datafeed/tradingview/message/utils.js",

  // ── debug ────────────────────────────────────────────────────────────────
  "public/js/debug/chartDebug.js": "public/js/debug/chart/index.js",

  // ── primitives ───────────────────────────────────────────────────────────
  "public/js/primitives/sessionBackgroundPrimitive.js":
    "public/js/primitives/session/background.js",

  // ── drawings: catalog / registry ─────────────────────────────────────────
  "public/js/drawings/catalog/toolCatalog.js": "public/js/drawings/catalog/tools.js",
  "public/js/drawings/catalog/toolIcons.js": "public/js/drawings/catalog/icons.js",
  "public/js/drawings/registry/toolRegistry.js": "public/js/drawings/registry/tools.js",

  // ── drawings: controller ─────────────────────────────────────────────────
  "public/js/drawings/controller/drawingController.js": "public/js/drawings/controller/index.js",
  "public/js/drawings/controller/hitTesting.js": "public/js/drawings/controller/hit/test.js",
  "public/js/drawings/controller/lib/drawingDrag.js": "public/js/drawings/controller/drag/index.js",
  "public/js/drawings/controller/lib/drawingFactory.js": "public/js/drawings/controller/factory/index.js",
  "public/js/drawings/controller/lib/pointerHandlers.js": "public/js/drawings/controller/pointer/handlers.js",
  "public/js/drawings/controller/lib/tooltipOverlay.js": "public/js/drawings/controller/tooltip/overlay.js",
  "public/js/drawings/controller/lib/disjointChannelPlacement.js":
    "public/js/drawings/controller/placement/disjointChannel.js",
  "public/js/drawings/controller/lib/flatTopBottomPlacement.js":
    "public/js/drawings/controller/placement/flatTopBottom.js",
  "public/js/drawings/controller/lib/parallelChannelPlacement.js":
    "public/js/drawings/controller/placement/parallelChannel.js",

  // ── drawings: geometry → tools ───────────────────────────────────────────
  "public/js/drawings/geometry/annotationGeometry.js": "public/js/drawings/tools/annotation/geometry.js",
  "public/js/drawings/geometry/annotationHitTest.js": "public/js/drawings/tools/annotation/hitTest.js",
  "public/js/drawings/geometry/annotationRender.js": "public/js/drawings/tools/annotation/render.js",
  "public/js/drawings/geometry/annotationStyle.js": "public/js/drawings/tools/annotation/style.js",
  "public/js/drawings/geometry/annotationTools.js": "public/js/drawings/tools/annotation/index.js",
  "public/js/drawings/geometry/axisLineTools.js": "public/js/drawings/tools/axis/lines.js",
  "public/js/drawings/geometry/channelFamilyTools.js": "public/js/drawings/tools/channel/family.js",
  "public/js/drawings/geometry/channels.js": "public/js/drawings/tools/channel/index.js",
  "public/js/drawings/geometry/parallelChannelTools.js": "public/js/drawings/tools/channel/parallel.js",
  "public/js/drawings/geometry/flatTopBottomTools.js": "public/js/drawings/tools/channel/flatTopBottom.js",
  "public/js/drawings/geometry/disjointChannelTools.js": "public/js/drawings/tools/channel/disjoint.js",
  "public/js/drawings/geometry/cycleTools.js": "public/js/drawings/tools/cycle/index.js",
  "public/js/drawings/geometry/fibTools.js": "public/js/drawings/tools/fib/index.js",
  "public/js/drawings/geometry/fibRetracementTools.js": "public/js/drawings/tools/fib/retracement.js",
  "public/js/drawings/geometry/fibAdvancedTools.js": "public/js/drawings/tools/fib/advanced.js",
  "public/js/drawings/geometry/forecastTools.js": "public/js/drawings/tools/forecast/index.js",
  "public/js/drawings/geometry/gannTools.js": "public/js/drawings/tools/gann/index.js",
  "public/js/drawings/geometry/infoLine.js": "public/js/drawings/tools/line/info.js",
  "public/js/drawings/geometry/lineExtend.js": "public/js/drawings/tools/line/extend.js",
  "public/js/drawings/geometry/lineMath.js": "public/js/drawings/tools/line/math.js",
  "public/js/drawings/geometry/trendLineStyle.js": "public/js/drawings/tools/line/trendStyle.js",
  "public/js/drawings/geometry/trendLineStats.js": "public/js/drawings/tools/line/trendStats.js",
  "public/js/drawings/geometry/trendAngle.js": "public/js/drawings/tools/line/trendAngle.js",
  "public/js/drawings/geometry/measureTools.js": "public/js/drawings/tools/measure/index.js",
  "public/js/drawings/geometry/patternTools.js": "public/js/drawings/tools/pattern/index.js",
  "public/js/drawings/geometry/pitchfork.js": "public/js/drawings/tools/pattern/pitchfork.js",
  "public/js/drawings/geometry/positionTools.js": "public/js/drawings/tools/position/barrel.js",
  "public/js/drawings/geometry/regressionTrendTools.js": "public/js/drawings/tools/regression/trend.js",
  "public/js/drawings/geometry/shapeTools.js": "public/js/drawings/tools/shape/index.js",
  "public/js/drawings/geometry/magnetSnap.js": "public/js/drawings/tools/snap/magnet.js",

  // ── drawings: primitives ─────────────────────────────────────────────────
  "public/js/drawings/primitives/drawingRenderers.js": "public/js/drawings/primitives/renderers/index.js",
  "public/js/drawings/primitives/drawingPriceLines.js": "public/js/drawings/primitives/priceLines/index.js",
  "public/js/drawings/primitives/userDrawingsPrimitive.js":
    "public/js/drawings/primitives/userDrawings/index.js",

  // ── drawings: toolbars ───────────────────────────────────────────────────
  "public/js/drawings/toolbars/mainToolbar.js": "public/js/drawings/toolbars/main/index.js",
  "public/js/drawings/toolbars/editToolbar.js": "public/js/drawings/toolbars/edit/index.js",
  "public/js/drawings/toolbars/favoriteToolbar.js": "public/js/drawings/toolbars/favorite/index.js",
  "public/js/drawings/toolbars/utilityToolbarUi.js": "public/js/drawings/toolbars/utility/index.js",
  "public/js/drawings/toolbars/utilitySettingsStore.js":
    "public/js/drawings/toolbars/utility/settings/store.js",
  "public/js/drawings/toolbars/flyoutHost.js": "public/js/drawings/toolbars/flyout/host.js",
  "public/js/drawings/toolbars/toolbarBuilders.js": "public/js/drawings/toolbars/builders.js",
  "public/js/drawings/toolbars/toolbarConstants.js": "public/js/drawings/toolbars/constants.js",
  "public/js/drawings/toolbars/drawingDefaultsStore.js": "public/js/drawings/toolbars/defaults/store.js",
  "public/js/drawings/toolbars/favoritesStore.js": "public/js/drawings/toolbars/favorites/store.js",
  "public/js/drawings/toolbars/toolbarSelectionStore.js": "public/js/drawings/toolbars/selection/store.js",

  // ── drawings: ui → settings ──────────────────────────────────────────────
  "public/js/drawings/ui/drawingSettingsDialog.js": "public/js/drawings/settings/dialog/index.js",
  "public/js/drawings/ui/drawingSettingsDialogMarkup.js": "public/js/drawings/settings/dialog/markup.js",
  "public/js/drawings/ui/drawingSettingsDialogUtils.js": "public/js/drawings/settings/dialog/utils.js",
  "public/js/drawings/ui/drawingSettingsCoordsPanel.js": "public/js/drawings/settings/dialog/coords/panel.js",
  "public/js/drawings/ui/annotationSettingsSection.js": "public/js/drawings/settings/sections/annotation.js",
  "public/js/drawings/ui/channelStyleSettingsSection.js": "public/js/drawings/settings/sections/channelStyle.js",
  "public/js/drawings/ui/cycleSettingsSection.js": "public/js/drawings/settings/sections/cycle.js",
  "public/js/drawings/ui/fibRetracementSettingsSection.js": "public/js/drawings/settings/sections/fibRetracement.js",
  "public/js/drawings/ui/forecastSettingsSection.js": "public/js/drawings/settings/sections/forecast.js",
  "public/js/drawings/ui/gannSettingsSection.js": "public/js/drawings/settings/sections/gann.js",
  "public/js/drawings/ui/measureSettingsSection.js": "public/js/drawings/settings/sections/measure.js",
  "public/js/drawings/ui/parallelChannelSettingsSection.js":
    "public/js/drawings/settings/sections/parallelChannel.js",
  "public/js/drawings/ui/patternSettingsSection.js": "public/js/drawings/settings/sections/pattern.js",
  "public/js/drawings/ui/positionSettingsSection.js": "public/js/drawings/settings/sections/position.js",
  "public/js/drawings/ui/regressionTrendSettingsSection.js":
    "public/js/drawings/settings/sections/regressionTrend.js",
  "public/js/drawings/ui/shapeSettingsSection.js": "public/js/drawings/settings/sections/shape.js",
  "public/js/drawings/ui/trendLineStyleSettingsSection.js":
    "public/js/drawings/settings/sections/trendLineStyle.js",
  "public/js/drawings/ui/removeConfirmDialog.js": "public/js/drawings/settings/confirm/remove.js",
  "public/js/drawings/ui/drawToolHint.js": "public/js/drawings/settings/hint/tool.js",
  "public/js/drawings/ui/tvMenu.js": "public/js/drawings/settings/menu/tv.js",

  "public/js/drawings/multiPaneHub.js": "public/js/drawings/multi/paneHub.js",
  "public/js/drawings/types/drawingType.js": "public/js/drawings/types/handler.js",

  // ── ui ───────────────────────────────────────────────────────────────────
  "public/js/ui/appLoader.js": "public/js/ui/loader/app.js",
  "public/js/ui/chartSettings.js": "public/js/ui/chart/settings.js",
  "public/js/ui/chartSymbolStore.js": "public/js/ui/chart/symbol/store.js",
  "public/js/ui/colorPicker.js": "public/js/ui/color/picker.js",
  "public/js/ui/chartContextMenu.js": "public/js/ui/context/chart.js",
  "public/js/ui/priceScaleContextMenu.js": "public/js/ui/context/priceScale.js",
  "public/js/ui/statusLineContextMenu.js": "public/js/ui/context/statusLine.js",
  "public/js/ui/timeScaleContextMenu.js": "public/js/ui/context/timeScale.js",
  "public/js/ui/contextMenuRegistry.js": "public/js/ui/context/registry.js",
  "public/js/ui/symbolSearch.js": "public/js/ui/symbol/search.js",
  "public/js/ui/timeframeFavorites.js": "public/js/ui/timeframe/favorites.js",
  "public/js/ui/timeframePicker.js": "public/js/ui/timeframe/picker.js",
  "public/js/ui/timezoneClock.js": "public/js/ui/timezone/clock.js",
  "public/js/ui/header/headerToolbar.js": "public/js/ui/header/toolbar/index.js",
  "public/js/ui/header/headerIcons.js": "public/js/ui/header/icons.js",
  "public/js/ui/header/chartSnapshot.js": "public/js/ui/header/snapshot/chart.js",
  "public/js/ui/header/fullscreenMode.js": "public/js/ui/header/fullscreen/mode.js",
  "public/js/ui/header/layoutDefinitions.js": "public/js/ui/header/layout/definitions.js",
  "public/js/ui/header/layoutIcons.js": "public/js/ui/header/layout/icons.js",
  "public/js/ui/header/layoutManager.js": "public/js/ui/header/layout/manager.js",

  // ── css (mirror feature folders) ─────────────────────────────────────────
  "public/css/header-toolbar.css": "public/css/header/toolbar.css",
  "public/css/symbol-search.css": "public/css/symbol/search.css",
  "public/css/color-picker.css": "public/css/color/picker.css",
  "public/css/context-menu.css": "public/css/context/menu.css",
  "public/css/timezone-clock.css": "public/css/timezone/clock.css",
  "public/css/market-status.css": "public/css/market/status.css",
  "public/css/drawings/drawing-settings.css": "public/css/drawings/settings/dialog.css",
  "public/css/drawings/edit-toolbar.css": "public/css/drawings/toolbars/edit.css",
  "public/css/drawings/main-toolbar.css": "public/css/drawings/toolbars/main.css",
  "public/css/drawings/favorite-toolbar.css": "public/css/drawings/toolbars/favorite.css",
  "public/css/drawings/confirm-dialog.css": "public/css/drawings/settings/confirm.css",
  "public/css/drawings/tv-menu.css": "public/css/drawings/settings/menu.css",
};

/** @param {string} p */
function toPosix(p) {
  return p.replace(/\\/g, "/");
}

/** @param {string} rel */
function absFromRel(rel) {
  return toPosix(path.resolve(ROOT, rel));
}

/** @param {string} abs */
function relFromAbs(abs) {
  return toPosix(path.relative(ROOT, abs));
}

/** @param {string} fromDir @param {string} toAbs */
function relativeImport(fromDir, toAbs) {
  let rel = toPosix(path.relative(fromDir, toAbs));
  if (!rel.startsWith(".")) rel = `./${rel}`;
  return rel;
}

/** @param {string} fileAbs @param {string} specifier */
function resolveSpecifier(fileAbs, specifier) {
  if (!specifier.startsWith(".")) return null;
  const dir = path.dirname(fileAbs);
  let resolved = path.resolve(dir, specifier);
  if (!path.extname(resolved)) resolved += ".js";
  return toPosix(resolved);
}

/** @param {string} abs @param {Map<string, string>} forward @param {Map<string, string>} reverse */
function canonicalNewPath(abs, forward, reverse) {
  const old = reverse.get(abs) ?? abs;
  return forward.get(old) ?? abs;
}

/** @param {string} content @param {string} fileNewAbs @param {Map<string, string>} forward @param {Map<string, string>} reverse */
function rewriteImports(content, fileNewAbs, forward, reverse) {
  const fileOldAbs = reverse.get(fileNewAbs) ?? fileNewAbs;
  const re = /(\bfrom\s+['"])([^'"]+)(['"])|(\bimport\s*\(\s*['"])([^'"]+)(['"]\s*\))/g;

  return content.replace(re, (match, fromPre, fromSpec, fromSuf, dynPre, dynSpec, dynSuf) => {
    const specifier = fromSpec ?? dynSpec;
    const pre = fromPre ?? dynPre;
    const suf = fromSuf ?? dynSuf;
    if (!specifier.startsWith(".")) return match;

    const resolvedOld = resolveSpecifier(fileOldAbs, specifier);
    if (!resolvedOld) return match;

    const targetNew = canonicalNewPath(resolvedOld, forward, reverse);
    const newSpec = relativeImport(path.dirname(fileNewAbs), targetNew);
    return `${pre}${newSpec}${suf}`;
  });
}

/** @param {string} dir */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function collectTextFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) collectTextFiles(full, acc);
    else if (/\.(js|mjs|css|html|json)$/.test(ent.name)) acc.push(full);
  }
  return acc;
}

function main() {
  const forward = new Map();
  const reverse = new Map();

  for (const [oldRel, newRel] of Object.entries(MOVE_MAP)) {
    const oldAbs = absFromRel(oldRel);
    const newAbs = absFromRel(newRel);
    if (!fs.existsSync(oldAbs)) {
      console.warn(`skip missing: ${oldRel}`);
      continue;
    }
    forward.set(oldAbs, newAbs);
    reverse.set(newAbs, oldAbs);
  }

  console.log(`${DRY_RUN ? "[dry-run] " : ""}Moving ${forward.size} files...`);

  for (const [oldAbs, newAbs] of forward) {
    ensureDir(path.dirname(newAbs));
    console.log(`  ${relFromAbs(oldAbs)} -> ${relFromAbs(newAbs)}`);
    if (!DRY_RUN) {
      fs.renameSync(oldAbs, newAbs);
    }
  }

  const touchedNew = new Set([...forward.values()]);
  const allFiles = collectTextFiles(ROOT);

  let rewritten = 0;
  for (const fileAbs of allFiles) {
    const fileNewAbs = toPosix(path.resolve(fileAbs));
    let content = fs.readFileSync(fileAbs, "utf8");
    const next = rewriteImports(content, fileNewAbs, forward, reverse);
    if (next !== content) {
      rewritten += 1;
      if (!DRY_RUN) fs.writeFileSync(fileAbs, next, "utf8");
    }
  }

  console.log(`Rewrote imports in ${rewritten} files.`);

  // Write manifest for documentation
  const manifest = {
    movedAt: new Date().toISOString(),
    dryRun: DRY_RUN,
    moves: Object.fromEntries(
      [...forward.entries()].map(([o, n]) => [relFromAbs(o), relFromAbs(n)]),
    ),
  };
  const manifestPath = path.join(ROOT, "docs", "restructure-manifest.json");
  if (!DRY_RUN) {
    ensureDir(path.dirname(manifestPath));
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  }

  // Clean empty directories
  if (!DRY_RUN) {
    for (const oldAbs of forward.keys()) {
      let dir = path.dirname(oldAbs);
      while (dir.startsWith(ROOT) && dir !== ROOT) {
        try {
          if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
        } catch {
          break;
        }
        dir = path.dirname(dir);
      }
    }
  }
}

main();

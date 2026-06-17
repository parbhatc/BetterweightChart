import { setTvCheck } from "../../drawings/settings/dialog/utils.js";
import { ICON_LINE } from "./icons.js";

/** @type {{ id: string, label: string, icon: string, enabled?: boolean }[]} */
export const LINE_PLOT_TYPES = [
  { id: "line", label: "Line", icon: ICON_LINE },
  {
    id: "line_breaks",
    label: "Line with breaks",
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="none" aria-hidden="true"><path stroke="currentColor" d="M5.5 16.5l5-5a1.414 1.414 0 0 1 2 0m11-1l-5 5a1.414 1.414 0 0 1-2 0"/><path fill="currentColor" d="M14 5h1v2h-1zM14 10h1v2h-1zM14 15h1v2h-1zM14 20h1v2h-1z"/></svg>`,
  },
  {
    id: "step",
    label: "Step line",
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="none" aria-hidden="true"><path stroke="currentColor" d="M5.5 17v5.5h4v-18h4v12h4v-9h4V21"/></svg>`,
  },
  {
    id: "step_breaks",
    label: "Step line with breaks",
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28"><path fill="currentColor" d="M14 3h1v2h-1V3Zm1 5h-1v2h1V8Zm-1 5h1v2h-1v-2Zm0 5h1v2h-1v-2Zm0 5h1v2h-1v-2ZM10 5h2V4H9v18H6v-5H5v6h5V5Zm11 16h1V7h-5v10h1V8h3v13Z"/></path></svg>`,
  },
  {
    id: "step_diamonds",
    label: "Step line with diamonds",
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28" fill="none" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M9.8 2.7l.7-.7.7.7 2.1 2.1.2.2H18v9.5l.2.2 2.1 2.1.2.2H24v1h-3.5l-.2.2-2.1 2.1-.7.7-.7-.7-2.1-2.1-.7-.7.7-.7 2.1-2.1.2-.2V6h-3.5l-.2.2-2.1 2.1-.2.2V24H5.5v-1H10V8.5l-.2-.2-2.1-2.1-.7-.7.7-.7 2.1-2.1zM8.4 5.5l2.09 2.09 2.09-2.09-2.09-2.09L8.41 5.5zm9.09 14.09l-2.09-2.09 2.09-2.09 2.09 2.09-2.09 2.09z"/></path></svg>`,
  },
  {
    id: "histogram",
    label: "Histogram",
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><path stroke="currentColor" d="M4.5 20v-7m3 7V10m3 10V8m3 12V10m3 10v-8m3 8V10m3 10V8"/></svg>`,
  },
  {
    id: "cross",
    label: "Cross",
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><path stroke="currentColor" d="M17 8.5h7M20.5 12V5M10 19.5h7M13.5 23v-7M3 12.5h7M6.5 16V9"/></svg>`,
  },
  {
    id: "area",
    label: "Area",
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="none" aria-hidden="true"><path stroke="currentColor" d="M5.5 13.52v4.98a1 1 0 0 0 1 1h15a1 1 0 0 0 1-1V8.914c0-.89-1.077-1.337-1.707-.707l-4.66 4.66a1 1 0 0 1-1.332.074l-3.716-2.973a1 1 0 0 0-1.198-.039l-3.96 2.772a1 1 0 0 0-.427.82z"/></svg>`,
  },
  {
    id: "area_breaks",
    label: "Area with breaks",
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="none" aria-hidden="true"><path stroke="currentColor" d="M13 11.5l-1.915-1.532a1 1 0 0 0-1.198-.039l-3.96 2.772a1 1 0 0 0-.427.82V18.5a1 1 0 0 0 1 1H13m3.5-7l4.293-4.293c.63-.63 1.707-.184 1.707.707V18.5a1 1 0 0 1-1 1H16"/><path fill="currentColor" d="M14 6h1v2h-1zM14 11h1v2h-1zM14 16h1v2h-1zM14 21h1v2h-1z"/></svg>`,
  },
  {
    id: "columns",
    label: "Columns",
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="none" aria-hidden="true"><path stroke="currentColor" d="M6.5 12.5v8h3v-8h-3zM12.5 7.5v13h3v-13h-3zM18.5 15.5v5h3v-5h-3z"/></svg>`,
  },
  {
    id: "circles",
    label: "Circles",
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="none" aria-hidden="true"><path stroke="currentColor" d="M10.5 13a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM16.5 19a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM22.5 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z"/></svg>`,
  },
];

/** @type {{ id: string, label: string, icon: string, enabled?: boolean }[]} */
export const VOLUME_PLOT_TYPES = LINE_PLOT_TYPES.map((item) => ({ ...item }));

/** @deprecated use LINE_PLOT_TYPES */
export const INDICATOR_PLOT_TYPES = LINE_PLOT_TYPES;

/**
 * @param {string} plotType
 * @param {{ id: string, icon: string }[]} [plotTypes]
 */
export function plotTypeIcon(plotType, plotTypes = LINE_PLOT_TYPES) {
  return plotTypes.find((item) => item.id === plotType)?.icon ?? ICON_LINE;
}

/**
 * @param {HTMLElement} anchor
 * @param {object} opts
 * @param {boolean} opts.priceLine
 * @param {string} opts.plotType
 * @param {boolean} [opts.priceLineDisabled]
 * @param {{ id: string, label: string, icon: string, enabled?: boolean }[]} [opts.plotTypes]
 * @param {(priceLine: boolean) => void} opts.onPriceLineChange
 * @param {(plotType: string) => void} opts.onPlotTypeChange
 */
export function openIndicatorPlotTypeMenu(anchor, opts) {
  const {
    priceLine,
    plotType,
    priceLineDisabled = false,
    plotTypes = LINE_PLOT_TYPES,
    onPriceLineChange,
    onPlotTypeChange,
  } = opts;

  const menu = document.createElement("div");
  menu.className = "tv-ind-plot-menu";
  menu.innerHTML = `<div class="tv-ind-plot-menu__inner">
    <div class="tv-ind-plot-menu__price-row${priceLineDisabled ? " is-disabled" : ""}">
      <span class="tv-ind-plot-menu__price-label">Price line</span>
      <button type="button" class="tv-set__check${priceLine ? " tv-set__check--on" : ""}${priceLineDisabled ? " is-disabled" : ""}" data-plot-price-line role="switch" aria-checked="${priceLine ? "true" : "false"}" aria-disabled="${priceLineDisabled ? "true" : "false"}" aria-label="Price line"${priceLineDisabled ? " disabled tabindex=\"-1\"" : ""}>
        <span class="tv-set__check-box"></span>
      </button>
    </div>
    <div class="tv-ind-plot-menu__sep" role="separator"></div>
    <div class="tv-ind-plot-menu__list" role="listbox">${plotTypes
      .map(
        (item) =>
          `<button type="button" class="tv-ind-plot-menu__item${plotType === item.id ? " is-active" : ""}" role="option" aria-selected="${plotType === item.id ? "true" : "false"}" data-plot-type="${item.id}">
          <span class="tv-ind-plot-menu__item-icon">${item.icon}</span>
          <span class="tv-ind-plot-menu__item-label">${item.label}</span>
        </button>`,
      )
      .join("")}</div>
  </div>`;

  document.body.appendChild(menu);
  const rect = anchor.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8))}px`;
  menu.style.top = `${rect.bottom + 4}px`;

  function cleanup() {
    menu.remove();
    document.removeEventListener("click", onDoc, true);
  }

  function onDoc(ev) {
    if (menu.contains(ev.target)) return;
    cleanup();
  }

  menu.addEventListener("click", (ev) => {
    if (!priceLineDisabled) {
      const priceBtn = ev.target.closest("[data-plot-price-line]:not(.is-disabled):not([disabled])");
      if (priceBtn instanceof HTMLElement) {
        const on = !priceBtn.classList.contains("tv-set__check--on");
        setTvCheck(priceBtn, on);
        onPriceLineChange(on);
        return;
      }
    }
    const typeBtn = ev.target.closest("[data-plot-type]");
    if (typeBtn instanceof HTMLElement && typeBtn.dataset.plotType) {
      onPlotTypeChange(typeBtn.dataset.plotType);
      cleanup();
    }
  });

  setTimeout(() => document.addEventListener("click", onDoc, true), 0);
}

import { TF_MAP } from "../core/constants.js";
import { resetSetupLabelCache } from "./setupMarkers.js";
import { SetupLabelsPrimitive } from "./setupLabelsPrimitive.js";

/**
 * Setup arrows — hover preview, left-click to pin tooltip (select/copy text).
 * @param {{
 *   series: { attachPrimitive?: Function };
 *   chartWrap?: HTMLElement | null;
 *   getLabels: () => import("./setupLabelsPrimitive.js").SetupLabel[];
 *   getTf: () => string;
 * }} opts
 */
export class SetupMarkersOverlay {
  constructor(opts) {
    const { series, chartWrap, getLabels, getTf } = opts;
    this.series = series;
    this.chartWrap = chartWrap;
    this.getLabels = getLabels;
    this.getTf = getTf;

    this.primitive = new SetupLabelsPrimitive();

    if (series?.attachPrimitive) {
      series.attachPrimitive(this.primitive);
    }

    this.tooltip = document.createElement("div");
    this.tooltip.className = "setup-marker-tooltip";
    this.tooltip.setAttribute("role", "dialog");
    this.tooltip.setAttribute("aria-modal", "false");
    this.tooltip.hidden = true;
    this.chartWrap?.appendChild(this.tooltip);

    /** @type {import("./setupLabelsPrimitive.js").SetupLabel | null} */
    this.pinnedLabel = null;
    /** @type {import("./setupLabelsPrimitive.js").SetupLabel | null} */
    this.hoverLabel = null;
    this.tooltipHovered = false;
    this.lastRenderedKey = "";
    /** @type {Map<string, number>} */
    this.activeTabByLabelId = new Map();

    this.primitive.setOnVisibleRangeChange(() => {
      if (this.pinnedLabel) this.updatePinnedTooltipPosition();
    });

    this.bindTooltipEvents();
    this.bindChartEvents();

    if (typeof window !== "undefined") {
      window.debugSetupMarkerCoords = () => this.primitive.debugCoords();
    }
  }

  selectionTouchesTooltip() {
    const sel = window.getSelection();
    if (!sel?.rangeCount || sel.isCollapsed) return false;
    const anchor = sel.anchorNode;
    const focus = sel.focusNode;
    return (
      (anchor != null && this.tooltip.contains(anchor)) || (focus != null && this.tooltip.contains(focus))
    );
  }

  isolateTooltipPointer(e) {
    e.stopPropagation();
  }

  isolateTooltipWheel(e) {
    e.stopPropagation();
    if (this.tooltip.scrollHeight > this.tooltip.clientHeight) {
      e.preventDefault();
    }
  }

  /** @param {import("./setupLabelsPrimitive.js").SetupLabel} label */
  tooltipVariants(label) {
    const variants = label.tooltipVariants;
    if (variants?.length) return variants;
    return [
      {
        setupNum: /** @type {1 | 2} */ (Number(label.id.split(":")[0]) || 1),
        tooltipTitle: label.tooltipTitle,
        tooltipSections: label.tooltipSections ?? [],
      },
    ];
  }

  /** @param {import("./setupLabelsPrimitive.js").SetupLabel} label */
  activeTabIndex(label) {
    const variants = this.tooltipVariants(label);
    const stored = this.activeTabByLabelId.get(label.id) ?? 0;
    return Math.min(Math.max(0, stored), variants.length - 1);
  }

  /** @param {import("./setupLabelsPrimitive.js").SetupLabel} label @param {number} index */
  setActiveTab(label, index) {
    this.activeTabByLabelId.set(label.id, index);
    this.renderTooltipContent(label);
    this.lastRenderedKey = `${label.id}:${index}`;
  }

  /** @param {import("./setupLabelsPrimitive.js").SetupLabel} label */
  renderTooltipContent(label) {
    this.tooltip.replaceChildren();
    const variants = this.tooltipVariants(label);
    const tabbed = variants.length > 1;
    const tabIdx = this.activeTabIndex(label);
    const variant = variants[tabIdx] ?? variants[0];

    const titleEl = document.createElement("div");
    titleEl.className = "setup-marker-tooltip__title";
    titleEl.textContent = tabbed ? label.tooltipTitle : variant.tooltipTitle;
    this.tooltip.append(titleEl);

    if (tabbed) {
      const tabsEl = document.createElement("div");
      tabsEl.className = "setup-marker-tooltip__tabs";
      tabsEl.setAttribute("role", "tablist");

      for (let i = 0; i < variants.length; i++) {
        const v = variants[i];
        const tabBtn = document.createElement("button");
        tabBtn.type = "button";
        tabBtn.className = "setup-marker-tooltip__tab";
        if (i === tabIdx) tabBtn.classList.add("setup-marker-tooltip__tab--active");
        tabBtn.setAttribute("role", "tab");
        tabBtn.setAttribute("aria-selected", i === tabIdx ? "true" : "false");
        tabBtn.textContent = `Setup #${v.setupNum}`;
        tabBtn.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.setActiveTab(label, i);
        });
        tabBtn.addEventListener("click", (e) => {
          e.stopPropagation();
        });
        tabsEl.append(tabBtn);
      }
      this.tooltip.append(tabsEl);

      const variantTitle = document.createElement("div");
      variantTitle.className = "setup-marker-tooltip__variant-title";
      variantTitle.textContent = variant.tooltipTitle;
      this.tooltip.append(variantTitle);
    }

    for (const section of variant.tooltipSections ?? []) {
      const secEl = document.createElement("div");
      secEl.className = "setup-marker-tooltip__section";

      const headEl = document.createElement("div");
      headEl.className = "setup-marker-tooltip__heading";
      headEl.textContent = section.title;
      secEl.append(headEl);

      for (const line of section.items) {
        const lineEl = document.createElement("div");
        lineEl.className = "setup-marker-tooltip__line";
        lineEl.textContent = line;
        secEl.append(lineEl);
      }

      this.tooltip.append(secEl);
    }
  }

  markerPaneCoords(labelId) {
    const m = this.primitive.debugCoords().markers.find((row) => row.id === labelId);
    if (!m || m.x == null || m.y == null) return null;
    return { x: m.x, y: m.y };
  }

  updatePinnedTooltipPosition() {
    if (!this.pinnedLabel || !this.chartWrap) return;
    const pt = this.markerPaneCoords(this.pinnedLabel.id);
    if (!pt) return;
    this.tooltip.style.left = `${pt.x}px`;
    this.tooltip.style.top = `${pt.y}px`;
  }

  /**
   * @param {import("./setupLabelsPrimitive.js").SetupLabel} label
   * @param {number} [paneX]
   * @param {number} [paneY]
   */
  showTooltip(label, paneX, paneY) {
    if (!this.chartWrap || !label) {
      this.hideTooltip();
      return;
    }

    const pt =
      paneX != null && paneY != null ? { x: paneX, y: paneY } : this.markerPaneCoords(label.id);
    if (!pt) return;

    this.tooltip.hidden = false;
    const pinned = this.pinnedLabel?.id === label.id;
    const tabbed = (label.tooltipVariants?.length ?? 0) > 1;
    this.tooltip.className = [
      "setup-marker-tooltip",
      "setup-marker-tooltip--visible",
      `setup-marker-tooltip--${label.side}`,
      pinned ? "setup-marker-tooltip--pinned" : "",
      tabbed ? "setup-marker-tooltip--tabbed" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const renderKey = `${label.id}:${this.activeTabIndex(label)}`;
    if (renderKey !== this.lastRenderedKey) {
      this.renderTooltipContent(label);
      this.lastRenderedKey = renderKey;
    }
    this.tooltip.style.left = `${pt.x}px`;
    this.tooltip.style.top = `${pt.y}px`;
    this.primitive.setHover(label.id);
    this.chartWrap.style.cursor = pinned || tabbed ? "" : "pointer";
  }

  hideTooltip() {
    if (this.pinnedLabel || this.tooltipHovered) return;
    this.tooltip.hidden = true;
    this.tooltip.className = "setup-marker-tooltip";
    this.lastRenderedKey = "";
    this.hoverLabel = null;
    this.primitive.setHover(null);
    if (this.chartWrap) this.chartWrap.style.cursor = "";
  }

  unpinTooltip() {
    this.pinnedLabel = null;
    this.tooltip.classList.remove("setup-marker-tooltip--pinned");
    window.getSelection()?.removeAllRanges();
    this.hideTooltip();
  }

  /**
   * @param {import("./setupLabelsPrimitive.js").SetupLabel} label
   * @param {number} paneX
   * @param {number} paneY
   */
  pinTooltip(label, paneX, paneY) {
    this.pinnedLabel = label;
    this.showTooltip(label, paneX, paneY);
  }

  /** @param {number} px @param {number} py */
  hitTestPane(px, py) {
    return this.primitive.hitTest(px, py);
  }

  /** @param {MouseEvent} e */
  isPointerOverTooltip(e) {
    if (this.tooltip.hidden) return false;
    const rect = this.tooltip.getBoundingClientRect();
    return (
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom
    );
  }

  /** @param {MouseEvent} e */
  onMouseMove(e) {
    if (!this.chartWrap) return;
    const rect = this.chartWrap.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (this.pinnedLabel) {
      this.updatePinnedTooltipPosition();
      this.primitive.setHover(this.pinnedLabel.id);
      return;
    }

    const overTooltip = this.isPointerOverTooltip(e);
    const hit = this.primitive.hitTest(x, y);
    if (hit) {
      this.hoverLabel = hit;
      this.showTooltip(hit, x, y);
    } else if (overTooltip && this.hoverLabel) {
      this.showTooltip(this.hoverLabel, x, y);
    } else if (!overTooltip) {
      this.hoverLabel = null;
      this.hideTooltip();
    }
  }

  onMouseLeave() {
    if (!this.pinnedLabel && !this.tooltipHovered) this.hideTooltip();
  }

  /** @param {MouseEvent} e */
  onChartClick(e) {
    if (!this.chartWrap) return;

    const target = e.target;
    if (target instanceof Node && this.tooltip.contains(target)) {
      return;
    }
    if (this.selectionTouchesTooltip()) {
      e.stopPropagation();
      return;
    }

    const rect = this.chartWrap.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hit = this.primitive.hitTest(x, y);

    if (hit) {
      e.stopPropagation();
      if (this.pinnedLabel?.id !== hit.id) {
        this.pinTooltip(hit, x, y);
      }
      return;
    }

    if (this.pinnedLabel) {
      this.unpinTooltip();
    }
  }

  /** @param {KeyboardEvent} e */
  onKeyDown(e) {
    if (e.key === "Escape" && this.pinnedLabel) {
      this.unpinTooltip();
    }
  }

  onTooltipMouseEnter() {
    this.tooltipHovered = true;
  }

  onTooltipMouseLeave() {
    this.tooltipHovered = false;
    if (!this.pinnedLabel) this.hideTooltip();
  }

  bindTooltipEvents() {
    for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel", "mousedown", "click", "dblclick"]) {
      this.tooltip.addEventListener(type, (e) => this.isolateTooltipPointer(e));
    }
    this.tooltip.addEventListener("wheel", (e) => this.isolateTooltipWheel(e), { passive: false });
    this.tooltip.addEventListener("mouseenter", () => this.onTooltipMouseEnter());
    this.tooltip.addEventListener("mouseleave", () => this.onTooltipMouseLeave());
  }

  bindChartEvents() {
    this.chartWrap?.addEventListener("mousemove", (e) => this.onMouseMove(e));
    this.chartWrap?.addEventListener("mouseleave", () => this.onMouseLeave());
    this.chartWrap?.addEventListener("click", (e) => this.onChartClick(e), true);
    document.addEventListener("keydown", (e) => this.onKeyDown(e));
  }

  sync() {
    const tf = this.getTf();
    const tfSec = TF_MAP[tf] ?? 60;
    const labels = this.getLabels();
    this.primitive.setData({ labels, tfSec });

    if (this.pinnedLabel) {
      const fresh = labels.find((l) => l.id === this.pinnedLabel.id);
      if (fresh) {
        this.pinnedLabel = fresh;
        this.showTooltip(fresh);
        this.updatePinnedTooltipPosition();
      } else {
        this.unpinTooltip();
      }
    }
  }

  clear() {
    resetSetupLabelCache();
    this.unpinTooltip();
    this.primitive.setData({ labels: [] });
  }

  destroy() {
    this.chartWrap?.removeEventListener("mousemove", (e) => this.onMouseMove(e));
    this.chartWrap?.removeEventListener("mouseleave", () => this.onMouseLeave());
    this.chartWrap?.removeEventListener("click", (e) => this.onChartClick(e), true);
    document.removeEventListener("keydown", (e) => this.onKeyDown(e));
    this.tooltip.remove();
  }
}

export function createSetupMarkersOverlay(opts) {
  return new SetupMarkersOverlay(opts);
}

import { newsImpactKind } from "../news/markers.js";

const MARKER_SIZE = 22;
const MARKER_GAP = 4;

/** @param {HTMLElement} parent @param {string} className */
function div(parent, className) {
  const el = document.createElement("div");
  el.className = className;
  parent.appendChild(el);
  return el;
}

/** @param {unknown} value */
function valueText(value) {
  const text = String(value ?? "").trim();
  return text && text !== "—" ? text : "";
}

/**
 * Interactive TradingView-style markers positioned immediately above the time axis.
 * @param {object} opts
 * @param {HTMLElement} opts.mountEl
 * @param {import("lightweight-charts").IChartApi} opts.chart
 */
export function mountTimeScaleMarkers({ mountEl, chart }) {
  const root = div(mountEl, "tv-timescale-markers");
  root.setAttribute("aria-label", "Chart event markers");

  const popup = div(document.body, "tv-timescale-marker-popup");
  popup.hidden = true;
  popup.setAttribute("role", "dialog");
  popup.setAttribute("aria-label", "Event details");

  let markers = [];
  let buttons = [];
  let openButton = null;
  let frame = 0;
  let dragStartClientX = 0;
  let dragClientX = 0;
  let draggingChart = false;
  const positioned = [];

  function closePopup() {
    popup.hidden = true;
    popup.replaceChildren();
    openButton?.setAttribute("aria-expanded", "false");
    openButton = null;
  }

  /** @param {HTMLElement} anchor */
  function positionPopup(anchor) {
    if (popup.hidden) return;
    const rect = anchor.getBoundingClientRect();
    const pad = 8;
    const width = popup.offsetWidth;
    const height = popup.offsetHeight;
    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(pad, Math.min(window.innerWidth - width - pad, left));
    let top = rect.top - height - 8;
    if (top < pad) top = rect.bottom + 8;
    popup.style.left = `${left}px`;
    popup.style.top = `${Math.max(pad, top)}px`;
  }

  /** @param {HTMLButtonElement} button @param {object} marker */
  function openPopup(button, marker) {
    if (openButton === button && !popup.hidden) {
      closePopup();
      return;
    }
    closePopup();
    openButton = button;
    button.setAttribute("aria-expanded", "true");

    const head = div(popup, "tv-timescale-marker-popup__head");
    const heading = div(head, "tv-timescale-marker-popup__heading");
    const title = div(heading, "tv-timescale-marker-popup__title");
    title.textContent = marker.events?.length > 1 ? `${marker.events.length} news events` : "News event";
    const time = div(heading, "tv-timescale-marker-popup__time");
    time.textContent = marker.timeLabel ?? "";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "tv-timescale-marker-popup__close";
    close.setAttribute("aria-label", "Close event details");
    close.textContent = "×";
    close.addEventListener("click", closePopup);
    head.appendChild(close);

    const list = div(popup, "tv-timescale-marker-popup__list");
    for (const event of marker.events ?? []) {
      const row = div(list, "tv-timescale-marker-popup__event");
      const impact = newsImpactKind(event.impact ?? event.importance);
      row.classList.add(`tv-timescale-marker-popup__event--${impact}`);
      const rowHead = div(row, "tv-timescale-marker-popup__event-head");
      const dot = div(rowHead, "tv-timescale-marker-popup__impact");
      dot.title = `${impact} impact`;
      const eventTitle = div(rowHead, "tv-timescale-marker-popup__event-title");
      eventTitle.textContent = event.title ?? event.event ?? event.name ?? "Event";
      const currency = div(rowHead, "tv-timescale-marker-popup__currency");
      currency.textContent = event.currency ?? event.country ?? "";

      const facts = [
        ["Actual", valueText(event.actual)],
        ["Forecast", valueText(event.forecast)],
        ["Previous", valueText(event.previous)],
      ].filter(([, value]) => value);
      if (facts.length) {
        const factsEl = div(row, "tv-timescale-marker-popup__facts");
        for (const [label, value] of facts) {
          const fact = div(factsEl, "tv-timescale-marker-popup__fact");
          const factLabel = div(fact, "tv-timescale-marker-popup__fact-label");
          factLabel.textContent = label;
          const factValue = div(fact, "tv-timescale-marker-popup__fact-value");
          factValue.textContent = value;
        }
      }
    }
    popup.hidden = false;
    positionPopup(button);
  }

  function updatePositions() {
    frame = 0;
    const axisHeight = typeof chart.timeScale().height === "function" ? chart.timeScale().height() : 26;
    positioned.length = 0;
    for (const entry of buttons) {
      const x = chart.timeScale().timeToCoordinate(entry.marker.time);
      entry.x = x;
      if (x == null || !Number.isFinite(x) || x < -MARKER_SIZE || x > mountEl.clientWidth + MARKER_SIZE) {
        entry.button.hidden = true;
        continue;
      }
      entry.button.hidden = false;
      positioned.push(entry);
    }
    positioned.sort((a, b) => a.x - b.x);
    const laneEnds = [-Infinity, -Infinity, -Infinity];
    for (const entry of positioned) {
      let lane = laneEnds.findIndex((end) => entry.x - end >= MARKER_SIZE + MARKER_GAP);
      if (lane < 0) lane = laneEnds.indexOf(Math.min(...laneEnds));
      laneEnds[lane] = entry.x;
      const y = Math.max(0, axisHeight - 1) + lane * (MARKER_SIZE + 2);
      if (entry.lastX !== entry.x || entry.lastY !== y) {
        entry.lastX = entry.x;
        entry.lastY = y;
        // Transform-only movement stays on the compositor and avoids forcing
        // layout for every marker while the chart is being dragged.
        entry.button.style.setProperty("--marker-x", `${entry.x}px`);
        entry.button.style.setProperty("--marker-y", `${-y}px`);
      }
    }
    if (openButton?.hidden) closePopup();
  }

  function schedulePosition() {
    if (frame) return;
    frame = requestAnimationFrame(updatePositions);
  }

  function applyDragPosition() {
    if (!draggingChart) return;
    const deltaX = dragClientX - dragStartClientX;
    for (const entry of buttons) {
      if (!Number.isFinite(entry.dragStartX)) continue;
      const x = entry.dragStartX + deltaX;
      entry.button.hidden = x < -MARKER_SIZE || x > mountEl.clientWidth + MARKER_SIZE;
      entry.button.style.setProperty("--marker-x", `${x}px`);
    }
  }

  function render() {
    root.replaceChildren();
    buttons = markers.map((marker) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tv-timescale-marker";
      button.style.setProperty("--marker-color", marker.color ?? "#a855f7");
      button.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-label", marker.title ?? "Chart event");
      button.title = marker.title ?? "Chart event";
      const glyph = document.createElement("span");
      glyph.className = "tv-timescale-marker__glyph";
      glyph.textContent = marker.label ?? "•";
      button.appendChild(glyph);
      if ((marker.events?.length ?? 0) > 1) {
        const count = document.createElement("span");
        count.className = "tv-timescale-marker__count";
        count.textContent = String(marker.events.length);
        button.appendChild(count);
      }
      button.addEventListener("pointerdown", (event) => event.stopPropagation());
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openPopup(button, marker);
      });
      root.appendChild(button);
      return { button, marker, x: 0, dragStartX: 0, lastX: null, lastY: null };
    });
    schedulePosition();
  }

  const onDocumentPointerDown = (event) => {
    if (popup.hidden) return;
    if (popup.contains(event.target) || openButton?.contains(event.target)) return;
    closePopup();
  };
  const onKeyDown = (event) => {
    if (event.key === "Escape") closePopup();
  };
  document.addEventListener("pointerdown", onDocumentPointerDown, true);
  document.addEventListener("keydown", onKeyDown);
  // LWC can defer its public range callback until mouse-up. Follow the actual
  // left-drag pixel delta meanwhile, then reconcile to the authoritative scale.
  const onVisibleRangeChange = () => {
    if (!popup.hidden) closePopup();
    if (draggingChart) return;
    schedulePosition();
  };
  const onPointerDown = (event) => {
    if (event.button !== 0 || event.isPrimary === false) return;
    if (event.target instanceof Element && event.target.closest(".tv-timescale-marker")) return;
    draggingChart = true;
    dragStartClientX = event.clientX;
    dragClientX = event.clientX;
    for (const entry of buttons) entry.dragStartX = entry.x;
    if (!popup.hidden) closePopup();
  };
  const onPointerMove = (event) => {
    if (!draggingChart) return;
    dragClientX = event.clientX;
    // A transform-only write is cheap and must happen before mouse-up; queuing
    // this can drop the final movement when a fast drag starts and ends in one frame.
    applyDragPosition();
  };
  const onPointerEnd = () => {
    if (!draggingChart) return;
    draggingChart = false;
    schedulePosition();
  };
  chart.timeScale().subscribeVisibleLogicalRangeChange(onVisibleRangeChange);
  mountEl.addEventListener("pointerdown", onPointerDown, { capture: true, passive: true });
  window.addEventListener("pointermove", onPointerMove, { capture: true, passive: true });
  window.addEventListener("pointerup", onPointerEnd, { capture: true, passive: true });
  window.addEventListener("pointercancel", onPointerEnd, { capture: true, passive: true });
  const resizeObserver = new ResizeObserver(schedulePosition);
  resizeObserver.observe(mountEl);

  return {
    /** @param {object[]} next */
    setMarkers(next) {
      markers = Array.isArray(next) ? next : [];
      closePopup();
      render();
    },
    requestRefresh: schedulePosition,
    destroy() {
      if (frame) cancelAnimationFrame(frame);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onVisibleRangeChange);
      mountEl.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerup", onPointerEnd, true);
      window.removeEventListener("pointercancel", onPointerEnd, true);
      resizeObserver.disconnect();
      document.removeEventListener("pointerdown", onDocumentPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
      closePopup();
      popup.remove();
      root.remove();
    },
  };
}

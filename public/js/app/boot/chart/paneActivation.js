/**

 * Select a layout pane on pointer/touch (mousedown alone misses many mobile taps on the canvas).

 * @param {HTMLElement} wrapEl

 * @param {number} paneIndex

 * @param {(index: number) => void} setActivePane

 * @param {import("lightweight-charts").IChartApi} [chart]

 */

export function wirePaneActivation(wrapEl, paneIndex, setActivePane, chart) {

  if (!(wrapEl instanceof HTMLElement) || typeof setActivePane !== "function") return;



  const activate = (e) => {

    if (e.type === "mousedown" && e.button !== 0) return;

    if (e.type === "pointerdown" && e.pointerType === "mouse" && e.button !== 0) return;

    setActivePane(paneIndex);

  };



  wrapEl.addEventListener("pointerdown", activate, { capture: true });

  wrapEl.addEventListener("mousedown", activate);



  // LWC click is reliable on mobile when touch panning swallows wrap pointer hits.

  if (chart?.subscribeClick) {

    chart.subscribeClick(() => setActivePane(paneIndex));

  }



  const stage = wrapEl.querySelector(".tv-chart-wrap__stage");

  if (stage instanceof HTMLElement) {

    stage.addEventListener(

      "touchend",

      (ev) => {

        if (ev.changedTouches?.length !== 1) return;

        const t = ev.changedTouches[0];

        const hit = document.elementFromPoint(t.clientX, t.clientY);

        if (hit instanceof Node && stage.contains(hit)) {

          setActivePane(paneIndex);

        }

      },

      { passive: true },

    );

  }

}



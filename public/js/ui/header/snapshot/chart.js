/**
 * @param {() => import("lightweight-charts").IChartApi | null} getChart
 * @param {() => HTMLElement | null} [getOverlayEl]
 * @param {() => string} [getShareUrl]
 */
export function createChartSnapshot(getChart, getOverlayEl, getShareUrl) {
  function captureCanvas() {
    const chart = getChart();
    if (!chart) return null;

    let canvas = chart.takeScreenshot(true, false);
    const overlay = getOverlayEl?.();
    if (overlay && overlay.childNodes.length) {
      const merged = document.createElement("canvas");
      merged.width = canvas.width;
      merged.height = canvas.height;
      const ctx = merged.getContext("2d");
      if (!ctx) return canvas;
      ctx.drawImage(canvas, 0, 0);
      const rect = overlay.getBoundingClientRect();
      const chartRect = chart.chartElement().getBoundingClientRect();
      const scaleX = canvas.width / chartRect.width;
      const scaleY = canvas.height / chartRect.height;
      for (const node of overlay.querySelectorAll("canvas")) {
        const r = node.getBoundingClientRect();
        ctx.drawImage(
          node,
          (r.left - chartRect.left) * scaleX,
          (r.top - chartRect.top) * scaleY,
          r.width * scaleX,
          r.height * scaleY,
        );
      }
      canvas = merged;
    }
    return canvas;
  }

  async function toBlob() {
    const canvas = captureCanvas();
    if (!canvas) return null;
    return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  }

  function defaultFilename() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `chart-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.png`;
  }

  async function downloadImage() {
    const blob = await toBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = defaultFilename();
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyImage() {
    const blob = await toBlob();
    if (!blob || !navigator.clipboard?.write) return;
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  }

  async function copyLink() {
    if (!navigator.clipboard?.writeText) return;
    const link = getShareUrl?.() ?? window.location.href;
    await navigator.clipboard.writeText(link);
  }

  async function openInNewTab() {
    const blob = await toBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return { downloadImage, copyImage, copyLink, openInNewTab };
}

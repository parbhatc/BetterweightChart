/**
 * @param {import("./state.js").BootContext} ctx
 */
export function wireKeyboardShortcuts(ctx) {
  document.addEventListener("keydown", (ev) => {
    if (!ev.altKey || ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) {
      return;
    }
    const key = ev.key.toLowerCase();
    if (key === "i") {
      ev.preventDefault();
      const sc = ctx.settingsStore.get().scales ?? {};
      ctx.settingsStore.set("scales", "invertScale", !sc.invertScale);
      return;
    }
    if (key === "p") {
      ev.preventDefault();
      ctx.settingsStore.merge({ scales: { priceScaleMode: "percent", logarithmic: false } });
      return;
    }
    if (key === "l") {
      ev.preventDefault();
      ctx.settingsStore.merge({ scales: { priceScaleMode: "logarithmic", logarithmic: true } });
      return;
    }
    if (ev.ctrlKey && ev.altKey && key === "q") {
      ev.preventDefault();
      ctx.resetTimeScale();
    }
  });
}

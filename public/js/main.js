import { bootChart } from "./app.js";

bootChart()
  .then((widget) => {
    if (typeof window !== "undefined") window.__BWC_WIDGET__ = widget;
  })
  .catch((err) => {
    console.error(err);
    document.getElementById("app-loader")?.classList.add("app-loader--hidden");
  });
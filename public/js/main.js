import { bootChart } from "./app.js";

bootChart().catch((err) => {
  console.error(err);
  document.getElementById("app-loader")?.classList.add("app-loader--hidden");
});
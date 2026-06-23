/**
 * Floating symbol search popover (indicator settings, etc.).
 * @param {object} opts
 * @param {HTMLElement} opts.anchor
 * @param {import("../../datafeed/types.js").DatafeedApi} opts.datafeed
 * @param {string} [opts.currentSymbol]
 * @param {(symbol: string, meta: object) => void} opts.onSelect
 */
export function openSymbolSearchPopover(opts) {
  const { anchor, datafeed, currentSymbol = "", onSelect } = opts;

  const menu = document.createElement("div");
  menu.className = "tv-symbol-popover";
  menu.setAttribute("role", "dialog");
  menu.innerHTML = `<input type="search" class="tv-symbol__search" placeholder="Search symbol" autocomplete="off" data-search />
<ul class="tv-symbol__list" role="listbox"></ul>`;

  const searchInput = menu.querySelector("[data-search]");
  const listEl = menu.querySelector(".tv-symbol__list");
  if (!(searchInput instanceof HTMLInputElement) || !(listEl instanceof HTMLElement)) {
    menu.remove();
    return;
  }

  document.body.appendChild(menu);
  const rect = anchor.getBoundingClientRect();
  menu.style.position = "fixed";
  menu.style.left = `${rect.left}px`;
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.minWidth = `${Math.max(rect.width, 280)}px`;
  menu.style.zIndex = "10050";

  /** @type {Map<string, object>} */
  const metaBySymbol = new Map();
  let activeSymbol = currentSymbol;

  function displayTicker(sym, meta) {
    return meta?.ticker ?? sym.split(":").pop() ?? sym;
  }

  function listItemTicker(sym, meta) {
    const full = displayTicker(sym, meta);
    const colon = full.lastIndexOf(":");
    if (colon >= 0) return full.slice(colon + 1);
    return full;
  }

  function renderList(query) {
    return datafeed.searchSymbols(query).then((results) => {
      results.forEach((r) => metaBySymbol.set(r.symbol, r));
      if (!results.length) {
        listEl.innerHTML = `<li class="tv-symbol__empty">No symbols found</li>`;
        return;
      }
      listEl.innerHTML = results
        .map((r) => {
          const active = r.symbol === activeSymbol ? " is-active" : "";
          const ticker = listItemTicker(r.symbol, r);
          const logo = r.logoUrl
            ? `<img class="tv-symbol__item-logo" src="${r.logoUrl}" alt="" loading="lazy" />`
            : `<span class="tv-symbol__item-logo tv-symbol__item-logo--empty" aria-hidden="true"></span>`;
          const sub = r.contractDescription ? ` · ${r.contractDescription}` : "";
          return `<li role="option" class="tv-symbol__item${active}" data-symbol="${r.symbol}" aria-selected="${r.symbol === activeSymbol}">
            ${logo}
            <span class="tv-symbol__item-ticker">${ticker}</span>
            <span class="tv-symbol__item-name">${r.name}${sub}</span>
            <span class="tv-symbol__item-exchange">${r.exchange ?? ""}</span>
          </li>`;
        })
        .join("");
    });
  }

  function cleanup() {
    menu.remove();
    document.removeEventListener("click", onDoc, true);
    document.removeEventListener("keydown", onKey, true);
  }

  function onDoc(ev) {
    if (menu.contains(ev.target) || anchor.contains(ev.target)) return;
    cleanup();
  }

  function onKey(ev) {
    if (ev.key === "Escape") {
      ev.preventDefault();
      cleanup();
      anchor.focus?.();
    }
  }

  searchInput.addEventListener("input", () => {
    void renderList(searchInput.value);
  });

  listEl.addEventListener("click", (ev) => {
    const item = ev.target.closest("[data-symbol]");
    if (!item) return;
    const sym = item.dataset.symbol;
    if (!sym) return;
    const meta = metaBySymbol.get(sym) ?? { symbol: sym };
    activeSymbol = sym;
    cleanup();
    onSelect(sym, meta);
  });

  setTimeout(() => {
    document.addEventListener("click", onDoc, true);
    document.addEventListener("keydown", onKey, true);
    searchInput.focus();
  }, 0);

  const seed = activeSymbol.includes(":")
    ? activeSymbol.split(":")[1]?.replace(/[0-9].*$/, "") ?? ""
    : activeSymbol;
  void renderList(seed || "ES");
}

/**
 * Symbol search dropdown.
 * @param {object} opts
 * @param {HTMLElement} opts.root
 * @param {ReturnType<import("../../datafeed/client.js").createDatafeed>} opts.datafeed
 * @param {string} opts.initialSymbol
 * @param {(symbol: string, meta: object) => void} opts.onSelect
 */
export function mountSymbolSearch(opts) {
  const { root, datafeed, initialSymbol, onSelect } = opts;

  const trigger = root.querySelector("#symbol-trigger");
  const logoEl = root.querySelector("#symbol-logo");
  const tickerEl = root.querySelector("#symbol-ticker");
  const nameEl = root.querySelector("#symbol-name");
  const exchangeEl = root.querySelector("#symbol-exchange");
  const dropdown = root.querySelector("#symbol-dropdown");
  const searchInput = root.querySelector("#symbol-search");
  const listEl = root.querySelector("#symbol-list");

  if (!trigger || !dropdown || !searchInput || !listEl) {
    throw new Error("Symbol search markup missing");
  }

  /** @type {Map<string, object>} */
  const metaBySymbol = new Map();
  let open = false;
  let activeSymbol = initialSymbol;

  function displayTicker(sym, meta) {
    return meta?.ticker ?? sym.split(":").pop() ?? sym;
  }

  function setLogo(el, url) {
    if (!(el instanceof HTMLImageElement)) return;
    if (url) {
      el.src = url;
      el.hidden = false;
    } else {
      el.removeAttribute("src");
      el.hidden = true;
    }
  }

  function setDisplay(sym, meta) {
    activeSymbol = sym;
    const ticker = displayTicker(sym, meta);
    if (tickerEl) tickerEl.textContent = ticker;
    if (nameEl) {
      const sub = meta?.contractDescription;
      nameEl.textContent = sub ? `${meta?.name ?? ticker} · ${sub}` : meta?.name ?? meta?.description ?? ticker;
    }
    if (exchangeEl) exchangeEl.textContent = meta?.exchange ?? "";
    setLogo(logoEl, meta?.logoUrl);
    trigger?.setAttribute("aria-label", `${ticker}${meta?.name ? ` — ${meta.name}` : ""}`);
  }

  function close() {
    open = false;
    dropdown.hidden = true;
    trigger?.setAttribute("aria-expanded", "false");
  }

  function openDropdown() {
    open = true;
    dropdown.hidden = false;
    trigger?.setAttribute("aria-expanded", "true");
    searchInput.value = "";
    void renderList("");
    searchInput.focus();
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
          const ticker = displayTicker(r.symbol, r);
          const logo = r.logoUrl
            ? `<img class="tv-symbol__item-logo" src="${r.logoUrl}" alt="" loading="lazy" />`
            : `<span class="tv-symbol__item-logo tv-symbol__item-logo--empty" aria-hidden="true"></span>`;
          const sub = r.contractDescription ? ` · ${r.contractDescription}` : "";
          return `<li role="option" class="tv-symbol__item${active}" data-symbol="${r.symbol}" aria-selected="${r.symbol === activeSymbol}">
            ${logo}
            <span class="tv-symbol__item-ticker">${ticker}</span>
            <span class="tv-symbol__item-name">${r.name}${sub}</span>
            <span class="tv-symbol__item-exchange">${r.exchange}</span>
          </li>`;
        })
        .join("");
    });
  }

  trigger.addEventListener("click", () => {
    if (open) close();
    else openDropdown();
  });

  searchInput.addEventListener("input", () => {
    void renderList(searchInput.value);
  });

  searchInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      close();
      trigger?.focus();
    }
  });

  listEl.addEventListener("click", (ev) => {
    const item = ev.target.closest("[data-symbol]");
    if (!item) return;
    const sym = item.dataset.symbol;
    const meta = metaBySymbol.get(sym) ?? { symbol: sym };
    setDisplay(sym, meta);
    close();
    onSelect(sym, meta);
  });

  document.addEventListener("click", (ev) => {
    if (!open) return;
    if (root.contains(ev.target)) return;
    close();
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && open) close();
  });

  return {
    async init() {
      const seed = activeSymbol.includes(":")
        ? activeSymbol.split(":")[1]?.replace(/[0-9].*$/, "") ?? ""
        : activeSymbol;
      const results = await datafeed.searchSymbols(seed || "NQ");
      results.forEach((s) => metaBySymbol.set(s.symbol, s));
      const meta =
        metaBySymbol.get(activeSymbol) ?? results.find((s) => s.symbol === activeSymbol);
      if (meta) setDisplay(activeSymbol, meta);
      else {
        const info = await datafeed.resolveSymbol(activeSymbol);
        setDisplay(activeSymbol, {
          name: info.description,
          exchange: info.exchange,
          ticker: info.ticker,
          logoUrl: info.logoUrl,
        });
      }
    },
    setSymbol(sym, meta) {
      const resolved = meta ?? metaBySymbol.get(sym) ?? { symbol: sym };
      setDisplay(sym, resolved);
    },
    getSymbol: () => activeSymbol,
    open: openDropdown,
  };
}

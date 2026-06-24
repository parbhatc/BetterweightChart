/**
 * Symbol search — centered modal dialog (TradingView-style).
 * @param {object} opts
 * @param {HTMLElement} opts.root
 * @param {ReturnType<import("../../datafeed/client.js").createDatafeed>} opts.datafeed
 * @param {string} opts.initialSymbol
 * @param {(symbol: string, meta: object) => void} opts.onSelect
 */

const ICON_SEARCH = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="22" height="22" fill="none" aria-hidden="true"><path fill="currentColor" d="M12.182 4a8.18 8.18 0 0 1 6.29 13.412l5.526 5.525-1.06 1.06-5.527-5.525A8.182 8.182 0 1 1 12.181 4m0 1.5a6.681 6.681 0 1 0 0 13.363 6.681 6.681 0 0 0 0-13.363"/></svg>`;
const ICON_CLOSE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width="18" height="18" aria-hidden="true"><path stroke="currentColor" stroke-width="1.2" fill="none" d="m1.5 1.5 15 15m0-15-15 15"/></svg>`;
const ICON_CLEAR = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width="18" height="18" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M9 17A8 8 0 1 0 9 1a8 8 0 0 0 0 16Zm0-9.04L6.04 5 5 6.04 7.96 9 5 11.96 6.04 13 9 10.04 11.96 13 13 11.96 10.04 9 13 6.04 11.96 5 9 7.96Z"/></svg>`;

const TYPE_TABS = [
  { id: "", label: "All" },
  { id: "stock", label: "Stocks" },
  { id: "etf", label: "Funds" },
  { id: "futures", label: "Futures" },
  { id: "forex", label: "Forex" },
  { id: "crypto", label: "Crypto" },
  { id: "index", label: "Indices" },
];

/** @param {string} [type] */
function normalizeType(type) {
  const t = String(type || "").toLowerCase();
  if (t === "bitcoin" || t === "crypto") return "crypto";
  if (t === "fund") return "etf";
  return t;
}

/** @param {HTMLElement} root */
function ensureSymbolModal(root) {
  let modal = document.getElementById("symbol-modal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "symbol-modal";
  modal.className = "tv-symbol-modal";
  modal.hidden = true;
  modal.innerHTML = `<div class="tv-symbol-modal__backdrop" data-backdrop></div>
<div class="tv-symbol-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="symbol-modal-title" data-name="symbol-search-items-dialog">
  <div class="tv-symbol-modal__header">
    <h2 id="symbol-modal-title" class="tv-symbol-modal__title">Symbol search</h2>
    <button type="button" class="tv-symbol-modal__close" data-close aria-label="Close menu">${ICON_CLOSE}</button>
  </div>
  <div class="tv-symbol-modal__search-wrap">
    <span class="tv-symbol-modal__search-icon">${ICON_SEARCH}</span>
    <input
      type="text"
      class="tv-symbol-modal__search"
      id="symbol-search"
      role="searchbox"
      placeholder="Symbol, ISIN, or CUSIP"
      autocomplete="off"
      spellcheck="false"
    />
    <div class="tv-symbol-modal__search-actions">
      <button type="button" class="tv-symbol-modal__clear" data-clear aria-label="Clear" title="Clear" hidden>${ICON_CLEAR}</button>
    </div>
  </div>
  <div class="tv-symbol-modal__tabs" role="tablist" aria-label="Symbol type" data-tabs></div>
  <div class="tv-symbol-modal__body">
    <ul class="tv-symbol-modal__list" id="symbol-list" role="listbox"></ul>
  </div>
  <div class="tv-symbol-modal__footer">Search using symbol name or ticker</div>
</div>`;
  document.body.appendChild(modal);
  return modal;
}

export function mountSymbolSearch(opts) {
  const { root, datafeed, initialSymbol, onSelect } = opts;

  const trigger = root.querySelector("#symbol-trigger");
  const logoEl = root.querySelector("#symbol-logo");
  const tickerEl = root.querySelector("#symbol-ticker");
  const nameEl = root.querySelector("#symbol-name");
  const exchangeEl = root.querySelector("#symbol-exchange");

  const modal = ensureSymbolModal(root);
  const searchInput = modal.querySelector("#symbol-search");
  const listEl = modal.querySelector("#symbol-list");
  const tabsEl = modal.querySelector("[data-tabs]");
  const clearBtn = modal.querySelector("[data-clear]");

  if (!trigger || !(searchInput instanceof HTMLInputElement) || !(listEl instanceof HTMLElement) || !(tabsEl instanceof HTMLElement)) {
    throw new Error("Symbol search markup missing");
  }

  /** @type {Map<string, object>} */
  const metaBySymbol = new Map();
  let open = false;
  let activeSymbol = initialSymbol;
  let activeTab = "";
  let searchSeq = 0;

  function renderTabs() {
    tabsEl.innerHTML = TYPE_TABS.map(
      (tab) =>
        `<button type="button" role="tab" class="tv-symbol-modal__tab${tab.id === activeTab ? " is-active" : ""}" data-tab="${tab.id}" aria-selected="${tab.id === activeTab}">${tab.label}</button>`,
    ).join("");
  }

  function displayTicker(sym, meta) {
    if (meta?.ticker) return meta.ticker;
    if (meta?.exchange && meta?.symbol && !String(meta.symbol).includes(":")) {
      return `${meta.exchange}:${meta.symbol}`;
    }
    const raw = sym.split(":").pop() ?? sym;
    if (meta?.exchange && raw) return `${meta.exchange}:${raw}`;
    return sym;
  }

  /** Short root for list rows — exchange is shown in its own column. */
  function listItemTicker(sym, meta) {
    const full = displayTicker(sym, meta);
    const colon = full.lastIndexOf(":");
    if (colon >= 0) return full.slice(colon + 1);
    return full;
  }

  function matchesActiveSymbol(sym, meta, active) {
    if (!active) return false;
    if (sym === active || meta?.ticker === active || meta?.streamTicker === active) return true;
    const rootSym = active.includes(":") ? active.split(":").pop() : active;
    return sym === rootSym || meta?.symbol === rootSym;
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

  function resultLabel(r) {
    return r.name || r.description || r.full_name || r.symbol || "";
  }

  function setDisplay(sym, meta) {
    activeSymbol = sym;
    const ticker = displayTicker(sym, meta);
    if (tickerEl) tickerEl.textContent = ticker;
    if (nameEl) {
      const sub = meta?.contractDescription;
      nameEl.textContent = sub
        ? `${resultLabel(meta) || ticker} · ${sub}`
        : resultLabel(meta) || ticker;
    }
    if (exchangeEl) exchangeEl.textContent = meta?.exchange ?? "";
    setLogo(logoEl, meta?.logoUrl);
    trigger?.setAttribute("aria-label", `${ticker}${resultLabel(meta) ? ` — ${resultLabel(meta)}` : ""}`);
  }

  function syncClearButton() {
    if (!(clearBtn instanceof HTMLButtonElement)) return;
    const hasValue = Boolean(searchInput.value.trim());
    clearBtn.hidden = !hasValue;
  }

  function close() {
    open = false;
    modal.hidden = true;
    document.body.classList.remove("tv-symbol-modal-open");
    trigger?.setAttribute("aria-expanded", "false");
    searchInput.value = "";
    syncClearButton();
  }

  function openDropdown() {
    open = true;
    activeTab = "";
    renderTabs();
    modal.hidden = false;
    document.body.classList.add("tv-symbol-modal-open");
    trigger?.setAttribute("aria-expanded", "true");
    searchInput.value = "";
    syncClearButton();
    void renderList("");
    requestAnimationFrame(() => searchInput.focus());
  }

  /** @param {object[]} results */
  function applyTabFilter(results) {
    if (!activeTab) return results;
    return results.filter((r) => normalizeType(r.type) === activeTab);
  }

  function renderList(query) {
    const seq = ++searchSeq;
    return datafeed.searchSymbols(query, "", activeTab, 50).then((results) => {
      if (seq !== searchSeq) return;
      results.forEach((r) => metaBySymbol.set(r.symbol, r));
      const filtered = applyTabFilter(results);
      if (!filtered.length) {
        listEl.innerHTML = `<li class="tv-symbol-modal__empty">No symbols found</li>`;
        return;
      }
      listEl.innerHTML = filtered
        .map((r) => {
          const active = matchesActiveSymbol(r.symbol, r, activeSymbol) ? " is-active" : "";
          const ticker = listItemTicker(r.symbol, r);
          const logo = r.logoUrl
            ? `<img class="tv-symbol-modal__item-logo" src="${r.logoUrl}" alt="" loading="lazy" />`
            : `<span class="tv-symbol-modal__item-logo tv-symbol-modal__item-logo--letter" aria-hidden="true">${ticker.charAt(0) || "?"}</span>`;
          const label = resultLabel(r);
          const marketType = normalizeType(r.type) || "—";
          return `<li role="option" class="tv-symbol-modal__item${active}" data-symbol="${r.symbol}" aria-selected="${matchesActiveSymbol(r.symbol, r, activeSymbol)}">
            <div class="tv-symbol-modal__item-main">
              <div class="tv-symbol-modal__item-logo-wrap">${logo}</div>
              <div class="tv-symbol-modal__item-ticker">${ticker}</div>
            </div>
            <div class="tv-symbol-modal__item-desc">${label}</div>
            <div class="tv-symbol-modal__item-meta">
              <span class="tv-symbol-modal__item-type">${marketType}</span>
              <span class="tv-symbol-modal__item-exchange">${r.exchange ?? ""}</span>
            </div>
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
    syncClearButton();
    void renderList(searchInput.value);
  });

  searchInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      close();
      trigger?.focus();
    }
  });

  tabsEl.addEventListener("click", (ev) => {
    const tab = ev.target instanceof Element ? ev.target.closest("[data-tab]") : null;
    if (!(tab instanceof HTMLElement)) return;
    const next = tab.dataset.tab ?? "";
    if (next === activeTab) return;
    activeTab = next;
    renderTabs();
    void renderList(searchInput.value);
  });

  if (clearBtn instanceof HTMLButtonElement) {
    clearBtn.addEventListener("click", () => {
      searchInput.value = "";
      syncClearButton();
      searchInput.focus();
      void renderList("");
    });
  }

  modal.addEventListener("click", (ev) => {
    if (ev.target instanceof Element && ev.target.closest("[data-close], [data-backdrop]")) {
      close();
      trigger?.focus();
    }
  });

  listEl.addEventListener("click", (ev) => {
    const item = ev.target instanceof Element ? ev.target.closest("[data-symbol]") : null;
    if (!(item instanceof HTMLElement)) return;
    const sym = item.dataset.symbol;
    if (!sym) return;
    const meta = metaBySymbol.get(sym) ?? { symbol: sym };
    close();
    trigger?.focus();
    if (matchesActiveSymbol(sym, meta, activeSymbol)) return;
    setDisplay(sym, meta);
    onSelect(sym, meta);
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && open) {
      close();
      trigger?.focus();
    }
  });

  renderTabs();

  return {
    async init() {
      const seed = activeSymbol.includes(":")
        ? activeSymbol.split(":")[1]?.replace(/[0-9].*$/, "") ?? ""
        : activeSymbol;
      const results = await datafeed.searchSymbols(seed || "NQ");
      results.forEach((s) => metaBySymbol.set(s.symbol, s));
      const meta =
        metaBySymbol.get(activeSymbol) ??
        results.find((s) => matchesActiveSymbol(s.symbol, s, activeSymbol));
      if (meta) setDisplay(activeSymbol, meta);
      else {
        const info = await datafeed.resolveSymbol(activeSymbol);
        const rootSym = activeSymbol.includes(":") ? activeSymbol.split(":").pop() : activeSymbol;
        const exchange = info.listed_exchange || info.exchange?.replace(/\s*\(Delayed\)$/i, "") || "CME";
        setDisplay(activeSymbol, {
          name: info.description,
          exchange,
          symbol: rootSym,
          ticker: info.ticker?.includes("-Delayed:")
            ? info.ticker.replace(/-Delayed:/i, ":")
            : info.ticker || `${exchange}:${rootSym}`,
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

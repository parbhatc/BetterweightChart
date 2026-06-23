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
    const root = active.includes(":") ? active.split(":").pop() : active;
    return sym === root || meta?.symbol === root;
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

  function close() {
    open = false;
    dropdown.hidden = true;
    trigger?.setAttribute("aria-expanded", "false");
    dropdown.style.top = "";
    dropdown.style.left = "";
    dropdown.style.right = "";
    dropdown.style.width = "";
    window.removeEventListener("resize", positionDropdown);
    window.removeEventListener("scroll", positionDropdown, true);
  }

  function positionDropdown() {
    if (!open || !trigger) return;
    const pad = 8;
    const gap = 4;
    const rect = trigger.getBoundingClientRect();
    let top = rect.bottom + gap;
    let left = Math.max(pad, rect.left);

    dropdown.style.top = `${top}px`;
    dropdown.style.left = `${left}px`;
    dropdown.style.right = "auto";
    dropdown.style.width = "";

    const panelRect = dropdown.getBoundingClientRect();
    if (panelRect.right > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - panelRect.width - pad);
      dropdown.style.left = `${left}px`;
    }
    if (panelRect.bottom > window.innerHeight - pad) {
      const flipTop = rect.top - panelRect.height - gap;
      if (flipTop >= pad) dropdown.style.top = `${flipTop}px`;
    }
  }

  function openDropdown() {
    open = true;
    dropdown.hidden = false;
    trigger?.setAttribute("aria-expanded", "true");
    searchInput.value = "";
    positionDropdown();
    window.addEventListener("resize", positionDropdown);
    window.addEventListener("scroll", positionDropdown, true);
    void renderList("").then(() => positionDropdown());
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
          const ticker = listItemTicker(r.symbol, r);
          const logo = r.logoUrl
            ? `<img class="tv-symbol__item-logo" src="${r.logoUrl}" alt="" loading="lazy" />`
            : `<span class="tv-symbol__item-logo tv-symbol__item-logo--empty" aria-hidden="true"></span>`;
          const label = resultLabel(r);
          const sub = r.contractDescription ? ` · ${r.contractDescription}` : "";
          return `<li role="option" class="tv-symbol__item${active}" data-symbol="${r.symbol}" aria-selected="${r.symbol === activeSymbol}">
            ${logo}
            <span class="tv-symbol__item-ticker">${ticker}</span>
            <span class="tv-symbol__item-name">${label}${sub}</span>
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
        metaBySymbol.get(activeSymbol) ??
        results.find((s) => matchesActiveSymbol(s.symbol, s, activeSymbol));
      if (meta) setDisplay(activeSymbol, meta);
      else {
        const info = await datafeed.resolveSymbol(activeSymbol);
        const root = activeSymbol.includes(":") ? activeSymbol.split(":").pop() : activeSymbol;
        const exchange = info.listed_exchange || info.exchange?.replace(/\s*\(Delayed\)$/i, "") || "CME";
        setDisplay(activeSymbol, {
          name: info.description,
          exchange,
          symbol: root,
          ticker: info.ticker?.includes("-Delayed:")
            ? info.ticker.replace(/-Delayed:/i, ":")
            : info.ticker || `${exchange}:${root}`,
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

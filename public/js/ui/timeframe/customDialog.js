import { validateCustomInterval } from "../../chart/resolutions.js";
import { mountDialogDrag } from "../../drawings/settings/dialog/utils.js";

/** @typedef {{ id: "T"|"S"|"m"|"h"|"D"|"W"|"M", label: string }} IntervalType */

const TYPES = /** @type {IntervalType[]} */ ([
  { id: "T", label: "ticks" },
  { id: "S", label: "seconds" },
  { id: "m", label: "minutes" },
  { id: "h", label: "hours" },
  { id: "D", label: "days" },
  { id: "W", label: "weeks" },
  { id: "M", label: "months" },
]);

const CHEVRON = `<svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M3.92 7.83 9 12.29l5.08-4.46-1-1.13L9 10.29l-4.09-3.6-.99 1.14Z"/></svg>`;
const CLOSE = `<svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true"><path stroke="currentColor" stroke-width="1.2" d="m1.5 1.5 15 15m0-15-15 15"/></svg>`;

/**
 * @param {object} opts
 * @param {HTMLElement} [opts.anchorEl] position near this element
 * @param {string[]} [opts.existingIds] resolution ids already in the list
 * @param {(result: { id: string, value: number, unit: IntervalType["id"] }) => void} opts.onAdd
 * @param {() => void} [opts.onClose]
 * @returns {() => void} close
 */
export function openCustomIntervalDialog(opts) {
  const { anchorEl, existingIds = [], onAdd, onClose } = opts;

  const overlay = document.createElement("div");
  overlay.className = "tv-tf-dialog-overlay";
  overlay.innerHTML = `<div class="tv-tf-dialog" role="dialog" aria-modal="true" aria-labelledby="tv-tf-dialog-title" data-name="add-custom-interval-dialog">
    <div class="tv-tf-dialog__header">
      <div class="tv-tf-dialog__title" id="tv-tf-dialog-title">Add custom interval</div>
      <button type="button" class="tv-tf-dialog__close" data-close aria-label="Close menu">${CLOSE}</button>
    </div>
    <div class="tv-tf-dialog__body">
      <div class="tv-tf-dialog__row">
        <div class="tv-tf-dialog__label">Type</div>
        <div class="tv-tf-dialog__type-wrap">
          <button type="button" class="tv-tf-dialog__type" data-type-toggle aria-haspopup="listbox" aria-expanded="false">
            <span data-type-label>minutes</span>
            <span class="tv-tf-dialog__type-chev">${CHEVRON}</span>
          </button>
          <div class="tv-tf-dialog__type-menu" role="listbox" hidden>
            ${TYPES.map(
              (t) =>
                `<button type="button" class="tv-tf-dialog__type-opt${t.id === "m" ? " is-active" : ""}" role="option" data-unit="${t.id}" aria-selected="${t.id === "m"}">${t.label}</button>`,
            ).join("")}
          </div>
        </div>
      </div>
      <div class="tv-tf-dialog__row tv-tf-dialog__row--interval">
        <div class="tv-tf-dialog__label">Interval</div>
        <div class="tv-tf-dialog__input-wrap">
          <input type="text" class="tv-tf-dialog__input" maxlength="6" inputmode="numeric" autocomplete="off" aria-label="Interval" aria-describedby="tv-tf-dialog-error" />
          <span class="tv-tf-dialog__error" id="tv-tf-dialog-error" role="alert" aria-live="assertive" hidden></span>
        </div>
      </div>
    </div>
    <div class="tv-tf-dialog__footer">
      <button type="button" class="tv-tf-dialog__btn tv-tf-dialog__btn--secondary" data-cancel>Cancel</button>
      <button type="button" class="tv-tf-dialog__btn tv-tf-dialog__btn--primary" data-submit disabled>Add</button>
    </div>
  </div>`;

  document.body.appendChild(overlay);

  const dialog = overlay.querySelector(".tv-tf-dialog");
  const typeBtn = overlay.querySelector("[data-type-toggle]");
  const typeLabel = overlay.querySelector("[data-type-label]");
  const typeMenu = overlay.querySelector(".tv-tf-dialog__type-menu");
  const input = overlay.querySelector(".tv-tf-dialog__input");
  const errorEl = overlay.querySelector(".tv-tf-dialog__error");
  const submitBtn = overlay.querySelector("[data-submit]");

  /** @type {IntervalType["id"]} */
  let unit = "m";
  let userMoved = false;

  function positionDialog() {
    if (!(dialog instanceof HTMLElement)) return;
    const pad = 8;
    const dialogW = 280;
    let left = window.innerWidth / 2 - dialogW / 2;
    let top = window.innerHeight / 2 - 120;

    if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      left = rect.left;
      top = rect.bottom + 6;
      if (left + dialogW > window.innerWidth - pad) {
        left = window.innerWidth - dialogW - pad;
      }
      if (top + 220 > window.innerHeight - pad) {
        top = Math.max(pad, rect.top - 220);
      }
    }

    dialog.style.position = "fixed";
    dialog.style.margin = "0";
    dialog.style.width = `${dialogW}px`;
    dialog.style.left = `${Math.max(pad, left)}px`;
    dialog.style.top = `${Math.max(pad, top)}px`;
  }

  function closeTypeMenu() {
    typeMenu?.setAttribute("hidden", "");
    typeBtn?.setAttribute("aria-expanded", "false");
  }

  function openTypeMenu() {
    typeMenu?.removeAttribute("hidden");
    typeBtn?.setAttribute("aria-expanded", "true");
  }

  function setUnit(next) {
    unit = next;
    const type = TYPES.find((t) => t.id === next);
    if (typeLabel && type) typeLabel.textContent = type.label;
    typeMenu?.querySelectorAll("[data-unit]").forEach((el) => {
      const active = el.dataset.unit === next;
      el.classList.toggle("is-active", active);
      el.setAttribute("aria-selected", String(active));
    });
    closeTypeMenu();
    updateSubmit();
  }

  function parsedValue() {
    const raw = String(input?.value ?? "").trim();
    if (!raw || !/^\d+$/.test(raw)) return null;
    const n = Number(raw);
    return n >= 1 ? n : null;
  }

  function setError(message) {
    if (!input || !errorEl) return;
    const hasError = Boolean(message);
    input.classList.toggle("tv-tf-dialog__input--error", hasError);
    input.setAttribute("aria-invalid", hasError ? "true" : "false");
    if (hasError) {
      errorEl.textContent = message;
      errorEl.removeAttribute("hidden");
    } else {
      errorEl.textContent = "";
      errorEl.setAttribute("hidden", "");
    }
  }

  function updateSubmit() {
    if (!submitBtn) return;
    const n = parsedValue();
    if (n == null) {
      setError(null);
      submitBtn.disabled = true;
      submitBtn.setAttribute("aria-disabled", "true");
      return;
    }

    const result = validateCustomInterval(n, unit, existingIds);
    if (!result.ok) {
      setError(result.message);
      submitBtn.disabled = true;
      submitBtn.setAttribute("aria-disabled", "true");
      return;
    }

    setError(null);
    submitBtn.disabled = false;
    submitBtn.setAttribute("aria-disabled", "false");
  }

  function close() {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
    window.removeEventListener("resize", onResize);
    onClose?.();
  }

  function onResize() {
    if (!userMoved) positionDialog();
  }

  function onKey(ev) {
    if (ev.key === "Escape") {
      if (typeMenu && !typeMenu.hidden) {
        closeTypeMenu();
        return;
      }
      close();
    }
  }

  function submit() {
    const n = parsedValue();
    if (n == null) return;
    const result = validateCustomInterval(n, unit, existingIds);
    if (!result.ok) {
      updateSubmit();
      return;
    }
    onAdd({ id: result.id, value: n, unit });
    close();
  }

  document.addEventListener("keydown", onKey);
  window.addEventListener("resize", onResize);
  positionDialog();

  const header = overlay.querySelector(".tv-tf-dialog__header");
  if (dialog instanceof HTMLElement && header instanceof HTMLElement) {
    mountDialogDrag(dialog, header);
    header.addEventListener(
      "mousedown",
      (ev) => {
        if (ev.target instanceof Element && ev.target.closest("button")) return;
        userMoved = true;
      },
      true,
    );
  }

  typeBtn?.addEventListener("click", (ev) => {
    ev.stopPropagation();
    if (typeMenu?.hidden) openTypeMenu();
    else closeTypeMenu();
  });

  typeMenu?.addEventListener("mousedown", (ev) => ev.stopPropagation());
  typeMenu?.addEventListener("wheel", (ev) => ev.stopPropagation(), { passive: true });

  typeMenu?.querySelectorAll("[data-unit]").forEach((el) => {
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      setUnit(/** @type {IntervalType["id"]} */ (el.dataset.unit));
    });
  });

  overlay.addEventListener("click", (ev) => {
    if (ev.target === overlay) close();
    if (!ev.target.closest(".tv-tf-dialog__type-wrap")) closeTypeMenu();
  });

  overlay.querySelector("[data-close]")?.addEventListener("click", close);
  overlay.querySelector("[data-cancel]")?.addEventListener("click", close);
  submitBtn?.addEventListener("click", submit);

  input?.addEventListener("input", () => {
    if (input) input.value = input.value.replace(/\D/g, "").slice(0, 6);
    updateSubmit();
  });

  input?.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && submitBtn && !submitBtn.disabled) {
      ev.preventDefault();
      submit();
    }
  });

  queueMicrotask(() => {
    input?.focus();
    updateSubmit();
  });

  return close;
}

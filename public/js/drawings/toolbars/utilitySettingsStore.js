const ALWAYS_REMOVE_LOCKED_KEY = "tv-draw-always-remove-locked";
const SKIP_LOCKED_CONFIRM_KEY = "tv-draw-skip-locked-confirm";

export function loadAlwaysRemoveLocked() {
  try {
    return localStorage.getItem(ALWAYS_REMOVE_LOCKED_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveAlwaysRemoveLocked(value) {
  try {
    localStorage.setItem(ALWAYS_REMOVE_LOCKED_KEY, value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function loadSkipLockedConfirm() {
  try {
    return localStorage.getItem(SKIP_LOCKED_CONFIRM_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveSkipLockedConfirm(value) {
  try {
    localStorage.setItem(SKIP_LOCKED_CONFIRM_KEY, value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

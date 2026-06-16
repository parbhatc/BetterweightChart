const ALWAYS_REMOVE_LOCKED_KEY = "tv-draw-always-remove-locked";
const SKIP_LOCKED_CONFIRM_KEY = "tv-draw-skip-locked-confirm";
const DRAWINGS_HIDDEN_KEY = "tv-draw-hide-drawings";
const HIDE_ALL_KEY = "tv-draw-hide-all";
const STAY_IN_DRAWING_MODE_KEY = "tv-draw-stay-in-mode";
const SHOW_MOBILE_PLACEMENT_BAR_KEY = "tv-draw-mobile-placement-bar";

export function loadDrawingsVisibility() {
  try {
    return {
      drawingsHidden: localStorage.getItem(DRAWINGS_HIDDEN_KEY) === "1",
      hideAll: localStorage.getItem(HIDE_ALL_KEY) === "1",
    };
  } catch {
    return { drawingsHidden: false, hideAll: false };
  }
}

export function saveDrawingsVisibility({ drawingsHidden, hideAll }) {
  try {
    localStorage.setItem(DRAWINGS_HIDDEN_KEY, drawingsHidden ? "1" : "0");
    localStorage.setItem(HIDE_ALL_KEY, hideAll ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function loadStayInDrawingMode() {
  try {
    return localStorage.getItem(STAY_IN_DRAWING_MODE_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveStayInDrawingMode(value) {
  try {
    localStorage.setItem(STAY_IN_DRAWING_MODE_KEY, value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function loadShowMobilePlacementBar() {
  try {
    const raw = localStorage.getItem(SHOW_MOBILE_PLACEMENT_BAR_KEY);
    return raw === null ? true : raw === "1";
  } catch {
    return true;
  }
}

export function saveShowMobilePlacementBar(value) {
  try {
    localStorage.setItem(SHOW_MOBILE_PLACEMENT_BAR_KEY, value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

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

/** @param {Record<string, unknown>} state @param {(() => void) | undefined} requestFn */
export function pendingInit(state, requestFn) {
  requestFn?.();
  state.skip = true;
  state.loading = true;
}

/** @param {Record<string, unknown>} state */
export function readyInit(state) {
  state.skip = false;
  state.loading = false;
}

/** @returns {import("./types.js").ReplayEngineState} */
export function createReplayEngineState() {
  return {
    playTimer: null,
    lastAppliedEndIndex: null,
    lastAppliedBarTime: null,
    replayTfChangeInFlight: false,
    replaySkipSyncApply: false,
    replayLiveEndUtc: null,
    ltBarsBeforeTfSwitch: null,
    ltResolutionBeforeTfSwitch: null,
    replayBarsByResolution: new Map(),
    replayCursorAtEntry: new Map(),
    replayViewportByResolution: new Map(),
    replayLtBarsForForming: null,
    wasReplayUiActive: false,
  };
}

/**
 * @typedef {object} ReplayEngineState
 * @property {ReturnType<typeof setInterval> | null} playTimer
 * @property {number | null} lastAppliedEndIndex
 * @property {number | null} lastAppliedBarTime
 * @property {boolean} replayTfChangeInFlight
 * @property {boolean} replaySkipSyncApply
 * @property {number | null} replayLiveEndUtc
 * @property {object[] | null} ltBarsBeforeTfSwitch
 * @property {string | null} ltResolutionBeforeTfSwitch
 * @property {Map<string, { bars: object[], cursorUtc: number }>} replayBarsByResolution
 * @property {Map<string, number>} replayCursorAtEntry
 * @property {Map<string, import("../../chart/pane/viewportBarLayout.js").ViewportBarLayout>} replayViewportByResolution
 * @property {{ resolution: string, bars: object[] } | null} replayLtBarsForForming
 * @property {boolean} wasReplayUiActive
 */

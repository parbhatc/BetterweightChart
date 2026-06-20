export class SetupProfile {
  constructor() {
    this._profile = null;
    /** @type {{ era: number; bars: number; hits: number; ms: number }[]} */
    this._eraDetails = [];
  }

  reset() {
    this._profile = {
      warmCacheMs: 0,
      eraCount: 0,
      findAllEraMs: 0,
      barIterations: 0,
      setup1CompleteAtBarCalls: 0,
      setup1CompleteAtBarMs: 0,
      computeSetup1StateCalls: 0,
      computeSetup1StateMs: 0,
      setup1MemoHits: 0,
      setup1MemoMisses: 0,
      enrichSetupContextMs: 0,
      fvgTapMs: 0,
      fvgTapMemoHits: 0,
      fvgTapMemoMisses: 0,
      internalSweepMs: 0,
      internalSweepMemoHits: 0,
      internalSweepMemoMisses: 0,
      ifvgEnrichMs: 0,
      freezeEraMs: 0,
      fvgSliceMs: 0,
      fvgAgg15mMs: 0,
      fvgAgg15mMemoHits: 0,
      fvgAgg15mMemoMisses: 0,
      fvgBuildZonesMs: 0,
      fvgTapWalkMs: 0,
      fvgPierceFilterMs: 0,
      fvgZoneCount: 0,
      fvgTapWalkBarChecks: 0,
      fvgTapWalkZoneChecks: 0,
      fvgHtfBarCount: 0,
      fvgSliceBarCount: 0,
      fvgZoneActiveAtCalls: 0,
      fvgZoneActiveAtMs: 0,
      fvgZonePiercedAtCalls: 0,
      fvgZonePiercedAtMs: 0,
      fvgAgg15mMissWorkMs: 0,
    };
    this._eraDetails = [];
  }

  enable() {
    this.reset();
  }

  get() {
    return this._profile;
  }

  getEraDetails() {
    return this._eraDetails;
  }

  on() {
    return this._profile != null;
  }

  /** @param {string} key @param {number} ms */
  add(key, ms) {
    if (!this._profile) return;
    this._profile[key] = (this._profile[key] ?? 0) + ms;
  }

  /** @param {string} key @param {number} [n] */
  inc(key, n = 1) {
    if (!this._profile) return;
    this._profile[key] = (this._profile[key] ?? 0) + n;
  }

  /** @param {{ era: number; bars: number; hits: number; ms: number }} row */
  pushEra(row) {
    if (!this._profile) return;
    this._eraDetails.push(row);
  }
}

const defaultProfile = new SetupProfile();

export const resetProfile = () => defaultProfile.reset();
export const enableProfile = () => defaultProfile.enable();
export const getProfile = () => defaultProfile.get();
export const getEraDetails = () => defaultProfile.getEraDetails();
export const profileOn = () => defaultProfile.on();
export const profileAdd = (key, ms) => defaultProfile.add(key, ms);
export const profileInc = (key, n) => defaultProfile.inc(key, n);
export const profilePushEra = (row) => defaultProfile.pushEra(row);

export const resetSetup1Profile = resetProfile;
export const enableSetup1Profile = enableProfile;
export const getSetup1Profile = getProfile;
export const getSetup1EraDetails = getEraDetails;

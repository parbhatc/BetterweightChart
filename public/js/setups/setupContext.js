/** @typedef {{ title: string; forming: boolean; complete: boolean; checklist: Array<[string, boolean]> }} SetupState */

export class SetupContext {
  /**
   * Later steps only count once all prior steps are done (sequential setup).
   * @param {Array<[string, boolean]>} rows
   */
  static sequential(rows) {
    /** @type {Array<[string, boolean]>} */
    const out = [];
    let priorOk = true;
    for (const [label, rawOk] of rows) {
      const ok = priorOk && rawOk;
      out.push([label, ok]);
      if (!ok) priorOk = false;
    }
    return out;
  }

  /**
   * @param {string} label e.g. "Setup #1"
   * @param {Array<[string, boolean]>} raw
   * @returns {SetupState}
   */
  static state(label, raw) {
    const checklist = SetupContext.sequential(raw);
    const complete = checklist.every(([, ok]) => ok);
    const started = checklist.some(([, ok]) => ok);
    const forming = started && !complete;
    return {
      title: forming ? `Forming ${label}` : label,
      forming,
      complete,
      checklist,
    };
  }
}

export const applySequentialChecklist = (...a) => SetupContext.sequential(...a);
export const makeSetupState = (...a) => SetupContext.state(...a);

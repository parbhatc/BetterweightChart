const FONT =
  "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif";

class StudyPaneLegendPrimitive {
  /** @param {() => object | null} getState */
  constructor(getState) {
    /** @type {import("lightweight-charts").IChartApi | null} */
    this._chart = null;
    /** @type {(() => void) | null} */
    this._requestUpdate = null;
    this._getState = getState;
    this._paneView = new StudyPaneLegendPaneView(this);
    /** @type {(() => void) | null} */
    this._unsub = null;
  }

  requestRefresh() {
    this._requestUpdate?.();
  }

  /** @param {import("lightweight-charts").SeriesAttachedParameter} param */
  attached(param) {
    this._chart = param.chart;
    this._requestUpdate = param.requestUpdate;
    const ts = this._chart.timeScale();
    const onRange = () => this._requestUpdate?.();
    ts.subscribeVisibleLogicalRangeChange(onRange);
    this._unsub = () => ts.unsubscribeVisibleLogicalRangeChange(onRange);
  }

  detached() {
    this._unsub?.();
    this._unsub = null;
    this._chart = null;
    this._requestUpdate = null;
  }

  updateAllViews() {}

  paneViews() {
    return [this._paneView];
  }

  drawState() {
    const state = this._getState?.();
    if (!state?.visible || !state.title) return null;
    return state;
  }
}

class StudyPaneLegendPaneView {
  /** @param {StudyPaneLegendPrimitive} source */
  constructor(source) {
    this._source = source;
  }

  zOrder() {
    return "top";
  }

  renderer() {
    return new StudyPaneLegendPaneRenderer(this._source);
  }
}

class StudyPaneLegendPaneRenderer {
  /** @param {StudyPaneLegendPrimitive} source */
  constructor(source) {
    this._source = source;
  }

  draw(target) {
    const state = this._source.drawState();
    if (!state) return;

    target.useMediaCoordinateSpace(({ context: ctx }) => {
      ctx.save();
      ctx.font = `600 12px ${FONT}`;
      ctx.textBaseline = "top";
      ctx.textAlign = "left";

      let x = 8;
      const y = 6;

      ctx.fillStyle = "#d1d4dc";
      ctx.fillText(state.title, x, y);
      x += ctx.measureText(state.title).width + 6;

      if (state.params?.length) {
        ctx.font = `400 12px ${FONT}`;
        ctx.fillStyle = "#787b86";
        const paramText = state.params.join(" ");
        ctx.fillText(paramText, x, y);
        x += ctx.measureText(paramText).width + 8;
      }

      ctx.font = `600 12px ${FONT}`;
      for (const value of state.values ?? []) {
        if (value.value == null) continue;
        ctx.fillStyle = value.color;
        const text = String(value.value);
        ctx.fillText(text, x, y);
        x += ctx.measureText(text).width + 8;
      }

      ctx.restore();
    });
  }
}

/**
 * @param {object} opts
 * @param {import("lightweight-charts").ISeriesApi} opts.series
 * @param {() => object | null} opts.getState
 */
export function attachStudyPaneLegendPrimitive(opts) {
  const primitive = new StudyPaneLegendPrimitive(opts.getState);
  opts.series.attachPrimitive(primitive);
  return {
    requestRefresh: () => primitive.requestRefresh(),
    destroy: () => {
      try {
        opts.series.detachPrimitive(primitive);
      } catch {
        /* ignore */
      }
    },
  };
}

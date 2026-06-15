import { MENU_CHEVRON } from "./utils.js";

export function drawingSettingsDialogHtml() {
  return `<div class="tv-drawing-settings__backdrop" data-backdrop></div>
    <div class="tv-drawing-settings__dialog" role="dialog" aria-modal="true" aria-labelledby="tv-drawing-settings-title">
      <div class="tv-drawing-settings__header" data-drag-handle>
        <div class="tv-drawing-settings__title-wrap">
          <span id="tv-drawing-settings-title" class="tv-drawing-settings__title" data-dialog-title>Trendline</span>
        </div>
        <button type="button" class="tv-drawing-settings__close" data-close aria-label="Close">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width="18" height="18" aria-hidden="true"><path stroke="currentColor" stroke-width="1.2" d="m1.5 1.5 15 15m0-15-15 15"/></svg>
        </button>
      </div>
      <div class="tv-drawing-settings__tabs" role="tablist">
        <button type="button" class="tv-drawing-settings__tab" data-tab="inputs" role="tab" aria-selected="false" hidden>Inputs</button>
        <button type="button" class="tv-drawing-settings__tab is-selected" data-tab="style" role="tab" aria-selected="true">Style</button>
        <button type="button" class="tv-drawing-settings__tab" data-tab="text" role="tab" aria-selected="false">Text</button>
        <button type="button" class="tv-drawing-settings__tab" data-tab="coordinates" role="tab" aria-selected="false">Coordinates</button>
        <button type="button" class="tv-drawing-settings__tab" data-tab="visibility" role="tab" aria-selected="false">Visibility</button>
        <div class="tv-drawing-settings__tab-underline" data-tab-underline></div>
      </div>
      <div class="tv-drawing-settings__body">
        <div class="tv-drawing-settings__panel" data-panel="inputs" hidden></div>
        <div class="tv-drawing-settings__panel" data-panel="style">
          <div class="tv-set__section" data-regression-style-section hidden></div>
          <div class="tv-set__section" data-line-section>
            <div class="tv-set__section-head" data-line-section-head>Line</div>
            <div class="tv-set__section-body tv-drawing-settings__line-row">
              <button type="button" class="tv-drawing-settings__color-btn" data-style-color aria-label="Line color">
                <span class="tv-drawing-settings__color-swatch" data-style-swatch></span>
                <span class="tv-drawing-settings__color-line" data-style-line></span>
              </button>
              <button type="button" class="tv-drawing-settings__line-end-btn" data-left-end-btn aria-haspopup="listbox" aria-label="Left end" hidden>
                <span class="tv-drawing-settings__line-end-icon" data-left-end-icon></span>
              </button>
              <button type="button" class="tv-drawing-settings__line-end-btn tv-drawing-settings__line-end-btn--right" data-right-end-btn aria-haspopup="listbox" aria-label="Right end" hidden>
                <span class="tv-drawing-settings__line-end-icon tv-drawing-settings__line-end-icon--right" data-right-end-icon></span>
              </button>
            </div>
          </div>
          <div class="tv-set__section" data-annotation-brush-section hidden>
            <div class="tv-set__section-body">
              <div class="tv-set__check-row tv-fib-control-row">
                <button type="button" class="tv-set__check" data-brush-background-btn role="checkbox" aria-checked="false" aria-label="Background">
                  <span class="tv-set__check-box"></span>
                </button>
                <span class="tv-set__check-label">Background</span>
                <button type="button" class="tv-drawing-settings__color-btn tv-drawing-settings__color-btn--compact tv-fib-row-action" data-brush-background-color aria-label="Background color" disabled>
                  <span class="tv-drawing-settings__color-swatch" data-brush-background-swatch></span>
                </button>
              </div>
            </div>
          </div>
          <div class="tv-set__section" data-annotation-highlighter-section hidden>
            <div class="tv-set__section-head">Thickness</div>
            <div class="tv-set__section-body tv-set__section-body--fields">
              <div class="tv-set__field-row">
                <div class="tv-set__select-wrap">
                  <button type="button" class="tv-drawing-settings__menu-btn" data-highlighter-thickness-btn aria-haspopup="listbox">
                    <span data-highlighter-thickness-label>20px</span>
                    <span class="tv-set__select-chev">${MENU_CHEVRON}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div class="tv-set__section" data-shape-background-section hidden>
            <div class="tv-set__section-body">
              <div class="tv-set__check-row tv-fib-control-row">
                <button type="button" class="tv-set__check tv-set__check--on" data-shape-background-btn role="checkbox" aria-checked="true" aria-label="Background">
                  <span class="tv-set__check-box"></span>
                </button>
                <span class="tv-set__check-label">Background</span>
                <button type="button" class="tv-drawing-settings__color-btn tv-drawing-settings__color-btn--compact tv-fib-row-action" data-shape-background-color aria-label="Background color">
                  <span class="tv-drawing-settings__color-swatch" data-shape-background-swatch></span>
                </button>
              </div>
            </div>
          </div>
          <div class="tv-set__section" data-shape-middle-line-section hidden>
            <div class="tv-set__section-body">
              <div class="tv-set__check-row tv-fib-control-row">
                <button type="button" class="tv-set__check" data-shape-middle-line-btn role="checkbox" aria-checked="false" aria-label="Middle line">
                  <span class="tv-set__check-box"></span>
                </button>
                <span class="tv-set__check-label">Middle line</span>
                <button type="button" class="tv-drawing-settings__color-btn tv-drawing-settings__color-btn--compact tv-fib-row-action" data-shape-middle-line-color aria-label="Middle line color" disabled>
                  <span class="tv-drawing-settings__color-swatch" data-shape-middle-line-swatch></span>
                  <span class="tv-drawing-settings__color-line tv-drawing-settings__color-line--dashed" data-shape-middle-line-preview></span>
                </button>
              </div>
            </div>
          </div>
          <div class="tv-set__section" data-pattern-label-section hidden>
            <div class="tv-set__section-head">Label</div>
            <div class="tv-set__section-body">
              <div class="tv-drawing-settings__text-toolbar">
                <button type="button" class="tv-drawing-settings__color-btn tv-drawing-settings__color-btn--compact" data-pattern-label-color aria-label="Label color">
                  <span class="tv-drawing-settings__color-swatch" data-pattern-label-swatch></span>
                </button>
                <select class="tv-drawing-settings__select tv-drawing-settings__select--small" data-pattern-font-size>
                  <option value="10">10</option>
                  <option value="12" selected>12</option>
                  <option value="14">14</option>
                  <option value="16">16</option>
                  <option value="18">18</option>
                </select>
                <button type="button" class="tv-drawing-settings__font-btn" data-pattern-label-bold-btn aria-label="Bold" aria-pressed="false"><b>B</b></button>
                <button type="button" class="tv-drawing-settings__font-btn" data-pattern-label-italic-btn aria-label="Italic" aria-pressed="false"><i>I</i></button>
              </div>
            </div>
          </div>
          <div class="tv-set__section" data-pattern-border-section hidden>
            <div class="tv-set__section-head">Border</div>
            <div class="tv-set__section-body tv-drawing-settings__line-row">
              <button type="button" class="tv-drawing-settings__color-btn" data-pattern-border-color aria-label="Border color">
                <span class="tv-drawing-settings__color-swatch" data-pattern-border-swatch></span>
                <span class="tv-drawing-settings__color-line" data-pattern-border-line></span>
              </button>
            </div>
          </div>
          <div class="tv-set__section" data-pattern-background-section hidden>
            <div class="tv-set__section-body">
              <div class="tv-set__check-row tv-fib-control-row">
                <button type="button" class="tv-set__check tv-set__check--on" data-pattern-background-btn role="checkbox" aria-checked="true" aria-label="Background">
                  <span class="tv-set__check-box"></span>
                </button>
                <span class="tv-set__check-label">Background</span>
                <button type="button" class="tv-drawing-settings__color-btn tv-drawing-settings__color-btn--compact tv-fib-row-action" data-pattern-background-color aria-label="Background color">
                  <span class="tv-drawing-settings__color-swatch" data-pattern-background-swatch></span>
                </button>
              </div>
            </div>
          </div>
          <div class="tv-set__section" data-elliott-color-section hidden>
            <div class="tv-set__section-head">Color</div>
            <div class="tv-set__section-body">
              <button type="button" class="tv-drawing-settings__color-btn tv-drawing-settings__color-btn--compact" data-elliott-color-btn aria-label="Wave color">
                <span class="tv-drawing-settings__color-swatch" data-elliott-color-swatch></span>
              </button>
            </div>
          </div>
          <div class="tv-set__section" data-elliott-wave-section hidden>
            <div class="tv-set__section-body">
              <div class="tv-set__check-row tv-fib-control-row">
                <button type="button" class="tv-set__check tv-set__check--on" data-pattern-wave-btn role="checkbox" aria-checked="true" aria-label="Wave">
                  <span class="tv-set__check-box"></span>
                </button>
                <span class="tv-set__check-label">Wave</span>
                <button type="button" class="tv-drawing-settings__menu-btn tv-fib-row-action" data-pattern-wave-width-btn aria-haspopup="listbox" aria-label="Wave width">
                  <span class="tv-fib-line-width-preview" data-pattern-wave-width-preview style="border-top-width:2px"></span>
                </button>
              </div>
            </div>
          </div>
          <div class="tv-set__section" data-elliott-degree-section hidden>
            <div class="tv-set__section-head">Degree</div>
            <div class="tv-set__section-body tv-set__section-body--fields">
              <div class="tv-set__field-row">
                <div class="tv-set__select-wrap">
                  <button type="button" class="tv-drawing-settings__menu-btn" data-elliott-degree-btn aria-haspopup="listbox">
                    <span data-elliott-degree-label>Intermediate</span>
                    <span class="tv-set__select-chev">${MENU_CHEVRON}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div class="tv-set__section" data-cycle-background-section hidden>
            <div class="tv-set__section-body">
              <div class="tv-set__check-row tv-fib-control-row">
                <button type="button" class="tv-set__check tv-set__check--on" data-cycle-background-btn role="checkbox" aria-checked="true" aria-label="Background">
                  <span class="tv-set__check-box"></span>
                </button>
                <span class="tv-set__check-label">Background</span>
                <button type="button" class="tv-drawing-settings__color-btn tv-drawing-settings__color-btn--compact tv-fib-row-action" data-cycle-background-color aria-label="Background color">
                  <span class="tv-drawing-settings__color-swatch" data-cycle-background-swatch></span>
                </button>
              </div>
            </div>
          </div>
          <div class="tv-set__section" data-axis-line-section hidden>
            <div class="tv-set__section-body">
              <div class="tv-set__check-row" data-axis-price-label-row hidden>
                <button type="button" class="tv-set__check" data-axis-price-label-btn role="checkbox" aria-checked="false" aria-label="Price label">
                  <span class="tv-set__check-box"></span>
                </button>
                <span class="tv-set__check-label">Price label</span>
              </div>
              <div class="tv-set__check-row" data-axis-time-label-row hidden>
                <button type="button" class="tv-set__check" data-axis-time-label-btn role="checkbox" aria-checked="false" aria-label="Time label">
                  <span class="tv-set__check-box"></span>
                </button>
                <span class="tv-set__check-label">Time label</span>
              </div>
            </div>
          </div>
          <div class="tv-set__section" data-extend-section hidden>
            <div class="tv-set__section-head">Extend</div>
            <div class="tv-set__section-body tv-set__section-body--fields">
              <div class="tv-set__field-row">
                <span class="tv-set__field-label">Extend</span>
                <div class="tv-set__select-wrap">
                  <button type="button" class="tv-drawing-settings__menu-btn" data-extend-btn aria-haspopup="listbox">
                    <span data-extend-label>Don't extend</span>
                    <span class="tv-set__select-chev">${MENU_CHEVRON}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div class="tv-set__section" data-position-section hidden>
            <div class="tv-set__section-head">Stop color</div>
            <div class="tv-set__section-body">
              <button type="button" class="tv-drawing-settings__color-btn tv-drawing-settings__color-btn--compact" data-position-stop-color aria-label="Stop color">
                <span class="tv-drawing-settings__color-swatch" data-position-stop-swatch></span>
              </button>
            </div>
          </div>
          <div class="tv-set__section" data-position-section hidden>
            <div class="tv-set__section-head">Target color</div>
            <div class="tv-set__section-body">
              <button type="button" class="tv-drawing-settings__color-btn tv-drawing-settings__color-btn--compact" data-position-profit-color aria-label="Target color">
                <span class="tv-drawing-settings__color-swatch" data-position-profit-swatch></span>
              </button>
            </div>
          </div>
          <div class="tv-set__section" data-position-section hidden>
            <div class="tv-set__section-head">Text</div>
            <div class="tv-set__section-body tv-drawing-settings__line-row">
              <select class="tv-drawing-settings__select tv-drawing-settings__select--small" data-position-font-size>
                <option value="10">10</option>
                <option value="12" selected>12</option>
                <option value="14">14</option>
                <option value="16">16</option>
              </select>
            </div>
          </div>
          <div class="tv-set__section" data-position-section hidden>
            <div class="tv-set__section-body">
              <div class="tv-set__check-row">
                <button type="button" class="tv-set__check tv-set__check--on" data-position-price-labels-btn role="checkbox" aria-checked="true" aria-label="Price labels">
                  <span class="tv-set__check-box"></span>
                </button>
                <span class="tv-set__check-label">Price labels</span>
              </div>
            </div>
          </div>
          <div class="tv-set__section" data-position-section hidden>
            <div class="tv-set__section-head">Info</div>
            <div class="tv-set__section-body tv-set__section-body--fields">
              <div class="tv-set__field-row">
                <span class="tv-set__field-label">Stats</span>
                <div class="tv-set__select-wrap">
                  <button type="button" class="tv-drawing-settings__menu-btn" data-position-stats-btn aria-haspopup="listbox">
                    <span data-position-stats-label>Hidden</span>
                    <span class="tv-set__select-chev">${MENU_CHEVRON}</span>
                  </button>
                </div>
              </div>
              <div class="tv-set__check-row">
                <button type="button" class="tv-set__check" data-position-always-show-stats-btn role="checkbox" aria-checked="false" aria-label="Always show stats">
                  <span class="tv-set__check-box"></span>
                </button>
                <span class="tv-set__check-label">Always show stats</span>
              </div>
            </div>
          </div>
          <div class="tv-set__section" data-forecast-section hidden>
            <div class="tv-set__section-head">Source text</div>
            <div class="tv-set__section-body tv-drawing-settings__line-row">
              <button type="button" class="tv-drawing-settings__color-btn tv-drawing-settings__color-btn--compact" data-forecast-source-text-color aria-label="Source text color">
                <span class="tv-drawing-settings__color-swatch" data-forecast-source-text-color-swatch></span>
              </button>
            </div>
          </div>
          <div class="tv-set__section" data-forecast-section hidden>
            <div class="tv-set__section-head">Source background</div>
            <div class="tv-set__section-body tv-drawing-settings__line-row">
              <button type="button" class="tv-drawing-settings__color-btn tv-drawing-settings__color-btn--compact" data-forecast-source-bg-color aria-label="Source background color">
                <span class="tv-drawing-settings__color-swatch" data-forecast-source-bg-color-swatch></span>
              </button>
            </div>
          </div>
          <div class="tv-set__section" data-forecast-section hidden>
            <div class="tv-set__section-head">Source border</div>
            <div class="tv-set__section-body tv-drawing-settings__line-row">
              <button type="button" class="tv-drawing-settings__color-btn tv-drawing-settings__color-btn--compact" data-forecast-source-border-color aria-label="Source border color">
                <span class="tv-drawing-settings__color-swatch" data-forecast-source-border-color-swatch></span>
              </button>
            </div>
          </div>
          <div class="tv-set__section" data-forecast-section hidden>
            <div class="tv-set__section-head">Target text</div>
            <div class="tv-set__section-body tv-drawing-settings__line-row">
              <button type="button" class="tv-drawing-settings__color-btn tv-drawing-settings__color-btn--compact" data-forecast-target-text-color aria-label="Target text color">
                <span class="tv-drawing-settings__color-swatch" data-forecast-target-text-color-swatch></span>
              </button>
            </div>
          </div>
          <div class="tv-set__section" data-forecast-section hidden>
            <div class="tv-set__section-head">Target background</div>
            <div class="tv-set__section-body tv-drawing-settings__line-row">
              <button type="button" class="tv-drawing-settings__color-btn tv-drawing-settings__color-btn--compact" data-forecast-target-bg-color aria-label="Target background color">
                <span class="tv-drawing-settings__color-swatch" data-forecast-target-bg-color-swatch></span>
              </button>
            </div>
          </div>
          <div class="tv-set__section" data-forecast-section hidden>
            <div class="tv-set__section-head">Target border</div>
            <div class="tv-set__section-body tv-drawing-settings__line-row">
              <button type="button" class="tv-drawing-settings__color-btn tv-drawing-settings__color-btn--compact" data-forecast-target-border-color aria-label="Target border color">
                <span class="tv-drawing-settings__color-swatch" data-forecast-target-border-color-swatch></span>
              </button>
            </div>
          </div>
          <div class="tv-set__section" data-forecast-section hidden>
            <div class="tv-set__section-head">Success text</div>
            <div class="tv-set__section-body tv-drawing-settings__line-row">
              <button type="button" class="tv-drawing-settings__color-btn tv-drawing-settings__color-btn--compact" data-forecast-success-text-color aria-label="Success text color">
                <span class="tv-drawing-settings__color-swatch" data-forecast-success-text-color-swatch></span>
              </button>
            </div>
          </div>
          <div class="tv-set__section" data-forecast-section hidden>
            <div class="tv-set__section-head">Success background</div>
            <div class="tv-set__section-body tv-drawing-settings__line-row">
              <button type="button" class="tv-drawing-settings__color-btn tv-drawing-settings__color-btn--compact" data-forecast-success-bg-color aria-label="Success background color">
                <span class="tv-drawing-settings__color-swatch" data-forecast-success-bg-color-swatch></span>
              </button>
            </div>
          </div>
          <div class="tv-set__section" data-forecast-section hidden>
            <div class="tv-set__section-head">Failure text</div>
            <div class="tv-set__section-body tv-drawing-settings__line-row">
              <button type="button" class="tv-drawing-settings__color-btn tv-drawing-settings__color-btn--compact" data-forecast-failure-text-color aria-label="Failure text color">
                <span class="tv-drawing-settings__color-swatch" data-forecast-failure-text-color-swatch></span>
              </button>
            </div>
          </div>
          <div class="tv-set__section" data-forecast-section hidden>
            <div class="tv-set__section-head">Failure background</div>
            <div class="tv-set__section-body tv-drawing-settings__line-row">
              <button type="button" class="tv-drawing-settings__color-btn tv-drawing-settings__color-btn--compact" data-forecast-failure-bg-color aria-label="Failure background color">
                <span class="tv-drawing-settings__color-swatch" data-forecast-failure-bg-color-swatch></span>
              </button>
            </div>
          </div>
          <div class="tv-set__section" data-measure-section hidden>
            <div class="tv-set__section-body">
              <div class="tv-set__check-row tv-fib-control-row">
                <button type="button" class="tv-set__check tv-set__check--on" data-measure-background-btn role="checkbox" aria-checked="true" aria-label="Background">
                  <span class="tv-set__check-box"></span>
                </button>
                <span class="tv-set__check-label">Background</span>
                <button type="button" class="tv-drawing-settings__color-btn tv-drawing-settings__color-btn--compact tv-fib-row-action" data-measure-background-color aria-label="Background color">
                  <span class="tv-drawing-settings__color-swatch" data-measure-background-swatch></span>
                </button>
              </div>
            </div>
          </div>
          <div class="tv-set__section" data-measure-section data-measure-border-section hidden>
            <div class="tv-set__section-body">
              <div class="tv-set__check-row">
                <button type="button" class="tv-set__check" data-measure-border-btn role="checkbox" aria-checked="false" aria-label="Border">
                  <span class="tv-set__check-box"></span>
                </button>
                <span class="tv-set__check-label">Border</span>
              </div>
            </div>
          </div>
          <div class="tv-set__section" data-measure-section hidden>
            <div class="tv-set__section-head">Info</div>
            <div class="tv-set__section-body tv-set__section-body--fields">
              <div class="tv-set__field-row">
                <span class="tv-set__field-label">Stats</span>
                <div class="tv-set__select-wrap">
                  <button type="button" class="tv-drawing-settings__menu-btn" data-measure-stats-btn aria-haspopup="listbox">
                    <span data-measure-stats-label>Hidden</span>
                    <span class="tv-set__select-chev">${MENU_CHEVRON}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div class="tv-set__section" data-measure-section hidden>
            <div class="tv-set__section-head">Label</div>
            <div class="tv-set__section-body">
              <div class="tv-drawing-settings__text-toolbar">
                <button type="button" class="tv-drawing-settings__color-btn tv-drawing-settings__color-btn--compact" data-measure-label-color aria-label="Label color">
                  <span class="tv-drawing-settings__color-swatch" data-measure-label-color-swatch></span>
                </button>
                <select class="tv-drawing-settings__select tv-drawing-settings__select--small" data-measure-font-size>
                  <option value="10">10</option>
                  <option value="12" selected>12</option>
                  <option value="14">14</option>
                  <option value="16">16</option>
                </select>
              </div>
            </div>
          </div>
          <div class="tv-set__section" data-measure-section hidden>
            <div class="tv-set__section-body">
              <div class="tv-set__check-row tv-fib-control-row">
                <button type="button" class="tv-set__check tv-set__check--on" data-measure-label-bg-btn role="checkbox" aria-checked="true" aria-label="Label background">
                  <span class="tv-set__check-box"></span>
                </button>
                <span class="tv-set__check-label">Label background</span>
                <button type="button" class="tv-drawing-settings__color-btn tv-drawing-settings__color-btn--compact tv-fib-row-action" data-measure-label-bg-color aria-label="Label background color">
                  <span class="tv-drawing-settings__color-swatch" data-measure-label-bg-swatch></span>
                </button>
              </div>
            </div>
          </div>
          <div class="tv-set__section" data-trendline-section hidden>
            <div class="tv-set__section-head">Options</div>
            <div class="tv-set__section-body">
              <div class="tv-set__check-row" data-middle-point-row>
                <button type="button" class="tv-set__check" data-middle-point-btn role="checkbox" aria-checked="false" aria-label="Middle point">
                  <span class="tv-set__check-box"></span>
                </button>
                <span class="tv-set__check-label">Middle point</span>
              </div>
              <div class="tv-set__check-row" data-price-labels-row>
                <button type="button" class="tv-set__check" data-price-labels-btn role="checkbox" aria-checked="false" aria-label="Price labels">
                  <span class="tv-set__check-box"></span>
                </button>
                <span class="tv-set__check-label">Price labels</span>
              </div>
            </div>
          </div>
          <div class="tv-set__section" data-trendline-section hidden>
            <div class="tv-set__section-head">Info</div>
            <div class="tv-set__section-body tv-set__section-body--fields">
              <div class="tv-set__field-row">
                <span class="tv-set__field-label">Stats</span>
                <div class="tv-set__select-wrap">
                  <button type="button" class="tv-drawing-settings__menu-btn" data-stats-btn aria-haspopup="listbox">
                    <span data-stats-label>Hidden</span>
                    <span class="tv-set__select-chev">${MENU_CHEVRON}</span>
                  </button>
                </div>
              </div>
              <div class="tv-set__field-row">
                <span class="tv-set__field-label">Stats position</span>
                <div class="tv-set__select-wrap">
                  <button type="button" class="tv-drawing-settings__menu-btn" data-stats-position-btn aria-haspopup="listbox">
                    <span data-stats-position-label>Auto</span>
                    <span class="tv-set__select-chev">${MENU_CHEVRON}</span>
                  </button>
                </div>
              </div>
              <div class="tv-set__check-row" data-always-show-stats-row>
                <button type="button" class="tv-set__check" data-always-show-stats-btn role="checkbox" aria-checked="false" aria-label="Always show stats">
                  <span class="tv-set__check-box"></span>
                </button>
                <span class="tv-set__check-label">Always show stats</span>
              </div>
            </div>
          </div>
          <div class="tv-set__section" data-parallel-channel-section hidden>
            <div class="tv-set__section-body" data-pc-levels-list></div>
          </div>
          <div class="tv-set__section" data-channel-prices-section hidden>
            <div class="tv-set__section-body">
              <div class="tv-set__check-row">
                <button type="button" class="tv-set__check" data-channel-prices-btn role="checkbox" aria-checked="false" aria-label="Prices">
                  <span class="tv-set__check-box"></span>
                </button>
                <span class="tv-set__check-label">Prices</span>
              </div>
              <div class="tv-drawing-settings__line-row tv-channel-prices-controls" data-channel-prices-controls>
                <button type="button" class="tv-drawing-settings__color-btn tv-drawing-settings__color-btn--compact" data-channel-prices-color aria-label="Prices text color">
                  <span class="tv-drawing-settings__color-swatch" data-channel-prices-swatch></span>
                </button>
                <select class="tv-drawing-settings__select tv-drawing-settings__select--small" data-channel-prices-font-size disabled>
                  <option value="10">10</option>
                  <option value="12" selected>12</option>
                  <option value="14">14</option>
                  <option value="16">16</option>
                  <option value="18">18</option>
                </select>
              </div>
            </div>
          </div>
          <div class="tv-set__section" data-pc-background-section hidden>
            <div class="tv-set__section-body">
              <div class="tv-set__check-row">
                <button type="button" class="tv-set__check" data-pc-background-btn role="checkbox" aria-checked="true" aria-label="Background">
                  <span class="tv-set__check-box"></span>
                </button>
                <span class="tv-set__check-label">Background</span>
              </div>
              <button type="button" class="tv-drawing-settings__color-btn tv-drawing-settings__color-btn--compact" data-pc-background-color aria-label="Background color">
                <span class="tv-drawing-settings__color-swatch" data-pc-background-swatch></span>
              </button>
            </div>
          </div>
          <div class="tv-set__section" data-fib-trend-section hidden>
            <div class="tv-set__section-head">Trend line</div>
            <div class="tv-set__section-body">
              <div class="tv-set__check-row tv-fib-control-row">
                <button type="button" class="tv-set__check tv-set__check--on" data-fib-trend-btn role="checkbox" aria-checked="true" aria-label="Trend line">
                  <span class="tv-set__check-box"></span>
                </button>
                <span class="tv-set__check-label">Trend line</span>
                <button type="button" class="tv-drawing-settings__color-btn tv-drawing-settings__color-btn--compact tv-fib-row-action" data-fib-trend-color aria-label="Trend line style">
                  <span class="tv-drawing-settings__color-swatch" data-fib-trend-swatch></span>
                </button>
              </div>
            </div>
          </div>
          <div class="tv-set__section" data-fib-levels-section hidden>
            <div class="tv-set__section-head">Levels</div>
            <div class="tv-set__section-body">
              <div class="tv-set__field-row">
                <span class="tv-set__field-label">Display</span>
                <div class="tv-set__select-wrap">
                  <button type="button" class="tv-drawing-settings__menu-btn" data-fib-levels-display-btn aria-haspopup="listbox">
                    <span data-fib-levels-display-label>Values</span>
                    <span class="tv-set__select-chev">${MENU_CHEVRON}</span>
                  </button>
                </div>
              </div>
              <div class="tv-fib-levels-grid" data-fib-levels-list></div>
              <div class="tv-set__check-row tv-fib-control-row">
                <button type="button" class="tv-set__check" data-fib-use-one-color-btn role="checkbox" aria-checked="false" aria-label="Use one color">
                  <span class="tv-set__check-box"></span>
                </button>
                <span class="tv-set__check-label">Use one color</span>
                <button type="button" class="tv-drawing-settings__color-btn tv-drawing-settings__color-btn--compact tv-fib-row-action" data-fib-use-one-swatch-wrap aria-label="One color" hidden>
                  <span class="tv-drawing-settings__color-swatch" data-fib-use-one-swatch></span>
                </button>
              </div>
            </div>
          </div>
          <div class="tv-set__section" data-fib-levels-line-section hidden>
            <div class="tv-set__section-head">Levels line</div>
            <div class="tv-set__section-body">
              <div class="tv-fib-levels-line-controls">
                <button type="button" class="tv-fib-line-control-btn" data-fib-levels-line-width-btn aria-haspopup="listbox" aria-label="Levels line width">
                  <span class="tv-fib-line-width-preview" data-fib-levels-line-width-preview></span>
                </button>
                <button type="button" class="tv-fib-line-control-btn" data-fib-levels-line-style-btn aria-haspopup="listbox" aria-label="Levels line style">
                  <span class="tv-fib-line-style-preview" data-fib-levels-line-style-preview></span>
                </button>
              </div>
            </div>
          </div>
          <div class="tv-set__section" data-fib-labels-section hidden>
            <div class="tv-set__section-head">Labels</div>
            <div class="tv-set__section-body tv-set__section-body--fields">
              <div class="tv-set__field-row">
                <span class="tv-set__field-label">Horizontal</span>
                <div class="tv-set__select-wrap">
                  <button type="button" class="tv-drawing-settings__menu-btn" data-fib-label-align-h-btn aria-haspopup="listbox">
                    <span data-fib-label-align-h-label>Left</span>
                    <span class="tv-set__select-chev">${MENU_CHEVRON}</span>
                  </button>
                </div>
              </div>
              <div class="tv-set__field-row">
                <span class="tv-set__field-label">Vertical</span>
                <div class="tv-set__select-wrap">
                  <button type="button" class="tv-drawing-settings__menu-btn" data-fib-label-align-v-btn aria-haspopup="listbox">
                    <span data-fib-label-align-v-label>Middle</span>
                    <span class="tv-set__select-chev">${MENU_CHEVRON}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div class="tv-set__section" data-fib-options-section hidden>
            <div class="tv-set__section-head">Options</div>
            <div class="tv-set__section-body tv-fib-options-body">
              <div class="tv-set__check-row tv-fib-control-row">
                <button type="button" class="tv-set__check" data-fib-reverse-btn role="checkbox" aria-checked="false" aria-label="Reverse">
                  <span class="tv-set__check-box"></span>
                </button>
                <span class="tv-set__check-label">Reverse</span>
              </div>
              <div class="tv-set__check-row tv-fib-control-row">
                <button type="button" class="tv-set__check tv-set__check--on" data-fib-prices-btn role="checkbox" aria-checked="true" aria-label="Prices">
                  <span class="tv-set__check-box"></span>
                </button>
                <span class="tv-set__check-label">Prices</span>
              </div>
              <div class="tv-set__check-row tv-fib-control-row">
                <button type="button" class="tv-set__check tv-set__check--on" data-fib-level-labels-btn role="checkbox" aria-checked="true" aria-label="Level labels">
                  <span class="tv-set__check-box"></span>
                </button>
                <span class="tv-set__check-label">Level labels</span>
              </div>
            </div>
          </div>
          <div class="tv-set__section" data-fib-background-section hidden>
            <div class="tv-set__section-head">Background</div>
            <div class="tv-set__section-body">
              <div class="tv-set__check-row tv-fib-control-row">
                <button type="button" class="tv-set__check tv-set__check--on" data-fib-background-btn role="checkbox" aria-checked="true" aria-label="Background">
                  <span class="tv-set__check-box"></span>
                </button>
                <span class="tv-set__check-label">Background</span>
                <button type="button" class="tv-drawing-settings__color-btn tv-drawing-settings__color-btn--compact tv-fib-row-action" data-fib-background-color aria-label="Background color">
                  <span class="tv-drawing-settings__color-swatch" data-fib-background-swatch></span>
                </button>
              </div>
            </div>
          </div>
          <div class="tv-set__section" data-gann-box-price-section hidden>
            <div class="tv-set__section-head">Price levels</div>
            <div class="tv-set__section-body">
              <div class="tv-fib-levels-grid" data-gann-price-levels-list></div>
            </div>
          </div>
          <div class="tv-set__section" data-gann-box-time-section hidden>
            <div class="tv-set__section-head">Time levels</div>
            <div class="tv-set__section-body">
              <div class="tv-fib-levels-grid" data-gann-time-levels-list></div>
            </div>
          </div>
          <div class="tv-set__section" data-gann-box-labels-section hidden>
            <div class="tv-set__section-head">Labels</div>
            <div class="tv-set__section-body tv-fib-options-body">
              <div class="tv-set__check-row tv-fib-control-row">
                <button type="button" class="tv-set__check tv-set__check--on" data-gann-left-labels-btn role="checkbox" aria-checked="true" aria-label="Left labels"><span class="tv-set__check-box"></span></button>
                <span class="tv-set__check-label">Left labels</span>
              </div>
              <div class="tv-set__check-row tv-fib-control-row">
                <button type="button" class="tv-set__check tv-set__check--on" data-gann-right-labels-btn role="checkbox" aria-checked="true" aria-label="Right labels"><span class="tv-set__check-box"></span></button>
                <span class="tv-set__check-label">Right labels</span>
              </div>
              <div class="tv-set__check-row tv-fib-control-row">
                <button type="button" class="tv-set__check tv-set__check--on" data-gann-top-labels-btn role="checkbox" aria-checked="true" aria-label="Top labels"><span class="tv-set__check-box"></span></button>
                <span class="tv-set__check-label">Top labels</span>
              </div>
              <div class="tv-set__check-row tv-fib-control-row">
                <button type="button" class="tv-set__check tv-set__check--on" data-gann-bottom-labels-btn role="checkbox" aria-checked="true" aria-label="Bottom labels"><span class="tv-set__check-box"></span></button>
                <span class="tv-set__check-label">Bottom labels</span>
              </div>
            </div>
          </div>
          <div class="tv-set__section" data-gann-box-angles-section hidden>
            <div class="tv-set__section-head">Angles</div>
            <div class="tv-set__section-body">
              <div class="tv-set__check-row tv-fib-control-row">
                <button type="button" class="tv-set__check" data-gann-angles-btn role="checkbox" aria-checked="false" aria-label="Angles"><span class="tv-set__check-box"></span></button>
                <span class="tv-set__check-label">Angles</span>
                <button type="button" class="tv-drawing-settings__color-btn tv-drawing-settings__color-btn--compact tv-fib-row-action" data-gann-angles-color aria-label="Angles color">
                  <span class="tv-drawing-settings__color-swatch" data-gann-angles-swatch></span>
                </button>
              </div>
            </div>
          </div>
          <div class="tv-set__section" data-gann-square-levels-section hidden>
            <div class="tv-set__section-head">Levels</div>
            <div class="tv-set__section-body">
              <div class="tv-fib-levels-grid" data-gann-square-levels-list></div>
            </div>
          </div>
          <div class="tv-set__section" data-gann-square-fans-section hidden>
            <div class="tv-set__section-head">Fans</div>
            <div class="tv-set__section-body">
              <div class="tv-fib-levels-grid" data-gann-fan-levels-list></div>
            </div>
          </div>
          <div class="tv-set__section" data-gann-square-arcs-section hidden>
            <div class="tv-set__section-head">Arcs</div>
            <div class="tv-set__section-body">
              <div class="tv-fib-levels-grid" data-gann-arcs-levels-list></div>
            </div>
          </div>
          <div class="tv-set__section" data-gann-fan-section hidden>
            <div class="tv-set__section-head">Levels</div>
            <div class="tv-set__section-body">
              <div class="tv-fib-levels-grid" data-gann-fan-lines-list></div>
            </div>
          </div>
          <div class="tv-set__section" data-gann-options-section hidden>
            <div class="tv-set__section-head">Options</div>
            <div class="tv-set__section-body tv-fib-options-body">
              <div class="tv-set__check-row tv-fib-control-row">
                <button type="button" class="tv-set__check" data-gann-use-one-color-btn role="checkbox" aria-checked="false" aria-label="Use one color"><span class="tv-set__check-box"></span></button>
                <span class="tv-set__check-label">Use one color</span>
                <button type="button" class="tv-drawing-settings__color-btn tv-drawing-settings__color-btn--compact tv-fib-row-action" data-gann-use-one-swatch-wrap aria-label="One color" hidden>
                  <span class="tv-drawing-settings__color-swatch" data-gann-use-one-swatch></span>
                </button>
              </div>
              <div class="tv-set__check-row tv-fib-control-row">
                <button type="button" class="tv-set__check" data-gann-reverse-btn role="checkbox" aria-checked="false" aria-label="Reverse"><span class="tv-set__check-box"></span></button>
                <span class="tv-set__check-label">Reverse</span>
              </div>
              <div class="tv-set__check-row tv-fib-control-row">
                <button type="button" class="tv-set__check tv-set__check--on" data-gann-labels-btn role="checkbox" aria-checked="true" aria-label="Labels"><span class="tv-set__check-box"></span></button>
                <span class="tv-set__check-label">Labels</span>
              </div>
              <div class="tv-set__check-row tv-fib-control-row">
                <button type="button" class="tv-set__check tv-set__check--on" data-gann-ranges-btn role="checkbox" aria-checked="true" aria-label="Ranges and ratio"><span class="tv-set__check-box"></span></button>
                <span class="tv-set__check-label">Ranges and ratio</span>
              </div>
            </div>
          </div>
          <div class="tv-set__section" data-gann-scale-section hidden>
            <div class="tv-set__section-head">Price/bar ratio</div>
            <div class="tv-set__section-body tv-set__section-body--fields">
              <div class="tv-set__field-row">
                <span class="tv-set__field-label">Ratio</span>
                <input type="text" class="tv-drawing-settings__input" data-gann-scale-ratio inputmode="decimal" placeholder="Auto" />
              </div>
            </div>
          </div>
          <div class="tv-set__section" data-gann-background-section hidden>
            <div class="tv-set__section-head">Background</div>
            <div class="tv-set__section-body">
              <div class="tv-set__check-row tv-fib-control-row">
                <button type="button" class="tv-set__check tv-set__check--on" data-gann-background-btn role="checkbox" aria-checked="true" aria-label="Background"><span class="tv-set__check-box"></span></button>
                <span class="tv-set__check-label">Background</span>
                <button type="button" class="tv-drawing-settings__color-btn tv-drawing-settings__color-btn--compact tv-fib-row-action" data-gann-background-color aria-label="Background color">
                  <span class="tv-drawing-settings__color-swatch" data-gann-background-swatch></span>
                </button>
              </div>
            </div>
          </div>
        </div>
        <div class="tv-drawing-settings__panel" data-panel="text" hidden>
          <div class="tv-set__section">
            <div class="tv-set__section-head" data-text-section-title>Text</div>
            <div class="tv-set__section-body">
              <div class="tv-drawing-settings__text-toolbar">
                <button type="button" class="tv-drawing-settings__color-btn tv-drawing-settings__color-btn--compact" data-text-color aria-label="Text color">
                  <span class="tv-drawing-settings__color-swatch" data-text-swatch></span>
                </button>
                <select class="tv-drawing-settings__select tv-drawing-settings__select--small" data-font-size>
                  <option value="10">10</option>
                  <option value="12">12</option>
                  <option value="14" selected>14</option>
                  <option value="16">16</option>
                  <option value="18">18</option>
                </select>
              </div>
              <textarea class="tv-drawing-settings__textarea" data-text-input rows="5" placeholder="Add text"></textarea>
            </div>
          </div>
          <div class="tv-set__section" data-text-align-section>
            <div class="tv-set__section-head" data-text-align-section-title>Text alignment</div>
            <div class="tv-set__section-body tv-set__section-body--fields">
              <div class="tv-set__field-row">
                <span class="tv-set__field-label">Vertical</span>
                <div class="tv-set__select-wrap">
                  <button type="button" class="tv-drawing-settings__menu-btn" data-align-v-btn aria-haspopup="listbox">
                    <span data-align-v-label>Top</span>
                    <span class="tv-set__select-chev">${MENU_CHEVRON}</span>
                  </button>
                </div>
              </div>
              <div class="tv-set__field-row">
                <span class="tv-set__field-label">Horizontal</span>
                <div class="tv-set__select-wrap">
                  <button type="button" class="tv-drawing-settings__menu-btn" data-align-h-btn aria-haspopup="listbox">
                    <span data-align-h-label>Center</span>
                    <span class="tv-set__select-chev">${MENU_CHEVRON}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="tv-drawing-settings__panel" data-panel="coordinates" hidden data-coords-panel></div>
        <div class="tv-drawing-settings__panel" data-panel="visibility" hidden>
          <div class="tv-set__section">
            <div class="tv-set__section-head">Visibility</div>
            <div class="tv-set__section-body" data-visibility-list></div>
          </div>
        </div>
      </div>
      <div class="tv-drawing-settings__footer">
        <button type="button" class="tv-drawing-settings__btn tv-drawing-settings__btn--secondary" data-cancel>Cancel</button>
        <button type="button" class="tv-drawing-settings__btn tv-drawing-settings__btn--primary" data-submit>Ok</button>
      </div>
    </div>`;
}

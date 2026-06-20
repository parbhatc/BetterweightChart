import { DEFAULT_NEWS_LEVELS, NEWS_SOURCE_OPTIONS, normalizeNewsLevels } from "./events.js";

const STORAGE_KEY = "bwc-news-settings";

/** @typedef {{ enabled: boolean, source: string, eventTypes: import("./events.js").NewsLevelRow[] }} NewsSettings */

/** @type {NewsSettings} */
const DEFAULT_NEWS_SETTINGS = {
  enabled: true,
  source: "forexfactory",
  eventTypes: DEFAULT_NEWS_LEVELS.map((r) => ({ ...r })),
};

/** @returns {NewsSettings} */
function loadNewsSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_NEWS_SETTINGS);
    const parsed = JSON.parse(raw);
    return {
      enabled: parsed.enabled !== false,
      source: parsed.source ?? "forexfactory",
      eventTypes: normalizeNewsLevels(parsed.eventTypes ?? parsed.newsLevels),
    };
  } catch {
    return structuredClone(DEFAULT_NEWS_SETTINGS);
  }
}

/** @param {NewsSettings} state */
function saveNewsSettings(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    //
  }
}

export function createNewsSettings() {
  /** @type {NewsSettings} */
  let state = loadNewsSettings();
  /** @type {Set<(s: NewsSettings) => void>} */
  const listeners = new Set();

  function emit() {
    listeners.forEach((fn) => fn(state));
  }

  return {
    get() {
      return state;
    },
    getDefaults() {
      return structuredClone(DEFAULT_NEWS_SETTINGS);
    },
    isEnabled() {
      return state.enabled !== false;
    },
    sourceOptions() {
      return NEWS_SOURCE_OPTIONS;
    },
    /** @param {Partial<NewsSettings>} patch */
    update(patch) {
      if (patch.enabled != null) state.enabled = patch.enabled !== false;
      if (patch.source != null) state.source = String(patch.source);
      if (patch.eventTypes != null) state.eventTypes = normalizeNewsLevels(patch.eventTypes);
      saveNewsSettings(state);
      emit();
    },
    setEnabled(enabled) {
      state.enabled = enabled !== false;
      saveNewsSettings(state);
      emit();
    },
    reset() {
      state = structuredClone(DEFAULT_NEWS_SETTINGS);
      saveNewsSettings(state);
      emit();
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

/** @type {ReturnType<typeof createNewsSettings> | null} */
let shared = null;

export function getNewsSettingsStore() {
  if (!shared) shared = createNewsSettings();
  return shared;
}

export { DEFAULT_NEWS_SETTINGS, NEWS_SOURCE_OPTIONS };

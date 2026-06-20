/**
 * @typedef {{
 *   id: string | null,
 *   title: string,
 *   country: string,
 *   impact: string,
 *   hmEt: string | null,
 *   timeLabel: string,
 *   forecast: string | null,
 *   previous: string | null,
 *   actual: string | null,
 *   url: string | null,
 * }} NewsEvent
 */

/**
 * @typedef {{
 *   sources: { id: string, label: string }[],
 *   default_source: string,
 *   default_types: string[],
 *   default_currencies: string,
 *   time_zone: string,
 *   endpoints?: Record<string, string>,
 * }} NewsConfig
 */

/**
 * @typedef {{
 *   day: string,
 *   source: string,
 *   timeZone: string,
 *   events: NewsEvent[],
 *   error?: string,
 *   file?: string,
 * }} NewsCalendarResponse
 */

export {};

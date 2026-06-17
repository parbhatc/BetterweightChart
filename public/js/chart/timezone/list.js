/** @typedef {{ value: string, label: string }} TzOption */
/** @typedef {{ value: string, label: string }} PrecisionOption */

/** @type {TzOption[]} */
export const TIMEZONE_OPTIONS = [
  { value: "Etc/UTC", label: "UTC" },
  { value: "exchange", label: "Exchange" },
  { value: "Pacific/Honolulu", label: "(UTC-10) Honolulu" },
  { value: "America/Anchorage", label: "(UTC-8) Anchorage" },
  { value: "America/Juneau", label: "(UTC-8) Juneau" },
  { value: "America/Los_Angeles", label: "(UTC-7) Los Angeles" },
  { value: "America/Phoenix", label: "(UTC-7) Phoenix" },
  { value: "America/Vancouver", label: "(UTC-7) Vancouver" },
  { value: "America/Denver", label: "(UTC-6) Denver" },
  { value: "America/Mexico_City", label: "(UTC-6) Mexico City" },
  { value: "America/El_Salvador", label: "(UTC-6) San Salvador" },
  { value: "America/Bogota", label: "(UTC-5) Bogota" },
  { value: "America/Chicago", label: "(UTC-5) Chicago" },
  { value: "America/Lima", label: "(UTC-5) Lima" },
  { value: "America/Caracas", label: "(UTC-4) Caracas" },
  { value: "America/New_York", label: "(UTC-4) New York" },
  { value: "America/Santiago", label: "(UTC-4) Santiago" },
  { value: "America/Toronto", label: "(UTC-4) Toronto" },
  { value: "America/Argentina/Buenos_Aires", label: "(UTC-3) Buenos Aires" },
  { value: "America/Halifax", label: "(UTC-3) Halifax" },
  { value: "America/Sao_Paulo", label: "(UTC-3) Sao Paulo" },
  { value: "Atlantic/Azores", label: "(UTC) Azores" },
  { value: "Atlantic/Reykjavik", label: "(UTC) Reykjavik" },
  { value: "Africa/Casablanca", label: "(UTC+1) Casablanca" },
  { value: "Europe/Dublin", label: "(UTC+1) Dublin" },
  { value: "Africa/Lagos", label: "(UTC+1) Lagos" },
  { value: "Europe/Lisbon", label: "(UTC+1) Lisbon" },
  { value: "Europe/London", label: "(UTC+1) London" },
  { value: "Africa/Tunis", label: "(UTC+1) Tunis" },
  { value: "Europe/Amsterdam", label: "(UTC+2) Amsterdam" },
  { value: "Europe/Belgrade", label: "(UTC+2) Belgrade" },
  { value: "Europe/Berlin", label: "(UTC+2) Berlin" },
  { value: "Europe/Bratislava", label: "(UTC+2) Bratislava" },
  { value: "Europe/Brussels", label: "(UTC+2) Brussels" },
  { value: "Europe/Budapest", label: "(UTC+2) Budapest" },
  { value: "Europe/Copenhagen", label: "(UTC+2) Copenhagen" },
  { value: "Africa/Johannesburg", label: "(UTC+2) Johannesburg" },
  { value: "Europe/Ljubljana", label: "(UTC+2) Ljubljana" },
  { value: "Europe/Luxembourg", label: "(UTC+2) Luxembourg" },
  { value: "Europe/Madrid", label: "(UTC+2) Madrid" },
  { value: "Europe/Malta", label: "(UTC+2) Malta" },
  { value: "Europe/Oslo", label: "(UTC+2) Oslo" },
  { value: "Europe/Paris", label: "(UTC+2) Paris" },
  { value: "Europe/Prague", label: "(UTC+2) Prague" },
  { value: "Europe/Rome", label: "(UTC+2) Rome" },
  { value: "Europe/Stockholm", label: "(UTC+2) Stockholm" },
  { value: "Europe/Vienna", label: "(UTC+2) Vienna" },
  { value: "Europe/Warsaw", label: "(UTC+2) Warsaw" },
  { value: "Europe/Zagreb", label: "(UTC+2) Zagreb" },
  { value: "Europe/Zurich", label: "(UTC+2) Zurich" },
  { value: "Europe/Athens", label: "(UTC+3) Athens" },
  { value: "Asia/Bahrain", label: "(UTC+3) Bahrain" },
  { value: "Europe/Bucharest", label: "(UTC+3) Bucharest" },
  { value: "Africa/Cairo", label: "(UTC+3) Cairo" },
  { value: "Europe/Helsinki", label: "(UTC+3) Helsinki" },
  { value: "Europe/Istanbul", label: "(UTC+3) Istanbul" },
  { value: "Asia/Jerusalem", label: "(UTC+3) Jerusalem" },
  { value: "Asia/Kuwait", label: "(UTC+3) Kuwait" },
  { value: "Europe/Moscow", label: "(UTC+3) Moscow" },
  { value: "Africa/Nairobi", label: "(UTC+3) Nairobi" },
  { value: "Asia/Nicosia", label: "(UTC+3) Nicosia" },
  { value: "Asia/Qatar", label: "(UTC+3) Qatar" },
  { value: "Europe/Riga", label: "(UTC+3) Riga" },
  { value: "Asia/Riyadh", label: "(UTC+3) Riyadh" },
  { value: "Europe/Sofia", label: "(UTC+3) Sofia" },
  { value: "Europe/Tallinn", label: "(UTC+3) Tallinn" },
  { value: "Europe/Vilnius", label: "(UTC+3) Vilnius" },
  { value: "Asia/Tehran", label: "(UTC+3:30) Tehran" },
  { value: "Asia/Dubai", label: "(UTC+4) Dubai" },
  { value: "Asia/Muscat", label: "(UTC+4) Muscat" },
  { value: "Asia/Kabul", label: "(UTC+4:30) Kabul" },
  { value: "Asia/Ashgabat", label: "(UTC+5) Ashgabat" },
  { value: "Asia/Almaty", label: "(UTC+5) Astana" },
  { value: "Asia/Karachi", label: "(UTC+5) Karachi" },
  { value: "Asia/Colombo", label: "(UTC+5:30) Colombo" },
  { value: "Asia/Kolkata", label: "(UTC+5:30) Kolkata" },
  { value: "Asia/Kathmandu", label: "(UTC+5:45) Kathmandu" },
  { value: "Asia/Dhaka", label: "(UTC+6) Dhaka" },
  { value: "Asia/Yangon", label: "(UTC+6:30) Yangon" },
  { value: "Asia/Bangkok", label: "(UTC+7) Bangkok" },
  { value: "Asia/Ho_Chi_Minh", label: "(UTC+7) Ho Chi Minh" },
  { value: "Asia/Jakarta", label: "(UTC+7) Jakarta" },
  { value: "Asia/Chongqing", label: "(UTC+8) Chongqing" },
  { value: "Asia/Hong_Kong", label: "(UTC+8) Hong Kong" },
  { value: "Asia/Kuala_Lumpur", label: "(UTC+8) Kuala Lumpur" },
  { value: "Asia/Manila", label: "(UTC+8) Manila" },
  { value: "Australia/Perth", label: "(UTC+8) Perth" },
  { value: "Asia/Shanghai", label: "(UTC+8) Shanghai" },
  { value: "Asia/Singapore", label: "(UTC+8) Singapore" },
  { value: "Asia/Taipei", label: "(UTC+8) Taipei" },
  { value: "Asia/Seoul", label: "(UTC+9) Seoul" },
  { value: "Asia/Tokyo", label: "(UTC+9) Tokyo" },
  { value: "Australia/Adelaide", label: "(UTC+9:30) Adelaide" },
  { value: "Australia/Brisbane", label: "(UTC+10) Brisbane" },
  { value: "Australia/Sydney", label: "(UTC+10) Sydney" },
  { value: "Pacific/Norfolk", label: "(UTC+11) Norfolk Island" },
  { value: "Pacific/Auckland", label: "(UTC+12) New Zealand" },
  { value: "Pacific/Chatham", label: "(UTC+12:45) Chatham Islands" },
  { value: "Pacific/Fakaofo", label: "(UTC+13) Tokelau" },
];

/** @type {PrecisionOption[]} */
export const PRECISION_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "0", label: "Integer" },
  ...Array.from({ length: 15 }, (_, i) => {
    const n = i + 1;
    return { value: String(n), label: n === 1 ? "1 decimal" : `${n} decimals` };
  }),
  { value: "frac:2", label: "1/2" },
  { value: "frac:4", label: "1/4" },
  { value: "frac:8", label: "1/8" },
  { value: "frac:16", label: "1/16" },
  { value: "frac:32", label: "1/32" },
  { value: "frac:64", label: "1/64" },
  { value: "frac:128", label: "1/128" },
  { value: "frac:320", label: "1/320" },
];

/**
 * @param {string | undefined} setting
 * @param {object} [symbolInfo]
 */
export function priceFormatFromPrecisionSetting(setting, symbolInfo) {
  if (!setting || setting === "default") {
    if (symbolInfo?.pricescale && symbolInfo?.minmov != null) {
      const minMove = symbolInfo.minmov / symbolInfo.pricescale;
      const parts = String(minMove).split(".");
      return { type: "price", precision: parts[1]?.length ?? 0, minMove };
    }
    const tick = symbolInfo?.tick ?? 0.01;
    const parts = String(tick).split(".");
    return { type: "price", precision: parts[1]?.length ?? 0, minMove: tick };
  }
  if (setting.startsWith("frac:")) {
    const denom = Number(setting.slice(5));
    const minMove = 1 / denom;
    const parts = String(minMove).split(".");
    return { type: "price", precision: parts[1]?.length ?? 0, minMove };
  }
  const p = Number(setting);
  if (p === 0) return { type: "price", precision: 0, minMove: 1 };
  return { type: "price", precision: p, minMove: 10 ** -p };
}

/**
 * Price format for indicator axis labels — display decimals only, not instrument tick size.
 * TradingView shows values like 30348.24 even when the symbol tick is 0.25.
 * @param {string | undefined} setting
 * @param {object} [symbolInfo]
 */
export function indicatorPriceFormatFromSetting(setting, symbolInfo) {
  const precision = displayPrecisionFromSetting(setting, symbolInfo);
  if (precision <= 0) return { type: "price", precision: 0, minMove: 1 };
  return { type: "price", precision, minMove: 10 ** -precision };
}

/** @param {string | undefined} setting @param {object} [symbolInfo] */
export function indicatorDisplayPrecision(setting, symbolInfo) {
  return displayPrecisionFromSetting(setting, symbolInfo);
}

/**
 * @param {string | undefined} setting
 * @param {object} [symbolInfo]
 */
function displayPrecisionFromSetting(setting, symbolInfo) {
  if (!setting || setting === "default") {
    if (symbolInfo?.pricescale) return Math.round(Math.log10(symbolInfo.pricescale));
    const tick = symbolInfo?.tick ?? 0.01;
    const parts = String(tick).split(".");
    return parts[1] ? parts[1].length : 2;
  }
  if (setting.startsWith("frac:")) {
    const minMove = 1 / Number(setting.slice(5));
    const parts = String(minMove).split(".");
    return parts[1] ? parts[1].length : 0;
  }
  return Number(setting);
}

/**
 * @param {string} tz
 * @param {object} [symbolInfo]
 */
export function resolveTimezone(tz, symbolInfo) {
  if (tz === "exchange") {
    const byExchange = {
      CME: "America/Chicago",
      CBOT: "America/Chicago",
      NYMEX: "America/New_York",
      COMEX: "America/New_York",
      NASDAQ: "America/New_York",
      ARCA: "America/New_York",
      CRYPTO: "Etc/UTC",
      FOREX: "America/New_York",
    };
    return (
      symbolInfo?.timezone ??
      byExchange[symbolInfo?.exchange] ??
      "America/New_York"
    );
  }
  return tz || "America/New_York";
}

/** @param {Date} date @param {string} timeZone */
export function formatUtcOffsetLabel(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
  }).formatToParts(date);
  const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  return name.replace(/^GMT/, "UTC");
}

/** @param {Date} date @param {string} timeZone */
export function formatClockTime(date, timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(date);
}

/** @param {Date} date @param {string} timeZone */
export function formatClockButton(date, timeZone) {
  return `${formatClockTime(date, timeZone)} ${formatUtcOffsetLabel(date, timeZone)}`;
}

/** @param {number} unixSec @param {string} timeZone */
export function formatTimeInZone(unixSec, timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(unixSec * 1000));
}

/** @param {object} settings @param {object} [symbolInfo] */
export function precisionFromSettings(settings, symbolInfo) {
  return displayPrecisionFromSetting(settings?.symbol?.precision, symbolInfo);
}

const RELATIVE_TIME_UNIT_MS: Record<string, number> = {
  s: 1_000,
  sec: 1_000,
  secs: 1_000,
  second: 1_000,
  seconds: 1_000,
  с: 1_000,
  сек: 1_000,
  m: 60_000,
  min: 60_000,
  mins: 60_000,
  minute: 60_000,
  minutes: 60_000,
  хв: 60_000,
  h: 60 * 60_000,
  hr: 60 * 60_000,
  hrs: 60 * 60_000,
  hour: 60 * 60_000,
  hours: 60 * 60_000,
  год: 60 * 60_000,
  d: 24 * 60 * 60_000,
  day: 24 * 60 * 60_000,
  days: 24 * 60 * 60_000,
  д: 24 * 60 * 60_000,
  дн: 24 * 60 * 60_000,
  w: 7 * 24 * 60 * 60_000,
  wk: 7 * 24 * 60 * 60_000,
  wks: 7 * 24 * 60 * 60_000,
  week: 7 * 24 * 60 * 60_000,
  weeks: 7 * 24 * 60 * 60_000,
  тиж: 7 * 24 * 60 * 60_000,
  mo: 30 * 24 * 60 * 60_000,
  mos: 30 * 24 * 60 * 60_000,
  month: 30 * 24 * 60 * 60_000,
  months: 30 * 24 * 60 * 60_000,
  міс: 30 * 24 * 60 * 60_000,
  y: 365 * 24 * 60 * 60_000,
  yr: 365 * 24 * 60 * 60_000,
  yrs: 365 * 24 * 60 * 60_000,
  year: 365 * 24 * 60 * 60_000,
  years: 365 * 24 * 60 * 60_000,
  р: 365 * 24 * 60 * 60_000,
  рік: 365 * 24 * 60 * 60_000,
  роки: 365 * 24 * 60 * 60_000,
  років: 365 * 24 * 60 * 60_000,
};

/** Converts LinkedIn's visible relative-view label to an approximate age. */
export function parseProfileViewerRelativeAgeMs(value: string | undefined): number | null {
  const normalized = (value || '').trim().toLocaleLowerCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ');
  if (!normalized) {
    return null;
  }

  if (/\bjust now\b/u.test(normalized) || /\bщойно\b/u.test(normalized)) {
    return 0;
  }
  if (/\byesterday\b/u.test(normalized) || /\bвчора\b/u.test(normalized)) {
    return RELATIVE_TIME_UNIT_MS.d;
  }

  const match = normalized.match(
    /(?:^|\s)(\d+)\s*(seconds?|secs?|sec|s|minutes?|mins?|min|m|hours?|hrs?|hr|h|days?|d|weeks?|wks?|wk|w|months?|mos?|mo|years?|yrs?|yr|y|сек|с|хв|год|дн|д|тиж|міс|років|роки|рік|р)(?:\s|$)/u
  );
  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  const unitMs = RELATIVE_TIME_UNIT_MS[match[2]];
  return Number.isSafeInteger(amount) && unitMs ? amount * unitMs : null;
}

export function getEstimatedProfileViewedAt(viewedAgoText: string | undefined, observedAt: number): number | null {
  const ageMs = parseProfileViewerRelativeAgeMs(viewedAgoText);
  return ageMs === null || !Number.isFinite(observedAt) ? null : observedAt - ageMs;
}

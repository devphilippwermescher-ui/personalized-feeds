export interface ConnectionDateOccurrence {
  index: number;
  date: string;
}

const CONNECTION_DATE_LOCALES = [
  'en',
  'ru',
  'uk',
  'de',
  'fr',
  'es',
  'it',
  'pt',
  'nl',
  'pl',
  'cs',
  'da',
  'fi',
  'hu',
  'nb',
  'ro',
  'sv',
  'tr',
  'id',
  'ms',
  'vi',
  'hi',
  'ar',
  'th',
];

function normalizeMonthToken(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{M}]/gu, '');
}

function createMonthLookup(locales: string[]): Map<string, number> {
  const monthLookup = new Map<string, number>();
  for (const locale of Array.from(new Set(locales.filter(Boolean)))) {
    for (let month = 0; month < 12; month += 1) {
      const date = new Date(Date.UTC(2020, month, 15));
      for (const width of ['long', 'short'] as const) {
        try {
          const standalone = new Intl.DateTimeFormat(locale, {
            month: width,
            timeZone: 'UTC',
          }).format(date);
          const contextual = new Intl.DateTimeFormat(locale, {
            day: 'numeric',
            month: width,
            year: 'numeric',
            timeZone: 'UTC',
          })
            .formatToParts(date)
            .find((part) => part.type === 'month')?.value;
          [standalone, contextual].forEach((candidate) => {
            const token = normalizeMonthToken(candidate || '');
            // Numeric CJK month labels collapse to the same suffix after
            // normalization and are handled by the numeric parser below.
            if (token.length >= 2) monthLookup.set(token, month);
          });
        } catch {
          // Ignore a locale unsupported by the current JavaScript runtime.
        }
      }
    }
  }
  return monthLookup;
}

function toDateKey(year: number, month: number, day: number): string | undefined {
  if (!Number.isSafeInteger(year) || !Number.isSafeInteger(month) || !Number.isSafeInteger(day)) return undefined;
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) return undefined;
  return date.toISOString().slice(0, 10);
}

const DEFAULT_MONTH_LOOKUP = createMonthLookup(CONNECTION_DATE_LOCALES);

/**
 * Finds calendar dates without depending on LinkedIn's surrounding label.
 * LinkedIn localizes labels such as "Connected on", while the calendar value
 * itself remains recoverable from numeric formats or locale-aware month names.
 */
export function readConnectionDateOccurrences(value: string): ConnectionDateOccurrence[] {
  const occurrences = new Map<string, ConnectionDateOccurrence>();
  const addOccurrence = (index: number, year: number, month: number, day: number) => {
    const date = toDateKey(year, month, day);
    if (date) occurrences.set(`${index}:${date}`, { index, date });
  };

  for (const match of value.matchAll(/(?<!\d)(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?!\d)/g)) {
    addOccurrence(match.index || 0, Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  for (const match of value.matchAll(/(?<!\d)(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?!\d)/g)) {
    const first = Number(match[1]);
    const second = Number(match[2]);
    // Resolve only unambiguous numeric dates. Locale-formatted LinkedIn dates
    // normally use month names; guessing 04/05 would corrupt history.
    if (first > 12) addOccurrence(match.index || 0, Number(match[3]), second - 1, first);
    else if (second > 12) addOccurrence(match.index || 0, Number(match[3]), first - 1, second);
  }
  for (const match of value.matchAll(/(?<!\d)(\d{4})\s*(?:年|년)\s*(\d{1,2})\s*(?:月|월)\s*(\d{1,2})\s*(?:日|일)?/gu)) {
    addOccurrence(match.index || 0, Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  for (const yearMatch of value.matchAll(/(?<!\d)(\d{4})(?!\d)/g)) {
    const yearIndex = yearMatch.index || 0;
    const windowStart = Math.max(0, yearIndex - 48);
    const windowEnd = Math.min(value.length, yearIndex + yearMatch[0].length + 40);
    const windowText = value.slice(windowStart, windowEnd);
    const monthCandidates = Array.from(windowText.matchAll(/[\p{L}\p{M}][\p{L}\p{M}.'’-]*/gu))
      .map((match) => ({
        start: windowStart + (match.index || 0),
        end: windowStart + (match.index || 0) + match[0].length,
        month: DEFAULT_MONTH_LOOKUP.get(normalizeMonthToken(match[0])),
      }))
      .filter(
        (candidate): candidate is { start: number; end: number; month: number } => typeof candidate.month === 'number'
      )
      .sort(
        (left, right) =>
          Math.min(Math.abs(left.start - yearIndex), Math.abs(left.end - yearIndex)) -
          Math.min(Math.abs(right.start - yearIndex), Math.abs(right.end - yearIndex))
      );
    const monthCandidate = monthCandidates[0];
    if (!monthCandidate) continue;

    const dayCandidates = Array.from(windowText.matchAll(/(?<!\d)(\d{1,2})(?!\d)/g))
      .map((match) => ({
        start: windowStart + (match.index || 0),
        end: windowStart + (match.index || 0) + match[0].length,
        day: Number(match[1]),
      }))
      .filter(
        (candidate) =>
          candidate.day >= 1 &&
          candidate.day <= 31 &&
          !(candidate.start >= yearIndex && candidate.end <= yearIndex + yearMatch[0].length)
      )
      .map((candidate) => ({
        ...candidate,
        distance:
          candidate.end <= monthCandidate.start
            ? monthCandidate.start - candidate.end
            : candidate.start >= monthCandidate.end
              ? candidate.start - monthCandidate.end
              : Number.POSITIVE_INFINITY,
      }))
      .filter((candidate) => candidate.distance <= 16)
      .sort((left, right) => left.distance - right.distance);
    const dayCandidate = dayCandidates[0];
    if (!dayCandidate) continue;
    addOccurrence(
      Math.min(monthCandidate.start, dayCandidate.start),
      Number(yearMatch[1]),
      monthCandidate.month,
      dayCandidate.day
    );
  }

  return Array.from(occurrences.values()).sort((left, right) => left.index - right.index);
}

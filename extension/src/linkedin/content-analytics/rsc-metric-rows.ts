import {
  getRscRecordText,
  isRscHighlightValueRecord,
  isRscParagraphRecord,
  parseRscCount,
  type RscFlightRecord,
} from '../rsc-flight-records';

/**
 * LinkedIn analytics screens use exactly two metric layouts:
 *
 * - a highlight card, whose big value chunk is emitted just before its label;
 * - a breakdown row, whose plain `<p>` value chunk follows its label.
 *
 * Both are matched through visible text and text size, never through minified
 * component ids, so a redeploy of LinkedIn's bundle does not break parsing.
 */
export type RscMetricLayout = 'highlight' | 'row';

export function findRscRowValue(records: RscFlightRecord[], labelIndex: number): number | undefined {
  for (let index = labelIndex + 1; index <= labelIndex + 2 && index < records.length; index += 1) {
    if (!isRscParagraphRecord(records[index].value)) continue;
    const count = parseRscCount(getRscRecordText(records[index].value) || '');
    if (typeof count === 'number') return count;
  }
  return undefined;
}

export function findRscHighlightValue(records: RscFlightRecord[], labelIndex: number): number | undefined {
  for (let index = labelIndex - 1; index >= Math.max(0, labelIndex - 2); index -= 1) {
    if (!isRscHighlightValueRecord(records[index].value)) continue;
    const count = parseRscCount(getRscRecordText(records[index].value) || '');
    if (typeof count === 'number') return count;
  }
  return undefined;
}

export function normalizeRscLabel(value: string | undefined): string {
  return (value || '').trim().toLowerCase();
}

export interface RscMetricDefinition<TKey extends string> {
  /** Lower-case English label as LinkedIn renders it. */
  label: string;
  key: TKey;
  layout: RscMetricLayout;
}

/**
 * Collects the first occurrence of each definition. LinkedIn pre-renders the
 * daily and cumulative variants of a screen, so later duplicates are ignored.
 */
export function extractRscLabeledMetrics<TKey extends string>(
  records: RscFlightRecord[],
  definitions: Array<RscMetricDefinition<TKey>>
): Partial<Record<TKey, number>> {
  const values: Partial<Record<TKey, number>> = {};
  records.forEach((record, index) => {
    const label = normalizeRscLabel(getRscRecordText(record.value));
    if (!label) return;

    const definition = definitions.find((item) => item.label === label);
    if (!definition || values[definition.key] !== undefined) return;

    const value =
      definition.layout === 'highlight'
        ? findRscHighlightValue(records, index)
        : findRscRowValue(records, index);
    if (typeof value === 'number') values[definition.key] = value;
  });
  return values;
}

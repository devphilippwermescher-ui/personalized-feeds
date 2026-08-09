import type { ProfileAnalyticsSearchAppearancesSnapshot } from 'shared/types';
import { findFirstRecord, getNestedRecord, getString, isRecord, type UnknownRecord } from './linkedin/json-utils';

const SEARCH_APPEARANCES_CARD_MARKER = 'PROFILE_APPEARANCES_INSIGHTS_CONSOLIDATED_CARD';

function parseMetricCount(value: unknown): number | undefined {
  const text = getString(value);
  if (!text) return undefined;

  const normalized = text.replace(/[^\d.-]/g, '');
  if (!normalized) return undefined;

  const count = Number(normalized);
  return Number.isFinite(count) && count >= 0 ? Math.round(count) : undefined;
}

function getMetricItems(card: UnknownRecord): UnknownRecord[] {
  const components = Array.isArray(card.components) ? card.components : [];
  for (const component of components) {
    if (!isRecord(component)) continue;
    const summary = getNestedRecord(component, ['summary']);
    const keyMetrics = summary ? getNestedRecord(summary, ['keyMetrics']) : null;
    if (keyMetrics && Array.isArray(keyMetrics.items)) {
      return keyMetrics.items.filter(isRecord);
    }
  }
  return [];
}

function getMetricDescription(item: UnknownRecord): string {
  return getString(getNestedRecord(item, ['description'])?.text).toLowerCase();
}

function findSearchAppearancesMetric(payload: unknown): UnknownRecord | null {
  const consolidatedCard = findFirstRecord(payload, (record) =>
    getString(record.entityUrn).includes(SEARCH_APPEARANCES_CARD_MARKER)
  );
  const cardItems = consolidatedCard ? getMetricItems(consolidatedCard) : [];
  const describedMetric = cardItems.find((item) => {
    const description = getMetricDescription(item);
    return description.includes('search') && description.includes('appearance');
  });

  // LinkedIn currently returns "All appearances" first and "Search appearances"
  // second. The positional fallback keeps the collector working for localized
  // labels while the card URN still identifies the exact analytics module.
  if (describedMetric) return describedMetric;
  if (cardItems.length >= 2) return cardItems[1];

  return findFirstRecord(payload, (record) => {
    const description = getMetricDescription(record);
    return description.includes('search') && description.includes('appearance');
  });
}

function normalizePeriodLabel(value: unknown): string | undefined {
  const label = getString(value);
  return label ? `${label.charAt(0).toUpperCase()}${label.slice(1)}` : undefined;
}

export function parseSearchAppearancesSnapshot(
  payload: unknown,
  collectedAt: number,
  sourceUrl: string
): ProfileAnalyticsSearchAppearancesSnapshot | null {
  const metric = findSearchAppearancesMetric(payload);
  if (!metric) return null;

  const totalCount = parseMetricCount(getNestedRecord(metric, ['title'])?.text);
  if (typeof totalCount !== 'number') return null;

  return {
    totalCount,
    periodLabel: normalizePeriodLabel(metric.valuePercentageDescription),
    updatedAt: collectedAt,
    sourceUrl,
  };
}

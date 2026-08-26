import type { ProfileAnalyticsSearchAppearancesSnapshot } from 'shared/types';
import { findFirstRecord, getNestedRecord, getString, isRecord, type UnknownRecord } from './linkedin/json-utils';

const SEARCH_APPEARANCES_CARD_MARKER = 'PROFILE_APPEARANCES_INSIGHTS_CONSOLIDATED_CARD';

function parseMetricCount(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;
  }
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

function findConsolidatedCard(payload: unknown): UnknownRecord | null {
  return findFirstRecord(payload, (record) => getString(record.entityUrn).includes(SEARCH_APPEARANCES_CARD_MARKER));
}

function findSearchAppearancesMetric(payload: unknown, consolidatedCard: UnknownRecord | null): UnknownRecord | null {
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
  const consolidatedCard = findConsolidatedCard(payload);
  const metric = findSearchAppearancesMetric(payload, consolidatedCard);
  // LinkedIn can omit the key-metric item when Search Appearances is zero.
  // The exact consolidated-card URN proves this is a valid analytics response;
  // without that card we still treat the response as incomplete.
  if (!metric && !consolidatedCard) return null;

  const title = metric ? getNestedRecord(metric, ['title']) : null;
  const totalCount = metric ? (parseMetricCount(title?.text) ?? parseMetricCount(title?.accessibilityText)) : 0;
  if (typeof totalCount !== 'number') {
    // Some zero-result variants render a dash instead of a numeric title.
    const titleText = getString(title?.text);
    if (!/^[-–—]$/.test(titleText)) return null;
  }

  return {
    totalCount: totalCount ?? 0,
    periodLabel: metric ? normalizePeriodLabel(metric.valuePercentageDescription) : undefined,
    updatedAt: collectedAt,
    sourceUrl,
  };
}

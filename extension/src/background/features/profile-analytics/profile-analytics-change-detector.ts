import type {
  ProfileAnalyticsProfileSnapshot,
  ProfileAnalyticsSearchAppearancesSnapshot,
  ProfileAnalyticsSsiSnapshot,
} from 'shared/types';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)])
  );
}

function isEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

export function hasProfileSnapshotChanged(
  current: ProfileAnalyticsProfileSnapshot | undefined,
  next: ProfileAnalyticsProfileSnapshot
): boolean {
  if (!current) return true;
  const {
    updatedAt: _currentUpdatedAt,
    sourceUrl: _currentSourceUrl,
    followerGrowthUpdatedAt: _currentFollowerGrowthUpdatedAt,
    ...currentValues
  } = current;
  const {
    updatedAt: _nextUpdatedAt,
    sourceUrl: _nextSourceUrl,
    followerGrowthUpdatedAt: _nextFollowerGrowthUpdatedAt,
    ...nextValues
  } = next;
  return !isEqual(currentValues, nextValues);
}

export function hasSearchAppearancesChanged(
  current: ProfileAnalyticsSearchAppearancesSnapshot | undefined,
  next: ProfileAnalyticsSearchAppearancesSnapshot
): boolean {
  if (!current) return true;
  const { updatedAt: _currentUpdatedAt, sourceUrl: _currentSourceUrl, ...currentValues } = current;
  const { updatedAt: _nextUpdatedAt, sourceUrl: _nextSourceUrl, ...nextValues } = next;
  return !isEqual(currentValues, nextValues);
}

export function hasSocialSellingIndexChanged(
  current: ProfileAnalyticsSsiSnapshot | undefined,
  next: ProfileAnalyticsSsiSnapshot
): boolean {
  if (!current) return true;
  return current.score !== next.score;
}

import type { ContentAnalyticsMetricValues } from 'shared/types';
import { DashboardAnalyticsError } from '../../background/features/dashboard-analytics/dashboard-analytics-errors';
import { getActivityPublishedAt, resolveActivityIdentity } from './linkedin-activity-urn';

export type TopPostsMetricType = 'IMPRESSIONS' | 'ENGAGEMENTS';

export interface ContentAnalyticsTopPost {
  activityUrn: string;
  activityId: string;
  shareUrn?: string;
  text: string;
  linkedinUrl: string;
  analyticsUrl?: string;
  publishedAt: number;
  publishedAtSource: 'linkedin_timestamp' | 'activity_urn';
  metrics: ContentAnalyticsMetricValues;
}

export interface ContentAnalyticsTopPostsResult {
  posts: ContentAnalyticsTopPost[];
  /** LinkedIn reported a valid response that simply has nothing to show. */
  emptyState: boolean;
  emptyStateTitle?: string;
  totalCount?: number;
}

interface JsonRecord {
  [key: string]: unknown;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Depth-first collection of every object carrying the given `$type` suffix. */
function collectByType(value: unknown, typeSuffix: string, output: JsonRecord[]): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectByType(item, typeSuffix, output));
    return;
  }
  if (!isRecord(value)) return;
  if (typeof value.$type === 'string' && value.$type.endsWith(typeSuffix)) output.push(value);
  Object.values(value).forEach((item) => collectByType(item, typeSuffix, output));
}

function collectByKey(value: unknown, key: string, output: unknown[]): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectByKey(item, key, output));
    return;
  }
  if (!isRecord(value)) return;
  if (value[key] !== undefined && value[key] !== null) output.push(value[key]);
  Object.values(value).forEach((item) => collectByKey(item, key, output));
}

function parseMetricValue(title: string | undefined): number | undefined {
  if (!title) return undefined;
  const digits = title.replace(/[^\d]/g, '');
  return digits ? Number(digits) : undefined;
}

function toMetricValues(metricType: TopPostsMetricType, value: number | undefined): ContentAnalyticsMetricValues {
  if (typeof value !== 'number') return {};
  return metricType === 'IMPRESSIONS' ? { impressions: value } : { linkedInEngagements: value };
}

/**
 * Reads `voyagerPremiumDashLibraView` responses for `CREATOR_TOP_POSTS`.
 *
 * Nothing here depends on `$recipeTypes` hashes: entities are located by
 * `$type` suffix and by field name, both of which LinkedIn keeps stable.
 * A response that contains neither a card nor an empty state raises
 * `unsupported_graphql_shape` rather than reporting zero posts.
 */
export function parseContentAnalyticsTopPosts(
  payload: unknown,
  metricType: TopPostsMetricType
): ContentAnalyticsTopPostsResult {
  if (!isRecord(payload)) {
    throw new DashboardAnalyticsError('unsupported_graphql_shape', 'LinkedIn Top Posts returned a non-object body.');
  }

  const emptyStates: JsonRecord[] = [];
  collectByType(payload, '.EmptyState', emptyStates);

  const miniUpdateItems: JsonRecord[] = [];
  collectByType(payload, '.AnalyticsMiniUpdateItem', miniUpdateItems);

  const miniUpdates: JsonRecord[] = [];
  collectByType(payload, '.miniupdate.MiniUpdate', miniUpdates);

  const socialCounts: JsonRecord[] = [];
  collectByType(payload, '.SocialActivityCounts', socialCounts);

  const libraViews: JsonRecord[] = [];
  collectByType(payload, '.LibraView', libraViews);
  const libraCards: JsonRecord[] = [];
  collectByType(payload, '.LibraCard', libraCards);

  if (miniUpdateItems.length === 0 && emptyStates.length === 0 && libraViews.length === 0 && libraCards.length === 0) {
    throw new DashboardAnalyticsError(
      'unsupported_graphql_shape',
      'LinkedIn Top Posts response contained no recognisable Libra view.'
    );
  }

  const miniUpdateByActivityId = new Map<string, JsonRecord>();
  miniUpdates.forEach((miniUpdate) => {
    const metadata = isRecord(miniUpdate.metadata) ? miniUpdate.metadata : undefined;
    const identity = resolveActivityIdentity([readString(metadata?.backendUrn), readString(miniUpdate.entityUrn)]);
    if (identity.activityId) miniUpdateByActivityId.set(identity.activityId, miniUpdate);
  });

  const socialCountsByActivityId = new Map<string, JsonRecord>();
  socialCounts.forEach((counts) => {
    const identity = resolveActivityIdentity([readString(counts.urn), readString(counts.entityUrn)]);
    if (identity.activityId) socialCountsByActivityId.set(identity.activityId, counts);
  });

  const postsByActivityId = new Map<string, ContentAnalyticsTopPost>();
  miniUpdateItems.forEach((item) => {
    const ctaItem = isRecord(item.ctaItem) ? item.ctaItem : undefined;
    const actionData = isRecord(ctaItem?.actionData) ? ctaItem.actionData : undefined;
    const miniUpdateRef = readString(item['*miniUpdate']);
    const identity = resolveActivityIdentity([miniUpdateRef, readString(actionData?.navigationUrl)]);
    if (!identity.activityId || !identity.activityUrn) return;

    const miniUpdate = miniUpdateByActivityId.get(identity.activityId);
    const commentary = isRecord(miniUpdate?.commentary) ? miniUpdate.commentary : undefined;
    const commentaryText = isRecord(commentary?.commentaryText) ? commentary.commentaryText : undefined;
    const navigationContext = isRecord(commentary?.navigationContext) ? commentary.navigationContext : undefined;
    const counts = socialCountsByActivityId.get(identity.activityId);
    const shareIdentity = resolveActivityIdentity([
      identity.shareUrn,
      readString(counts?.urn),
      readString(counts?.entityUrn),
    ]);

    const publishedAt = getActivityPublishedAt(identity.activityId);
    if (typeof publishedAt !== 'number') return;

    const metricValue = parseMetricValue(readString(ctaItem?.title));
    const metrics: ContentAnalyticsMetricValues = {
      ...toMetricValues(metricType, metricValue),
      ...(readNumber(counts?.numLikes) !== undefined ? { reactions: readNumber(counts?.numLikes) } : {}),
      ...(readNumber(counts?.numComments) !== undefined ? { comments: readNumber(counts?.numComments) } : {}),
      // `numShares: null` means "not reported", which is not the same as zero.
      ...(readNumber(counts?.numShares) !== undefined ? { reposts: readNumber(counts?.numShares) } : {}),
      ...(readNumber(counts?.numImpressions) !== undefined ? { impressions: readNumber(counts?.numImpressions) } : {}),
      ...toMetricValues(metricType, metricValue),
    };

    postsByActivityId.set(identity.activityId, {
      activityUrn: identity.activityUrn,
      activityId: identity.activityId,
      shareUrn: shareIdentity.shareUrn,
      text: readString(commentaryText?.text) || '',
      linkedinUrl:
        readString(navigationContext?.target) || `https://www.linkedin.com/feed/update/${identity.activityUrn}`,
      analyticsUrl: readString(actionData?.navigationUrl),
      publishedAt,
      publishedAtSource: 'activity_urn',
      metrics,
    });
  });

  const totals: unknown[] = [];
  collectByKey(payload, 'total', totals);
  const totalCount = totals.map(readNumber).find((value): value is number => typeof value === 'number');

  return {
    posts: Array.from(postsByActivityId.values()).sort((left, right) => right.publishedAt - left.publishedAt),
    emptyState: postsByActivityId.size === 0 && emptyStates.length > 0,
    emptyStateTitle: readString(emptyStates[0]?.title),
    totalCount,
  };
}

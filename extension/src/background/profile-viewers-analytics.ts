import {
  getProfileAnalyticsSnapshot,
  getProfileViewerSummary,
  upsertProfileAnalyticsSnapshot,
} from 'shared/firestore-service';
import { DASHBOARD_ANALYTICS_SYNC_ENABLED } from 'shared/feature-flags';

export async function recordProfileViewsAnalytics({
  userId,
  visibleCount,
  privateCount,
  recruiterCount,
  updatedAt,
}: {
  userId: string;
  visibleCount?: number;
  privateCount?: number;
  recruiterCount?: number;
  updatedAt: number;
}): Promise<void> {
  if (!DASHBOARD_ANALYTICS_SYNC_ENABLED) return;

  const current = await getProfileAnalyticsSnapshot(userId);
  const resolvedVisibleCount = visibleCount ?? current?.profileViews?.visibleCount;
  if (typeof resolvedVisibleCount !== 'number') {
    return;
  }
  const storedSummary =
    typeof privateCount === 'number' && typeof recruiterCount === 'number'
      ? null
      : await getProfileViewerSummary(userId);
  const safeVisibleCount = Math.max(0, Math.trunc(resolvedVisibleCount));
  const safePrivateCount = Math.max(0, Math.trunc(privateCount ?? storedSummary?.privateViewerCount ?? 0));
  const resolvedRecruiterCount = recruiterCount ?? storedSummary?.recruiterViewerCount;
  const safeRecruiterCount =
    typeof resolvedRecruiterCount === 'number' ? Math.max(0, Math.trunc(resolvedRecruiterCount)) : undefined;
  const totalCount = safeVisibleCount + safePrivateCount + (safeRecruiterCount || 0);
  if (
    current?.profileViews?.visibleCount === safeVisibleCount &&
    current.profileViews.privateCount === safePrivateCount &&
    current.profileViews.recruiterCount === safeRecruiterCount &&
    current.profileViews.totalCount === totalCount
  ) {
    return;
  }

  await upsertProfileAnalyticsSnapshot(
    userId,
    {
      profileViews: {
        visibleCount: safeVisibleCount,
        privateCount: safePrivateCount,
        recruiterCount: safeRecruiterCount,
        totalCount,
        updatedAt,
        source: 'profile_viewers',
      },
    },
    { updatedAt }
  );
}

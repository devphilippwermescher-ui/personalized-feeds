import { writeBatch } from 'firebase/firestore';
import { getFirebaseDb } from 'shared/firebase-config';
import { profileAnalyticsDoc } from 'shared/firestore/refs';
import {
  publishContentAnalytics,
  stageDashboardAnalyticsSyncManifest,
  stripUndefinedDeep,
  writeContentAnalyticsPosts,
} from 'shared/firestore-service';
import type { ContentAnalyticsPost } from 'shared/types';
import { DashboardAnalyticsError } from './dashboard-analytics-errors';
import {
  buildContentAnalyticsSnapshot,
  buildDashboardAnalyticsManifest,
  type DashboardAnalyticsPublishInput,
} from './dashboard-analytics-manifest';

export * from './dashboard-analytics-manifest';

/**
 * Publishes one coherent Dashboard Analytics run.
 *
 * The Profile coherence patch, the Content current snapshot, its range and
 * daily documents, and the run manifest all land in a single write batch, so
 * the dashboard can never read a Content range without the manifest that
 * describes how fresh it is. A source that failed simply contributes nothing:
 * previously published values are merged, never overwritten with blanks.
 */
export async function publishDashboardAnalyticsRun(input: DashboardAnalyticsPublishInput): Promise<void> {
  const manifest = buildDashboardAnalyticsManifest(input);
  const batch = writeBatch(getFirebaseDb());

  batch.set(
    profileAnalyticsDoc(input.userId),
    stripUndefinedDeep({
      syncRunId: input.syncRunId,
      publishedAt: input.publishedAt,
      capturedAt: input.profile.capturedAt,
      updatedAt: input.publishedAt,
    }),
    { merge: true }
  );

  await publishContentAnalytics(
    input.userId,
    {
      snapshot: buildContentAnalyticsSnapshot(input),
      ranges: input.ranges,
      daily: input.daily,
    },
    batch
  );
  stageDashboardAnalyticsSyncManifest(input.userId, manifest, batch);

  try {
    await batch.commit();
  } catch (error) {
    throw new DashboardAnalyticsError(
      'firestore_write_failed',
      error instanceof Error ? error.message : 'Dashboard Analytics could not be written.'
    );
  }
}

/**
 * Posts are written outside the coherent batch: their count is unbounded and
 * a Firestore batch is capped, so a large post list must never be able to
 * block the current snapshots and the manifest from being published.
 */
export async function publishContentAnalyticsPosts(
  userId: string,
  posts: ContentAnalyticsPost[]
): Promise<void> {
  if (posts.length === 0) return;

  try {
    await writeContentAnalyticsPosts(userId, posts);
  } catch (error) {
    throw new DashboardAnalyticsError(
      'firestore_write_failed',
      error instanceof Error ? error.message : 'Content Analytics posts could not be written.'
    );
  }
}

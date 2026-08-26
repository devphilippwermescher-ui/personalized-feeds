import {
  getProfileViewerItems,
  getProfileViewerSummary,
  removeProfileViewer,
  updateProfileViewer,
} from 'shared/firestore-service';
import type { ProfileViewerSummary } from 'shared/types';
import { DASHBOARD_ANALYTICS_SYNC_ENABLED } from 'shared/feature-flags';
import {
  appendProfileViewersWakeEvent,
  getProfileViewersSyncState,
  resetProfileViewersSyncState,
} from './profile-viewers-coordinator-storage';
import { queueProfileViewersFirstSurfaceSync, queueProfileViewersSync } from './profile-viewers-coordinator';
import { queueProfileViewersStatusSync, runProfileViewersStatusSync } from './profile-viewers-status-sync';
import { getAuthenticatedFeedsUser } from './feeds-auth';
import { getFeedsAuthErrorResponse, normalizeFeedsError } from './feeds-errors';
import { findProfileViewerUpdateTargets } from './profile-viewers-update-targets';
import { queueProfileAnalyticsForLinkedInActivity } from './profile-analytics-sync-coordinator';

async function notifyLinkedInTabsAboutProfileViewerUpdate(): Promise<void> {
  const tabs = await chrome.tabs.query({ url: 'https://www.linkedin.com/*' });
  await Promise.all(
    tabs
      .filter((tab): tab is chrome.tabs.Tab & { id: number } => typeof tab.id === 'number')
      .map((tab) =>
        chrome.tabs.sendMessage(tab.id, { type: 'PROFILE_VIEWERS_SYNC_COMPLETED' }).catch(() => {
          /* the sidebar content script may not be ready in every LinkedIn tab */
        })
      )
  );
}

function getProfileViewerSummaryFromSyncState(
  syncState: Awaited<ReturnType<typeof getProfileViewersSyncState>>
): ProfileViewerSummary | null {
  const logWithSummaryCount = syncState.logs.find(
    (log) =>
      (Number.isSafeInteger(log.privateViewerCount) && (log.privateViewerCount || 0) >= 0) ||
      (Number.isSafeInteger(log.recruiterViewerCount) && (log.recruiterViewerCount || 0) >= 0)
  );

  if (!logWithSummaryCount) {
    return null;
  }

  return {
    privateViewerCount: logWithSummaryCount.privateViewerCount || 0,
    recruiterViewerCount:
      Number.isSafeInteger(logWithSummaryCount.recruiterViewerCount) &&
      (logWithSummaryCount.recruiterViewerCount || 0) >= 0
        ? logWithSummaryCount.recruiterViewerCount
        : undefined,
    recruiterViewerUrl:
      typeof logWithSummaryCount.recruiterViewerUrl === 'string' && logWithSummaryCount.recruiterViewerUrl.trim()
        ? logWithSummaryCount.recruiterViewerUrl.trim()
        : undefined,
    updatedAt: logWithSummaryCount.finishedAt,
  };
}

async function updateProfileViewerByBestMatch(
  userId: string,
  viewerId: string,
  updates: Parameters<typeof updateProfileViewer>[2]
): Promise<void> {
  const viewers = await getProfileViewerItems(userId);
  const targets = findProfileViewerUpdateTargets(viewers, viewerId, updates);
  if (targets.length > 0) {
    await Promise.all(
      targets.map((target) => updateProfileViewer(userId, target.linkedinUsername || target.id, updates))
    );
    console.info('[profile-viewers-sync] updated profile viewer status targets', {
      viewerId,
      status: updates.status,
      targetCount: targets.length,
      targets: targets.map((target) => target.linkedinUsername || target.id),
    });
    return;
  }

  try {
    await updateProfileViewer(userId, viewerId, updates);
  } catch (error) {
    console.warn('[profile-viewers-sync] failed to update profile viewer status', {
      viewerId,
      status: updates.status,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PROFILE_VIEWERS_GET') {
    getAuthenticatedFeedsUser()
      .then((user) => {
        if (!user) {
          sendResponse(getFeedsAuthErrorResponse({ viewers: [] }));
          return;
        }

        return Promise.all([
          getProfileViewerItems(user.uid),
          getProfileViewerSummary(user.uid),
          getProfileViewersSyncState(user.uid),
        ]).then(([viewers, summary, syncState]) => {
          sendResponse({
            success: true,
            viewers,
            summary: summary || getProfileViewerSummaryFromSyncState(syncState),
          });
        });
      })
      .catch((error) => {
        sendResponse({
          success: false,
          error: normalizeFeedsError(error, 'Failed to load profile visitors'),
          viewers: [],
        });
      });
    return true;
  }

  if (message.type === 'PROFILE_VIEWERS_LINKEDIN_ACTIVITY') {
    void appendProfileViewersWakeEvent({
      event: 'linkedin_activity',
      trigger: 'linkedin_activity',
      reason: sender.tab?.id ? `tab:${sender.tab.id}` : 'content_script',
    });
    queueProfileViewersFirstSurfaceSync('linkedin_activity')
      .then((result) => {
        sendResponse({ success: result.success, ran: result.ran });
      })
      .catch((error) => {
        sendResponse({
          success: false,
          ran: false,
          error: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        if (DASHBOARD_ANALYTICS_SYNC_ENABLED) {
          void queueProfileAnalyticsForLinkedInActivity(sender.tab?.id).catch((error) => {
            console.warn('[profile-analytics] LinkedIn activity sync failed after Profile Viewers', error);
          });
        }
      });
    return true;
  }

  if (message.type === 'PROFILE_VIEWERS_SYNC_STATUS_GET') {
    getAuthenticatedFeedsUser()
      .then(async (user) => {
        if (!user) {
          sendResponse(getFeedsAuthErrorResponse({ syncState: null }));
          return;
        }

        const syncState = await getProfileViewersSyncState(user.uid);
        sendResponse({ success: true, syncState });
      })
      .catch((error) => {
        sendResponse({
          success: false,
          syncState: null,
          error: normalizeFeedsError(error, 'Failed to load profile visitors sync status'),
        });
      });
    return true;
  }

  if (message.type === 'PROFILE_VIEWERS_STATUS_SYNC_NOW') {
    getAuthenticatedFeedsUser()
      .then(async (user) => {
        if (!user) {
          sendResponse(getFeedsAuthErrorResponse({ result: null }));
          return;
        }

        const priorityUsernames = Array.isArray(message.priorityUsernames)
          ? (message.priorityUsernames as unknown[]).filter((value): value is string => typeof value === 'string')
          : [];
        if (priorityUsernames.length > 0) {
          await queueProfileViewersStatusSync({
            trigger: 'manual',
            priorityUsernames,
            urgent: true,
          });
        }

        const result = await runProfileViewersStatusSync('manual', user, {
          forceStale: message.forceStale === true,
        });
        sendResponse({ success: result.success, result });
      })
      .catch((error) => {
        sendResponse({
          success: false,
          result: null,
          error: normalizeFeedsError(error, 'Failed to sync profile visitor statuses'),
        });
      });
    return true;
  }

  if (message.type === 'PROFILE_VIEWERS_STATUS_SYNC_QUEUE') {
    getAuthenticatedFeedsUser()
      .then(async (user) => {
        if (!user) {
          sendResponse(getFeedsAuthErrorResponse({ queued: false }));
          return;
        }

        const priorityUsernames = Array.isArray(message.priorityUsernames)
          ? (message.priorityUsernames as unknown[]).filter((value): value is string => typeof value === 'string')
          : [];

        await queueProfileViewersStatusSync({
          trigger: 'manual',
          priorityUsernames,
          urgent: false,
        });
        sendResponse({ success: true, queued: true });
      })
      .catch((error) => {
        sendResponse({
          success: false,
          queued: false,
          error: normalizeFeedsError(error, 'Failed to queue profile visitor status sync'),
        });
      });
    return true;
  }

  if (message.type === 'PROFILE_VIEWERS_SYNC_API_NOW' || message.type === 'PROFILE_VIEWERS_SYNC_NOW') {
    getAuthenticatedFeedsUser()
      .then(async (user) => {
        if (!user) {
          sendResponse(
            getFeedsAuthErrorResponse({
              savedCount: 0,
              newCount: 0,
              visibleCount: 0,
              source: 'api',
            })
          );
          return;
        }

        if (message.resetProfileViewers === true) {
          await resetProfileViewersSyncState(user.uid);
        }

        const coordinatorResult = await queueProfileViewersSync('manual', true);
        sendResponse({
          success: coordinatorResult.success,
          source: 'api',
          ...(coordinatorResult.result || {
            savedCount: 0,
            newCount: 0,
            visibleCount: 0,
          }),
          error: coordinatorResult.error,
        });
      })
      .catch((error) => {
        sendResponse({
          success: false,
          error: normalizeFeedsError(error, 'Failed to sync profile visitors via API'),
          savedCount: 0,
          newCount: 0,
          visibleCount: 0,
          source: 'api',
        });
      });
    return true;
  }

  if (message.type === 'PROFILE_VIEWERS_UPDATE') {
    getAuthenticatedFeedsUser()
      .then((user) => {
        if (!user) {
          sendResponse(getFeedsAuthErrorResponse());
          return;
        }

        return updateProfileViewerByBestMatch(
          user.uid,
          message.viewerId as string,
          (message.updates || {}) as Parameters<typeof updateProfileViewer>[2]
        ).then(() => {
          if (message.notifyProfileViewersChanged === true) {
            void notifyLinkedInTabsAboutProfileViewerUpdate();
          }
          sendResponse({ success: true });
        });
      })
      .catch((error) => {
        sendResponse({ success: false, error: normalizeFeedsError(error, 'Failed to update profile visitor') });
      });
    return true;
  }

  if (message.type === 'PROFILE_VIEWERS_REMOVE') {
    getAuthenticatedFeedsUser()
      .then((user) => {
        if (!user) {
          sendResponse(getFeedsAuthErrorResponse());
          return;
        }

        return removeProfileViewer(user.uid, message.viewerId as string).then(() => {
          sendResponse({ success: true });
        });
      })
      .catch((error) => {
        sendResponse({ success: false, error: normalizeFeedsError(error, 'Failed to remove profile visitor') });
      });
    return true;
  }

  return false;
});

import {
  clearProfileViewerCache,
  getProfileViewerItems,
  getProfileViewerSummary,
  removeProfileViewer,
  updateProfileViewer,
} from 'shared/firestore-service';
import type { ProfileViewerSummary } from 'shared/types';
import {
  appendProfileViewersWakeEvent,
  getProfileViewersSyncState,
  resetProfileViewersSyncState,
} from './profile-viewers-coordinator-storage';
import { queueProfileViewersSync } from './profile-viewers-coordinator';
import { syncProfileViewersViaPage } from './profile-viewers-page-sync';
import { getAuthenticatedFeedsUser } from './feeds-auth';
import { getFeedsAuthErrorResponse, normalizeFeedsError } from './feeds-errors';

function getProfileViewerSummaryFromSyncState(
  syncState: Awaited<ReturnType<typeof getProfileViewersSyncState>>
): ProfileViewerSummary | null {
  const logWithSummaryCount = syncState.logs.find(
    (log) =>
      (Number.isSafeInteger(log.privateViewerCount) &&
        (log.privateViewerCount || 0) >= 0) ||
      (Number.isSafeInteger(log.recruiterViewerCount) &&
        (log.recruiterViewerCount || 0) >= 0)
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
      typeof logWithSummaryCount.recruiterViewerUrl === 'string' &&
      logWithSummaryCount.recruiterViewerUrl.trim()
        ? logWithSummaryCount.recruiterViewerUrl.trim()
        : undefined,
    updatedAt: logWithSummaryCount.finishedAt,
  };
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
    queueProfileViewersSync('linkedin_activity')
      .then((result) => {
        sendResponse({ success: result.success, ran: result.ran });
      })
      .catch((error) => {
        sendResponse({
          success: false,
          ran: false,
          error: error instanceof Error ? error.message : String(error),
        });
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

  if (message.type === 'PROFILE_VIEWERS_SYNC_API_NOW' || message.type === 'PROFILE_VIEWERS_SYNC_NOW') {
    getAuthenticatedFeedsUser()
      .then(async (user) => {
        if (!user) {
          sendResponse(getFeedsAuthErrorResponse({
            savedCount: 0,
            newCount: 0,
            visibleCount: 0,
            source: 'api',
          }));
          return;
        }

        if (message.resetProfileViewers === true) {
          await clearProfileViewerCache(user.uid);
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

  if (message.type === 'PROFILE_VIEWERS_SYNC_PAGE_NOW') {
    syncProfileViewersViaPage()
      .then((result) => {
        sendResponse({ success: true, source: 'page', ...result });
      })
      .catch((error) => {
        sendResponse({
          success: false,
          error: normalizeFeedsError(error, 'Failed to sync profile visitors via LinkedIn page'),
          savedCount: 0,
          newCount: 0,
          visibleCount: 0,
          source: 'page',
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

        return updateProfileViewer(
          user.uid,
          message.viewerId as string,
          (message.updates || {}) as Parameters<typeof updateProfileViewer>[2]
        ).then(() => {
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

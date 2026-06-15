import {
  getProfileViewerItems,
  getProfileViewerSummary,
  removeProfileViewer,
  updateProfileViewer,
} from 'shared/firestore-service';
import {
  appendProfileViewersWakeEvent,
  getProfileViewersSyncState,
} from './profile-viewers-coordinator-storage';
import { queueProfileViewersSync } from './profile-viewers-coordinator';
import { syncProfileViewersViaPage } from './profile-viewers-page-sync';
import { getAuthenticatedFeedsUser } from './feeds-auth';
import { getFeedsAuthErrorResponse, normalizeFeedsError } from './feeds-errors';
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
        ]).then(([viewers, summary]) => {
          sendResponse({ success: true, viewers, summary });
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
    queueProfileViewersSync('manual', true)
      .then((coordinatorResult) => {
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

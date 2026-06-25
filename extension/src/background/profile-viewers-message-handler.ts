import {
  getProfileViewerItems,
  getProfileViewerSummary,
  removeProfileViewer,
  updateProfileViewer,
} from 'shared/firestore-service';
import type { ProfileViewer, ProfileViewerListItem, ProfileViewerSummary } from 'shared/types';
import { getUsernameFromLinkedInUrl, normalizeLinkedInUsername } from 'shared/linkedin-identity';
import {
  appendProfileViewersWakeEvent,
  getProfileViewersSyncState,
  resetProfileViewersSyncState,
} from './profile-viewers-coordinator-storage';
import { queueProfileViewersSync } from './profile-viewers-coordinator';
import {
  queueProfileViewersStatusSync,
  runProfileViewersStatusSync,
} from './profile-viewers-status-sync';
import { syncProfileViewersViaPage } from './profile-viewers-page-sync';
import { getAuthenticatedFeedsUser } from './feeds-auth';
import { getFeedsAuthErrorResponse, normalizeFeedsError } from './feeds-errors';

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

type ProfileViewerProfileItem = ProfileViewer;

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

function normalizeComparableName(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function isProfileViewerProfileItem(
  viewer: ProfileViewerListItem
): viewer is ProfileViewerProfileItem {
  return 'linkedinUsername' in viewer && typeof viewer.linkedinUsername === 'string';
}

function findProfileViewerUpdateTargets(
  viewers: ProfileViewerListItem[],
  viewerId: string,
  updates: Record<string, unknown>
): ProfileViewerProfileItem[] {
  const normalizedViewerId = normalizeLinkedInUsername(viewerId);
  const normalizedUpdateUsername = normalizeLinkedInUsername(
    String(updates.linkedinUsername || '')
  );
  const normalizedLinkedInUrlUsername = normalizeLinkedInUsername(
    getUsernameFromLinkedInUrl(String(updates.linkedinUrl || ''))
  );
  const updateProfileUrn = String(updates.profileUrn || '').trim();
  const updateMemberNumericId = String(updates.memberNumericId || '').trim();
  const usernameCandidates = new Set(
    [normalizedViewerId, normalizedUpdateUsername, normalizedLinkedInUrlUsername].filter(Boolean)
  );

  const profileViewers = viewers.filter(isProfileViewerProfileItem);
  const targets = new Map<string, ProfileViewerProfileItem>();
  profileViewers
    .filter((viewer) => {
      const viewerUsername = normalizeLinkedInUsername(viewer.linkedinUsername || viewer.id);
      const viewerUrlUsername = normalizeLinkedInUsername(getUsernameFromLinkedInUrl(viewer.linkedinUrl));
      return (
        usernameCandidates.has(viewerUsername) ||
        usernameCandidates.has(viewerUrlUsername) ||
        Boolean(updateProfileUrn && viewer.profileUrn === updateProfileUrn) ||
        Boolean(updateMemberNumericId && viewer.memberNumericId === updateMemberNumericId)
      );
    })
    .forEach((viewer) => {
      targets.set(viewer.linkedinUsername || viewer.id, viewer);
    });

  const displayName = normalizeComparableName(updates.displayName);
  if (displayName) {
    profileViewers
      .filter((viewer) => normalizeComparableName(viewer.displayName) === displayName)
      .forEach((viewer) => {
        targets.set(viewer.linkedinUsername || viewer.id, viewer);
      });
  }

  return Array.from(targets.values());
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
      targets.map((target) =>
        updateProfileViewer(userId, target.linkedinUsername || target.id, updates)
      )
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

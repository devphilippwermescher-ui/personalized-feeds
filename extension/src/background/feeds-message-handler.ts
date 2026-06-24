import {
  addMemberToFeed,
  createFeed,
  deleteFeed,
  getFeedMembers,
  getFeeds,
  getProfileFeedMemberships,
  removeMemberFromFeed,
  reorderFeeds,
  updateFeed,
  updateMemberInFeed,
} from 'shared/firestore-service';
import type { LinkedInProfileData } from 'shared/types';
import { getAuthenticatedFeedsUser } from './feeds-auth';
import { getFeedsAuthErrorResponse, normalizeFeedsError } from './feeds-errors';
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FEEDS_GET_ALL') {
    getAuthenticatedFeedsUser()
      .then((user) => {
        if (!user) {
          console.warn('[feeds] FEEDS_GET_ALL: no authenticated user');
          sendResponse(getFeedsAuthErrorResponse({ feeds: null }));
          return;
        }

        console.log('[feeds] FEEDS_GET_ALL: fetching feeds for uid:', user.uid);
        return getFeeds(user.uid).then((feeds) => {
          console.log('[feeds] FEEDS_GET_ALL: got', feeds.length, 'feeds');
          sendResponse({
            success: true,
            feeds: feeds.map((f) => ({
              id: f.id,
              name: f.name,
              description: f.description,
              color: f.color,
              memberCount: f.memberCount,
              sortOrder: f.sortOrder,
            })),
          });
        });
      })
      .catch((error) => {
        console.error('[feeds] FEEDS_GET_ALL error:', error);
        sendResponse({
          success: false,
          error: normalizeFeedsError(error, 'Failed to load feeds'),
          feeds: null,
        });
      });
    return true;
  }

  if (message.type === 'FEEDS_CREATE') {
    getAuthenticatedFeedsUser()
      .then((user) => {
        if (!user) {
          sendResponse(getFeedsAuthErrorResponse());
          return;
        }

        return createFeed(user.uid, message.name, message.description, message.color).then((feed) => {
          sendResponse({
            success: true,
            feed: {
              id: feed.id,
              name: feed.name,
              color: feed.color,
              memberCount: 0,
              sortOrder: feed.sortOrder,
            },
          });
        });
      })
      .catch((error) => {
        sendResponse({ success: false, error: normalizeFeedsError(error, 'Failed to create feed') });
      });
    return true;
  }

  if (message.type === 'FEEDS_ADD_MEMBER') {
    getAuthenticatedFeedsUser()
      .then((user) => {
        if (!user) {
          sendResponse(getFeedsAuthErrorResponse());
          return;
        }

        const profileData: LinkedInProfileData = message.profileData;
        return addMemberToFeed((message.ownerId as string) || user.uid, message.feedId, profileData).then(
          ({ member, alreadyExists }) => {
            sendResponse({ success: true, member, alreadyExists });
          }
        );
      })
      .catch((error) => {
        sendResponse({ success: false, error: normalizeFeedsError(error, 'Failed to add member') });
      });
    return true;
  }

  if (message.type === 'FEEDS_REMOVE_MEMBER') {
    getAuthenticatedFeedsUser()
      .then((user) => {
        if (!user) {
          sendResponse(getFeedsAuthErrorResponse());
          return;
        }

        return removeMemberFromFeed((message.ownerId as string) || user.uid, message.feedId, message.memberId).then(
          () => {
            sendResponse({ success: true });
          }
        );
      })
      .catch((error) => {
        sendResponse({ success: false, error: normalizeFeedsError(error, 'Failed to remove member') });
      });
    return true;
  }

  if (message.type === 'FEEDS_UPDATE_MEMBER') {
    getAuthenticatedFeedsUser()
      .then((user) => {
        if (!user) {
          sendResponse(getFeedsAuthErrorResponse());
          return;
        }

        return updateMemberInFeed(
          (message.ownerId as string) || user.uid,
          message.feedId,
          message.memberId,
          message.updates
        ).then(() => {
          sendResponse({ success: true });
        });
      })
      .catch((error) => {
        sendResponse({ success: false, error: normalizeFeedsError(error, 'Failed to update member') });
      });
    return true;
  }

  if (message.type === 'FEEDS_GET_MEMBERS') {
    getAuthenticatedFeedsUser()
      .then((user) => {
        if (!user) {
          sendResponse(getFeedsAuthErrorResponse({ members: [] }));
          return;
        }

        return getFeedMembers((message.ownerId as string) || user.uid, message.feedId).then((members) => {
          sendResponse({ success: true, members });
        });
      })
      .catch((error) => {
        sendResponse({
          success: false,
          error: normalizeFeedsError(error, 'Failed to load members'),
          members: [],
        });
      });
    return true;
  }

  if (message.type === 'FEEDS_GET_PROFILE_MEMBERSHIPS') {
    getAuthenticatedFeedsUser()
      .then((user) => {
        if (!user) {
          sendResponse({ memberships: [] });
          return;
        }
        return getProfileFeedMemberships(
          user.uid,
          message.linkedinUsername as string,
          message.linkedinUrl as string | undefined,
          message.memberNumericId as string | undefined,
          message.profileUrn as string | undefined
        ).then((memberships) => {
          sendResponse({ memberships });
        });
      })
      .catch(() => {
        sendResponse({ memberships: [] });
      });
    return true;
  }

  if (message.type === 'FEEDS_DELETE') {
    getAuthenticatedFeedsUser()
      .then((user) => {
        if (!user) {
          sendResponse(getFeedsAuthErrorResponse());
          return;
        }

        return deleteFeed(user.uid, message.feedId).then(() => {
          sendResponse({ success: true });
        });
      })
      .catch((error) => {
        sendResponse({ success: false, error: normalizeFeedsError(error, 'Failed to delete feed') });
      });
    return true;
  }

  if (message.type === 'FEEDS_UPDATE') {
    getAuthenticatedFeedsUser()
      .then((user) => {
        if (!user) {
          sendResponse(getFeedsAuthErrorResponse());
          return;
        }

        return updateFeed(user.uid, message.feedId, message.updates).then(() => {
          sendResponse({ success: true });
        });
      })
      .catch((error) => {
        sendResponse({ success: false, error: normalizeFeedsError(error, 'Failed to update feed') });
      });
    return true;
  }

  if (message.type === 'FEEDS_REORDER') {
    getAuthenticatedFeedsUser()
      .then((user) => {
        if (!user) {
          sendResponse(getFeedsAuthErrorResponse());
          return;
        }

        return reorderFeeds(user.uid, (message.feedIds as string[]) || []).then(() => {
          sendResponse({ success: true });
        });
      })
      .catch((error) => {
        sendResponse({ success: false, error: normalizeFeedsError(error, 'Failed to reorder feeds') });
      });
    return true;
  }

  return false;
});

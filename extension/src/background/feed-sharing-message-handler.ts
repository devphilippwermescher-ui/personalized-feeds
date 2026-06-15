import {
  duplicateSharedFeed,
  ensureFeedShareLink,
  followFeedByShareToken,
  getFeedShares,
  getFollowedFeeds,
  removeFeedShare,
  shareFeedWithUser,
  unfollowFeed,
  updateFeedShareRole,
} from 'shared/firestore-service';
import { getAuthenticatedFeedsUser } from './feeds-auth';
import { getFeedsAuthErrorResponse, normalizeFeedsError } from './feeds-errors';
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FEEDS_GET_SHARED_ALL') {
    getAuthenticatedFeedsUser()
      .then((user) => {
        if (!user) {
          sendResponse(getFeedsAuthErrorResponse({ sharedFeeds: [] }));
          return;
        }
        return getFollowedFeeds(user.uid).then((sharedFeeds) => {
          sendResponse({ success: true, sharedFeeds });
        });
      })
      .catch((error) => {
        sendResponse({
          success: false,
          error: normalizeFeedsError(error, 'Failed to load shared feeds'),
          sharedFeeds: [],
        });
      });
    return true;
  }

  if (message.type === 'FEEDS_GET_SHARES') {
    getAuthenticatedFeedsUser()
      .then((user) => {
        if (!user) {
          sendResponse(getFeedsAuthErrorResponse({ shares: [] }));
          return;
        }
        return getFeedShares(user.uid, message.feedId).then((shares) => {
          sendResponse({ success: true, shares });
        });
      })
      .catch((error) => {
        sendResponse({ success: false, error: normalizeFeedsError(error, 'Failed to load shares'), shares: [] });
      });
    return true;
  }

  if (message.type === 'FEEDS_SHARE_WITH_EMAIL') {
    getAuthenticatedFeedsUser()
      .then((user) => {
        if (!user) {
          sendResponse(getFeedsAuthErrorResponse());
          return;
        }
        return shareFeedWithUser(user.uid, message.feedId, message.email, message.role).then((share) => {
          sendResponse({ success: true, share });
        });
      })
      .catch((error) => {
        sendResponse({ success: false, error: normalizeFeedsError(error, 'Failed to share feed') });
      });
    return true;
  }

  if (message.type === 'FEEDS_UPDATE_SHARE_ROLE') {
    getAuthenticatedFeedsUser()
      .then((user) => {
        if (!user) {
          sendResponse(getFeedsAuthErrorResponse());
          return;
        }
        return updateFeedShareRole(user.uid, message.feedId, message.targetUid, message.role).then(() => {
          sendResponse({ success: true });
        });
      })
      .catch((error) => {
        sendResponse({ success: false, error: normalizeFeedsError(error, 'Failed to update share role') });
      });
    return true;
  }

  if (message.type === 'FEEDS_REMOVE_SHARE') {
    getAuthenticatedFeedsUser()
      .then((user) => {
        if (!user) {
          sendResponse(getFeedsAuthErrorResponse());
          return;
        }
        return removeFeedShare(user.uid, message.feedId, message.targetUid).then(() => {
          sendResponse({ success: true });
        });
      })
      .catch((error) => {
        sendResponse({ success: false, error: normalizeFeedsError(error, 'Failed to remove shared user') });
      });
    return true;
  }

  if (message.type === 'FEEDS_GET_SHARE_LINK') {
    getAuthenticatedFeedsUser()
      .then((user) => {
        if (!user) {
          sendResponse(getFeedsAuthErrorResponse());
          return;
        }
        return ensureFeedShareLink(user.uid, message.feedId).then((token) => {
          sendResponse({
            success: true,
            token,
            // Hash survives LinkedIn redirects; ?sharefeed= is often stripped from the URL bar
            url: `https://www.linkedin.com/feed/#sharefeed=${encodeURIComponent(token)}`,
          });
        });
      })
      .catch((error) => {
        sendResponse({ success: false, error: normalizeFeedsError(error, 'Failed to generate share link') });
      });
    return true;
  }

  if (message.type === 'FEEDS_FOLLOW_SHARE_LINK') {
    getAuthenticatedFeedsUser()
      .then((user) => {
        if (!user) {
          sendResponse(getFeedsAuthErrorResponse());
          return;
        }
        return followFeedByShareToken(user.uid, message.token).then((sharedFeed) => {
          sendResponse({ success: true, sharedFeed });
        });
      })
      .catch((error) => {
        sendResponse({ success: false, error: normalizeFeedsError(error, 'Failed to follow shared feed') });
      });
    return true;
  }

  if (message.type === 'FEEDS_UNFOLLOW_SHARED') {
    getAuthenticatedFeedsUser()
      .then((user) => {
        if (!user) {
          sendResponse(getFeedsAuthErrorResponse());
          return;
        }
        return unfollowFeed(user.uid, message.ownerId, message.feedId).then(() => {
          sendResponse({ success: true });
        });
      })
      .catch((error) => {
        sendResponse({ success: false, error: normalizeFeedsError(error, 'Failed to unfollow shared feed') });
      });
    return true;
  }

  if (message.type === 'FEEDS_DUPLICATE_SHARED') {
    getAuthenticatedFeedsUser()
      .then((user) => {
        if (!user) {
          sendResponse(getFeedsAuthErrorResponse());
          return;
        }
        return duplicateSharedFeed(user.uid, message.ownerId, message.feedId).then((feed) => {
          sendResponse({
            success: true,
            feed: {
              id: feed.id,
              name: feed.name,
              description: feed.description,
              color: feed.color,
              memberCount: feed.memberCount,
              sortOrder: feed.sortOrder,
            },
          });
        });
      })
      .catch((error) => {
        sendResponse({ success: false, error: normalizeFeedsError(error, 'Failed to duplicate shared feed') });
      });
    return true;
  }

  return false;
});

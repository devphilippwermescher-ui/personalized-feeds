import {
  dismissShareNotification,
  ensureFeedShareLink,
  getFeedShares,
  getFollowedFeeds,
  getShareNotifications,
  reorderFollowedFeeds,
  updateFeedShareRole,
} from 'shared/firestore-service';
import { getAuthenticatedFeedsUser } from '../../auth/services/authenticated-user';
import { getFeedsAuthErrorResponse, normalizeFeedsError } from '../../feeds/errors/feeds-error';
import {
  duplicateSharedFeedForPlan,
  getPlanLimitErrorResponse,
  PlanLimitError,
  projectFeedForOwnerPolicy,
} from '../../plans/public';
import {
  acceptSharedFeedNotification,
  followSharedFeedLink,
  getFeedPlanPolicies,
  removeSharedFeedAccess,
  shareFeedWithEmail,
  unfollowSharedFeed,
} from '../services/sharing-functions-client';
import { startShareNotificationRuntime } from '../services/share-notification-runtime';
import { startFeedSharesRuntime, stopFeedSharesRuntime } from '../services/feed-shares-runtime';

function sendSharingError(sendResponse: (response?: unknown) => void, error: unknown, fallback: string): void {
  if (error instanceof PlanLimitError) {
    sendResponse(getPlanLimitErrorResponse(error));
    return;
  }

  sendResponse({ success: false, error: normalizeFeedsError(error, fallback) });
}
export function registerFeedSharingMessageHandler(): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'FEEDS_WATCH_FEED_SHARES') {
      const feedId = typeof message.feedId === 'string' ? message.feedId : '';
      const tabId = sender.tab?.id;
      if (!feedId || feedId.includes('/') || typeof tabId !== 'number') {
        sendResponse({ success: false, error: 'Unable to watch shared users', shares: [] });
        return false;
      }
      startFeedSharesRuntime(feedId, tabId)
        .then((shares) => sendResponse({ success: true, shares }))
        .catch((error) => {
          sendResponse({
            success: false,
            error: normalizeFeedsError(error, 'Unable to watch shared users'),
            shares: [],
          });
        });
      return true;
    }

    if (message.type === 'FEEDS_UNWATCH_FEED_SHARES') {
      const feedId = typeof message.feedId === 'string' ? message.feedId : '';
      const tabId = sender.tab?.id;
      if (feedId && typeof tabId === 'number') {
        stopFeedSharesRuntime(feedId, tabId);
      }
      sendResponse({ success: true });
      return false;
    }

    if (message.type === 'FEEDS_WATCH_SHARE_NOTIFICATIONS') {
      startShareNotificationRuntime()
        .then((notifications) => sendResponse({ success: true, notifications }))
        .catch((error) => {
          sendResponse({
            success: false,
            error: normalizeFeedsError(error, 'Failed to watch sharing notifications'),
            notifications: [],
          });
        });
      return true;
    }

    if (message.type === 'FEEDS_GET_SHARED_ALL') {
      getAuthenticatedFeedsUser()
        .then((user) => {
          if (!user) {
            sendResponse(getFeedsAuthErrorResponse({ sharedFeeds: [] }));
            return;
          }
          return getFollowedFeeds(user.uid).then(async (sharedFeeds) => {
            if (sharedFeeds.length === 0) {
              sendResponse({ success: true, sharedFeeds });
              return;
            }
            const policies = await getFeedPlanPolicies(
              sharedFeeds.map((feed) => ({ ownerId: feed.ownerId, feedId: feed.id }))
            );
            sendResponse({
              success: true,
              sharedFeeds: sharedFeeds.map((feed) => {
                const policy = policies[`${feed.ownerId}/${feed.id}`];
                return policy ? projectFeedForOwnerPolicy(feed, policy) : feed;
              }),
            });
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
          return shareFeedWithEmail({ feedId: message.feedId, email: message.email, role: message.role }).then(
            sendResponse
          );
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
          return removeSharedFeedAccess(message.feedId, message.targetUid).then(sendResponse);
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
          return followSharedFeedLink(message.token).then(sendResponse);
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
          return unfollowSharedFeed(message.ownerId, message.feedId).then(sendResponse);
        })
        .catch((error) => {
          sendResponse({ success: false, error: normalizeFeedsError(error, 'Failed to unfollow shared feed') });
        });
      return true;
    }

    if (message.type === 'FEEDS_REORDER_SHARED') {
      getAuthenticatedFeedsUser()
        .then((user) => {
          if (!user) {
            sendResponse(getFeedsAuthErrorResponse());
            return;
          }
          return reorderFollowedFeeds(user.uid, (message.followedFeedIds as string[]) || []).then(() => {
            sendResponse({ success: true });
          });
        })
        .catch((error) => {
          sendResponse({ success: false, error: normalizeFeedsError(error, 'Failed to reorder shared feeds') });
        });
      return true;
    }

    if (message.type === 'FEEDS_GET_SHARE_NOTIFICATIONS') {
      getAuthenticatedFeedsUser()
        .then((user) => {
          if (!user) {
            sendResponse(getFeedsAuthErrorResponse({ notifications: [] }));
            return;
          }
          return getShareNotifications(user.uid).then((notifications) => {
            sendResponse({ success: true, notifications });
          });
        })
        .catch((error) => {
          sendResponse({
            success: false,
            error: normalizeFeedsError(error, 'Failed to load sharing notifications'),
            notifications: [],
          });
        });
      return true;
    }

    if (message.type === 'FEEDS_ACCEPT_SHARE_NOTIFICATION') {
      getAuthenticatedFeedsUser()
        .then((user) => {
          if (!user) {
            sendResponse(getFeedsAuthErrorResponse());
            return;
          }
          return acceptSharedFeedNotification(message.notificationId).then(sendResponse);
        })
        .catch((error) => {
          sendResponse({ success: false, error: normalizeFeedsError(error, 'Failed to accept shared feed') });
        });
      return true;
    }

    if (message.type === 'FEEDS_DISMISS_SHARE_NOTIFICATION') {
      getAuthenticatedFeedsUser()
        .then((user) => {
          if (!user) {
            sendResponse(getFeedsAuthErrorResponse());
            return;
          }
          return dismissShareNotification(user.uid, message.notificationId).then(() => {
            sendResponse({ success: true });
          });
        })
        .catch((error) => {
          sendResponse({ success: false, error: normalizeFeedsError(error, 'Failed to dismiss notification') });
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
          return duplicateSharedFeedForPlan(user.uid, message.ownerId, message.feedId).then((feed) => {
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
          sendSharingError(sendResponse, error, 'Failed to duplicate shared feed');
        });
      return true;
    }

    return false;
  });
}

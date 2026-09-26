import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import {
  acceptShareNotification,
  followSharedFeedLink as followLink,
  shareFeedWithEmail as shareByEmail,
} from './sharing-service.js';
import { removeShareRelationship } from './sharing-removal-service.js';
import { getAuthorizedFeedPlanPolicies, type FeedPlanPolicyRequest } from './feed-plan-policy.js';
import type { ShareMutationResult, ShareRole } from './types.js';

const SHARING_CALLABLE_OPTIONS = { region: 'us-central1', maxInstances: 10 } as const;
const SHARING_FIRESTORE_OPTIONS = { region: 'europe-west1', maxInstances: 10 } as const;

function authenticatedUserId(auth: { uid: string } | undefined): string {
  if (!auth) throw new HttpsError('unauthenticated', 'Sign in to manage shared feeds.');
  return auth.uid;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new HttpsError('invalid-argument', `${label} is required.`);
  return value.trim();
}

function role(value: unknown): ShareRole {
  if (value !== 'reader' && value !== 'editor') throw new HttpsError('invalid-argument', 'Choose a valid access role.');
  return value;
}

function requiredDocumentId(value: unknown, label: string): string {
  const id = requiredString(value, label);
  if (id.includes('/')) throw new HttpsError('invalid-argument', `${label} is invalid.`);
  return id;
}

function feedPolicyRequests(value: unknown): FeedPlanPolicyRequest[] {
  if (!Array.isArray(value)) {
    throw new HttpsError('invalid-argument', 'Feeds are required.');
  }
  return value.map((item) => {
    const data = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    return {
      ownerId: requiredDocumentId(data.ownerId, 'Owner'),
      feedId: requiredDocumentId(data.feedId, 'Feed'),
    };
  });
}

function sharingFailure(error: unknown, fallback: string): never {
  if (error instanceof HttpsError) throw error;
  const message = error instanceof Error && error.message ? error.message : fallback;
  if (
    message === 'Feed not found' ||
    message === 'User not found' ||
    message === 'No myFeedPilot user found for this email' ||
    message === 'You already own this feed' ||
    message.includes('invalid or expired') ||
    message.includes('no longer available')
  ) {
    throw new HttpsError('failed-precondition', message);
  }
  logger.error(fallback, error);
  throw new HttpsError('internal', fallback);
}

export const shareFeedWithEmail = onCall(SHARING_CALLABLE_OPTIONS, async (request): Promise<ShareMutationResult> => {
  const ownerId = authenticatedUserId(request.auth);
  try {
    return await shareByEmail(
      getFirestore(),
      ownerId,
      requiredString(request.data?.feedId, 'Feed'),
      requiredString(request.data?.email, 'Email'),
      role(request.data?.role)
    );
  } catch (error) {
    return sharingFailure(error, 'Unable to share this feed right now.');
  }
});

export const followSharedFeedLink = onCall(SHARING_CALLABLE_OPTIONS, async (request): Promise<ShareMutationResult> => {
  const recipientId = authenticatedUserId(request.auth);
  try {
    return await followLink(getFirestore(), recipientId, requiredString(request.data?.token, 'Share link'));
  } catch (error) {
    return sharingFailure(error, 'Unable to follow this shared feed right now.');
  }
});

export const removeSharedFeedAccess = onCall(SHARING_CALLABLE_OPTIONS, async (request): Promise<{ success: true }> => {
  const ownerId = authenticatedUserId(request.auth);
  try {
    await removeShareRelationship(
      getFirestore(),
      ownerId,
      requiredString(request.data?.targetUid, 'Recipient'),
      requiredString(request.data?.feedId, 'Feed')
    );
    return { success: true };
  } catch (error) {
    return sharingFailure(error, 'Unable to remove shared access right now.');
  }
});

export const unfollowSharedFeed = onCall(SHARING_CALLABLE_OPTIONS, async (request): Promise<{ success: true }> => {
  const recipientId = authenticatedUserId(request.auth);
  try {
    await removeShareRelationship(
      getFirestore(),
      requiredString(request.data?.ownerId, 'Owner'),
      recipientId,
      requiredString(request.data?.feedId, 'Feed')
    );
    return { success: true };
  } catch (error) {
    return sharingFailure(error, 'Unable to unfollow this shared feed right now.');
  }
});

export const acceptSharedFeedNotification = onCall(
  SHARING_CALLABLE_OPTIONS,
  async (request): Promise<ShareMutationResult> => {
    const recipientId = authenticatedUserId(request.auth);
    try {
      return await acceptShareNotification(
        getFirestore(),
        recipientId,
        requiredString(request.data?.notificationId, 'Invitation')
      );
    } catch (error) {
      return sharingFailure(error, 'Unable to accept this shared feed right now.');
    }
  }
);

export const getFeedPlanPolicies = onCall(SHARING_CALLABLE_OPTIONS, async (request) => {
  const userId = authenticatedUserId(request.auth);
  return {
    policies: await getAuthorizedFeedPlanPolicies(getFirestore(), userId, feedPolicyRequests(request.data?.feeds)),
  };
});

export const cleanupDeletedFeedShares = onDocumentDeleted(
  {
    document: 'users/{ownerId}/feeds/{feedId}',
    ...SHARING_FIRESTORE_OPTIONS,
  },
  async (event) => {
    const { ownerId, feedId } = event.params;
    const db = getFirestore();
    const shares = await db.collection(`users/${ownerId}/feeds/${feedId}/shares`).get();
    await Promise.all(
      shares.docs.map(async (share) => {
        try {
          await removeShareRelationship(db, ownerId, share.id, feedId);
        } catch (error) {
          logger.error('Unable to clean up sharing state for a deleted feed', {
            ownerId,
            feedId,
            recipientId: share.id,
            error,
          });
        }
      })
    );
  }
);

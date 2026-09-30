import { httpsCallable } from 'firebase/functions';
import { SHARING_FUNCTION_NAMES, SHARING_FUNCTION_REGION } from 'shared/sharing-config';
import type {
  FeedPlanPolicy,
  FeedShareAccess,
  FeedShareRole,
  SharedFeedSummary,
  SharingLimitDetails,
} from 'shared/types';
import { waitForAuthReady } from '../../../../services/auth';
import { getCallableFunctions } from '../../../platform/firebase/callable-functions';

export interface SharingMutationResponse {
  success: boolean;
  error?: string;
  sharingLimit?: SharingLimitDetails;
  share?: FeedShareAccess;
  sharedFeed?: SharedFeedSummary;
}

async function requireAuthentication(): Promise<void> {
  const user = await waitForAuthReady();
  if (!user) throw new Error('Sign in to manage shared feeds.');
}

async function callSharingFunction<TRequest, TResponse>(name: string, data: TRequest): Promise<TResponse> {
  await requireAuthentication();
  const callable = httpsCallable<TRequest, TResponse>(getCallableFunctions(SHARING_FUNCTION_REGION), name);
  return (await callable(data)).data;
}

export function shareFeedWithEmail(input: {
  feedId: string;
  email: string;
  role: FeedShareRole;
}): Promise<SharingMutationResponse> {
  return callSharingFunction(SHARING_FUNCTION_NAMES.shareWithEmail, input);
}

export function followSharedFeedLink(token: string): Promise<SharingMutationResponse> {
  return callSharingFunction(SHARING_FUNCTION_NAMES.followLink, { token });
}

export function removeSharedFeedAccess(feedId: string, targetUid: string): Promise<{ success: true }> {
  return callSharingFunction(SHARING_FUNCTION_NAMES.removeShare, { feedId, targetUid });
}

export function unfollowSharedFeed(ownerId: string, feedId: string): Promise<{ success: true }> {
  return callSharingFunction(SHARING_FUNCTION_NAMES.unfollow, { ownerId, feedId });
}

export function acceptSharedFeedNotification(notificationId: string): Promise<SharingMutationResponse> {
  return callSharingFunction(SHARING_FUNCTION_NAMES.acceptNotification, { notificationId });
}

export async function getFeedPlanPolicies(
  feeds: Array<{ ownerId: string; feedId: string }>
): Promise<Record<string, FeedPlanPolicy>> {
  if (feeds.length === 0) return {};
  const batches = Array.from({ length: Math.ceil(feeds.length / 100) }, (_, index) =>
    feeds.slice(index * 100, index * 100 + 100)
  );
  const responses = await Promise.all(
    batches.map((batch) =>
      callSharingFunction<
        { feeds: Array<{ ownerId: string; feedId: string }> },
        { policies: Record<string, FeedPlanPolicy> }
      >(SHARING_FUNCTION_NAMES.getFeedPlanPolicies, { feeds: batch })
    )
  );
  return Object.assign({}, ...responses.map((response) => response.policies));
}

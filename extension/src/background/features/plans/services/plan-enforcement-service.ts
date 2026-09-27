import {
  addMemberToFeed,
  createFeed,
  duplicateSharedFeed,
  findExistingMemberInFeed,
  getFeedMembers,
  getFeeds,
  removeMemberFromFeed,
  syncFeedMemberCount,
  updateMemberInFeed,
} from 'shared/firestore-service';
import type { Feed, FeedMember, LinkedInProfileData } from 'shared/types';
import { getPlanEntitlements, isPlanLimitReached } from 'shared/plans';
import { PlanLimitError } from '../errors/plan-limit-error';
import { projectFeedMembersForPlan, projectFeedsForPlan } from '../utils/plan-projections';
import { getUserPlanSnapshot } from './plan-service';
import { getFeedPlanPolicies } from '../../feed-sharing/public';

const mutationTails = new Map<string, Promise<void>>();

async function getOwnerPlanPolicy(authenticatedUserId: string, ownerId: string, feedId: string) {
  if (ownerId === authenticatedUserId) {
    const [feeds, snapshot] = await Promise.all([getFeeds(ownerId), getUserPlanSnapshot(ownerId)]);
    const feedIndex = feeds.findIndex((feed) => feed.id === feedId);
    if (feedIndex < 0) throw new Error('Feed not found');
    const feedLimit = snapshot.entitlements.maxCustomFeeds;
    return {
      ownerPlan: snapshot.plan,
      isFeedLocked: feedLimit !== null && feedIndex >= feedLimit,
      maxMembersPerFeed: snapshot.entitlements.maxMembersPerFeed,
    } as const;
  }

  const policies = await getFeedPlanPolicies([{ ownerId, feedId }]);
  const policy = policies[`${ownerId}/${feedId}`];
  if (!policy) throw new Error('Feed access policy is unavailable');
  return policy;
}

function runSerialized<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = mutationTails.get(key) || Promise.resolve();
  const result = previous.then(operation, operation);
  const tail = result.then(
    () => undefined,
    () => undefined
  );

  mutationTails.set(key, tail);
  void tail.finally(() => {
    if (mutationTails.get(key) === tail) {
      mutationTails.delete(key);
    }
  });

  return result;
}

export async function getOwnedFeedsForPlan(userId: string): Promise<Feed[]> {
  const [feeds, planSnapshot] = await Promise.all([getFeeds(userId), getUserPlanSnapshot(userId)]);
  return projectFeedsForPlan(feeds, planSnapshot.entitlements);
}

export async function createOwnedFeedForPlan(
  userId: string,
  input: { name: string; description?: string; color?: string }
): Promise<Feed> {
  return runSerialized(`feeds:${userId}`, async () => {
    const [feeds, planSnapshot] = await Promise.all([getFeeds(userId), getUserPlanSnapshot(userId)]);
    const limit = planSnapshot.entitlements.maxCustomFeeds;
    if (isPlanLimitReached(feeds.length, limit)) {
      throw new PlanLimitError('feeds', limit!);
    }

    return createFeed(userId, input.name, input.description, input.color);
  });
}

export async function addFeedMemberForPlan(
  authenticatedUserId: string,
  ownerId: string,
  feedId: string,
  profileData: LinkedInProfileData
): Promise<{ member: FeedMember; alreadyExists: boolean }> {
  return runSerialized(`members:${ownerId}:${feedId}`, async () => {
    const [members, policy, existingMember] = await Promise.all([
      getFeedMembers(ownerId, feedId),
      getOwnerPlanPolicy(authenticatedUserId, ownerId, feedId),
      findExistingMemberInFeed(ownerId, feedId, profileData),
    ]);
    if (policy.isFeedLocked) {
      throw new PlanLimitError('feeds', 3);
    }
    const limit = policy.maxMembersPerFeed;
    if (!existingMember && isPlanLimitReached(members.length, limit)) {
      throw new PlanLimitError('members', limit!);
    }

    return addMemberToFeed(ownerId, feedId, profileData);
  });
}

export async function getFeedMembersForPlan(
  authenticatedUserId: string,
  ownerId: string,
  feedId: string
): Promise<FeedMember[]> {
  const [members, policy] = await Promise.all([
    getFeedMembers(ownerId, feedId),
    getOwnerPlanPolicy(authenticatedUserId, ownerId, feedId),
  ]);
  return projectFeedMembersForPlan(members, getPlanEntitlements(policy.ownerPlan), policy.isFeedLocked);
}

export async function projectFeedMembersForPlanAccess(
  authenticatedUserId: string,
  ownerId: string,
  feedId: string,
  members: FeedMember[]
): Promise<FeedMember[]> {
  const policy = await getOwnerPlanPolicy(authenticatedUserId, ownerId, feedId);
  return projectFeedMembersForPlan(members, getPlanEntitlements(policy.ownerPlan), policy.isFeedLocked);
}

export async function updateFeedMemberForPlan(
  authenticatedUserId: string,
  ownerId: string,
  feedId: string,
  memberId: string,
  updates: Parameters<typeof updateMemberInFeed>[3]
): Promise<void> {
  const [members, policy] = await Promise.all([
    getFeedMembers(ownerId, feedId),
    getOwnerPlanPolicy(authenticatedUserId, ownerId, feedId),
  ]);
  const member = projectFeedMembersForPlan(members, getPlanEntitlements(policy.ownerPlan), policy.isFeedLocked).find(
    (item) => item.id === memberId
  );
  if (policy.isFeedLocked || !member || member.isLockedByPlan) {
    throw new PlanLimitError(policy.isFeedLocked ? 'feeds' : 'members', policy.isFeedLocked ? 3 : 10);
  }
  await updateMemberInFeed(ownerId, feedId, memberId, updates);
}

export async function removeFeedMemberForPlan(
  authenticatedUserId: string,
  ownerId: string,
  feedId: string,
  memberId: string
): Promise<void> {
  const [members, policy] = await Promise.all([
    getFeedMembers(ownerId, feedId),
    getOwnerPlanPolicy(authenticatedUserId, ownerId, feedId),
  ]);
  const member = projectFeedMembersForPlan(members, getPlanEntitlements(policy.ownerPlan), policy.isFeedLocked).find(
    (item) => item.id === memberId
  );
  if (!member) {
    await syncFeedMemberCount(ownerId, feedId, members.length);
    return;
  }
  const ownerMayRemoveLockedData = authenticatedUserId === ownerId;
  if (!ownerMayRemoveLockedData && (policy.isFeedLocked || member.isLockedByPlan)) {
    throw new PlanLimitError(policy.isFeedLocked ? 'feeds' : 'members', policy.isFeedLocked ? 3 : 10);
  }
  await removeMemberFromFeed(ownerId, feedId, memberId);
}

export async function duplicateSharedFeedForPlan(userId: string, ownerId: string, feedId: string): Promise<Feed> {
  return runSerialized(`feeds:${userId}`, async () => {
    const [ownedFeeds, sourceMembers, planSnapshot, sourcePolicy] = await Promise.all([
      getFeeds(userId),
      getFeedMembers(ownerId, feedId),
      getUserPlanSnapshot(userId),
      getOwnerPlanPolicy(userId, ownerId, feedId),
    ]);

    const feedLimit = planSnapshot.entitlements.maxCustomFeeds;
    if (isPlanLimitReached(ownedFeeds.length, feedLimit)) {
      throw new PlanLimitError('feeds', feedLimit!);
    }

    if (sourcePolicy.isFeedLocked) {
      throw new PlanLimitError('feeds', 3);
    }
    const accessibleSourceMembers = projectFeedMembersForPlan(
      sourceMembers,
      getPlanEntitlements(sourcePolicy.ownerPlan)
    ).filter((member) => !member.isLockedByPlan);

    const memberLimit = planSnapshot.entitlements.maxMembersPerFeed;
    if (memberLimit !== null && accessibleSourceMembers.length > memberLimit) {
      throw new PlanLimitError('members', memberLimit);
    }

    return duplicateSharedFeed(userId, ownerId, feedId, accessibleSourceMembers);
  });
}

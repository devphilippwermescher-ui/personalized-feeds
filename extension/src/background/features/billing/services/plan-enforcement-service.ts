import {
  addMemberToFeed,
  createFeed,
  duplicateSharedFeed,
  findExistingMemberInFeed,
  getFeedMembers,
  getFeeds,
} from 'shared/firestore-service';
import type { Feed, FeedMember, LinkedInProfileData } from 'shared/types';
import { isPlanLimitReached } from 'shared/plans';
import { PlanLimitError } from '../errors/plan-limit-error';
import { projectFeedMembersForPlan, projectFeedsForPlan } from '../utils/plan-projections';
import { getUserPlanSnapshot } from './plan-service';

const mutationTails = new Map<string, Promise<void>>();

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
  if (ownerId !== authenticatedUserId) {
    // Followed feeds are not part of the authenticated user's own Free quota.
    return addMemberToFeed(ownerId, feedId, profileData);
  }

  return runSerialized(`members:${ownerId}:${feedId}`, async () => {
    const [members, planSnapshot, existingMember] = await Promise.all([
      getFeedMembers(ownerId, feedId),
      getUserPlanSnapshot(authenticatedUserId),
      findExistingMemberInFeed(ownerId, feedId, profileData),
    ]);
    const limit = planSnapshot.entitlements.maxMembersPerFeed;
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
  const [members, planSnapshot] = await Promise.all([
    getFeedMembers(ownerId, feedId),
    ownerId === authenticatedUserId ? getUserPlanSnapshot(authenticatedUserId) : Promise.resolve(null),
  ]);

  return planSnapshot ? projectFeedMembersForPlan(members, planSnapshot.entitlements) : members;
}

export async function duplicateSharedFeedForPlan(userId: string, ownerId: string, feedId: string): Promise<Feed> {
  return runSerialized(`feeds:${userId}`, async () => {
    const [ownedFeeds, sourceMembers, planSnapshot] = await Promise.all([
      getFeeds(userId),
      getFeedMembers(ownerId, feedId),
      getUserPlanSnapshot(userId),
    ]);

    const feedLimit = planSnapshot.entitlements.maxCustomFeeds;
    if (isPlanLimitReached(ownedFeeds.length, feedLimit)) {
      throw new PlanLimitError('feeds', feedLimit!);
    }

    const memberLimit = planSnapshot.entitlements.maxMembersPerFeed;
    if (memberLimit !== null && sourceMembers.length > memberLimit) {
      throw new PlanLimitError('members', memberLimit);
    }

    return duplicateSharedFeed(userId, ownerId, feedId);
  });
}

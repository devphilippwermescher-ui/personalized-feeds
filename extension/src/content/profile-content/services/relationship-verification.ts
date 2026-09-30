import type { RelationshipResolution } from '../../linkedin-relationship-status/types';
import { rememberLinkedInRelationshipStatus } from '../../linkedin-relationship-status';
import type { FeedMembership, ProfileData } from '../types';

export const PROFILE_RELATIONSHIP_VERIFY_COOLDOWN_MS = 30_000;

interface RelationshipVerificationDeps {
  getCurrentProfileData: () => ProfileData | null;
  sendMessageToBackground: (message: Record<string, unknown>) => Promise<unknown>;
  now?: () => number;
}

interface RelationshipResolutionResponse {
  success?: boolean;
  resolution?: RelationshipResolution;
}

interface VerifiedRelationshipUpdates {
  updates: Record<string, unknown>;
  profileViewerUpdates: Record<string, unknown>;
}

function buildVerifiedRelationshipUpdates(
  profile: ProfileData,
  resolution: RelationshipResolution,
  resolvedAt: number
): VerifiedRelationshipUpdates {
  const updates: Record<string, unknown> = {
    status: resolution.status,
  };

  if (resolution.status === 'connected') {
    updates.connectionDegree = '1st';
  } else if (profile.connectionDegree) {
    updates.connectionDegree = profile.connectionDegree;
  }

  if (resolution.profileUrn) updates.profileUrn = resolution.profileUrn;
  if (resolution.memberNumericId) updates.memberNumericId = resolution.memberNumericId;
  if (typeof resolution.canMessage === 'boolean') updates.canMessage = resolution.canMessage;
  if (typeof resolution.canFollow === 'boolean') updates.canFollow = resolution.canFollow;
  if (typeof resolution.canConnect === 'boolean') updates.canConnect = resolution.canConnect;
  if (typeof resolution.isFollowing === 'boolean') updates.isFollowing = resolution.isFollowing;
  if (typeof resolution.isPremium === 'boolean') updates.isPremium = resolution.isPremium;

  if (resolution.profileUrn) profile.profileUrn = resolution.profileUrn;
  if (resolution.memberNumericId) {
    profile.memberNumericId = resolution.memberNumericId;
    profile.memberId = resolution.memberNumericId;
  }
  if (typeof resolution.canMessage === 'boolean') profile.canMessage = resolution.canMessage;
  if (typeof resolution.canFollow === 'boolean') profile.canFollow = resolution.canFollow;
  if (typeof resolution.canConnect === 'boolean') profile.canConnect = resolution.canConnect;
  if (typeof resolution.isFollowing === 'boolean') profile.isFollowing = resolution.isFollowing;
  if (resolution.status === 'connected') profile.connectionDegree = '1st';

  return { updates, profileViewerUpdates: { ...updates, statusResolvedAt: resolvedAt } };
}

export function createProfileRelationshipVerifier({
  getCurrentProfileData,
  sendMessageToBackground,
  now = Date.now,
}: RelationshipVerificationDeps): {
  verifyAfterDomChange: () => Promise<boolean>;
} {
  const lastAttemptAtByUsername = new Map<string, number>();
  const inFlightByUsername = new Map<string, Promise<boolean>>();

  const verifyAfterDomChange = async (): Promise<boolean> => {
    const profile = getCurrentProfileData();
    const username = profile?.linkedinUsername.trim().toLowerCase() || '';
    if (!profile || !username) {
      return false;
    }

    const existing = inFlightByUsername.get(username);
    if (existing) {
      return existing;
    }

    const startedAt = now();
    const lastAttemptAt = lastAttemptAtByUsername.get(username) || 0;
    if (lastAttemptAt > 0 && startedAt - lastAttemptAt < PROFILE_RELATIONSHIP_VERIFY_COOLDOWN_MS) {
      return false;
    }
    lastAttemptAtByUsername.set(username, startedAt);

    const request = (async (): Promise<boolean> => {
      const response = (await sendMessageToBackground({
        type: 'LINKEDIN_RELATIONSHIP_STATUS_RESOLVE_BACKGROUND',
        linkedinUsername: username,
      })) as RelationshipResolutionResponse | null;
      if (!response?.success || !response.resolution) {
        return false;
      }

      const resolution = response.resolution;
      rememberLinkedInRelationshipStatus(username, resolution);
      const { updates, profileViewerUpdates } = buildVerifiedRelationshipUpdates(profile, resolution, now());

      const membershipsResponse = (await sendMessageToBackground({
        type: 'FEEDS_GET_PROFILE_MEMBERSHIPS',
        linkedinUsername: profile.linkedinUsername,
        linkedinUrl: profile.linkedinUrl,
        memberNumericId: resolution.memberNumericId || profile.memberNumericId || profile.memberId,
        profileUrn: resolution.profileUrn || profile.profileUrn,
      })) as { memberships?: FeedMembership[] } | null;
      const memberships = membershipsResponse?.memberships || [];

      await Promise.all([
        sendMessageToBackground({
          type: 'PROFILE_VIEWERS_UPDATE',
          viewerId: profile.linkedinUsername,
          updates: profileViewerUpdates,
          notifyProfileViewersChanged: true,
        }),
        ...memberships.map((membership) =>
          sendMessageToBackground({
            type: 'FEEDS_UPDATE_MEMBER',
            feedId: membership.feedId,
            memberId: membership.memberId,
            updates,
          })
        ),
      ]);

      return true;
    })().finally(() => {
      inFlightByUsername.delete(username);
    });

    inFlightByUsername.set(username, request);
    return request;
  };

  return { verifyAfterDomChange };
}

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStatusCache, getCachedStatus } from '../../linkedin-relationship-status/cache';
import {
  createProfileRelationshipVerifier,
  PROFILE_RELATIONSHIP_VERIFY_COOLDOWN_MS,
} from '../services/relationship-verification';
import type { ProfileData } from '../types';

function profile(): ProfileData {
  return {
    linkedinUrl: 'https://www.linkedin.com/in/yuliia-biliavtseva/',
    linkedinUsername: 'Yuliia-Biliavtseva',
    displayName: 'Yuliia Biliavtseva',
    connectionDegree: '2nd',
  };
}

describe('profile relationship verification', () => {
  beforeEach(() => {
    clearStatusCache();
  });

  it('deduplicates concurrent checks and applies a per-profile cooldown', async () => {
    let resolveRequest: (value: unknown) => void = () => {
      throw new Error('Expected a pending relationship request');
    };
    let now = 1_000;
    const sendMessageToBackground = vi.fn((message: Record<string, unknown>): Promise<unknown> => {
      if (message.type === 'LINKEDIN_RELATIONSHIP_STATUS_RESOLVE_BACKGROUND') {
        return new Promise((resolve) => {
          resolveRequest = resolve;
        });
      }
      if (message.type === 'FEEDS_GET_PROFILE_MEMBERSHIPS') {
        return Promise.resolve({ memberships: [] });
      }
      return Promise.resolve({ success: true });
    });
    const verifier = createProfileRelationshipVerifier({
      getCurrentProfileData: profile,
      sendMessageToBackground,
      now: () => now,
    });

    const first = verifier.verifyAfterDomChange();
    const duplicate = verifier.verifyAfterDomChange();
    expect(sendMessageToBackground).toHaveBeenCalledTimes(1);
    resolveRequest({
      success: true,
      resolution: { status: 'pending', canConnect: false },
    });
    await expect(Promise.all([first, duplicate])).resolves.toEqual([true, true]);

    await expect(verifier.verifyAfterDomChange()).resolves.toBe(false);
    expect(
      sendMessageToBackground.mock.calls.filter(
        ([message]) => (message as Record<string, unknown>).type === 'LINKEDIN_RELATIONSHIP_STATUS_RESOLVE_BACKGROUND'
      )
    ).toHaveLength(1);

    now += PROFILE_RELATIONSHIP_VERIFY_COOLDOWN_MS;
    const afterCooldown = verifier.verifyAfterDomChange();
    resolveRequest({
      success: true,
      resolution: { status: 'pending', canConnect: false },
    });
    await expect(afterCooldown).resolves.toBe(true);
    expect(
      sendMessageToBackground.mock.calls.filter(
        ([message]) => (message as Record<string, unknown>).type === 'LINKEDIN_RELATIONSHIP_STATUS_RESOLVE_BACKGROUND'
      )
    ).toHaveLength(2);
  });

  it('persists only the verified GraphQL result for viewers and feed memberships', async () => {
    const currentProfile = profile();
    const sendMessageToBackground = vi.fn(async (message: Record<string, unknown>): Promise<unknown> => {
      if (message.type === 'LINKEDIN_RELATIONSHIP_STATUS_RESOLVE_BACKGROUND') {
        return {
          success: true,
          resolution: {
            status: 'connected',
            profileUrn: 'urn:li:fsd_profile:abc123',
            memberNumericId: '123',
            canMessage: true,
            canConnect: false,
            canFollow: false,
            isFollowing: false,
          },
        };
      }
      if (message.type === 'FEEDS_GET_PROFILE_MEMBERSHIPS') {
        return { memberships: [{ feedId: 'feed-1', feedName: 'People', memberId: 'member-1' }] };
      }
      return { success: true };
    });
    const verifier = createProfileRelationshipVerifier({
      getCurrentProfileData: () => currentProfile,
      sendMessageToBackground,
      now: () => 5_000,
    });

    await expect(verifier.verifyAfterDomChange()).resolves.toBe(true);

    expect(sendMessageToBackground).toHaveBeenCalledWith({
      type: 'PROFILE_VIEWERS_UPDATE',
      viewerId: 'Yuliia-Biliavtseva',
      updates: expect.objectContaining({
        status: 'connected',
        connectionDegree: '1st',
        canConnect: false,
        statusResolvedAt: 5_000,
      }),
      notifyProfileViewersChanged: true,
    });
    expect(sendMessageToBackground).toHaveBeenCalledWith({
      type: 'FEEDS_UPDATE_MEMBER',
      feedId: 'feed-1',
      memberId: 'member-1',
      updates: expect.objectContaining({
        status: 'connected',
        connectionDegree: '1st',
        canConnect: false,
      }),
    });
    expect(getCachedStatus('yuliia-biliavtseva')).toMatchObject({
      status: 'connected',
      canConnect: false,
    });
    expect(currentProfile).toMatchObject({
      profileUrn: 'urn:li:fsd_profile:abc123',
      memberNumericId: '123',
      memberId: '123',
      connectionDegree: '1st',
      canConnect: false,
    });
  });

  it('does not persist anything when GraphQL cannot verify the status', async () => {
    const sendMessageToBackground = vi.fn().mockResolvedValue({ success: false });
    const verifier = createProfileRelationshipVerifier({
      getCurrentProfileData: profile,
      sendMessageToBackground,
      now: () => 10_000,
    });

    await expect(verifier.verifyAfterDomChange()).resolves.toBe(false);
    expect(sendMessageToBackground).toHaveBeenCalledOnce();
    expect(sendMessageToBackground).toHaveBeenCalledWith({
      type: 'LINKEDIN_RELATIONSHIP_STATUS_RESOLVE_BACKGROUND',
      linkedinUsername: 'yuliia-biliavtseva',
    });
  });
});

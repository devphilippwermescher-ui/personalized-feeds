import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeedMemberInfo } from '../../feeds-sidebar/types';
import { LinkedInStatusFetchError } from '../errors';

const fetchWithGraphQL = vi.fn();
const fetchStatusFromProfilePage = vi.fn();
const fetchProfileImageFromProfilePage = vi.fn();
const resolveCanonicalLinkedInIdentity = vi.fn();

vi.mock('../api', () => ({
  GRAPHQL_QUERY_IDS: ['test-query-id'],
  fetchWithGraphQL,
  fetchStatusFromProfilePage,
  fetchProfileImageFromProfilePage,
  resolveCanonicalLinkedInIdentity,
  isLikelyLinkedInProfileToken: (username: string) => /^ACo[A-Za-z0-9_-]+$/i.test(username.trim()),
  resolveProfileUrn: vi.fn(),
  sendLinkedInConnectRequest: vi.fn(),
  sendLinkedInFollowState: vi.fn(),
}));

describe('fetchLinkedInRelationshipStatus', () => {
  beforeEach(() => {
    vi.resetModules();
    fetchWithGraphQL.mockReset();
    fetchStatusFromProfilePage.mockReset();
    fetchProfileImageFromProfilePage.mockReset();
    resolveCanonicalLinkedInIdentity.mockReset();
    delete (globalThis as { chrome?: unknown }).chrome;
  });

  it('resolves token-style usernames to vanity slug before GraphQL', async () => {
    const tokenUrl =
      'https://www.linkedin.com/in/ACoAAD-k8P8BVBQtJpze3MdxLgVqCqsIrUk7Mqs?miniProfileUrn=urn%3Ali%3Afs_miniProfile%3AACoAAD-k8P8BVBQtJpze3MdxLgVqCqsIrUk7Mqs';
    resolveCanonicalLinkedInIdentity.mockResolvedValue({
      username: 'alina-oharova-a7b718259',
      linkedinUrl: 'https://www.linkedin.com/in/alina-oharova-a7b718259/',
    });
    fetchWithGraphQL.mockResolvedValue({
      status: 'connected',
      canMessage: true,
    });

    const { fetchLinkedInRelationshipStatus } = await import('../service');
    const member: FeedMemberInfo = {
      id: 'urn:li:fsd_profile:ACoAAD-k8P8BVBQtJpze3MdxLgVqCqsIrUk7Mqs',
      linkedinUrl: tokenUrl,
      linkedinUsername: 'ACoAAD-k8P8BVBQtJpze3MdxLgVqCqsIrUk7Mqs',
      displayName: 'Alina Oharova',
      addedAt: Date.now(),
    };

    const result = await fetchLinkedInRelationshipStatus(member);

    expect(resolveCanonicalLinkedInIdentity).toHaveBeenCalledWith(
      tokenUrl,
      'acoaad-k8p8bvbqtjpze3mdxlgvqcqsiruk7mqs'
    );
    expect(fetchWithGraphQL).toHaveBeenCalledWith('alina-oharova-a7b718259', expect.any(String));
    expect(member.linkedinUsername).toBe('alina-oharova-a7b718259');
    expect(member.linkedinUrl).toBe('https://www.linkedin.com/in/alina-oharova-a7b718259/');
    expect(result.status).toBe('connected');
  });

  it('refreshes expired LinkedIn media avatar URLs through the HTML image fallback', async () => {
    fetchWithGraphQL.mockResolvedValue({
      status: 'connect',
      profileUrn: 'urn:li:fsd_profile:ACoAADXvS4cBAw9b0BPD1e_I1i9GQUdEnOB99Tc',
      canConnect: true,
    });
    fetchProfileImageFromProfilePage.mockResolvedValue(
      'https://media.licdn.com/dms/image/v2/D5603AQFdn_98-m9tZQ/profile-displayphoto-crop_800_800/B56Zuyd7kcHUAI-/0/1768225750524?e=1782345600&v=beta&t=fresh'
    );

    const { fetchLinkedInRelationshipStatus } = await import('../service');
    const member: FeedMemberInfo = {
      id: 'sofia',
      linkedinUrl: 'https://www.linkedin.com/in/sofia-melnychok-54705a213/',
      linkedinUsername: 'sofia-melnychok-54705a213',
      displayName: 'Sofia Melnychok',
      profileImageUrl:
        'https://media.licdn.com/dms/image/v2/D5603AQFdn_98-m9tZQ/profile-displayphoto-crop_800_800/B56Zuyd7kcHUAI-/0/1768225750524?e=1777507200&v=beta&t=expired',
      addedAt: Date.now(),
    };

    const result = await fetchLinkedInRelationshipStatus(member);

    expect(fetchProfileImageFromProfilePage).toHaveBeenCalledWith(
      'sofia-melnychok-54705a213',
      'urn:li:fsd_profile:ACoAADXvS4cBAw9b0BPD1e_I1i9GQUdEnOB99Tc'
    );
    expect(result.profileImageUrl).toContain('e=1782345600');
  });

  it('normalizes connected GraphQL results to allow messaging', async () => {
    fetchWithGraphQL.mockResolvedValue({
      status: 'connected',
      canMessage: false,
    });

    const { fetchLinkedInRelationshipStatus } = await import('../service');
    const member: FeedMemberInfo = {
      id: 'connected-member',
      linkedinUrl: 'https://www.linkedin.com/in/connected-member/',
      linkedinUsername: 'connected-member',
      displayName: 'Connected Member',
      profileImageUrl: 'https://media.licdn.com/profile.jpg',
      addedAt: Date.now(),
    };

    const firstResult = await fetchLinkedInRelationshipStatus(member);
    const cachedResult = await fetchLinkedInRelationshipStatus(member);

    expect(firstResult.canMessage).toBe(true);
    expect(cachedResult.canMessage).toBe(true);
    expect(fetchWithGraphQL).toHaveBeenCalledTimes(1);
  });

  it('falls back to background status resolution when content GraphQL is blocked', async () => {
    fetchWithGraphQL.mockRejectedValue(
      new LinkedInStatusFetchError('blocked', 'auth_blocked', 403)
    );
    fetchProfileImageFromProfilePage.mockResolvedValue('');

    const sendMessage = vi.fn((_message, callback) => {
      callback({
        success: true,
        resolution: {
          status: 'connected',
          canMessage: true,
          profileUrn: 'urn:li:fsd_profile:abc',
        },
      });
    });
    (globalThis as { chrome?: unknown }).chrome = {
      runtime: {
        sendMessage,
        lastError: null,
      },
    };

    const { fetchLinkedInRelationshipStatus } = await import('../service');
    const member: FeedMemberInfo = {
      id: 'blocked-member',
      linkedinUrl: 'https://www.linkedin.com/in/blocked-member/',
      linkedinUsername: 'blocked-member',
      displayName: 'Blocked Member',
      profileImageUrl: 'https://media.licdn.com/profile.jpg',
      addedAt: Date.now(),
    };

    const result = await fetchLinkedInRelationshipStatus(member);
    const cachedResult = await fetchLinkedInRelationshipStatus(member);

    expect(sendMessage).toHaveBeenCalledWith(
      {
        type: 'LINKEDIN_RELATIONSHIP_STATUS_RESOLVE_BACKGROUND',
        linkedinUsername: 'blocked-member',
      },
      expect.any(Function)
    );
    expect(result.status).toBe('connected');
    expect(result.canMessage).toBe(true);
    expect(cachedResult.status).toBe('connected');
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('throttles emergency background fallback requests for large blocked batches', async () => {
    fetchWithGraphQL.mockRejectedValue(
      new LinkedInStatusFetchError('blocked', 'auth_blocked', 403)
    );
    fetchProfileImageFromProfilePage.mockResolvedValue('');

    const sendMessage = vi.fn((message, callback) => {
      callback({
        success: true,
        resolution: {
          status: 'connected',
          canMessage: true,
          profileUrn: `urn:li:fsd_profile:${message.linkedinUsername}`,
        },
      });
    });
    (globalThis as { chrome?: unknown }).chrome = {
      runtime: {
        sendMessage,
        lastError: null,
      },
    };

    const { fetchStatusesProgressively } = await import('../service');
    const members: FeedMemberInfo[] = Array.from({ length: 21 }, (_, index) => ({
      id: `blocked-member-${index}`,
      linkedinUrl: `https://www.linkedin.com/in/blocked-member-${index}/`,
      linkedinUsername: `blocked-member-${index}`,
      displayName: `Blocked Member ${index}`,
      profileImageUrl: 'https://media.licdn.com/profile.jpg',
      addedAt: Date.now(),
    }));

    await fetchStatusesProgressively(members, () => undefined);

    expect(sendMessage).toHaveBeenCalledTimes(20);
    expect(members.filter((member) => member.status === 'connected')).toHaveLength(20);
    expect(members.filter((member) => !member.status)).toHaveLength(1);
  });

  it('preserves withdrawn connect cooldown when refresh resolves the profile as connect', async () => {
    fetchWithGraphQL.mockResolvedValue({
      status: 'connect',
      canConnect: true,
      canFollow: true,
      isFollowing: true,
      profileUrn: 'urn:li:fsd_profile:withdrawn-member',
      memberNumericId: '123',
    });

    const { fetchStatusesProgressively } = await import('../service');
    const member: FeedMemberInfo = {
      id: 'withdrawn-member',
      linkedinUrl: 'https://www.linkedin.com/in/withdrawn-member/',
      linkedinUsername: 'withdrawn-member',
      displayName: 'Withdrawn Member',
      status: 'withdrawn',
      canConnect: false,
      profileImageUrl: 'https://media.licdn.com/profile.jpg',
      addedAt: Date.now(),
    };

    await fetchStatusesProgressively([member], () => undefined);

    expect(member.status).toBe('withdrawn');
    expect(member.canConnect).toBe(false);
    expect(member.canFollow).toBe(true);
    expect(member.isFollowing).toBe(true);
    expect(member.profileUrn).toBe('urn:li:fsd_profile:withdrawn-member');
  });

  it('bypasses cached status when follow actions require missing LinkedIn identifiers', async () => {
    fetchWithGraphQL
      .mockResolvedValueOnce({
        status: 'withdrawn',
        canConnect: false,
      })
      .mockResolvedValueOnce({
        status: 'withdrawn',
        canConnect: false,
        canFollow: true,
        isFollowing: false,
        profileUrn: 'urn:li:fsd_profile:cached-without-ids',
        memberNumericId: '456',
      });

    const { fetchLinkedInRelationshipStatus } = await import('../service');
    const member: FeedMemberInfo = {
      id: 'cached-without-ids',
      linkedinUrl: 'https://www.linkedin.com/in/cached-without-ids/',
      linkedinUsername: 'cached-without-ids',
      displayName: 'Cached Without IDs',
      profileImageUrl: 'https://media.licdn.com/profile.jpg',
      addedAt: Date.now(),
    };

    const cachedResult = await fetchLinkedInRelationshipStatus(member);
    const actionResult = await fetchLinkedInRelationshipStatus(member, {
      requireActionIdentifiers: true,
    });

    expect(cachedResult.profileUrn).toBeUndefined();
    expect(cachedResult.memberNumericId).toBeUndefined();
    expect(actionResult.profileUrn).toBe('urn:li:fsd_profile:cached-without-ids');
    expect(actionResult.memberNumericId).toBe('456');
    expect(fetchWithGraphQL).toHaveBeenCalledTimes(2);
  });

  it('continues to profile HTML when action identifiers are missing from GraphQL', async () => {
    fetchWithGraphQL.mockResolvedValue({
      status: 'withdrawn',
      canConnect: false,
      canFollow: true,
      isFollowing: true,
    });
    fetchStatusFromProfilePage.mockResolvedValue({
      status: 'connect',
      canConnect: true,
      canFollow: true,
      isFollowing: false,
      profileUrn: 'urn:li:fsd_profile:action-ids-from-html',
      memberNumericId: '789',
    });

    const { fetchLinkedInRelationshipStatus } = await import('../service');
    const member: FeedMemberInfo = {
      id: 'action-ids-from-html',
      linkedinUrl: 'https://www.linkedin.com/in/action-ids-from-html/',
      linkedinUsername: 'action-ids-from-html',
      displayName: 'Action IDs From HTML',
      profileImageUrl: 'https://media.licdn.com/profile.jpg',
      addedAt: Date.now(),
    };

    const result = await fetchLinkedInRelationshipStatus(member, {
      requireActionIdentifiers: true,
    });

    expect(fetchStatusFromProfilePage).toHaveBeenCalledWith('action-ids-from-html');
    expect(result.status).toBe('withdrawn');
    expect(result.canConnect).toBe(false);
    expect(result.isFollowing).toBe(false);
    expect(result.profileUrn).toBe('urn:li:fsd_profile:action-ids-from-html');
    expect(result.memberNumericId).toBe('789');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeedMemberInfo } from '../../feeds-sidebar/types';

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
});

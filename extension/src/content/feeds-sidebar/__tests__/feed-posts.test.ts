import { describe, expect, it, vi } from 'vitest';
import { buildLinkedInContentSearchUrl, extractLinkedInMemberToken } from '../logic/feed-posts';
import { openFeedPosts } from '../logic/open-feed-posts';

describe('feed posts search', () => {
  it('extracts member tokens from raw and full LinkedIn profile URNs', () => {
    expect(extractLinkedInMemberToken('ACoExample_123')).toBe('ACoExample_123');
    expect(extractLinkedInMemberToken('urn:li:fsd_profile:ACoAnother-456')).toBe('ACoAnother-456');
    expect(extractLinkedInMemberToken('urn:li:member:123')).toBeNull();
  });

  it('builds the same deduplicated content search URL for every feed type', () => {
    const result = buildLinkedInContentSearchUrl([
      { profileUrn: 'urn:li:fsd_profile:ACoFirst' },
      { profileUrn: 'ACoSecond' },
      { profileUrn: 'urn:li:fsd_profile:ACoFirst' },
      { profileUrn: undefined },
    ]);

    expect(result).not.toBeNull();

    const url = new URL(result!);
    expect(url.origin + url.pathname).toBe('https://www.linkedin.com/search/results/content/');
    expect(url.searchParams.get('origin')).toBe('FACETED_SEARCH');
    expect(JSON.parse(url.searchParams.get('sortBy') || '[]')).toEqual(['date_posted']);
    expect(JSON.parse(url.searchParams.get('fromMember') || '[]')).toEqual(['ACoFirst', 'ACoSecond']);
  });

  it('returns null when no LinkedIn member token is available', () => {
    expect(buildLinkedInContentSearchUrl([{ profileUrn: undefined }, { profileUrn: 'urn:li:member:123' }])).toBeNull();
  });
});

describe('opening feed posts with plan-locked data', () => {
  it('uses active members only when a downgraded feed still contains overflow profiles', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);

    await openFeedPosts('feed-with-overflow', {
      getFeeds: () => [{ id: 'feed-with-overflow', name: 'Work', color: '#fff', memberCount: 2 }],
      getFeedMembersById: () => ({
        'feed-with-overflow': [
          {
            id: 'active',
            linkedinUrl: 'https://www.linkedin.com/in/active/',
            linkedinUsername: 'active',
            displayName: 'Active',
            profileUrn: 'ACoActive',
            addedAt: 2,
          },
          {
            id: 'locked',
            linkedinUrl: 'https://www.linkedin.com/in/locked/',
            linkedinUsername: 'locked',
            displayName: 'Locked',
            profileUrn: 'ACoLocked',
            addedAt: 1,
            isLockedByPlan: true,
          },
        ],
      }),
      loadFeedMembers: vi.fn(),
      resolveProfileUrn: vi.fn(),
      renderSidebarContent: vi.fn(),
      showToast: vi.fn(),
      showPlanModal: vi.fn(),
    });

    const openedUrl = new URL(String(open.mock.calls[0]?.[0]));
    expect(JSON.parse(openedUrl.searchParams.get('fromMember') || '[]')).toEqual(['ACoActive']);
    open.mockRestore();
  });

  it('opens the upgrade explanation instead of an entirely locked feed', async () => {
    const showPlanModal = vi.fn();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);

    await openFeedPosts('locked-feed', {
      getFeeds: () => [{ id: 'locked-feed', name: 'Legacy', color: '#fff', memberCount: 4, isLockedByPlan: true }],
      getFeedMembersById: () => ({}),
      loadFeedMembers: vi.fn(),
      resolveProfileUrn: vi.fn(),
      renderSidebarContent: vi.fn(),
      showToast: vi.fn(),
      showPlanModal,
    });

    expect(showPlanModal).toHaveBeenCalledOnce();
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });
});

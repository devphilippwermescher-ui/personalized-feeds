import { describe, expect, it } from 'vitest';
import { renderFeedRow } from '../components/FeedRow/FeedRow';
import type { FeedInfo } from '../types';

function makeFeed(overrides: Partial<FeedInfo> = {}): FeedInfo {
  return {
    id: 'feed-1',
    name: 'Profile Visitors',
    color: '#615DEC',
    memberCount: 3,
    ...overrides,
  };
}

describe('renderFeedRow', () => {
  it('renders the system feed with a pinned icon and custom info tooltip', () => {
    const html = renderFeedRow({
      feed: makeFeed({
        isSystem: true,
        systemType: 'profileViewers',
        memberCount: 9,
        privateViewerCount: 4,
        recruiterViewerCount: 2,
      }),
      expanded: false,
      previewHtml: '',
    });

    expect(html).toContain('lfa-feed-pin');
    expect(html).toContain('lfa-feed-pin-tooltip');
    expect(html).toContain('You can hide this list in Settings');
    expect(html).toContain('lfa-feed-info');
    expect(html).toContain('lfa-feed-info-tooltip');
    expect(html).toContain('Auto-saved from LinkedIn over the last 90 days');
    expect(html).toContain('>8 / 6</span>');
    expect(html).toContain('8 visible visitor entries saved');
    expect(html).toContain('4 private-mode visitors');
    expect(html).toContain('2 recruiter views');
    expect(html).toContain('lfa-profile-viewer-count-tooltip');
    expect(html).not.toContain('lfa-feed-owner-badge">auto-saved');
  });

  it('keeps the drag grip for a regular feed', () => {
    const html = renderFeedRow({
      feed: makeFeed({ name: 'Work', isSystem: false }),
      expanded: false,
      previewHtml: '',
    });

    expect(html).toContain('lfa-feed-grip');
    expect(html).not.toContain('lfa-feed-pin');
    expect(html).not.toContain('lfa-feed-info');
  });

  it('keeps the drag grip and draggable row for a shared feed', () => {
    const html = renderFeedRow({
      feed: makeFeed({ name: 'Shared Work', isShared: true, ownerDisplayName: 'Owner' }),
      expanded: false,
      previewHtml: '',
    });

    expect(html).toContain('lfa-feed-grip');
    expect(html).toContain('draggable="true"');
    expect(html).toContain('lfa-feed-owner-badge">by Owner</span>');
    expect(html).not.toContain('lfa-feed-grip--hidden');
  });

  it('shows persisted overflow without making a locked feed draggable', () => {
    const html = renderFeedRow({
      feed: makeFeed({
        name: 'Legacy feed',
        memberCount: 16,
        activeMemberCount: 0,
        lockedMemberCount: 16,
        isLockedByPlan: true,
      }),
      expanded: false,
      previewHtml: '',
    });

    expect(html).toContain('lfa-feed-item--locked');
    expect(html).toContain('draggable="false"');
    expect(html).toContain('>0 / 16</span>');
    expect(html).toContain('0 active profiles and 16 locked');
    expect(html).toContain('Upgrade to Pro to unlock all profiles.');
    expect(html).toContain('lfa-feed-plan-lock');
  });

  it('uses a compact active/locked count with the Profile Visitors tooltip style', () => {
    const html = renderFeedRow({
      feed: makeFeed({
        name: 'Limited feed',
        memberCount: 16,
        activeMemberCount: 10,
        lockedMemberCount: 6,
      }),
      expanded: false,
      previewHtml: '',
    });

    expect(html).toContain('>10 / 6</span>');
    expect(html).toContain('10 active profiles and 6 locked');
    expect(html).toContain('lfa-profile-viewer-count-tooltip');
    expect(html).toContain('lfa-feed-group--plan-limited');
    expect(html).toContain('Upgrade to Pro to unlock all profiles.');
    expect(html).not.toContain('The feed owner needs Pro');
    expect(html).not.toContain('10 active · 6 locked');
  });

  it('refers to the owner only when another user is viewing a shared feed', () => {
    const html = renderFeedRow({
      feed: makeFeed({
        name: 'Shared limited feed',
        isShared: true,
        ownerDisplayName: 'Owner',
        memberCount: 16,
        activeMemberCount: 10,
        lockedMemberCount: 6,
      }),
      expanded: false,
      previewHtml: '',
    });

    expect(html).toContain('The feed owner needs Pro to unlock all profiles.');
    expect(html).not.toContain('Upgrade to Pro to unlock all profiles.');
  });

  it('shows collection progress only while Profile Visitors is actively syncing', () => {
    const collectingHtml = renderFeedRow({
      feed: makeFeed({
        isSystem: true,
        systemType: 'profileViewers',
        profileViewersCollectionProgress: {
          phase: 'visible',
          startedAt: 123,
        },
      }),
      expanded: false,
      previewHtml: '',
    });
    const idleHtml = renderFeedRow({
      feed: makeFeed({ isSystem: true, systemType: 'profileViewers' }),
      expanded: false,
      previewHtml: '',
    });

    expect(collectingHtml).toContain('Collecting profile visitors…');
    expect(collectingHtml).toContain('role="progressbar"');
    expect(idleHtml).not.toContain('lfa-profile-viewers-collection');
  });

  it('labels the private summary collection phase', () => {
    const html = renderFeedRow({
      feed: makeFeed({
        isSystem: true,
        systemType: 'profileViewers',
        profileViewersCollectionProgress: {
          phase: 'private_summary',
          startedAt: 123,
        },
      }),
      expanded: false,
      previewHtml: '',
    });

    expect(html).toContain('Checking private and recruiter views…');
  });
});

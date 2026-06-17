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
    expect(html).toContain('Auto-saved from LinkedIn');
    expect(html).toContain('>9 / 6</span>');
    expect(html).toContain('9 visible visitor entries saved');
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
});

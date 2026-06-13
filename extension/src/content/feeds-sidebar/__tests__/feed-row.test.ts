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
      feed: makeFeed({ isSystem: true, systemType: 'profileViewers' }),
      expanded: false,
      previewHtml: '',
    });

    expect(html).toContain('lfa-feed-pin');
    expect(html).toContain('lfa-feed-pin-tooltip');
    expect(html).toContain('You can hide this list in Settings');
    expect(html).toContain('lfa-feed-info');
    expect(html).toContain('lfa-feed-info-tooltip');
    expect(html).toContain('Auto-saved from LinkedIn');
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

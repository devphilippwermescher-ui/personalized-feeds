import { describe, expect, it } from 'vitest';
import { renderSidebarHeader } from '../template';

describe('settings menu', () => {
  it('renders the Hide Profile Visitors toggle disabled by default', () => {
    const html = renderSidebarHeader({
      logoUrl: 'chrome-extension://test/icon.png',
      currentUser: {
        userId: 'user-1',
        displayName: 'Test User',
        email: 'test@example.com',
        photoURL: '',
      },
      isPremium: true,
      featureSettings: {
        messagingButtons: true,
        postButtons: true,
        speechToComment: true,
        hideProfileViewers: false,
      },
    });

    expect(html).toContain('Hide Profile Visitors');
    expect(html).toContain('data-setting-toggle="hideProfileViewers"');
    expect(html).toContain('Background collection will continue');
    expect(html).toContain('aria-pressed="false"');
  });
});

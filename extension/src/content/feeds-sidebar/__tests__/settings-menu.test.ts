import { describe, expect, it } from 'vitest';
import { renderSidebarBody, renderSidebarHeader } from '../template';

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

  it('does not expose dashboard navigation while the dashboard is disabled', () => {
    const headerHtml = renderSidebarHeader({
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
    const signedOutBodyHtml = renderSidebarBody({
      isLoading: false,
      isInitializing: false,
      isPremium: false,
      currentUser: null,
      authErrorMessage: '',
      sidebarSearchQuery: '',
      activeFeedTab: 'owned',
      feedsListCount: 0,
      feedsHtml: '',
      editorOverlayHtml: '',
    });
    const freeUserBodyHtml = renderSidebarBody({
      isLoading: false,
      isInitializing: false,
      isPremium: false,
      currentUser: {
        userId: 'user-1',
        displayName: 'Test User',
        email: 'test@example.com',
        photoURL: '',
      },
      authErrorMessage: '',
      sidebarSearchQuery: '',
      activeFeedTab: 'owned',
      feedsListCount: 0,
      feedsHtml: '',
      editorOverlayHtml: '',
    });

    expect(headerHtml).not.toContain('id="lfa-header-dashboard-btn"');
    expect(headerHtml).not.toContain('id="lfa-manage-account-btn"');
    expect(headerHtml).not.toContain('id="lfa-profile-settings-btn"');
    expect(headerHtml).not.toContain('id="lfa-subscription-btn"');
    expect(signedOutBodyHtml).not.toContain('id="lfa-open-dashboard-btn"');
    expect(freeUserBodyHtml).not.toContain('id="lfa-open-subscription-btn"');
    expect(freeUserBodyHtml).not.toContain('id="lfa-open-subscription-activate"');
  });
});

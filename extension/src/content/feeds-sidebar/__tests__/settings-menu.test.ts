import { describe, expect, it } from 'vitest';
import { renderSidebarBody, renderSidebarHeader } from '../template';

describe('settings menu', () => {
  const featureSettings = {
    messagingButtons: true,
    postButtons: true,
    speechToComment: true,
    hideProfileViewers: false,
  };

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
      featureSettings,
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
      featureSettings,
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
    expect(freeUserBodyHtml).toContain('id="lfa-footer-get-pro-btn"');
    expect(freeUserBodyHtml).toContain('Get Pro');
  });

  it('hides plan state before authentication and renders a read-only Free badge after sign-in', () => {
    const signedOutHeader = renderSidebarHeader({
      logoUrl: 'chrome-extension://test/icon.png',
      currentUser: null,
      isPremium: false,
      featureSettings,
    });
    const signedInHeader = renderSidebarHeader({
      logoUrl: 'chrome-extension://test/icon.png',
      currentUser: {
        userId: 'user-1',
        displayName: 'Test User',
        email: 'test@example.com',
        photoURL: '',
      },
      isPremium: false,
      featureSettings,
    });

    expect(signedOutHeader).not.toContain('lfa-plan-badge');
    expect(signedInHeader).toContain('lfa-plan-badge--free');
    expect(signedInHeader).toContain('Current plan: Free');
    expect(signedInHeader).not.toContain('lfa-plan-toggle-btn');
    expect(signedInHeader).toContain('id="lfa-manage-plan-btn"');
    expect(signedInHeader).toContain('class="lfa-plan-star-glyph"');
    expect(signedInHeader).toContain('fill="none" stroke="currentColor"');
    expect(signedInHeader.indexOf('id="lfa-manage-plan-btn"')).toBeLessThan(
      signedInHeader.indexOf('id="lfa-account-signout-btn"')
    );
  });

  it('shows the normal feeds surface to authenticated Free users', () => {
    const html = renderSidebarBody({
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

    expect(html).toContain('id="lfa-tab-owned"');
    expect(html).toContain('id="lfa-add-feed-btn"');
    expect(html).not.toContain('Unlock custom feeds with a paid subscription');
    expect(html).toContain('Pro removes limits across Profile Visitors, feeds &amp; more');
    expect(html).toContain('id="lfa-footer-get-pro-btn"');
  });

  it('does not show the footer upsell to authenticated Pro users', () => {
    const html = renderSidebarBody({
      isLoading: false,
      isInitializing: false,
      isPremium: true,
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

    expect(html).not.toContain('id="lfa-footer-get-pro-btn"');
    expect(html).toContain('Support &amp; Feedback');
  });

  it('invites signed-out users to start with the Free plan', () => {
    const html = renderSidebarBody({
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

    expect(html).toContain('Sign in and try myFeedPilot for free');
    expect(html).toContain('no subscription required');
  });
});

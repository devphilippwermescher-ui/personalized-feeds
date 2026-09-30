import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { destroyMessagingDrawerButtons, initMessagingDrawerButtons } from '..';

const DRAWER_CARD_HTML = `
  <div class="msg-s-profile-card msg-s-profile-card-one-to-one ph3">
    <div class="artdeco-entity-lockup__title display-flex truncate align-items-center">
      <a class="profile-card-one-to-one__profile-link" href="/in/ACoAA-gabriel/">Gabriel P Bernes</a>
      <div class="artdeco-entity-lockup__badge">
        <span class="a11y-text">1st degree connection</span>
        <span class="artdeco-entity-lockup__degree" aria-hidden="true">· 1st</span>
      </div>
    </div>
    <div class="artdeco-entity-lockup__subtitle">Software Engineer</div>
  </div>
`;

describe('Messaging drawer button lifecycle', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.history.replaceState({}, '', '/feed/');
    vi.stubGlobal('chrome', {
      runtime: {
        getURL: (path: string) => `chrome-extension://test/${path}`,
      },
    });
  });

  afterEach(() => {
    destroyMessagingDrawerButtons();
    window.history.replaceState({}, '', '/');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('injects exactly one button into a drawer opened over the feed', async () => {
    const openPicker = vi.fn().mockResolvedValue(undefined);
    initMessagingDrawerButtons(openPicker);
    document.body.insertAdjacentHTML('beforeend', DRAWER_CARD_HTML);

    await vi.waitFor(() => {
      expect(document.querySelectorAll('.lfa-messaging-drawer-feed-btn-wrapper')).toHaveLength(1);
      expect(
        document.querySelector('.artdeco-entity-lockup__title > .lfa-messaging-drawer-feed-btn-wrapper:last-child')
      ).not.toBeNull();
    });

    document.querySelector<HTMLButtonElement>('.lfa-messaging-drawer-feed-btn-wrapper button')?.click();
    await vi.waitFor(() => {
      expect(openPicker).toHaveBeenCalledWith(expect.objectContaining({ linkedinUsername: 'ACoAA-gabriel' }));
    });
  });

  it('does not inject or move buttons on the full Messaging route', async () => {
    window.history.replaceState({}, '', '/messaging/thread/example/');
    document.body.innerHTML = DRAWER_CARD_HTML;

    initMessagingDrawerButtons(vi.fn().mockResolvedValue(undefined));
    await new Promise((resolve) => window.setTimeout(resolve, 50));

    expect(document.querySelector('.lfa-messaging-drawer-feed-btn-wrapper')).toBeNull();
  });

  it('finds a drawer rendered in a reachable same-origin frame', async () => {
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    const frameDocument = frame.contentDocument;
    expect(frameDocument).not.toBeNull();
    frameDocument?.body.insertAdjacentHTML('beforeend', DRAWER_CARD_HTML);

    initMessagingDrawerButtons(vi.fn().mockResolvedValue(undefined));

    await vi.waitFor(() => {
      expect(frameDocument?.querySelectorAll('.lfa-messaging-drawer-feed-btn-wrapper')).toHaveLength(1);
    });
  });

  it('finds and styles the drawer rendered inside an open shadow root', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadowRoot = host.attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = DRAWER_CARD_HTML;

    initMessagingDrawerButtons(vi.fn().mockResolvedValue(undefined));

    await vi.waitFor(() => {
      expect(shadowRoot.querySelectorAll('.lfa-messaging-drawer-feed-btn-wrapper')).toHaveLength(1);
      expect(shadowRoot.querySelector('#lfa-messaging-drawer-buttons-styles')).not.toBeNull();
      expect(
        shadowRoot.querySelector('.artdeco-entity-lockup__title > .lfa-messaging-drawer-feed-btn-wrapper:last-child')
      ).not.toBeNull();
    });
  });
});

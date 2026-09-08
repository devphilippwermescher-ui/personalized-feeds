import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { destroyMessagingButtons, initMessagingButtons } from '../index';
import { registerContentRuntime } from '../../runtime/content-runtime-registration';

describe('Messaging button lifecycle', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.history.replaceState({}, '', '/feed/');
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 24));
    vi.stubGlobal('chrome', {
      runtime: {
        getURL: (path: string) => `chrome-extension://test/${path}`,
      },
    });
  });

  afterEach(() => {
    destroyMessagingButtons();
    window.history.replaceState({}, '', '/');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('starts observing before Messaging opens and injects after the SPA renders a conversation', async () => {
    initMessagingButtons();
    expect(document.querySelector('.lfa-messaging-feed-btn')).toBeNull();

    window.history.replaceState({}, '', '/messaging/thread/example/');
    document.body.insertAdjacentHTML(
      'beforeend',
      `
        <section class="msg-thread__profile-card">
          <img src="https://media.licdn.com/gabriel.jpg" alt="Gabriel P Bernes" />
          <a href="https://www.linkedin.com/in/gabriel-bernes/">Gabriel P Bernes</a>
          <span class="msg-thread__connection-degree">· 1st</span>
        </section>
      `
    );

    await vi.waitFor(() => {
      expect(document.querySelector('.lfa-messaging-feed-btn')?.textContent).toContain('Add to feed');
    });
  });

  it('ignores hidden cached profiles and binds only the visible conversation profile', async () => {
    window.history.replaceState({}, '', '/messaging/thread/example/');
    document.body.innerHTML = `
      <section style="display: none">
        <a href="/in/kedar-kotkunde/">Kedar Kotkunde</a>
        <p><span>· 3rd+</span></p>
      </section>
      <section class="msg-thread__profile-card">
        <a href="/in/gabriel-p-bernes/">Gabriel P Bernes</a>
        <div class="identity-row"><strong>Gabriel P Bernes</strong> · 1st</div>
      </section>
    `;

    initMessagingButtons();

    await vi.waitFor(() => {
      const wrappers = document.querySelectorAll<HTMLElement>('.lfa-messaging-feed-btn-wrapper');
      expect(wrappers).toHaveLength(1);
      expect(wrappers[0].dataset.lfaMessagingProfileKey).toBe('gabriel-p-bernes');
    });
  });

  it('supports an embedded Messaging surface and delegates its picker to the supplied top-frame opener', async () => {
    const openTopFramePicker = vi.fn().mockResolvedValue(undefined);
    window.history.replaceState({}, '', '/preload/');
    document.body.innerHTML = `
      <div class="msg-s-profile-card msg-s-profile-card-one-to-one">
        <div class="artdeco-entity-lockup__title display-flex align-items-center">
          <a class="profile-card-one-to-one__profile-link" href="/in/ACoAACRPshYBLCHxtTUH4Cl1mCZPtGURwL_hJv8">
            Gabriel P Bernes
          </a>
          <div class="artdeco-entity-lockup__badge">
            <span class="a11y-text">1st degree connection</span>
            <span class="artdeco-entity-lockup__degree" aria-hidden="true">· 1st</span>
          </div>
        </div>
      </div>
    `;

    initMessagingButtons({
      isSurfaceActive: () => true,
      openProfileFeedPicker: openTopFramePicker,
    });

    const button = document.querySelector<HTMLButtonElement>('.lfa-messaging-feed-btn');
    expect(button).not.toBeNull();
    button?.click();

    await vi.waitFor(() => {
      expect(openTopFramePicker).toHaveBeenCalledOnce();
      expect(openTopFramePicker).toHaveBeenCalledWith(
        expect.objectContaining({
          linkedinUsername: 'ACoAACRPshYBLCHxtTUH4Cl1mCZPtGURwL_hJv8',
          displayName: 'Gabriel P Bernes',
        })
      );
    });
  });

  it('keeps observing SPA hydration when the same content build is evaluated twice', async () => {
    const runtimeHost = {} as Window;
    const dispose = vi.fn(() => destroyMessagingButtons());
    const refresh = vi.fn(() => initMessagingButtons());

    registerContentRuntime(runtimeHost, 'build-1', initMessagingButtons, dispose, refresh);
    expect(registerContentRuntime(runtimeHost, 'build-1', initMessagingButtons, vi.fn())).toBe(false);
    expect(dispose).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledOnce();

    window.history.replaceState({}, '', '/messaging/thread/example/');
    document.body.insertAdjacentHTML(
      'beforeend',
      `
        <div class="msg-s-profile-card msg-s-profile-card-one-to-one">
          <div class="artdeco-entity-lockup__title display-flex align-items-center">
            <a class="profile-card-one-to-one__profile-link" href="/in/ACoAACRPshYBLCHxtTUH4Cl1mCZPtGURwL_hJv8">
              Gabriel P Bernes
            </a>
            <div class="artdeco-entity-lockup__badge">
              <span class="a11y-text">1st degree connection</span>
              <span class="artdeco-entity-lockup__degree" aria-hidden="true">· 1st</span>
            </div>
          </div>
          <div class="artdeco-entity-lockup__subtitle">Software Engineer</div>
        </div>
      `
    );

    await vi.waitFor(() => {
      expect(document.querySelectorAll('.lfa-messaging-feed-btn')).toHaveLength(1);
    });
  });

  it('injects when LinkedIn updates the URL after rendering the conversation', async () => {
    initMessagingButtons();
    document.body.insertAdjacentHTML(
      'beforeend',
      `
        <section class="msg-thread__profile-card">
          <img src="https://media.licdn.com/gabriel.jpg" alt="Gabriel P Bernes" />
          <a href="https://www.linkedin.com/in/gabriel-bernes/">Gabriel P Bernes</a>
          <span class="msg-thread__connection-degree">· 1st</span>
        </section>
      `
    );

    await new Promise((resolve) => window.setTimeout(resolve, 100));
    expect(document.querySelector('.lfa-messaging-feed-btn')).toBeNull();

    window.history.replaceState({}, '', '/messaging/thread/example/');

    await vi.waitFor(() => {
      expect(document.querySelector('.lfa-messaging-feed-btn')?.textContent).toContain('Add to feed');
    });
  });

  it('injects when LinkedIn hydrates the profile href after the conversation is visible', async () => {
    window.history.replaceState({}, '', '/messaging/thread/example/');
    document.body.innerHTML = `
      <section data-view-name="messaging-profile-card">
        <a class="profile-link" href="#">Gabriel P Bernes</a>
        <div class="identity-row"><strong>Gabriel P Bernes</strong> · 1st</div>
      </section>
    `;
    initMessagingButtons();
    expect(document.querySelector('.lfa-messaging-feed-btn')).toBeNull();

    document.querySelector<HTMLAnchorElement>('.profile-link')?.setAttribute('href', '/in/gabriel-p-bernes/');

    await vi.waitFor(() => {
      const button = document.querySelector('.identity-row > .lfa-messaging-feed-btn-wrapper');
      expect(button?.textContent).toContain('Add to feed');
    });
  });

  it('reinjects once without reload when LinkedIn replaces the identity row', async () => {
    window.history.replaceState({}, '', '/messaging/thread/example/');
    document.body.innerHTML = `
      <section data-view-name="messaging-profile-card">
        <a href="/in/gabriel-p-bernes/">Gabriel P Bernes</a>
        <div class="identity-row"><strong>Gabriel P Bernes</strong> · 1st</div>
      </section>
    `;
    initMessagingButtons();

    await vi.waitFor(() => {
      expect(document.querySelectorAll('.lfa-messaging-feed-btn')).toHaveLength(1);
    });

    const card = document.querySelector<HTMLElement>('[data-view-name="messaging-profile-card"]');
    document.querySelector('.identity-row')?.remove();
    card?.insertAdjacentHTML('beforeend', '<div class="identity-row"><strong>Gabriel P Bernes</strong> · 1st</div>');

    await vi.waitFor(() => {
      expect(document.querySelectorAll('.lfa-messaging-feed-btn')).toHaveLength(1);
      expect(document.querySelector('.identity-row > .lfa-messaging-feed-btn-wrapper')).not.toBeNull();
    });
  });

  it('injects only one button when the degree has visible and accessibility representations', async () => {
    window.history.replaceState({}, '', '/messaging/thread/example/');
    document.body.innerHTML = `
      <section class="msg-thread__profile-card">
        <div class="identity-row">
          <a href="/in/gabriel-p-bernes/">Gabriel P Bernes</a>
          <span aria-label="1st degree connection"></span>
          <span class="visible-degree">· 1st</span>
        </div>
      </section>
    `;

    initMessagingButtons();

    await vi.waitFor(() => {
      expect(document.querySelectorAll('.lfa-messaging-feed-btn')).toHaveLength(1);
      expect(document.querySelector('.identity-row > .lfa-messaging-feed-btn-wrapper:last-child')).not.toBeNull();
    });
  });

  it('removes a previously injected accessibility duplicate and keeps the visible binding', async () => {
    window.history.replaceState({}, '', '/messaging/thread/example/');
    document.body.innerHTML = `
      <section class="msg-thread__profile-card">
        <div class="identity-row">
          <a href="/in/gabriel-p-bernes/">Gabriel P Bernes</a>
          <span class="accessible-degree" aria-label="1st degree connection" data-lfa-messaging-feed-bound="gabriel-p-bernes"></span>
          <span class="lfa-messaging-feed-btn-wrapper" data-lfa-messaging-profile-key="gabriel-p-bernes"><button class="lfa-messaging-feed-btn">Add to feed</button></span>
          <span class="visible-degree" data-lfa-messaging-feed-bound="gabriel-p-bernes">· 1st</span>
          <span class="lfa-messaging-feed-btn-wrapper" data-lfa-messaging-profile-key="gabriel-p-bernes"><button class="lfa-messaging-feed-btn">Add to feed</button></span>
        </div>
      </section>
    `;

    initMessagingButtons();

    await vi.waitFor(() => {
      expect(document.querySelectorAll('.lfa-messaging-feed-btn')).toHaveLength(1);
      expect(document.querySelector('.identity-row > .lfa-messaging-feed-btn-wrapper:last-child')).not.toBeNull();
      expect(document.querySelector('.accessible-degree')?.hasAttribute('data-lfa-messaging-feed-bound')).toBe(false);
    });
  });

  it('inserts after LinkedIn visible degree instead of after its accessibility label', async () => {
    window.history.replaceState({}, '', '/messaging/thread/example/');
    document.body.innerHTML = `
      <div class="msg-s-profile-card msg-s-profile-card-one-to-one">
        <div class="artdeco-entity-lockup">
          <a href="/in/ACoAACRPshYBLCHxtTUH4Cl1mCZPtGURwL_hJv8"><img src="avatar.jpg" /></a>
          <div class="artdeco-entity-lockup__content">
            <div class="artdeco-entity-lockup__title display-flex align-items-center">
              <span><a class="profile-card-one-to-one__profile-link" href="/in/ACoAACRPshYBLCHxtTUH4Cl1mCZPtGURwL_hJv8">Gabriel P Bernes</a></span>
              <div class="artdeco-entity-lockup__badge">
                <span class="a11y-text">1st degree connection</span>
                <span class="artdeco-entity-lockup__degree" aria-hidden="true">·&nbsp;1st</span>
              </div>
            </div>
            <div class="artdeco-entity-lockup__subtitle">Software Engineer</div>
          </div>
        </div>
      </div>
    `;

    initMessagingButtons();

    await vi.waitFor(() => {
      expect(document.querySelectorAll('.lfa-messaging-feed-btn')).toHaveLength(1);
      expect(
        document.querySelector('.artdeco-entity-lockup__title > .lfa-messaging-feed-btn-wrapper:last-child')
      ).not.toBeNull();
      expect(document.querySelector('.a11y-text + .lfa-messaging-feed-btn-wrapper')).toBeNull();
    });
  });
});

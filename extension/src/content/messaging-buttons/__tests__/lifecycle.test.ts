import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { destroyMessagingButtons, initMessagingButtons } from '../index';

describe('Messaging button lifecycle', () => {
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
    destroyMessagingButtons();
    window.history.replaceState({}, '', '/');
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
});

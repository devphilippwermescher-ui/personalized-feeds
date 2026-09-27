import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  refreshLinkedInContentRuntime: vi.fn(),
}));

vi.mock('../reinject-linkedin-content-runtime', () => ({
  refreshLinkedInContentRuntime: mocks.refreshLinkedInContentRuntime,
}));

import { registerLinkedInContentRuntimeRestoration } from '../register-linkedin-content-runtime';

describe('LinkedIn content runtime navigation restoration', () => {
  let historyListener!: (details: { tabId: number; frameId: number; url: string }) => void;
  let tabUpdatedListener!: (
    tabId: number,
    changeInfo: { status?: string; url?: string },
    tab: { url?: string }
  ) => void;

  beforeEach(() => {
    mocks.refreshLinkedInContentRuntime.mockReset();
    vi.stubGlobal('chrome', {
      webNavigation: {
        onHistoryStateUpdated: {
          addListener: vi.fn((listener: typeof historyListener) => {
            historyListener = listener;
          }),
        },
      },
      tabs: {
        onUpdated: {
          addListener: vi.fn((listener: typeof tabUpdatedListener) => {
            tabUpdatedListener = listener;
          }),
        },
      },
    });
    registerLinkedInContentRuntimeRestoration();
  });

  it('refreshes the content runtime after LinkedIn SPA navigation', () => {
    historyListener({
      tabId: 17,
      frameId: 0,
      url: 'https://www.linkedin.com/messaging/thread/example/',
    });

    expect(mocks.refreshLinkedInContentRuntime).toHaveBeenCalledWith(17);
  });

  it('ignores subframes and non-LinkedIn pages', () => {
    historyListener({ tabId: 17, frameId: 1, url: 'https://www.linkedin.com/messaging/' });
    historyListener({ tabId: 18, frameId: 0, url: 'https://example.com/messaging/' });

    expect(mocks.refreshLinkedInContentRuntime).not.toHaveBeenCalled();
  });

  it('refreshes after a LinkedIn tab completes loading', () => {
    tabUpdatedListener(23, { status: 'complete' }, { url: 'https://www.linkedin.com/messaging/' });

    expect(mocks.refreshLinkedInContentRuntime).toHaveBeenCalledWith(23);
  });
});

import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FeedShareRecipient } from '../components/FeedActionModals/types';
import { ShareFeedModal } from '../components/FeedActionModals/ShareFeedModal';

describe('Share feed modal realtime recipients', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('does not let an older load response overwrite a realtime update', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    let resolveLoad: ((shares: FeedShareRecipient[]) => void) | undefined;
    let pushShares: ((shares: FeedShareRecipient[]) => void) | undefined;
    const onLoadShares = vi.fn(
      () =>
        new Promise<FeedShareRecipient[]>((resolve) => {
          resolveLoad = resolve;
        })
    );

    flushSync(() => {
      root.render(
        createElement(ShareFeedModal, {
          onClose: vi.fn(),
          onLoadShares,
          onWatchShares: (listener) => {
            pushShares = listener;
            return vi.fn();
          },
          onShareByEmail: vi.fn(async () => ({ success: true })),
          onUpdateShareRole: vi.fn(async () => ({ success: true })),
          onRemoveShare: vi.fn(async () => ({ success: true })),
          onGetLink: vi.fn(async () => ({ success: true, url: 'https://example.com' })),
          onSharingLimit: vi.fn(),
        })
      );
    });

    await vi.waitFor(() => expect(pushShares).toBeTypeOf('function'));
    pushShares?.([
      {
        targetUid: 'new-user',
        targetEmail: 'new@example.com',
        displayName: 'Realtime User',
        role: 'reader',
      },
    ]);
    resolveLoad?.([
      {
        targetUid: 'old-user',
        targetEmail: 'old@example.com',
        displayName: 'Stale User',
        role: 'reader',
      },
    ]);

    await vi.waitFor(() => expect(document.body.textContent).toContain('Realtime User'));
    expect(document.body.textContent).not.toContain('Stale User');
    root.unmount();
  });
});

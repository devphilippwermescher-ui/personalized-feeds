import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolvePendingOffscreenAuth, startOffscreenAuth } from '../services/offscreen-google-auth-service';

describe('offscreen Google authentication', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('waits for a newly-created receiver and shares one active sign-in attempt', async () => {
    let offscreenDocumentExists = false;
    const sendMessage = vi.fn(async (message: { type?: string }) => {
      const pingAttempts = sendMessage.mock.calls.filter(([sent]) => sent.type === 'OFFSCREEN_AUTH_PING').length;
      if (message.type === 'OFFSCREEN_AUTH_PING' && pingAttempts === 1) {
        throw new Error('Could not establish connection. Receiving end does not exist.');
      }
      if (message.type === 'OFFSCREEN_AUTH_PING') {
        return { success: true, ready: true };
      }
      if (message.type === 'OFFSCREEN_AUTH_START') {
        return { success: true };
      }
      return undefined;
    });
    const closeDocument = vi.fn(async () => {
      offscreenDocumentExists = false;
    });

    vi.stubGlobal('chrome', {
      runtime: {
        ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' },
        getContexts: vi.fn(async () => (offscreenDocumentExists ? [{}] : [])),
        getURL: vi.fn(() => 'chrome-extension://example/offscreen.html'),
        sendMessage,
      },
      offscreen: {
        Reason: { IFRAME_SCRIPTING: 'IFRAME_SCRIPTING' },
        createDocument: vi.fn(async () => {
          offscreenDocumentExists = true;
        }),
        closeDocument,
      },
    });

    const firstAttempt = startOffscreenAuth();
    const repeatedAttempt = startOffscreenAuth();

    expect(repeatedAttempt).toBe(firstAttempt);
    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({ type: 'OFFSCREEN_AUTH_START' });
    });

    resolvePendingOffscreenAuth({
      success: true,
      idToken: 'id-token',
      accessToken: 'access-token',
    });

    await expect(firstAttempt).resolves.toEqual({
      success: true,
      idToken: 'id-token',
      accessToken: 'access-token',
    });
    expect(sendMessage.mock.calls.filter(([message]) => message.type === 'OFFSCREEN_AUTH_START')).toHaveLength(1);
    expect(closeDocument).toHaveBeenCalledOnce();
  });
});

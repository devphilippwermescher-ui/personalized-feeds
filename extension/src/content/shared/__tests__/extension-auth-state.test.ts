import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadExtensionAuthState, onExtensionAuthStateChange } from '../extension-auth-state';

type StorageListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string
) => void;

function installChromeMock(response: unknown) {
  let storageListener: StorageListener | null = null;
  const removeListener = vi.fn();
  const sendMessage = vi.fn((_message: unknown, callback: (value: unknown) => void) => callback(response));

  vi.stubGlobal('chrome', {
    runtime: {
      sendMessage,
      lastError: undefined,
    },
    storage: {
      onChanged: {
        addListener: vi.fn((listener: StorageListener) => {
          storageListener = listener;
        }),
        removeListener,
      },
    },
  });

  return {
    sendMessage,
    removeListener,
    emitStorageChange: (newValue: unknown) => {
      storageListener?.(
        {
          feedsUserInfo: {
            oldValue: undefined,
            newValue,
          },
        },
        'local'
      );
    },
  };
}

describe('extension auth state', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('loads the authoritative authenticated state from the background', async () => {
    const { sendMessage } = installChromeMock({ isAuthenticated: true, userId: 'user-1' });

    await expect(loadExtensionAuthState()).resolves.toBe(true);
    expect(sendMessage).toHaveBeenCalledWith({ type: 'FEEDS_GET_AUTH_STATE' }, expect.any(Function));
  });

  it('defaults to signed out when the background cannot confirm a session', async () => {
    installChromeMock({ isAuthenticated: false });
    await expect(loadExtensionAuthState()).resolves.toBe(false);
  });

  it('reports login and logout storage changes and stops after disposal', async () => {
    const chromeMock = installChromeMock({ isAuthenticated: false });
    const callback = vi.fn();
    const dispose = onExtensionAuthStateChange(callback);

    await vi.waitFor(() => expect(callback).toHaveBeenLastCalledWith(false));
    chromeMock.emitStorageChange({ isAuthenticated: true, userId: 'user-1' });
    expect(callback).toHaveBeenLastCalledWith(true);

    chromeMock.emitStorageChange(undefined);
    expect(callback).toHaveBeenLastCalledWith(false);

    dispose();
    expect(chromeMock.removeListener).toHaveBeenCalledOnce();
  });

  it('does not let a slower initial check overwrite a newer login event', async () => {
    let resolveAuthRequest: (value: unknown) => void = () => {
      throw new Error('Auth request was not registered');
    };
    let storageListener: StorageListener = () => {
      throw new Error('Storage listener was not registered');
    };
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: vi.fn((_message: unknown, callback: (value: unknown) => void) => {
          resolveAuthRequest = callback;
        }),
        lastError: undefined,
      },
      storage: {
        onChanged: {
          addListener: vi.fn((listener: StorageListener) => {
            storageListener = listener;
          }),
          removeListener: vi.fn(),
        },
      },
    });
    const callback = vi.fn();
    const dispose = onExtensionAuthStateChange(callback);

    storageListener(
      {
        feedsUserInfo: {
          oldValue: undefined,
          newValue: { isAuthenticated: true, userId: 'user-1' },
        },
      },
      'local'
    );
    resolveAuthRequest({ isAuthenticated: false });
    await Promise.resolve();

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenLastCalledWith(true);
    dispose();
  });
});

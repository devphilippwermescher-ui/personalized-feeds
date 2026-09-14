import type { UserFeatureSettings } from 'shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  destroyMessagingButtons: vi.fn(),
  initMessagingButtons: vi.fn(),
  loadFeatureSettings: vi.fn(),
  onExtensionAuthStateChange: vi.fn(),
  onFeatureSettingsChange: vi.fn(),
  stopAuthListener: vi.fn(),
  stopSettingsListener: vi.fn(),
}));

vi.mock('../../../feature-settings', () => ({
  loadFeatureSettings: mocks.loadFeatureSettings,
  onFeatureSettingsChange: mocks.onFeatureSettingsChange,
}));
vi.mock('../../index', () => ({
  destroyMessagingButtons: mocks.destroyMessagingButtons,
  initMessagingButtons: mocks.initMessagingButtons,
}));
vi.mock('../../services/top-frame-feed-picker', () => ({
  openTopFrameFeedPicker: vi.fn(),
}));
vi.mock('../../../shared/extension-auth-state', () => ({
  onExtensionAuthStateChange: mocks.onExtensionAuthStateChange,
}));

import { registerMessagingPreloadFrameRuntime } from '../preload-frame-controller';

const enabledSettings: UserFeatureSettings = {
  messagingButtons: true,
  postButtons: true,
  speechToComment: true,
  hideProfileViewers: false,
};

describe('Messaging preload frame auth gate', () => {
  let notifyAuthState: (authenticated: boolean) => void;

  beforeEach(() => {
    mocks.loadFeatureSettings.mockResolvedValue(enabledSettings);
    mocks.onExtensionAuthStateChange.mockImplementation((callback: typeof notifyAuthState) => {
      notifyAuthState = callback;
      return mocks.stopAuthListener;
    });
    mocks.onFeatureSettingsChange.mockReturnValue(mocks.stopSettingsListener);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('starts buttons only after authentication and removes them on logout', async () => {
    const dispose = registerMessagingPreloadFrameRuntime();
    await vi.waitFor(() => expect(mocks.loadFeatureSettings).toHaveBeenCalledOnce());

    expect(mocks.initMessagingButtons).not.toHaveBeenCalled();

    notifyAuthState(true);
    expect(mocks.initMessagingButtons).toHaveBeenCalledOnce();

    notifyAuthState(false);
    expect(mocks.destroyMessagingButtons).toHaveBeenCalled();

    dispose();
    expect(mocks.stopAuthListener).toHaveBeenCalledOnce();
    expect(mocks.stopSettingsListener).toHaveBeenCalledOnce();
  });

  it('does not start buttons for an authenticated user when the feature is disabled', async () => {
    mocks.loadFeatureSettings.mockResolvedValue({ ...enabledSettings, messagingButtons: false });
    const dispose = registerMessagingPreloadFrameRuntime();
    notifyAuthState(true);
    await vi.waitFor(() => expect(mocks.loadFeatureSettings).toHaveBeenCalledOnce());

    expect(mocks.initMessagingButtons).not.toHaveBeenCalled();
    dispose();
  });
});

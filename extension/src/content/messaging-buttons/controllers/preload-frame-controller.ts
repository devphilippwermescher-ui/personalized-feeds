import { loadFeatureSettings, onFeatureSettingsChange } from '../../feature-settings';
import { destroyMessagingButtons, initMessagingButtons } from '../index';
import { openTopFrameFeedPicker } from '../services/top-frame-feed-picker';
import { onExtensionAuthStateChange } from '../../shared/extension-auth-state';

function isTopLevelMessagingRoute(): boolean {
  const topWindow = window.top;
  if (!topWindow || window === topWindow) return false;

  try {
    return /^\/messaging(?:\/|$)/i.test(topWindow.location.pathname);
  } catch {
    return false;
  }
}

export function registerMessagingPreloadFrameRuntime(): () => void {
  let disposed = false;
  let authenticated = false;
  let messagingButtonsEnabled = false;

  const applyMessagingButtons = (): void => {
    if (disposed) return;

    if (authenticated && messagingButtonsEnabled) {
      initMessagingButtons({
        isSurfaceActive: isTopLevelMessagingRoute,
        openProfileFeedPicker: openTopFrameFeedPicker,
      });
    } else {
      destroyMessagingButtons();
    }
  };

  void loadFeatureSettings()
    .then((settings) => {
      messagingButtonsEnabled = settings.messagingButtons;
      applyMessagingButtons();
    })
    .catch(() => {
      // The frame can disappear while LinkedIn is completing SPA navigation.
    });

  const stopSettingsListener = onFeatureSettingsChange((settings) => {
    messagingButtonsEnabled = settings.messagingButtons;
    applyMessagingButtons();
  });
  const stopAuthStateListener = onExtensionAuthStateChange((nextAuthenticated) => {
    authenticated = nextAuthenticated;
    applyMessagingButtons();
  });

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    stopSettingsListener();
    stopAuthStateListener();
    destroyMessagingButtons();
    window.removeEventListener('pagehide', dispose);
  };

  window.addEventListener('pagehide', dispose, { once: true });
  return dispose;
}

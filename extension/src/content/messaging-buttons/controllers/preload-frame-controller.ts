import { loadFeatureSettings, onFeatureSettingsChange } from '../../feature-settings';
import { destroyMessagingButtons, initMessagingButtons } from '../index';
import { openTopFrameFeedPicker } from '../services/top-frame-feed-picker';

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

  const applyMessagingSetting = (enabled: boolean): void => {
    if (disposed) return;

    if (enabled) {
      initMessagingButtons({
        isSurfaceActive: isTopLevelMessagingRoute,
        openProfileFeedPicker: openTopFrameFeedPicker,
      });
    } else {
      destroyMessagingButtons();
    }
  };

  void loadFeatureSettings()
    .then((settings) => applyMessagingSetting(settings.messagingButtons))
    .catch(() => {
      // The frame can disappear while LinkedIn is completing SPA navigation.
    });

  const stopSettingsListener = onFeatureSettingsChange((settings) => {
    applyMessagingSetting(settings.messagingButtons);
  });

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    stopSettingsListener();
    destroyMessagingButtons();
    window.removeEventListener('pagehide', dispose);
  };

  window.addEventListener('pagehide', dispose, { once: true });
  return dispose;
}

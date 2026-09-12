import '../runtime/set-public-path';

/**
 * Content script entry point for Personalized Feeds.
 *
 * Initializes:
 *   - post-buttons       — "Add to feed" buttons on LinkedIn feed posts
 *   - messaging-buttons  — "Add to feed" buttons on LinkedIn messaging profile cards
 *   - speech-to-comment  — floating mic button for voice comments
 *
 * Responds to feature-settings changes from background so toggles take
 * effect without requiring a page reload.
 */

import { loadFeatureSettings, onFeatureSettingsChange } from './feature-settings';
import { DASHBOARD_ANALYTICS_SYNC_ENABLED } from 'shared/feature-flags';
import { initLinkedInAnalyticsPassiveCapture } from './linkedin-analytics/passive-capture';
import { initNativeInviteTracking } from './native-invite-tracking/controller';
import { destroyPostButtons, initPostButtons } from './post-buttons';
import { destroyMessagingButtons, initMessagingButtons } from './messaging-buttons';
import { destroyMessagingDrawerButtons, initMessagingDrawerButtons } from './messaging-buttons/drawer';
import { openProfileFeedPicker } from './post-buttons/public';
import { destroySpeechToCommentButton } from './speech-to-comment/controller';
import type { UserFeatureSettings } from 'shared/types';
import {
  CONTENT_RUNTIME_PING,
  CONTENT_RUNTIME_REFRESH,
  type ContentRuntimeMessage,
  type ContentRuntimePingResponse,
} from '../shared/content-runtime';
import { registerContentRuntime } from './runtime/content-runtime-registration';
import { isMessagingProfilePickerOpenMessage, type MessagingProfilePickerResponse } from '../shared/messaging-buttons';

const CONTENT_BOOTSTRAP_DELAY_MS = 100;

let featureSettings: UserFeatureSettings = {
  messagingButtons: true,
  postButtons: true,
  speechToComment: true,
  hideProfileViewers: false,
};

let domReady = false;
let stopFeatureSettingsListener: (() => void) | null = null;
let contentRuntimeMessageListener:
  | ((
      message: unknown,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response: ContentRuntimePingResponse | MessagingProfilePickerResponse) => void
    ) => boolean)
  | null = null;
let originalPushState: History['pushState'] | null = null;
let originalReplaceState: History['replaceState'] | null = null;
let patchedPushState: History['pushState'] | null = null;
let patchedReplaceState: History['replaceState'] | null = null;
let pageReadyTimer: number | null = null;

function applyFeatureUI(): void {
  if (featureSettings.messagingButtons) {
    initMessagingButtons({ openProfileFeedPicker });
    initMessagingDrawerButtons(openProfileFeedPicker);
  } else {
    destroyMessagingButtons();
    destroyMessagingDrawerButtons();
  }

  if (featureSettings.postButtons) {
    initPostButtons();
  } else {
    destroyPostButtons();
  }

  destroySpeechToCommentButton();
  // if (featureSettings.speechToComment) {
  //   initSpeechToCommentButton();
  // } else {
  //   destroySpeechToCommentButton();
  // }
}

function applyFeatureSettings(nextSettings: UserFeatureSettings): void {
  featureSettings = nextSettings;
  if (domReady) {
    applyFeatureUI();
  }
}

// ── Bootstrap ────────────────────────────────────────────────────────

let linkedinActivityTimer: number | undefined;

function notifyLinkedInActivity(): void {
  window.clearTimeout(linkedinActivityTimer);
  linkedinActivityTimer = window.setTimeout(() => {
    chrome.runtime.sendMessage({ type: 'PROFILE_VIEWERS_LINKEDIN_ACTIVITY' }).catch(() => {
      /* background may be unavailable while the extension is reloading */
    });
  }, 500);
}

function onPageReady(): void {
  pageReadyTimer = null;
  domReady = true;
  applyFeatureUI();
  notifyLinkedInActivity();
}

function schedulePageReady(): void {
  if (pageReadyTimer !== null) {
    window.clearTimeout(pageReadyTimer);
  }
  pageReadyTimer = window.setTimeout(onPageReady, CONTENT_BOOTSTRAP_DELAY_MS);
}

// ── SPA route change handling ────────────────────────────────────────

let lastUrl = location.href;

function onRouteChange(): void {
  const currentUrl = location.href;
  if (currentUrl === lastUrl) return;
  lastUrl = currentUrl;

  if (domReady) {
    window.setTimeout(applyFeatureUI, 300);
    notifyLinkedInActivity();
  }
}

function patchHistoryMethods(): void {
  originalPushState = history.pushState;
  originalReplaceState = history.replaceState;
  patchedPushState = function (...args: Parameters<typeof history.pushState>) {
    originalPushState?.apply(history, args);
    onRouteChange();
  };
  patchedReplaceState = function (...args: Parameters<typeof history.replaceState>) {
    originalReplaceState?.apply(history, args);
    onRouteChange();
  };
  history.pushState = patchedPushState;
  history.replaceState = patchedReplaceState;
}

function restoreHistoryMethods(): void {
  if (patchedPushState && history.pushState === patchedPushState && originalPushState) {
    history.pushState = originalPushState;
  }
  if (patchedReplaceState && history.replaceState === patchedReplaceState && originalReplaceState) {
    history.replaceState = originalReplaceState;
  }
  originalPushState = null;
  originalReplaceState = null;
  patchedPushState = null;
  patchedReplaceState = null;
}

function disposeContentRuntime(): void {
  destroyPostButtons();
  destroyMessagingButtons();
  destroyMessagingDrawerButtons();
  destroySpeechToCommentButton();
  try {
    stopFeatureSettingsListener?.();
  } catch {
    // The previous extension context is expected to be invalid after Reload.
  }
  stopFeatureSettingsListener = null;

  if (contentRuntimeMessageListener) {
    try {
      chrome.runtime.onMessage.removeListener(contentRuntimeMessageListener);
    } catch {
      // The previous extension context is expected to be invalid after Reload.
    }
    contentRuntimeMessageListener = null;
  }

  window.removeEventListener('load', schedulePageReady);
  window.removeEventListener('popstate', onRouteChange);
  restoreHistoryMethods();
  if (pageReadyTimer !== null) {
    window.clearTimeout(pageReadyTimer);
    pageReadyTimer = null;
  }
  window.clearTimeout(linkedinActivityTimer);
  linkedinActivityTimer = undefined;
  domReady = false;
}

function initializeContentRuntime(): void {
  console.info('[content-runtime] Initialized LinkedIn content runtime', {
    buildId: __MFP_CONTENT_BUILD_ID__,
    url: window.location.href,
    readyState: document.readyState,
  });
  contentRuntimeMessageListener = (
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: ContentRuntimePingResponse | MessagingProfilePickerResponse) => void
  ): boolean => {
    if (isMessagingProfilePickerOpenMessage(message)) {
      void openProfileFeedPicker(message.profile)
        .then(() => sendResponse({ success: true }))
        .catch((error: unknown) => {
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      return true;
    }

    if (typeof message !== 'object' || message === null || !('type' in message)) return false;
    const runtimeMessage = message as ContentRuntimeMessage;
    if (runtimeMessage.type !== CONTENT_RUNTIME_PING && runtimeMessage.type !== CONTENT_RUNTIME_REFRESH) return false;

    if (runtimeMessage.type === CONTENT_RUNTIME_REFRESH && domReady) {
      console.info('[content-runtime] Refresh received', { url: window.location.href });
      applyFeatureUI();
    }

    sendResponse({ ready: true });
    return false;
  };
  chrome.runtime.onMessage.addListener(contentRuntimeMessageListener);

  void loadFeatureSettings().then(applyFeatureSettings);
  stopFeatureSettingsListener = onFeatureSettingsChange(applyFeatureSettings);
  if (DASHBOARD_ANALYTICS_SYNC_ENABLED) {
    initNativeInviteTracking();
    initLinkedInAnalyticsPassiveCapture();
  }

  if (document.readyState === 'complete') {
    schedulePageReady();
  } else {
    window.addEventListener('load', schedulePageReady, { once: true });
  }

  patchHistoryMethods();
  window.addEventListener('popstate', onRouteChange);
}

registerContentRuntime(window, __MFP_CONTENT_BUILD_ID__, initializeContentRuntime, disposeContentRuntime, () => {
  if (domReady) applyFeatureUI();
});

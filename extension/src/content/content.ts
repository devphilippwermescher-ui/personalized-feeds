import '../runtime/set-public-path';

/**
 * Content script entry point for Personalized Feeds.
 *
 * Initializes:
 *   - post-buttons       — "Add to feed" buttons on LinkedIn feed posts
 *   - speech-to-comment  — floating mic button for voice comments
 *
 * Responds to feature-settings changes from background so toggles take
 * effect without requiring a page reload.
 */

import { loadFeatureSettings, onFeatureSettingsChange } from './feature-settings';
import { destroyPostButtons, initPostButtons } from './post-buttons';
import { destroySpeechToCommentButton, initSpeechToCommentButton } from './speech-to-comment';
import type { UserFeatureSettings } from 'shared/types';

let featureSettings: UserFeatureSettings = {
  messagingButtons: true,
  postButtons: true,
  speechToComment: true,
};

let domReady = false;

function applyFeatureUI(): void {
  if (featureSettings.postButtons) {
    initPostButtons();
  } else {
    destroyPostButtons();
  }

  if (featureSettings.speechToComment) {
    initSpeechToCommentButton();
  } else {
    destroySpeechToCommentButton();
  }
}

function applyFeatureSettings(nextSettings: UserFeatureSettings): void {
  featureSettings = nextSettings;
  if (domReady) {
    applyFeatureUI();
  }
}

void loadFeatureSettings().then(applyFeatureSettings);
onFeatureSettingsChange(applyFeatureSettings);

// ── Bootstrap ────────────────────────────────────────────────────────

let linkedinActivityTimer: number | undefined;

function notifyProfileViewersLinkedInActivity(): void {
  window.clearTimeout(linkedinActivityTimer);
  linkedinActivityTimer = window.setTimeout(() => {
    chrome.runtime.sendMessage({ type: 'PROFILE_VIEWERS_LINKEDIN_ACTIVITY' }).catch(() => {
      /* background may be unavailable while the extension is reloading */
    });
  }, 500);
}

function onPageReady(): void {
  domReady = true;
  applyFeatureUI();
  notifyProfileViewersLinkedInActivity();
}

if (document.readyState === 'complete') {
  setTimeout(onPageReady, 1000);
} else {
  window.addEventListener('load', () => {
    setTimeout(onPageReady, 1000);
  });
}

// ── SPA route change handling ────────────────────────────────────────

let lastUrl = location.href;

function onRouteChange(): void {
  const currentUrl = location.href;
  if (currentUrl === lastUrl) return;
  lastUrl = currentUrl;

  if (domReady) {
    window.setTimeout(applyFeatureUI, 300);
    notifyProfileViewersLinkedInActivity();
  }
}

(function patchHistoryMethods(): void {
  const origPush = history.pushState.bind(history);
  history.pushState = (...args: Parameters<typeof history.pushState>) => {
    origPush(...args);
    onRouteChange();
  };
  const origReplace = history.replaceState.bind(history);
  history.replaceState = (...args: Parameters<typeof history.replaceState>) => {
    origReplace(...args);
    onRouteChange();
  };
})();

window.addEventListener('popstate', onRouteChange);

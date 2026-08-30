import { getAuthHelperOrigin } from 'shared/app-environment';

const AUTH_HELPER_ORIGIN = getAuthHelperOrigin();
const AUTH_HELPER_URL = `${AUTH_HELPER_ORIGIN}/auth-helper.html?extensionId=${encodeURIComponent(chrome.runtime.id)}`;

type AuthMessage =
  | { type: 'LFA_AUTH_READY' }
  | { type: 'LFA_AUTH_START' }
  | {
      type: 'LFA_AUTH_RESULT';
      success: true;
      idToken: string;
      accessToken: string;
    }
  | { type: 'LFA_AUTH_RESULT'; success: false; error: string };

const AUTH_HELPER_READY_TIMEOUT_MS = 15_000;

let authHelperReady = false;
let authInProgress = false;
let authStartPosted = false;
let authHelperReadyTimeoutId: ReturnType<typeof setTimeout> | null = null;

const iframe = document.createElement('iframe');
iframe.src = AUTH_HELPER_URL;
iframe.style.width = '0';
iframe.style.height = '0';
iframe.style.border = '0';
iframe.style.position = 'absolute';
iframe.style.left = '-9999px';
iframe.setAttribute('aria-hidden', 'true');
iframe.addEventListener('load', markAuthHelperReady);
document.body.appendChild(iframe);

function postAuthStart(): void {
  if (!authInProgress || authStartPosted || !authHelperReady || !iframe.contentWindow) {
    return;
  }

  authStartPosted = true;
  const message: AuthMessage = { type: 'LFA_AUTH_START' };
  iframe.contentWindow.postMessage(message, AUTH_HELPER_ORIGIN);
}

function clearAuthHelperReadyTimeout(): void {
  if (!authHelperReadyTimeoutId) {
    return;
  }

  clearTimeout(authHelperReadyTimeoutId);
  authHelperReadyTimeoutId = null;
}

function markAuthHelperReady(): void {
  authHelperReady = true;
  clearAuthHelperReadyTimeout();
  postAuthStart();
}

async function finishAuth(message: Extract<AuthMessage, { type: 'LFA_AUTH_RESULT' }>): Promise<void> {
  if (!authInProgress) {
    return;
  }

  authInProgress = false;
  authStartPosted = false;
  clearAuthHelperReadyTimeout();

  if (!message.success) {
    await chrome.runtime.sendMessage({
      type: 'OFFSCREEN_AUTH_RESULT',
      success: false,
      error: message.error,
    });
    return;
  }

  await chrome.runtime.sendMessage({
    type: 'OFFSCREEN_AUTH_RESULT',
    success: true,
    idToken: message.idToken,
    accessToken: message.accessToken,
  });
}

window.addEventListener('message', (event: MessageEvent<AuthMessage>) => {
  if (event.origin !== AUTH_HELPER_ORIGIN || event.source !== iframe.contentWindow || !event.data) {
    return;
  }

  if (event.data.type === 'LFA_AUTH_READY') {
    markAuthHelperReady();
    return;
  }

  if (event.data.type === 'LFA_AUTH_RESULT') {
    void finishAuth(event.data);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'OFFSCREEN_AUTH_START') {
    return false;
  }

  if (authInProgress) {
    sendResponse({ success: false, error: 'Authentication already in progress' });
    return true;
  }

  authInProgress = true;
  authStartPosted = false;
  if (authHelperReady) {
    postAuthStart();
  } else {
    authHelperReadyTimeoutId = setTimeout(() => {
      void finishAuth({
        type: 'LFA_AUTH_RESULT',
        success: false,
        error: `Sign-in service is unavailable for ${AUTH_HELPER_ORIGIN}. Verify the Firebase auth helper deployment and try again.`,
      });
    }, AUTH_HELPER_READY_TIMEOUT_MS);
  }

  sendResponse({ success: true });
  return true;
});

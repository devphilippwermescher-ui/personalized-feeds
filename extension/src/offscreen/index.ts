const DASHBOARD_ORIGIN = 'https://linkedin-feed-sorter.web.app';
const AUTH_HELPER_URL = `${DASHBOARD_ORIGIN}/auth-helper.html?extensionId=${encodeURIComponent(chrome.runtime.id)}`;

type AuthMessage =
  | { type: 'LFA_AUTH_START' }
  | {
      type: 'LFA_AUTH_RESULT';
      success: true;
      idToken: string;
      accessToken: string;
    }
  | { type: 'LFA_AUTH_RESULT'; success: false; error: string };

let iframeLoaded = false;
let authInProgress = false;

const iframe = document.createElement('iframe');
iframe.src = AUTH_HELPER_URL;
iframe.style.width = '0';
iframe.style.height = '0';
iframe.style.border = '0';
iframe.style.position = 'absolute';
iframe.style.left = '-9999px';
iframe.setAttribute('aria-hidden', 'true');
iframe.addEventListener('load', () => {
  iframeLoaded = true;
});
document.body.appendChild(iframe);

function postAuthStart(): void {
  if (!iframeLoaded || !iframe.contentWindow) {
    return;
  }
  const message: AuthMessage = { type: 'LFA_AUTH_START' };
  iframe.contentWindow.postMessage(message, DASHBOARD_ORIGIN);
}

async function finishAuth(message: Extract<AuthMessage, { type: 'LFA_AUTH_RESULT' }>): Promise<void> {
  if (!authInProgress) {
    return;
  }

  authInProgress = false;

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
  if (event.origin !== DASHBOARD_ORIGIN || !event.data) {
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
  if (iframeLoaded) {
    postAuthStart();
  } else {
    iframe.addEventListener(
      'load',
      () => {
        postAuthStart();
      },
      { once: true }
    );
  }

  sendResponse({ success: true });
  return true;
});

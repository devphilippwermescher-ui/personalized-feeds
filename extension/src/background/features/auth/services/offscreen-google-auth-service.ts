export type OffscreenAuthResult =
  | {
      success: true;
      idToken: string;
      accessToken: string;
    }
  | {
      success: false;
      error: string;
    };

const OFFSCREEN_READY_TIMEOUT_MS = 5000;
const OFFSCREEN_READY_RETRY_MS = 50;
const AUTH_RESULT_TIMEOUT_MS = 90_000;

let pendingOffscreenAuth: {
  resolve: (result: OffscreenAuthResult) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
} | null = null;
let activeOffscreenAuth: Promise<OffscreenAuthResult> | null = null;

async function hasOffscreenDocument(): Promise<boolean> {
  const getContexts = chrome.runtime.getContexts?.bind(chrome.runtime);
  if (!getContexts) {
    return false;
  }

  const contexts = await getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [chrome.runtime.getURL('offscreen.html')],
  });

  return contexts.length > 0;
}

async function ensureOffscreenDocument(): Promise<void> {
  if (await hasOffscreenDocument()) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: [chrome.offscreen.Reason.IFRAME_SCRIPTING],
    justification: 'Authenticate the user with Firebase Google sign-in from an offscreen document.',
  });
}

async function closeOffscreenDocument(): Promise<void> {
  if (await hasOffscreenDocument()) {
    await chrome.offscreen.closeDocument();
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForOffscreenAuthReceiver(): Promise<void> {
  const deadline = Date.now() + OFFSCREEN_READY_TIMEOUT_MS;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    try {
      const response = (await chrome.runtime.sendMessage({ type: 'OFFSCREEN_AUTH_PING' })) as
        | { success?: boolean; ready?: boolean }
        | undefined;
      if (response?.success === true && response.ready === true) {
        return;
      }
    } catch (error) {
      lastError = error;
    }

    await delay(OFFSCREEN_READY_RETRY_MS);
  }

  throw new Error(
    lastError instanceof Error
      ? `Authentication helper did not become ready: ${lastError.message}`
      : 'Authentication helper did not become ready.'
  );
}

async function runOffscreenAuth(): Promise<OffscreenAuthResult> {
  await ensureOffscreenDocument();

  try {
    await waitForOffscreenAuthReceiver();
    return await new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        pendingOffscreenAuth = null;
        reject(new Error('Authentication timed out'));
      }, AUTH_RESULT_TIMEOUT_MS);

      pendingOffscreenAuth = { resolve, reject, timeoutId };

      chrome.runtime
        .sendMessage({ type: 'OFFSCREEN_AUTH_START' })
        .then((response: { success?: boolean; error?: string } | undefined) => {
          if (response?.success === true) {
            return;
          }
          clearTimeout(timeoutId);
          pendingOffscreenAuth = null;
          reject(new Error(response?.error || 'Authentication helper did not accept the sign-in request.'));
        })
        .catch((error: Error) => {
          clearTimeout(timeoutId);
          pendingOffscreenAuth = null;
          reject(error);
        });
    });
  } finally {
    await closeOffscreenDocument().catch((error) => {
      console.warn('[feeds-auth] Failed to close the offscreen authentication document:', error);
    });
  }
}

export function startOffscreenAuth(): Promise<OffscreenAuthResult> {
  if (activeOffscreenAuth) {
    return activeOffscreenAuth;
  }

  const attempt = runOffscreenAuth().finally(() => {
    if (activeOffscreenAuth === attempt) {
      activeOffscreenAuth = null;
    }
  });
  activeOffscreenAuth = attempt;
  return attempt;
}

export function resolvePendingOffscreenAuth(result: unknown): void {
  const pending = pendingOffscreenAuth;
  pendingOffscreenAuth = null;
  if (!pending) {
    return;
  }
  clearTimeout(pending.timeoutId);
  pending.resolve(result as OffscreenAuthResult);
}

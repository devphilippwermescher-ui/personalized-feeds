const BACKGROUND_STARTUP_RETRY_DELAY_MS = 150;

function isMissingBackgroundReceiver(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes('Could not establish connection') ||
    error.message.includes('Receiving end does not exist')
  );
}

function waitForBackgroundStartup(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, BACKGROUND_STARTUP_RETRY_DELAY_MS);
  });
}

async function sendMessage<T>(message: Record<string, unknown>): Promise<T | undefined> {
  return chrome.runtime.sendMessage(message) as Promise<T | undefined>;
}

/**
 * An unpacked-extension reload can briefly leave a LinkedIn content script
 * without a ready background receiver. Retry only that pre-delivery failure;
 * once the background accepted a billing action, never repeat it.
 */
export async function sendBillingMessage<T>(message: Record<string, unknown>): Promise<T> {
  try {
    const response = await sendMessage<T>(message);
    if (response !== undefined) return response;
  } catch (error) {
    if (!isMissingBackgroundReceiver(error)) throw error;
  }

  await waitForBackgroundStartup();
  const response = await sendMessage<T>(message);
  if (response === undefined) {
    throw new Error('The extension background service is unavailable. Please try again.');
  }
  return response;
}

/**
 * Announces that a person opened an extension UI surface.
 *
 * The background worker treats the first authenticated entry as the only
 * moment the one-time Connections history bootstrap may be created. Sending
 * this more than once is safe: the persisted Firestore job is the source of
 * truth, so later entries can only resume an existing job.
 */
export const EXTENSION_UI_ENTERED_MESSAGE = 'EXTENSION_UI_ENTERED';

export function reportExtensionUiEntered(): void {
  try {
    void chrome.runtime.sendMessage({ type: EXTENSION_UI_ENTERED_MESSAGE })?.catch?.(() => {
      // The worker may be starting up. The next entry reports again.
    });
  } catch {
    // Messaging is unavailable outside an extension context.
  }
}

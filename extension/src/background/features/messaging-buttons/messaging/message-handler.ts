import {
  isMessagingProfilePickerRequest,
  MESSAGING_PROFILE_PICKER_OPEN,
  type MessagingProfilePickerResponse,
} from '../../../../shared/messaging-buttons';

function isLinkedInPreloadSender(sender: chrome.runtime.MessageSender): boolean {
  if (!sender.url || typeof sender.frameId !== 'number' || sender.frameId === 0) return false;

  try {
    const url = new URL(sender.url);
    return url.hostname === 'www.linkedin.com' && /^\/preload(?:\/|$)/i.test(url.pathname);
  } catch {
    return false;
  }
}

export function registerMessagingProfilePickerRelay(): void {
  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (!isMessagingProfilePickerRequest(message)) return false;

    const tabId = sender.tab?.id;
    if (typeof tabId !== 'number' || !isLinkedInPreloadSender(sender)) {
      sendResponse({ success: false, error: 'Messaging profile request came from an unsupported frame' });
      return false;
    }

    void chrome.tabs
      .sendMessage(
        tabId,
        {
          type: MESSAGING_PROFILE_PICKER_OPEN,
          profile: message.profile,
        },
        { frameId: 0 }
      )
      .then((response: MessagingProfilePickerResponse | undefined) => {
        sendResponse(response || { success: true });
      })
      .catch((error: unknown) => {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return true;
  });
}

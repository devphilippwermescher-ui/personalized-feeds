import {
  isMessagingProfilePickerRequest,
  MESSAGING_PROFILE_PICKER_OPEN,
  type MessagingProfilePickerResponse,
} from '../../../../shared/messaging-buttons';

function isLinkedInUrl(value: string | undefined): boolean {
  if (!value) return false;

  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'www.linkedin.com';
  } catch {
    return false;
  }
}

function isLinkedInChildFrameSender(sender: chrome.runtime.MessageSender): boolean {
  if (typeof sender.frameId !== 'number' || sender.frameId === 0) return false;

  // LinkedIn initially creates the Messaging document at /preload, then can
  // change that child frame's URL as its SPA hydrates. Trust the LinkedIn
  // origin instead of one transient pathname, while still rejecting top-frame
  // and cross-origin requests. `origin` covers inherited about:blank frames.
  const senderIsLinkedIn = isLinkedInUrl(sender.url) || isLinkedInUrl(sender.origin);
  const topTabIsLinkedIn = !sender.tab?.url || isLinkedInUrl(sender.tab.url);
  return senderIsLinkedIn && topTabIsLinkedIn;
}

export function registerMessagingProfilePickerRelay(): void {
  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (!isMessagingProfilePickerRequest(message)) return false;

    const tabId = sender.tab?.id;
    if (typeof tabId !== 'number' || !isLinkedInChildFrameSender(sender)) {
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

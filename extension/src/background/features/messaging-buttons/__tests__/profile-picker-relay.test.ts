import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MESSAGING_PROFILE_PICKER_OPEN, MESSAGING_PROFILE_PICKER_REQUEST } from '../../../../shared/messaging-buttons';
import { registerMessagingProfilePickerRelay } from '../messaging/message-handler';

const addListener = vi.fn();
const sendMessage = vi.fn();

describe('Messaging profile picker relay', () => {
  beforeEach(() => {
    addListener.mockReset();
    sendMessage.mockReset();
    vi.stubGlobal('chrome', {
      runtime: { onMessage: { addListener } },
      tabs: { sendMessage },
    });
  });

  it('forwards a preload-frame profile to the existing picker in frame zero', async () => {
    sendMessage.mockResolvedValue({ success: true });
    registerMessagingProfilePickerRelay();
    const listener = addListener.mock.calls[0][0];
    const sendResponse = vi.fn();
    const profile = {
      linkedinUrl: 'https://www.linkedin.com/in/gabriel-p-bernes/',
      linkedinUsername: 'gabriel-p-bernes',
      displayName: 'Gabriel P Bernes',
    };

    expect(
      listener(
        { type: MESSAGING_PROFILE_PICKER_REQUEST, profile },
        {
          frameId: 7074,
          url: 'https://www.linkedin.com/preload/?_bprMode=vanilla',
          tab: { id: 42 },
        },
        sendResponse
      )
    ).toBe(true);

    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(42, { type: MESSAGING_PROFILE_PICKER_OPEN, profile }, { frameId: 0 });
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });
  });

  it('rejects the relay when the request did not originate in a LinkedIn child frame', () => {
    registerMessagingProfilePickerRelay();
    const listener = addListener.mock.calls[0][0];
    const sendResponse = vi.fn();

    expect(
      listener(
        {
          type: MESSAGING_PROFILE_PICKER_REQUEST,
          profile: {
            linkedinUrl: 'https://www.linkedin.com/in/gabriel-p-bernes/',
            linkedinUsername: 'gabriel-p-bernes',
            displayName: 'Gabriel P Bernes',
          },
        },
        {
          frameId: 0,
          url: 'https://www.linkedin.com/messaging/thread/example/',
          tab: { id: 42 },
        },
        sendResponse
      )
    ).toBe(false);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: 'Messaging profile request came from an unsupported frame',
    });
  });
});

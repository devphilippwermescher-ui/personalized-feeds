import type { PostAuthorProfile } from '../../post-buttons/public';
import {
  MESSAGING_PROFILE_PICKER_REQUEST,
  type MessagingProfilePickerResponse,
} from '../../../shared/messaging-buttons';

export async function openTopFrameFeedPicker(profile: PostAuthorProfile): Promise<void> {
  const response = (await chrome.runtime.sendMessage({
    type: MESSAGING_PROFILE_PICKER_REQUEST,
    profile,
  })) as MessagingProfilePickerResponse | undefined;

  if (!response?.success) {
    throw new Error(response?.error || 'Failed to open the feed picker');
  }
}

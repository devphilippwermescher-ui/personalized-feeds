import type { LinkedInProfileData } from 'shared/types';

export const MESSAGING_PROFILE_PICKER_REQUEST = 'MYFEEDPILOT_MESSAGING_PROFILE_PICKER_REQUEST';
export const MESSAGING_PROFILE_PICKER_OPEN = 'MYFEEDPILOT_MESSAGING_PROFILE_PICKER_OPEN';

export interface MessagingProfilePickerRequest {
  type: typeof MESSAGING_PROFILE_PICKER_REQUEST;
  profile: LinkedInProfileData;
}

export interface MessagingProfilePickerOpenMessage {
  type: typeof MESSAGING_PROFILE_PICKER_OPEN;
  profile: LinkedInProfileData;
}

export interface MessagingProfilePickerResponse {
  success: boolean;
  error?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasProfileIdentity(value: unknown): value is LinkedInProfileData {
  return (
    isRecord(value) &&
    typeof value.linkedinUrl === 'string' &&
    typeof value.linkedinUsername === 'string' &&
    typeof value.displayName === 'string'
  );
}

export function isMessagingProfilePickerRequest(value: unknown): value is MessagingProfilePickerRequest {
  return isRecord(value) && value.type === MESSAGING_PROFILE_PICKER_REQUEST && hasProfileIdentity(value.profile);
}

export function isMessagingProfilePickerOpenMessage(value: unknown): value is MessagingProfilePickerOpenMessage {
  return isRecord(value) && value.type === MESSAGING_PROFILE_PICKER_OPEN && hasProfileIdentity(value.profile);
}

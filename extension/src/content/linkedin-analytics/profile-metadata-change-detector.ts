export type LinkedInProfileMetadataMutation = 'intro' | 'avatar' | 'background';

const PROFILE_METADATA_REQUESTS: Record<string, LinkedInProfileMetadataMutation> = {
  'com.linkedin.sdui.requests.profile.saveProfileIntroForm': 'intro',
  'com.linkedin.sdui.requests.profile.saveProfilePicture': 'avatar',
  'com.linkedin.sdui.requests.profile.saveProfileBackgroundImage': 'background',
};

export function getLinkedInProfileMetadataMutation(
  requestUrl: string,
  responseStatus: number
): LinkedInProfileMetadataMutation | null {
  if (responseStatus < 200 || responseStatus >= 300) return null;

  try {
    const url = new URL(requestUrl, 'https://www.linkedin.com');
    if (url.origin !== 'https://www.linkedin.com' || !url.pathname.includes('/rsc-action/actions/server-request')) {
      return null;
    }
    return PROFILE_METADATA_REQUESTS[url.searchParams.get('sduiid') || ''] || null;
  } catch {
    return null;
  }
}

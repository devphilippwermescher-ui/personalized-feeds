import { describe, expect, it } from 'vitest';
import { getLinkedInProfileMetadataMutation } from '../profile-metadata-change-detector';

function requestUrl(requestId: string) {
  return `https://www.linkedin.com/flagship-web/rsc-action/actions/server-request?sduiid=${encodeURIComponent(requestId)}&parentSpanId=test`;
}

describe('LinkedIn profile metadata change detection', () => {
  it.each([
    ['com.linkedin.sdui.requests.profile.saveProfileIntroForm', 'intro'],
    ['com.linkedin.sdui.requests.profile.saveProfilePicture', 'avatar'],
    ['com.linkedin.sdui.requests.profile.saveProfileBackgroundImage', 'background'],
  ] as const)('recognizes a successful %s request', (requestId, mutation) => {
    expect(getLinkedInProfileMetadataMutation(requestUrl(requestId), 200)).toBe(mutation);
  });

  it('ignores upload registration and discovery requests', () => {
    expect(
      getLinkedInProfileMetadataMutation(requestUrl('com.linkedin.sdui.requests.profile.profileImageRegister'), 200)
    ).toBeNull();
    expect(
      getLinkedInProfileMetadataMutation(
        requestUrl('com.linkedin.sdui.requests.profile.fetchProfileDiscoveryDrawer'),
        200
      )
    ).toBeNull();
  });

  it('ignores failed save responses', () => {
    expect(
      getLinkedInProfileMetadataMutation(requestUrl('com.linkedin.sdui.requests.profile.saveProfileIntroForm'), 500)
    ).toBeNull();
  });
});

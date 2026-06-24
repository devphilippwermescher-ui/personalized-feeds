import { describe, expect, it } from 'vitest';
import { extractProfileViewerImageUrls } from '../profile-viewers-rsc-images';

describe('extractProfileViewerImageUrls', () => {
  it('builds the 100px avatar URL from the Premium pagination render payload', () => {
    const payload =
      `9:["$","component",null,{"a11yText":"Krystyna Zubiak","shape":"circle",` +
      `"renderPayload":{"rootUrl":"https://media.licdn.com/dms/image/v2/asset/profile-displayphoto-shrink_",` +
      `"imageRenditions":[{"width":100,"height":100,` +
      `"suffixUrl":"100_100/photo?e=1782950400&v=beta&t=token"},` +
      `{"width":200,"height":200,"suffixUrl":"200_200/photo"}],` +
      `"assetUrn":"urn:li:digitalmediaAsset:test"}}]`;

    expect(extractProfileViewerImageUrls(payload).get('krystyna zubiak')).toBe(
      'https://media.licdn.com/dms/image/v2/asset/profile-displayphoto-shrink_100_100/photo?e=1782950400&v=beta&t=token'
    );
  });

  it('does not associate a placeholder without renderPayload with another profile', () => {
    const payload =
      `1:{"a11yText":"Anonymous viewer","shape":"circle"}` +
      `2:{"a11yText":"Named Viewer","shape":"circle",` +
      `"renderPayload":{"rootUrl":"https://media.licdn.com/dms/image/v2/named/",` +
      `"imageRenditions":[{"width":100,"height":100,"suffixUrl":"photo"}],` +
      `"assetUrn":"urn:li:digitalmediaAsset:named"}}`;

    const result = extractProfileViewerImageUrls(payload);

    expect(result.has('anonymous viewer')).toBe(false);
    expect(result.get('named viewer')).toBe(
      'https://media.licdn.com/dms/image/v2/named/photo'
    );
  });
});

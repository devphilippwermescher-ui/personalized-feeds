import { describe, expect, it } from 'vitest';
import { INTERLEAVED_PROFILE_VIEWERS_RSC_FIXTURE } from '../features/profile-viewers/testing/interleaved-profile-viewers-rsc';
import { extractProfileViewerImageUrls } from '../profile-viewers-rsc-images';

describe('extractProfileViewerImageUrls', () => {
  it('returns images only after a rendered card identity is resolved', () => {
    const images = extractProfileViewerImageUrls(INTERLEAVED_PROFILE_VIEWERS_RSC_FIXTURE);

    expect(images.get('kamalakar vatala')).toContain('/b/profile-displayphoto-shrink_');
    expect(images.has('rostyslav osinchuk')).toBe(false);
    expect(images.has('volodymyr korol')).toBe(false);
  });
});

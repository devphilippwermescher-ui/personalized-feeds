import { describe, expect, it } from 'vitest';
import { extractProfileViewerReferences } from '../profile-viewers-references';

describe('extractProfileViewerReferences', () => {
  it('extracts absolute, relative, and state-key profile identities without duplicates', () => {
    const payload = [
      '"https://www.linkedin.com/in/yevhen-romanenko/"',
      '"/in/yuliia-biliavtseva/"',
      '"connect-button-disabled-mykhailo-blokhin-29296b90"',
      '"https://www.linkedin.com/in/yuliia-biliavtseva/"',
    ].join(' ');

    expect(
      extractProfileViewerReferences(payload).map((reference) => reference.linkedinUsername)
    ).toEqual([
      'yevhen-romanenko',
      'yuliia-biliavtseva',
      'mykhailo-blokhin-29296b90',
    ]);
  });
});

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

    expect(extractProfileViewerReferences(payload).map((reference) => reference.linkedinUsername)).toEqual([
      'yevhen-romanenko',
      'yuliia-biliavtseva',
      'mykhailo-blokhin-29296b90',
    ]);
  });

  it('keeps Unicode profile slugs intact and deduplicates encoded variants', () => {
    const payload = [
      '"https://www.linkedin.com/in/michał-chojnacki-491b1a2b8/"',
      '"/in/micha%C5%82-chojnacki-491b1a2b8/"',
      '"connect-button-disabled-michał-chojnacki-491b1a2b8"',
    ].join(' ');

    expect(extractProfileViewerReferences(payload)).toEqual([
      {
        linkedinUsername: 'michał-chojnacki-491b1a2b8',
        linkedinUrl: 'https://www.linkedin.com/in/micha%C5%82-chojnacki-491b1a2b8/',
        index: 1,
      },
    ]);
  });
});

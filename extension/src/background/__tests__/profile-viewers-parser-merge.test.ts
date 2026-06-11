import { describe, expect, it } from 'vitest';
import type { ProfileViewerInput } from 'shared/types';
import { mergeProfileViewerCandidates } from '../profile-viewers-parser-merge';

function viewer(username: string, overrides: Partial<ProfileViewerInput> = {}): ProfileViewerInput {
  return {
    linkedinUrl: `https://www.linkedin.com/in/${username}/`,
    linkedinUsername: username,
    displayName: username,
    ...overrides,
  };
}

describe('mergeProfileViewerCandidates', () => {
  it('adds the missing third RSC viewer after a partial HTML result', () => {
    const result = mergeProfileViewerCandidates([
      [viewer('yevhen'), viewer('yuliia')],
      [viewer('yevhen'), viewer('yuliia'), viewer('mykhailo')],
    ]);

    expect(result.map((item) => item.linkedinUsername)).toEqual(['yevhen', 'yuliia', 'mykhailo']);
  });

  it('enriches a partial HTML viewer with the avatar from the RSC result', () => {
    const result = mergeProfileViewerCandidates([
      [viewer('yuliia', { profileImageUrl: '' })],
      [
        viewer('yuliia', {
          profileImageUrl:
            'https://media.licdn.com/dms/image/v2/test/profile-displayphoto-shrink_100_100/yuliia?e=4102444800',
        }),
      ],
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].profileImageUrl).toContain('profile-displayphoto');
  });

  it('keeps every unique named viewer returned for Premium accounts', () => {
    const result = mergeProfileViewerCandidates([
      [viewer('viewer-1'), viewer('viewer-2'), viewer('viewer-3'), viewer('viewer-4'), viewer('viewer-5')],
      [
        viewer('viewer-3', { headline: 'Updated headline' }),
        viewer('viewer-6'),
        viewer('viewer-7'),
        viewer('viewer-8'),
      ],
    ]);

    expect(result.map((item) => item.linkedinUsername)).toEqual([
      'viewer-1',
      'viewer-2',
      'viewer-3',
      'viewer-4',
      'viewer-5',
      'viewer-6',
      'viewer-7',
      'viewer-8',
    ]);
    expect(result[2].headline).toBe('Updated headline');
  });
});

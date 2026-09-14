import { describe, expect, it } from 'vitest';
import type { ProfileViewerInput } from 'shared/types';
import { selectProfileViewerCollectionWindow } from '../utils/collection-window';

function viewer(
  linkedinUsername: string,
  identityUncertain = false
): ProfileViewerInput {
  return {
    linkedinUsername,
    linkedinUrl: `https://www.linkedin.com/in/${linkedinUsername}/`,
    displayName: linkedinUsername,
    identityUncertain,
  };
}

describe('selectProfileViewerCollectionWindow', () => {
  it('applies the Free limit after rejecting unresolved and duplicate identities', () => {
    const page = [
      viewer('viewer-1'),
      viewer('unresolved-viewer', true),
      viewer('viewer-2'),
      viewer('viewer-2'),
      ...Array.from({ length: 9 }, (_, index) => viewer(`viewer-${index + 3}`)),
    ];

    const result = selectProfileViewerCollectionWindow([], page, 10);

    expect(result.rankedViewers.map((item) => item.linkedinUsername)).toEqual(
      Array.from({ length: 10 }, (_, index) => `viewer-${index + 1}`)
    );
    expect(result.pageViewers.map((item) => item.linkedinUsername)).not.toContain(
      'unresolved-viewer'
    );
    expect(result.pageViewers.map((item) => item.linkedinUsername)).not.toContain(
      'viewer-11'
    );
  });

  it('keeps the same verified pipeline uncapped for Pro', () => {
    const result = selectProfileViewerCollectionWindow(
      [viewer('viewer-1')],
      [viewer('viewer-2'), viewer('viewer-3')],
      undefined
    );

    expect(result.rankedViewers.map((item) => item.linkedinUsername)).toEqual([
      'viewer-1',
      'viewer-2',
      'viewer-3',
    ]);
  });

  it('rejects a card whose canonical URL and username disagree', () => {
    const result = selectProfileViewerCollectionWindow(
      [],
      [
        {
          ...viewer('expected-person'),
          linkedinUrl: 'https://www.linkedin.com/in/different-person/',
        },
        viewer('verified-person'),
      ],
      10
    );

    expect(result.rankedViewers.map((item) => item.linkedinUsername)).toEqual([
      'verified-person',
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import { sortProfileViewersByRecency } from 'shared/profile-viewer-order';
import type { ProfileViewer } from 'shared/types';

function viewer(linkedinUsername: string, lastSeenAt: number, lastSeenPosition?: number): ProfileViewer {
  return {
    id: linkedinUsername,
    linkedinUrl: `https://www.linkedin.com/in/${linkedinUsername}/`,
    linkedinUsername,
    displayName: linkedinUsername,
    firstSeenAt: lastSeenAt,
    lastSeenAt,
    lastSeenPosition,
    source: 'linkedin_profile_views',
  };
}

describe('sortProfileViewersByRecency', () => {
  it('keeps the current LinkedIn order and places historical viewers after it', () => {
    const currentSyncAt = 200;
    const result = sortProfileViewersByRecency([
      viewer('vlad-lysak', 100),
      viewer('anastasiia-naida', currentSyncAt, 4),
      viewer('sodzhak-khrystyna', currentSyncAt, 7),
      viewer('yevhen-romanenko', currentSyncAt, 0),
      viewer('viktoriia-zubrytska', currentSyncAt, 6),
    ]);

    expect(result.map((item) => item.linkedinUsername)).toEqual([
      'yevhen-romanenko',
      'anastasiia-naida',
      'viktoriia-zubrytska',
      'sodzhak-khrystyna',
      'vlad-lysak',
    ]);
  });
});

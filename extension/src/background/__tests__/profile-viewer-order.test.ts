import { describe, expect, it } from 'vitest';
import { sortProfileViewersByRecency } from 'shared/profile-viewer-order';
import type { ProfileViewer, ProfileViewerSearch } from 'shared/types';

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

  it('keeps anonymous search segments interleaved with named viewers', () => {
    const search: ProfileViewerSearch = {
      id: 'search-1',
      itemType: 'search',
      searchKey:
        'currentCompany=1053414&keywords=Software+Developer&origin=WHO_VIEWED_ME',
      searchUrl:
        'https://www.linkedin.com/search/results/people/?currentCompany=1053414&keywords=Software+Developer&origin=WHO_VIEWED_ME',
      displayName: 'Software Developer at MagView',
      keywords: 'Software Developer',
      currentCompany: '1053414',
      firstSeenAt: 200,
      lastSeenAt: 200,
      lastSeenPosition: 1,
      source: 'linkedin_profile_views',
    };

    const result = sortProfileViewersByRecency([
      viewer('yevhen-romanenko', 200, 0),
      viewer('illia-syvash', 200, 2),
      search,
    ]);

    expect(result.map((item) => item.id)).toEqual([
      'yevhen-romanenko',
      'search-1',
      'illia-syvash',
    ]);
  });
});

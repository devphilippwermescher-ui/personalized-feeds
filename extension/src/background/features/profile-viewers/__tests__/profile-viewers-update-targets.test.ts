import { describe, expect, it } from 'vitest';
import type { ProfileViewer } from 'shared/types';
import { findProfileViewerUpdateTargets } from '../profile-viewers-update-targets';

function makeViewer(
  username: string,
  overrides: Partial<ProfileViewer> = {}
): ProfileViewer {
  return {
    id: username,
    linkedinUrl: `https://www.linkedin.com/in/${username}/`,
    linkedinUsername: username,
    displayName: username,
    firstSeenAt: 1,
    lastSeenAt: 1,
    source: 'linkedin_profile_views',
    ...overrides,
  };
}

describe('findProfileViewerUpdateTargets', () => {
  it('does not target a corrupted viewer whose stored URL points to the updated profile', () => {
    const nielsWithCarmenUrl = makeViewer('niels-wennesheimer', {
      displayName: 'Niels Wennesheimer',
      linkedinUrl: 'https://www.linkedin.com/in/carmen-linzner/',
    });
    const carmen = makeViewer('carmen-linzner', {
      displayName: 'Carmen Linzner',
    });

    const targets = findProfileViewerUpdateTargets(
      [nielsWithCarmenUrl, carmen],
      'carmen-linzner',
      {
        linkedinUsername: 'carmen-linzner',
        linkedinUrl: 'https://www.linkedin.com/in/carmen-linzner/',
        displayName: 'Carmen Linzner',
      }
    );

    expect(targets.map((target) => target.linkedinUsername)).toEqual(['carmen-linzner']);
  });

  it('does not use display name as a secondary match when the update has a profile identity', () => {
    const wrongNameMatch = makeViewer('niels-wennesheimer', {
      displayName: 'Carmen Linzner',
    });

    const targets = findProfileViewerUpdateTargets(
      [wrongNameMatch],
      'carmen-linzner',
      {
        linkedinUsername: 'carmen-linzner',
        linkedinUrl: 'https://www.linkedin.com/in/carmen-linzner/',
        displayName: 'Carmen Linzner',
      }
    );

    expect(targets).toEqual([]);
  });

  it('falls back to display name only when no profile identity is available', () => {
    const carmen = makeViewer('carmen-linzner', {
      displayName: 'Carmen Linzner',
    });

    const targets = findProfileViewerUpdateTargets(
      [carmen],
      '',
      {
        displayName: 'Carmen Linzner',
      }
    );

    expect(targets.map((target) => target.linkedinUsername)).toEqual(['carmen-linzner']);
  });
});

import { describe, expect, it } from 'vitest';
import type { ProfileViewer } from 'shared/types';
import {
  PROFILE_VIEWERS_STATUS_BATCH_LIMIT,
  PROFILE_VIEWERS_STATUS_STALE_MS,
  selectProfileViewersForStatusSync,
} from '../profile-viewers-status-sync-selection';

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

describe('profile viewers status sync selection', () => {
  it('limits status checks to one batch and puts new priority profiles first', () => {
    const now = 10_000_000;
    const viewers = Array.from({ length: 266 }, (_, index) =>
      makeViewer(`viewer-${index}`, {
        status: 'connected',
        statusResolvedAt: now - PROFILE_VIEWERS_STATUS_STALE_MS - index,
        lastSeenAt: now - index,
      })
    );

    const selected = selectProfileViewersForStatusSync(
      viewers,
      ['viewer-200', 'viewer-201'],
      now
    );

    expect(selected).toHaveLength(PROFILE_VIEWERS_STATUS_BATCH_LIMIT);
    expect(selected.slice(0, 2).map((viewer) => viewer.linkedinUsername)).toEqual([
      'viewer-200',
      'viewer-201',
    ]);
  });

  it('skips fresh statuses and profiles that recently failed status checks', () => {
    const now = 10_000_000;
    const stale = makeViewer('stale', {
      status: 'connected',
      statusResolvedAt: now - PROFILE_VIEWERS_STATUS_STALE_MS - 1,
    });
    const fresh = makeViewer('fresh', {
      status: 'connected',
      statusResolvedAt: now - 1_000,
    });
    const recentlyFailed = makeViewer('failed', {
      status: 'loading',
      statusCheckFailedAt: now - 1_000,
    });

    expect(selectProfileViewersForStatusSync([fresh, recentlyFailed, stale], [], now)).toEqual([
      stale,
    ]);
  });
});

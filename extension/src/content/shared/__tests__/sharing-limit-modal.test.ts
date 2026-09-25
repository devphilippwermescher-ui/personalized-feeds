import { describe, expect, it } from 'vitest';
import type { SharingLimitDetails } from 'shared/types';
import { getSharingLimitCopy } from '../components/FeedActionModals/SharingLimitModal';

describe('sharing limit copy', () => {
  it('explains the Free owner limit to a second link recipient', () => {
    const details: SharingLimitDetails = {
      code: 'SHARING_LIMIT_REACHED',
      direction: 'outgoing',
      dimension: 'people',
      blockedParty: 'counterparty',
      limit: 1,
      counterpartDisplayName: 'Feed owner',
      notificationCreated: true,
    };

    const copy = getSharingLimitCopy(details, 'link');

    expect(copy.title).toContain('Free limit');
    expect(copy.body).toContain('Free plan');
    expect(copy.body).toContain('only 1 person');
    expect(copy.body).toContain('owner was notified');
  });
});

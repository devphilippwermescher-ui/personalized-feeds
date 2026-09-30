import { describe, expect, it } from 'vitest';
import { getPlanEntitlements } from 'shared/plans';
import { getUserPlanSnapshot } from '../services/plan-service';

describe('Free release plan service', () => {
  it('returns Free entitlements for every authenticated user, including forced refreshes', async () => {
    await expect(getUserPlanSnapshot('user-1')).resolves.toEqual({
      plan: 'free',
      entitlements: getPlanEntitlements('free'),
    });
    await expect(getUserPlanSnapshot('user-2', { force: true })).resolves.toEqual({
      plan: 'free',
      entitlements: getPlanEntitlements('free'),
    });
  });
});

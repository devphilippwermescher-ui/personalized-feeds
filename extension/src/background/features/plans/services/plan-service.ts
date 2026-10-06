import { createFreePlanSnapshot, type UserPlanSnapshot } from 'shared/plans';

export async function getUserPlanSnapshot(
  _userId: string,
  _options: { force?: boolean } = {}
): Promise<UserPlanSnapshot> {
  return createFreePlanSnapshot();
}

export function clearUserPlanCache(_userId?: string): void {}

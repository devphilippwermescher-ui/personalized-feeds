import type { ProfileAnalyticsSsiSnapshot } from 'shared/types';
import { isRecord } from '../../platform/linkedin/json-utils';

function parseSsiScore(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    return undefined;
  }

  // LinkedIn displays the member score as a whole number (for example,
  // 15.683752 is rendered as 16 out of 100).
  return Math.round(value);
}

export function parseSocialSellingIndexSnapshot(
  payload: unknown,
  collectedAt: number,
  sourceUrl: string
): ProfileAnalyticsSsiSnapshot | null {
  if (!isRecord(payload) || !isRecord(payload.memberScore)) return null;

  const score = parseSsiScore(payload.memberScore.overall);
  if (typeof score !== 'number') return null;

  return {
    score,
    updatedAt: collectedAt,
    sourceUrl,
  };
}

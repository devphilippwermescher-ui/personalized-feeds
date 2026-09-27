import { describe, expect, it } from 'vitest';
import { parseSocialSellingIndexSnapshot } from '../profile-analytics-ssi-parser';

describe('Social Selling Index parsing', () => {
  const collectedAt = Date.UTC(2026, 7, 9, 8, 48, 21);
  const sourceUrl = 'https://www.linkedin.com/sales-api/salesApiSsi';

  it('reads and rounds the member SSI instead of either group rank', () => {
    const payload = {
      groupScore: [
        { rank: 85, groupType: 'INDUSTRY' },
        { rank: 94, groupType: 'NETWORK' },
      ],
      memberScore: {
        overall: 15.683752,
      },
    };

    expect(parseSocialSellingIndexSnapshot(payload, collectedAt, sourceUrl)).toEqual({
      score: 16,
      updatedAt: collectedAt,
      sourceUrl,
    });
  });

  it('accepts the boundary scores from zero through one hundred', () => {
    expect(parseSocialSellingIndexSnapshot({ memberScore: { overall: 0 } }, collectedAt, sourceUrl)?.score).toBe(0);
    expect(parseSocialSellingIndexSnapshot({ memberScore: { overall: 100 } }, collectedAt, sourceUrl)?.score).toBe(100);
  });

  it('rejects a response without a valid member score', () => {
    expect(parseSocialSellingIndexSnapshot({ groupScore: [{ rank: 85 }] }, collectedAt, sourceUrl)).toBeNull();
    expect(parseSocialSellingIndexSnapshot({ memberScore: { overall: 101 } }, collectedAt, sourceUrl)).toBeNull();
  });
});

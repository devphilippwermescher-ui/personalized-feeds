import { describe, expect, it } from 'vitest';
import type { ProfileViewerInput } from 'shared/types';
import { orderProfileViewersPage } from '../profile-viewers-page-order';

function viewer(linkedinUsername: string, viewedAgoText: string, sourceIndex: number): ProfileViewerInput {
  return {
    linkedinUsername,
    linkedinUrl: `https://www.linkedin.com/in/${linkedinUsername}/`,
    displayName: linkedinUsername,
    viewedAgoText,
    sourceIndex,
  };
}

describe('orderProfileViewersPage', () => {
  it('uses the rendered relative time when streamed references are out of order', () => {
    const result = orderProfileViewersPage([
      viewer('yurii-klymchuk-it', 'Viewed 2w ago', 10),
      viewer('oleksandr-alieksandrov', 'Viewed 1h ago', 20),
    ]);

    expect(result.map((item) => item.linkedinUsername)).toEqual(['oleksandr-alieksandrov', 'yurii-klymchuk-it']);
    expect(result.map((item) => item.listPosition)).toEqual([0, 1]);
  });

  it('keeps source order as the stable tie-break for equal relative times', () => {
    const result = orderProfileViewersPage([
      viewer('second', 'Viewed 1h ago', 20),
      viewer('first', 'Viewed 1h ago', 10),
    ]);

    expect(result.map((item) => item.linkedinUsername)).toEqual(['first', 'second']);
  });
});

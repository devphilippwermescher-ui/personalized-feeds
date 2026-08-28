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
  it('does not reorder rendered cards by coarse relative time', () => {
    const result = orderProfileViewersPage([
      viewer('yurii-klymchuk-it', 'Viewed 2w ago', 10),
      viewer('oleksandr-alieksandrov', 'Viewed 1h ago', 20),
    ]);

    expect(result.map((item) => item.linkedinUsername)).toEqual(['yurii-klymchuk-it', 'oleksandr-alieksandrov']);
    expect(result.map((item) => item.listPosition)).toEqual([0, 1]);
  });

  it('keeps source order as the stable tie-break for equal relative times', () => {
    const result = orderProfileViewersPage([
      viewer('second', 'Viewed 1h ago', 20),
      viewer('first', 'Viewed 1h ago', 10),
    ]);

    expect(result.map((item) => item.linkedinUsername)).toEqual(['first', 'second']);
  });

  it('uses LinkedIn semantic card positions before streamed definition order', () => {
    const nadira = viewer('nadira-sultankulova', 'Viewed 1mo ago', 10);
    const kamalakar = viewer('kamalakar-vatala', 'Viewed 1mo ago', 20);

    const result = orderProfileViewersPage([
      { ...nadira, renderPosition: 26 },
      { ...kamalakar, renderPosition: 25 },
    ]);

    expect(result.map((item) => item.linkedinUsername)).toEqual([
      'kamalakar-vatala',
      'nadira-sultankulova',
    ]);
  });
});

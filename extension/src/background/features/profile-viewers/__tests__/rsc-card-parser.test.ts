import { describe, expect, it } from 'vitest';
import { parseProfileViewerCardsFromRsc } from '../parsers/rsc-card-parser';
import { INTERLEAVED_PROFILE_VIEWERS_RSC_FIXTURE } from '../testing/interleaved-profile-viewers-rsc';
import { selectProfileViewerCollectionWindow } from '../utils/collection-window';
import { orderProfileViewersPage } from '../utils/page-order';

describe('Profile Visitors RSC card parser', () => {
  it('keeps identities inside their rendered card graph context', () => {
    const viewers = parseProfileViewerCardsFromRsc(
      INTERLEAVED_PROFILE_VIEWERS_RSC_FIXTURE
    );
    const rostyslav = viewers.find((viewer) => viewer.linkedinUsername === 'rossor');

    expect(rostyslav).toMatchObject({
      linkedinUrl: 'https://www.linkedin.com/in/rossor/',
      displayName: 'Rostyslav Osinchuk',
      headline: 'Founder at Product Studio',
      renderPosition: 24,
      identityUncertain: true,
      profileImageUrl: '',
    });
    expect(rostyslav?.displayName).not.toBe('Volodymyr Korol');
    expect(rostyslav?.profileImageUrl).not.toContain('volodymyr');
    expect(viewers.map((viewer) => viewer.linkedinUsername)).not.toContain(
      'volodymyr-korol'
    );
  });

  it('uses rendered semantic positions when definitions are interleaved', () => {
    const ordered = orderProfileViewersPage(
      parseProfileViewerCardsFromRsc(INTERLEAVED_PROFILE_VIEWERS_RSC_FIXTURE)
    );
    const usernames = ordered.map((viewer) => viewer.linkedinUsername);

    expect(usernames.indexOf('kamalakar-vatala')).toBeLessThan(
      usernames.indexOf('nadira-sultankulova')
    );
  });

  it('applies the Free window after card parsing, verification, and ordering', () => {
    const ordered = orderProfileViewersPage(
      parseProfileViewerCardsFromRsc(INTERLEAVED_PROFILE_VIEWERS_RSC_FIXTURE)
    );
    const result = selectProfileViewerCollectionWindow([], ordered, 10);

    expect(result.rankedViewers).toHaveLength(10);
    expect(result.rankedViewers.map((viewer) => viewer.linkedinUsername)).toEqual([
      'kamalakar-vatala',
      'nadira-sultankulova',
      ...Array.from({ length: 8 }, (_, index) => `verified-viewer-${index + 4}`),
    ]);
    expect(result.rankedViewers.map((viewer) => viewer.linkedinUsername)).not.toContain(
      'rossor'
    );
  });

  it('does not mistake a nested mutual-connection URL for another viewer card', () => {
    const payload = [
      '1:{"navigationUrl":"https://www.linkedin.com/in/kamalakar-vatala/"}',
      '2:{"children":[null,"Kamalakar Vatala"]}',
      '3:{"children":["Viewed 1mo ago","2 mutual connections"]}',
      '4:{"navigationUrl":"https://www.linkedin.com/in/nested-mutual-person/"}',
      '5:{"$type":"proto.sdui.common.SemanticPosition","verticalPosition":25}',
      'a:["$","div",null,{"children":["$L1","$L2","$L3","$L4","$L5"]}]',
      '0:["$","main",null,{"children":["$La"]}]',
    ].join('\n');

    expect(
      parseProfileViewerCardsFromRsc(payload).map((viewer) => viewer.linkedinUsername)
    ).toEqual(['kamalakar-vatala']);
  });
});

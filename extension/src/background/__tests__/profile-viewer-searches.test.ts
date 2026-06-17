import { describe, expect, it } from 'vitest';
import { extractProfileViewerSearches } from '../profile-viewer-searches';

describe('extractProfileViewerSearches', () => {
  it('extracts and canonicalizes an anonymous viewer search segment', () => {
    const payload = `
      <a href="https://www.linkedin.com/search/results/people/?keywords=Software+Developer&amp;origin=WHO_VIEWED_ME&amp;currentCompany=1053414&amp;sid=j~~">
        <p><span>Software Developer в MagView</span></p>
        <p>Переглянуто 1 міс. тому</p>
      </a>
    `;

    expect(extractProfileViewerSearches(payload)).toEqual([
      expect.objectContaining({
        itemType: 'search',
        displayName: 'Software Developer в MagView',
        keywords: 'Software Developer',
        currentCompany: '1053414',
        viewedAgoText: 'Переглянуто 1 міс. тому',
        searchKey:
          'currentCompany=1053414&keywords=Software+Developer&origin=WHO_VIEWED_ME',
        searchUrl:
          'https://www.linkedin.com/search/results/people/?currentCompany=1053414&keywords=Software+Developer&origin=WHO_VIEWED_ME',
      }),
    ]);
  });

  it('deduplicates equivalent escaped URLs independently of sid', () => {
    const payload = [
      '"/search/results/people/?keywords=Software%20Developer\\u0026origin=WHO_VIEWED_ME\\u0026currentCompany=1053414\\u0026sid=first"',
      '"https:\\/\\/www.linkedin.com\\/search\\/results\\/people\\/?currentCompany=1053414\\u0026keywords=Software%20Developer\\u0026origin=WHO_VIEWED_ME\\u0026sid=second"',
    ].join(' ');

    const searches = extractProfileViewerSearches(payload);
    expect(searches).toHaveLength(1);
    expect(searches[0].searchKey).not.toContain('sid');
  });

  it('does not use LinkedIn search URLs as the display name', () => {
    const payload = [
      '"https://www.linkedin.com/search/results/people/?currentCompany=1053414&keywords=Software%20Developer&origin=WHO_VIEWED_ME"',
      '"https://www.linkedin.com /results/people/?currentCompany=1053414&keywords=Software%20Developer&origin=WHO_VIEWED_ME"',
    ].join(' ');

    const searches = extractProfileViewerSearches(payload);
    expect(searches).toHaveLength(1);
    expect(searches[0].displayName).toBe('Software Developer');
  });

  it('extracts company-only anonymous viewer searches with empty keywords', () => {
    const payload = [
      '"children":["Someone at Hornetsecurity"]',
      '"url":"https://www.linkedin.com/search/results/people/?keywords=&origin=WHO_VIEWED_ME&currentCompany=750470"',
      '"children":["Viewed 6d ago"]',
    ].join(',');

    expect(extractProfileViewerSearches(payload)).toEqual([
      expect.objectContaining({
        itemType: 'search',
        displayName: 'Someone at Hornetsecurity',
        keywords: '',
        currentCompany: '750470',
        viewedAgoText: 'Viewed 6d ago',
        searchKey: 'currentCompany=750470&keywords=&origin=WHO_VIEWED_ME',
        searchUrl:
          'https://www.linkedin.com/search/results/people/?currentCompany=750470&keywords=&origin=WHO_VIEWED_ME',
      }),
    ]);
  });

  it('extracts company-only anonymous searches from partial pagination payloads', () => {
    const payload = [
      '"url":"https://www.linkedin.com/search/results/people/?keywords=&origin=WHO_VIEWED_ME&currentCompany=11727499"',
      '"children":["Someone at LAMPA Software"]',
      '"children":["Viewed 1w ago"]',
    ].join(',');

    expect(extractProfileViewerSearches(payload)).toEqual([
      expect.objectContaining({
        displayName: 'Someone at LAMPA Software',
        keywords: '',
        currentCompany: '11727499',
        viewedAgoText: 'Viewed 1w ago',
      }),
    ]);
  });

  it('prefers anonymous company labels over RSC technical strings', () => {
    const payload = [
      '"url":"https://www.linkedin.com/search/results/people/?keywords=&origin=WHO_VIEWED_ME&currentCompany=750470"',
      '"className":"_17ceb00c _6f4a3c15 d564c5b3 _6acd5688 bbb9c010 _75b045fb _8ba15302 f1493e7c e3c09adc _7b2ee40b"',
      '"children":["Someone at Hornetsecurity"]',
      '"linkColorTokens":"$undefined"',
      '"children":["Viewed 6d ago"]',
      '"url":"https://www.linkedin.com/search/results/people/?keywords=&origin=WHO_VIEWED_ME&currentCompany=28174419"',
      '"className":"_297bc8a0 _17ceb00c _6acd5688 _011d90be _75b045fb c3a418c0 _171666c2 b5d2f225 _7b2ee40b"',
      '"children":["Someone at TRUEPLAY"]',
      '"children":["Viewed 6d ago"]',
    ].join(',');

    expect(extractProfileViewerSearches(payload)).toEqual([
      expect.objectContaining({
        displayName: 'Someone at Hornetsecurity',
        keywords: '',
        currentCompany: '750470',
        viewedAgoText: 'Viewed 6d ago',
      }),
      expect.objectContaining({
        displayName: 'Someone at TRUEPLAY',
        keywords: '',
        currentCompany: '28174419',
        viewedAgoText: 'Viewed 6d ago',
      }),
    ]);
  });

  it('does not treat boolean RSC fragments as search display names', () => {
    const payload = [
      '"url":"https://www.linkedin.com/search/results/people/?keywords=&origin=WHO_VIEWED_ME&currentCompany=750470"',
      '":false}}}}]},',
      '"children":["Someone at Hornetsecurity"]',
      '"children":["Viewed 6d ago"]',
    ].join(',');

    expect(extractProfileViewerSearches(payload)).toEqual([
      expect.objectContaining({
        displayName: 'Someone at Hornetsecurity',
        currentCompany: '750470',
      }),
    ]);
  });

  it('ignores ordinary LinkedIn people searches not coming from profile viewers', () => {
    expect(
      extractProfileViewerSearches(
        '"/search/results/people/?keywords=Software%20Developer&origin=GLOBAL_SEARCH_HEADER"'
      )
    ).toEqual([]);
  });
});

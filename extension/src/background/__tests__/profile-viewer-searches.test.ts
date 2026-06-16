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

  it('ignores ordinary LinkedIn people searches not coming from profile viewers', () => {
    expect(
      extractProfileViewerSearches(
        '"/search/results/people/?keywords=Software%20Developer&origin=GLOBAL_SEARCH_HEADER"'
      )
    ).toEqual([]);
  });
});

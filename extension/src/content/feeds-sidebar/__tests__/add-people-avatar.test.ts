/**
 * Tests for Bug 1: avatars missing from Add People search results.
 *
 * Root cause: buildLinkedInImageUrl only pushed extracted URLs to fallbackUrls
 * when !targetProfileUrn && !targetUsername. Typeahead results always supply
 * both, so nonEntityProfilePicture URLs (which carry no identity fields and
 * therefore fail imageSourceMatchesProfile) were silently discarded.
 *
 * Fix: always push to fallbackUrls so that if no identity-matched image is
 * found, the first available URL is returned as a fallback.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeTypeaheadResponse(elements: unknown[]) {
  return {
    data: {
      data: {
        searchDashSharingByBlended: { elements },
      },
    },
  };
}

function makePersonElement(overrides: {
  profileUrn?: string;
  navigationUrl?: string;
  displayName?: string;
  subtitle?: string;
  image?: unknown;
}) {
  return {
    target: { '*profile': overrides.profileUrn ?? 'urn:li:fsd_profile:ACoTest123' },
    navigationUrl: overrides.navigationUrl ?? '/in/john-doe',
    title: { text: overrides.displayName ?? 'John Doe' },
    subtitle: { text: overrides.subtitle ?? '2nd • Software Engineer at Acme' },
    image: overrides.image ?? null,
  };
}

function makeNonEntityProfilePictureImage(rootUrl: string, artifacts: Array<{ width: number; path: string }>) {
  return {
    attributes: [
      {
        detailData: {
          nonEntityProfilePicture: {
            vectorImage: {
              rootUrl,
              artifacts: artifacts.map(({ width, path }) => ({
                width,
                fileIdentifyingUrlPathSegment: path,
              })),
            },
          },
        },
      },
    ],
  };
}

// ── Test setup ────────────────────────────────────────────────────────────────

beforeEach(() => {
  // Provide a minimal JSESSIONID cookie so getLinkedInCsrfToken returns a value.
  Object.defineProperty(document, 'cookie', {
    get: () => 'JSESSIONID=ajax:test-csrf-token',
    configurable: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

// ── Bug 1: nonEntityProfilePicture ────────────────────────────────────────────

describe('searchLinkedInPeople — avatar from nonEntityProfilePicture', () => {
  it('returns profileImageUrl when the typeahead element has nonEntityProfilePicture', async () => {
    const rootUrl = 'https://media.licdn.com/dms/image/D4E03AQH/';
    const path100 = 'profile-displayphoto-shrink_100_100/photo.jpg';
    const path200 = 'profile-displayphoto-shrink_200_200/photo.jpg';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () =>
          makeTypeaheadResponse([
            makePersonElement({
              image: makeNonEntityProfilePictureImage(rootUrl, [
                { width: 100, path: path100 },
                { width: 200, path: path200 },
              ]),
            }),
          ]),
      })
    );

    const { searchLinkedInPeople } = await import('../logic/linkedin-search');
    const results = await searchLinkedInPeople('john');

    expect(results).toHaveLength(1);
    // Should pick the highest-width artifact (200px)
    expect(results[0].profileImageUrl).toBe(`${rootUrl}${path200}`);
  });

  it('returns profileImageUrl for company logo (nonEntityCompanyLogo shape)', async () => {
    const rootUrl = 'https://media.licdn.com/dms/image/C4E0BAQ/';
    const logoPath = 'company-logo_200_200/logo.png';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () =>
          makeTypeaheadResponse([
            makePersonElement({
              image: {
                attributes: [
                  {
                    detailData: {
                      nonEntityProfilePicture: {
                        vectorImage: {
                          rootUrl,
                          artifacts: [{ width: 200, fileIdentifyingUrlPathSegment: logoPath }],
                        },
                      },
                    },
                  },
                ],
              },
            }),
          ]),
      })
    );

    const { searchLinkedInPeople } = await import('../logic/linkedin-search');
    const results = await searchLinkedInPeople('acme');

    expect(results).toHaveLength(1);
    expect(results[0].profileImageUrl).toBe(`${rootUrl}${logoPath}`);
  });

  it('gracefully omits profileImageUrl when the image field is null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () =>
          makeTypeaheadResponse([makePersonElement({ image: null })]),
      })
    );

    const { searchLinkedInPeople } = await import('../logic/linkedin-search');
    const results = await searchLinkedInPeople('john');

    expect(results).toHaveLength(1);
    expect(results[0].profileImageUrl).toBeFalsy();
  });

  it('gracefully omits profileImageUrl when attributes array is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () =>
          makeTypeaheadResponse([makePersonElement({ image: { attributes: [] } })]),
      })
    );

    const { searchLinkedInPeople } = await import('../logic/linkedin-search');
    const results = await searchLinkedInPeople('john');

    expect(results).toHaveLength(1);
    expect(results[0].profileImageUrl).toBeFalsy();
  });

  it('still works when profileImageUrl is passed through toLinkedInProfileData', async () => {
    const rootUrl = 'https://media.licdn.com/dms/image/D4E03AQH/';
    const path200 = 'profile-displayphoto-shrink_200_200/photo.jpg';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () =>
          makeTypeaheadResponse([
            makePersonElement({
              image: makeNonEntityProfilePictureImage(rootUrl, [
                { width: 200, path: path200 },
              ]),
            }),
          ]),
      })
    );

    const { searchLinkedInPeople, toLinkedInProfileData } = await import('../logic/linkedin-search');
    const results = await searchLinkedInPeople('john');
    const profileData = toLinkedInProfileData(results[0]);

    expect(profileData.profileImageUrl).toBe(`${rootUrl}${path200}`);
  });

  it('passes memberNumericId through toLinkedInProfileData when trackingUrn is present', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () =>
          makeTypeaheadResponse([
            {
              ...makePersonElement({}),
              trackingUrn: 'urn:li:member:12605988',
            },
          ]),
      })
    );

    const { searchLinkedInPeople, toLinkedInProfileData } = await import('../logic/linkedin-search');
    const [result] = await searchLinkedInPeople('john');
    const profileData = toLinkedInProfileData(result);

    expect(result.memberNumericId).toBe('12605988');
    expect(profileData.memberNumericId).toBe('12605988');
  });
});

// ── Artifact size selection ───────────────────────────────────────────────────

describe('searchLinkedInPeople — best artifact size selection', () => {
  it('picks the highest-width artifact when multiple sizes are available', async () => {
    const rootUrl = 'https://media.licdn.com/dms/image/D4E03AQH/';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () =>
          makeTypeaheadResponse([
            makePersonElement({
              image: makeNonEntityProfilePictureImage(rootUrl, [
                { width: 48, path: 'photo_48.jpg' },
                { width: 100, path: 'photo_100.jpg' },
                { width: 400, path: 'photo_400.jpg' },
                { width: 200, path: 'photo_200.jpg' },
              ]),
            }),
          ]),
      })
    );

    const { searchLinkedInPeople } = await import('../logic/linkedin-search');
    const results = await searchLinkedInPeople('john');

    expect(results[0].profileImageUrl).toBe(`${rootUrl}photo_400.jpg`);
  });
});

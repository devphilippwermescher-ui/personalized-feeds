/**
 * Regression test for double-encoding bug:
 *
 *   Username stored in Firestore: "karen-w%C3%BCst"
 *   encodeURIComponent("karen-w%C3%BCst") → "karen-w%25C3%25BCst"  ← WRONG
 *   safeEncodeUsername("karen-w%C3%BCst") → "karen-w%C3%BCst"       ← correct
 *
 * The double-encoded URL returns a LinkedIn 404/generic page instead of
 * the real profile, causing the parser to incorrectly return "connected".
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Pull the helper out for unit-testing ─────────────────────────────────
// We test the logic in isolation by reimplementing it here, mirroring api.ts.
function safeEncodeUsername(username: string): string {
  let decoded = username;
  try { decoded = decodeURIComponent(username); } catch { /* keep original */ }
  return encodeURIComponent(decoded);
}

describe('safeEncodeUsername — URL encoding helper', () => {
  it('does NOT double-encode an already percent-encoded username', () => {
    // Username stored as "karen-w%C3%BCst" (ü encoded once)
    const result = safeEncodeUsername('karen-w%C3%BCst');
    expect(result).toBe('karen-w%C3%BCst');
    expect(result).not.toContain('%25'); // no %25 = no double-encoding
  });

  it('single-encodes a raw Unicode username', () => {
    const result = safeEncodeUsername('karen-wüst');
    expect(result).toBe('karen-w%C3%BCst');
  });

  it('handles ASCII-only usernames unchanged', () => {
    expect(safeEncodeUsername('john-doe')).toBe('john-doe');
  });

  it('handles Cyrillic username stored as percent-encoded', () => {
    // "%D0%B5%D0%BB%D0%B5%D0%BD%D0%B0" = "елена" encoded once
    const raw = '%D0%B5%D0%BB%D0%B5%D0%BD%D0%B0-samoylenko-a305bb165';
    const result = safeEncodeUsername(raw);
    // Must not produce %25D0%25B5... (double-encoding)
    expect(result).not.toContain('%25D0');
    // Should produce the same single-encoded form
    expect(result).toBe(encodeURIComponent(decodeURIComponent(raw)));
  });

  it('does not crash on malformed percent sequences', () => {
    // decodeURIComponent would throw; we fall back to original
    const malformed = 'user%ZZname';
    expect(() => safeEncodeUsername(malformed)).not.toThrow();
    // Fallback encodes the original string
    expect(safeEncodeUsername(malformed)).toBe(encodeURIComponent(malformed));
  });
});

// ── Integration: verify the correct URL is constructed ───────────────────

describe('fetchStatusFromProfilePage — URL construction', () => {
  const capturedUrls: string[] = [];

  beforeEach(() => {
    capturedUrls.length = 0;
    vi.stubGlobal('fetch', async (url: string) => {
      capturedUrls.push(url);
      // Simulate LinkedIn returning a non-ok response so the function returns null
      return { ok: false } as Response;
    });
    // Stub DOMParser (used by parsers but not needed here)
    vi.stubGlobal('DOMParser', class {
      parseFromString() { return { querySelectorAll: () => [] }; }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends a single-encoded URL for a percent-encoded stored username', async () => {
    const { fetchStatusFromProfilePage } = await import('../api');
    await fetchStatusFromProfilePage('karen-w%C3%BCst');

    expect(capturedUrls).toHaveLength(1);
    const url = capturedUrls[0];
    // Must be single-encoded: %C3%BC (not double: %25C3%25BC)
    expect(url).toContain('karen-w%C3%BCst');
    expect(url).not.toContain('%25C3%25BC');
    expect(url).toBe('https://www.linkedin.com/in/karen-w%C3%BCst/');
  });

  it('sends correct URL for a raw Unicode username', async () => {
    const { fetchStatusFromProfilePage } = await import('../api');
    await fetchStatusFromProfilePage('karen-wüst');

    const url = capturedUrls[0];
    expect(url).toBe('https://www.linkedin.com/in/karen-w%C3%BCst/');
    expect(url).not.toContain('%25');
  });

  it('returns unavailable for HTTP 404 profile pages', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      capturedUrls.push(url);
      return {
        ok: false,
        status: 404,
      } as Response;
    }));

    const { fetchStatusFromProfilePage } = await import('../api');
    const result = await fetchStatusFromProfilePage('deleted-profile');

    expect(result).toMatchObject({
      status: 'unavailable',
      canMessage: false,
      canFollow: false,
      canConnect: false,
      isFollowing: false,
    });
  });
});

describe('resolveCanonicalLinkedInIdentity', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      url: 'https://www.linkedin.com/in/alina-oharova-a7b718259/',
      text: async () => `
        <html>
          <script>
            window.__como_rehydration__ = ["initialPath":"\\/in\\/alina-oharova-a7b718259\\/","vanityName":"alina-oharova-a7b718259"];
          </script>
        </html>
      `,
    }) as Response));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('extracts canonical vanity slug from token profile HTML', async () => {
    const { resolveCanonicalLinkedInIdentity } = await import('../api');
    const result = await resolveCanonicalLinkedInIdentity(
      'https://www.linkedin.com/in/ACoAAD-k8P8BVBQtJpze3MdxLgVqCqsIrUk7Mqs?miniProfileUrn=urn%3Ali%3Afs_miniProfile%3AACoAAD-k8P8BVBQtJpze3MdxLgVqCqsIrUk7Mqs',
      'ACoAAD-k8P8BVBQtJpze3MdxLgVqCqsIrUk7Mqs'
    );

    expect(result).toEqual({
      username: 'alina-oharova-a7b718259',
      linkedinUrl: 'https://www.linkedin.com/in/alina-oharova-a7b718259/',
    });
  });

  it('extracts canonical vanity slug from escaped rehydrate-data strings', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      url: 'https://www.linkedin.com/in/ACoAAD-k8P8BVBQtJpze3MdxLgVqCqsIrUk7Mqs?miniProfileUrn=urn%3Ali%3Afs_miniProfile%3AACoAAD-k8P8BVBQtJpze3MdxLgVqCqsIrUk7Mqs',
      text: async () => `
        <html>
          <script>
            window.__como_rehydration__ = ["0:[{\\"initialPath\\":\\"/in/alina-oharova-a7b718259/\\"}]","1:[{\\"vanityName\\":\\"alina-oharova-a7b718259\\"}]"];
          </script>
        </html>
      `,
    }) as Response));

    const { resolveCanonicalLinkedInIdentity } = await import('../api');
    const result = await resolveCanonicalLinkedInIdentity(
      'https://www.linkedin.com/in/ACoAAD-k8P8BVBQtJpze3MdxLgVqCqsIrUk7Mqs?miniProfileUrn=urn%3Ali%3Afs_miniProfile%3AACoAAD-k8P8BVBQtJpze3MdxLgVqCqsIrUk7Mqs',
      'ACoAAD-k8P8BVBQtJpze3MdxLgVqCqsIrUk7Mqs'
    );

    expect(result?.username).toBe('alina-oharova-a7b718259');
  });
});

describe('sendLinkedInConnectRequest', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
    }) as Response));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the Voyager invitation request with current relationship headers', async () => {
    const { sendLinkedInConnectRequest } = await import('../api');
    await sendLinkedInConnectRequest(
      'urn:li:fsd_profile:ACoAAConnectTest',
      'https://www.linkedin.com/in/connect-test/'
    );

    expect(fetch).toHaveBeenCalledWith(
      'https://www.linkedin.com/voyager/api/voyagerRelationshipsDashMemberRelationships?action=verifyQuotaAndCreateV2&decorationId=com.linkedin.voyager.dash.deco.relationships.InvitationCreationResultWithInvitee-2',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        referrer: 'https://www.linkedin.com/in/connect-test/',
        headers: expect.objectContaining({
          accept: 'application/vnd.linkedin.normalized+json+2.1',
          'content-type': 'application/json; charset=UTF-8',
          'x-li-deco-include-micro-schema': 'true',
          'x-li-lang': 'en_US',
          'x-li-pem-metadata': 'Voyager - Profile Actions=topcard-primary-connect-action-click,Voyager - Invitations - Actions=invite-send',
          'x-restli-protocol-version': '2.0.0',
        }),
        body: JSON.stringify({
          invitee: {
            inviteeUnion: {
              memberProfile: 'urn:li:fsd_profile:ACoAAConnectTest',
            },
          },
        }),
      })
    );
  });

  it('retries the connect request in the background when the content request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('content fetch failed');
    }));

    const sendMessage = vi.fn((message, callback) => {
      callback({ success: true });
    });
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage,
        lastError: null,
      },
    });

    const { sendLinkedInConnectRequest } = await import('../api');
    await sendLinkedInConnectRequest(
      'urn:li:fsd_profile:ACoAAConnectFallback',
      'https://www.linkedin.com/in/connect-fallback/'
    );

    expect(sendMessage).toHaveBeenCalledWith(
      {
        type: 'LINKEDIN_CONNECT_REQUEST_BACKGROUND',
        profileUrn: 'urn:li:fsd_profile:ACoAAConnectFallback',
        referrerUrl: 'https://www.linkedin.com/in/connect-fallback/',
      },
      expect.any(Function)
    );
  });
});

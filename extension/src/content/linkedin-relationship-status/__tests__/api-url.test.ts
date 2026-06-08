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

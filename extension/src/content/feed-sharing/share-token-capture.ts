/**
 * Runs at document_start on /feed — before LinkedIn's SPA can strip #sharefeed or ?sharefeed.
 * Persists the token to sessionStorage so the feeds-sidebar script can read it later at document_idle.
 */
const STORAGE_KEY = 'lfa_pending_sharefeed';

function extractToken(href: string): string | null {
  try {
    const u = new URL(href);
    const q = u.searchParams.get('sharefeed');
    if (q) {
      return q;
    }
    const raw = u.hash.replace(/^#/, '');
    if (!raw) {
      return null;
    }
    if (raw.startsWith('sharefeed=')) {
      return decodeURIComponent(raw.slice('sharefeed='.length).split('&')[0]);
    }
    return new URLSearchParams(raw).get('sharefeed');
  } catch {
    return null;
  }
}

try {
  const token = extractToken(window.location.href);
  if (token) {
    sessionStorage.setItem(STORAGE_KEY, token);
  }
} catch {
  /* sessionStorage may be unavailable in edge cases */
}

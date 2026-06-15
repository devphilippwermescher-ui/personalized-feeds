const PENDING_SHARE_SESSION_KEY = 'lfa_pending_sharefeed';

export function getSharefeedTokenFromLocation(): string | null {
  try {
    const url = new URL(window.location.href);
    const fromQuery = url.searchParams.get('sharefeed');
    if (fromQuery) {
      return fromQuery;
    }

    const rawHash = url.hash.replace(/^#/, '');
    if (rawHash.startsWith('sharefeed=')) {
      return decodeURIComponent(rawHash.slice('sharefeed='.length).split('&')[0]);
    }

    if (rawHash) {
      const fromHash = new URLSearchParams(rawHash).get('sharefeed');
      if (fromHash) {
        return fromHash;
      }
    }
  } catch {
    /* ignore malformed locations */
  }

  try {
    return sessionStorage.getItem(PENDING_SHARE_SESSION_KEY);
  } catch {
    return null;
  }
}

export function stripSharefeedFromLocation(): void {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('sharefeed');
    const rawHash = url.hash.replace(/^#/, '');

    if (rawHash.startsWith('sharefeed=')) {
      url.hash = '';
    } else if (rawHash) {
      const hashParams = new URLSearchParams(rawHash);
      if (hashParams.has('sharefeed')) {
        hashParams.delete('sharefeed');
        url.hash = hashParams.toString() ? `#${hashParams.toString()}` : '';
      }
    }

    window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
  } catch {
    /* ignore malformed locations */
  }

  try {
    sessionStorage.removeItem(PENDING_SHARE_SESSION_KEY);
  } catch {
    /* ignore unavailable session storage */
  }
}

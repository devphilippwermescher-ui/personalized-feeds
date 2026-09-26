const LINKEDIN_IMAGE_HOST_SUFFIX = '.licdn.com';

/**
 * Returns a persistable LinkedIn-hosted profile image URL.
 *
 * Feed members must never retain extension-owned image URLs: an injected
 * control can temporarily be the first image in a partially hydrated
 * LinkedIn card. Restricting this boundary to HTTPS LinkedIn CDN URLs also
 * keeps transient blob/data URLs out of Firestore.
 */
export function normalizeLinkedInProfileImageUrl(value: string | undefined, now = Date.now()): string {
  const candidate = (value || '').trim();
  if (!candidate) return '';

  try {
    const url = new URL(candidate);
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || !hostname.endsWith(LINKEDIN_IMAGE_HOST_SUFFIX)) {
      return '';
    }

    const expiryValue = url.searchParams.get('e');
    if (expiryValue) {
      const rawExpiry = Number(expiryValue);
      if (!Number.isFinite(rawExpiry) || rawExpiry <= 0) return '';
      const expiresAt = expiryValue.length > 10 ? rawExpiry : rawExpiry * 1000;
      if (expiresAt <= now) return '';
    }

    return candidate;
  } catch {
    return '';
  }
}

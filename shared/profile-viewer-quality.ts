function normalizeComparableName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\p{L}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function humanizeLinkedInUsername(linkedinUsername: string): string {
  return linkedinUsername
    .split(/[-_]+/)
    .filter((part) => part && !/^\d+[a-z0-9]*$/i.test(part))
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

export function isWeakProfileViewerDisplayName(
  displayName: string | undefined,
  linkedinUsername: string
): boolean {
  const value = (displayName || '').trim();
  if (!value) {
    return true;
  }

  if (
    /^https?:\/\//i.test(value) ||
    value.includes('/') ||
    /linkedin.*(?:sign in|log in)|(?:sign in|log in).*linkedin/i.test(value) ||
    /^(offsetstart|offsetend|navigationurl|linkedin|sign in|log in)$/i.test(value)
  ) {
    return true;
  }

  const normalizedUsername = linkedinUsername.trim().toLowerCase();
  return value.toLowerCase() === normalizedUsername;
}

export function chooseProfileViewerDisplayName(
  incoming: string | undefined,
  existing: string | undefined,
  linkedinUsername: string
): string {
  const normalizedIncoming = (incoming || '').trim();
  const normalizedExisting = (existing || '').trim();

  if (!isWeakProfileViewerDisplayName(normalizedIncoming, linkedinUsername)) {
    return normalizedIncoming;
  }

  if (!isWeakProfileViewerDisplayName(normalizedExisting, linkedinUsername)) {
    return normalizedExisting;
  }

  const humanized = humanizeLinkedInUsername(linkedinUsername);
  return humanized || normalizedIncoming || normalizedExisting;
}

export function isUsableLinkedInProfileImageUrl(
  url: string | undefined,
  now = Date.now()
): url is string {
  const value = (url || '').trim();
  if (!/^https:\/\/media\.licdn\.com\//i.test(value)) {
    return false;
  }

  if (!/profile-(?:displayphoto|framedphoto)/i.test(value)) {
    return false;
  }

  if (
    /profile-(?:displayphoto|framedphoto)[^/?#]*[_/]$/i.test(value) ||
    /\/profile-(?:displayphoto|framedphoto)[^/?#]*$/i.test(value)
  ) {
    return false;
  }

  const expiryMatch = value.match(/[?&]e=(\d+)(?:&|$)/);
  if (!expiryMatch?.[1]) {
    return true;
  }

  const rawExpiry = Number(expiryMatch[1]);
  if (!Number.isFinite(rawExpiry) || rawExpiry <= 0) {
    return false;
  }

  const expiresAt = expiryMatch[1].length > 10 ? rawExpiry : rawExpiry * 1000;
  return expiresAt > now;
}

export function chooseProfileViewerImageUrl(
  incoming: string | undefined,
  existing: string | undefined,
  now = Date.now()
): string {
  if (isUsableLinkedInProfileImageUrl(incoming, now)) {
    return incoming.trim();
  }

  if (isUsableLinkedInProfileImageUrl(existing, now)) {
    return existing.trim();
  }

  return '';
}

export function getAmbiguousProfileViewerImageUrls(
  viewers: Array<{
    linkedinUsername?: string;
    profileImageUrl?: string;
  }>
): Set<string> {
  const ownersByImageUrl = new Map<string, Set<string>>();

  viewers.forEach((viewer, index) => {
    const imageUrl = viewer.profileImageUrl?.trim();
    if (!imageUrl) {
      return;
    }

    const owner = viewer.linkedinUsername?.trim().toLowerCase() || `unknown-${index}`;
    const owners = ownersByImageUrl.get(imageUrl) || new Set<string>();
    owners.add(owner);
    ownersByImageUrl.set(imageUrl, owners);
  });

  return new Set(
    [...ownersByImageUrl.entries()]
      .filter(([, owners]) => owners.size > 1)
      .map(([imageUrl]) => imageUrl)
  );
}

export function namesLikelyReferToSameProfile(
  displayName: string,
  linkedinUsername: string
): boolean {
  const normalizedName = normalizeComparableName(displayName);
  const normalizedHumanized = normalizeComparableName(humanizeLinkedInUsername(linkedinUsername));
  return Boolean(normalizedName && normalizedName === normalizedHumanized);
}

/**
 * LinkedIn activity identity helpers.
 *
 * The same post is addressable as `urn:li:activity:<id>` and
 * `urn:li:share:<id>`. Both are kept, but only the activity id is canonical.
 */
const URN_ID_PATTERN = /urn:li:(?:fsd_)?(activity|share|ugcPost)[:(](\d{6,})/;

export interface LinkedInActivityIdentity {
  activityUrn?: string;
  shareUrn?: string;
  activityId?: string;
}

export function extractActivityId(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = value.match(URN_ID_PATTERN);
  if (match) return match[2];
  return /^\d{6,}$/.test(value.trim()) ? value.trim() : undefined;
}

export function toActivityUrn(activityId: string): string {
  return `urn:li:activity:${activityId}`;
}

/** Merges every urn seen for one post into a single canonical identity. */
export function resolveActivityIdentity(candidates: Array<string | undefined>): LinkedInActivityIdentity {
  const identity: LinkedInActivityIdentity = {};
  candidates.forEach((candidate) => {
    if (!candidate) return;
    const match = candidate.match(URN_ID_PATTERN);
    if (!match) return;
    if (match[1] === 'share' && !identity.shareUrn) identity.shareUrn = `urn:li:share:${match[2]}`;
    if (match[1] !== 'share' && !identity.activityUrn) identity.activityUrn = toActivityUrn(match[2]);
    if (!identity.activityId) identity.activityId = match[2];
  });
  if (!identity.activityUrn && identity.activityId) identity.activityUrn = toActivityUrn(identity.activityId);
  return identity;
}

/**
 * LinkedIn activity ids are snowflake-style: the top 41 bits are the creation
 * time in milliseconds since the Unix epoch. `BigInt` avoids the precision
 * loss a plain `Number` shift would introduce past 2^53.
 */
export function getActivityPublishedAt(activityId: string): number | undefined {
  if (!/^\d{6,}$/.test(activityId)) return undefined;

  try {
    const timestamp = Number(BigInt(activityId) >> 22n);
    // Reject anything outside LinkedIn's plausible publishing window.
    return timestamp > 1_100_000_000_000 && timestamp < 4_100_000_000_000 ? timestamp : undefined;
  } catch {
    return undefined;
  }
}

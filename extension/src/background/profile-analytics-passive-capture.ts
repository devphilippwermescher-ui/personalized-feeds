import { getProfileAnalyticsSnapshot, upsertProfileAnalyticsSnapshot } from 'shared/firestore-service';
import type { ProfileAnalyticsProfileSnapshot } from 'shared/types';
import { getAuthenticatedFeedsUser } from './feeds-auth';

interface PassiveAnalyticsCapture {
  sourceUrl: string;
  capturedAt: number;
  connectionsCount?: number;
  connectionsExact?: boolean;
  followersCount?: number;
  followersExact?: boolean;
  socialSellingIndexScore?: number;
}

interface PassiveCapturePersistResult {
  written: boolean;
  reason?: 'no_auth' | 'unchanged';
}

let activeWrite: Promise<void> = Promise.resolve();

function normalizeCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function normalizeSsiScore(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100 ? value : undefined;
}

function isAuthoritativeConnectionsSource(sourceUrl: string): boolean {
  try {
    const url = new URL(sourceUrl);
    return url.hostname === 'www.linkedin.com' && url.pathname === '/flagship-web/mynetwork/invite-connect/connections';
  } catch {
    return false;
  }
}

function normalizeCapture(value: unknown): PassiveAnalyticsCapture | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  const sourceUrl = typeof input.sourceUrl === 'string' ? input.sourceUrl : '';
  if (!sourceUrl.startsWith('https://www.linkedin.com/')) return null;
  const rawConnectionsCount = normalizeCount(input.connectionsCount);
  const connectionsExact =
    rawConnectionsCount !== undefined && input.connectionsExact === true && isAuthoritativeConnectionsSource(sourceUrl);
  const connectionsCount = connectionsExact ? rawConnectionsCount : undefined;
  const followersCount = normalizeCount(input.followersCount);
  const socialSellingIndexScore = normalizeSsiScore(input.socialSellingIndexScore);
  if (connectionsCount === undefined && followersCount === undefined && socialSellingIndexScore === undefined) {
    return null;
  }
  const capturedAt =
    typeof input.capturedAt === 'number' && Number.isFinite(input.capturedAt) ? input.capturedAt : Date.now();
  return {
    sourceUrl,
    capturedAt,
    connectionsCount,
    connectionsExact,
    followersCount,
    followersExact: input.followersExact === true,
    socialSellingIndexScore,
  };
}

async function persistPassiveCapture(capture: PassiveAnalyticsCapture): Promise<PassiveCapturePersistResult> {
  const user = await getAuthenticatedFeedsUser();
  if (!user) return { written: false, reason: 'no_auth' };
  const current = await getProfileAnalyticsSnapshot(user.uid);
  const currentProfile = current?.profile;

  const connectionsChanged =
    Boolean(currentProfile) &&
    typeof capture.connectionsCount === 'number' &&
    capture.connectionsCount !== currentProfile?.connectionsCount;
  const connectionsExactChanged =
    Boolean(currentProfile) &&
    typeof capture.connectionsCount === 'number' &&
    capture.connectionsExact === true &&
    currentProfile?.connectionsCountExact !== true;
  const followersChanged =
    Boolean(currentProfile) &&
    typeof capture.followersCount === 'number' &&
    capture.followersCount !== currentProfile?.followersCount;
  const followersExactChanged =
    Boolean(currentProfile) &&
    typeof capture.followersCount === 'number' &&
    capture.followersExact &&
    currentProfile?.followersCountExact !== true;
  const socialSellingIndexChanged =
    typeof capture.socialSellingIndexScore === 'number' &&
    capture.socialSellingIndexScore !== current?.socialSellingIndex?.score;
  if (
    !connectionsChanged &&
    !connectionsExactChanged &&
    !followersChanged &&
    !followersExactChanged &&
    !socialSellingIndexChanged
  ) {
    return { written: false, reason: 'unchanged' };
  }

  const profile: ProfileAnalyticsProfileSnapshot | undefined = currentProfile
    ? {
        ...currentProfile,
        ...(connectionsChanged ? { connectionsCount: capture.connectionsCount } : {}),
        ...((connectionsChanged || connectionsExactChanged) && capture.connectionsExact
          ? {
              connectionsCountExact: true,
              connectionsCountUpdatedAt: capture.capturedAt,
              connectionsCountSource: 'connections_rsc' as const,
            }
          : {}),
        ...(followersChanged ? { followersCount: capture.followersCount } : {}),
        ...(followersExactChanged ? { followersCountExact: true } : {}),
        // A zero-traffic passive observation must not make the full six-hour
        // analytics cycle look fresh; only the observed totals are newer.
        updatedAt: currentProfile.updatedAt,
      }
    : undefined;
  await upsertProfileAnalyticsSnapshot(
    user.uid,
    {
      ...(profile && (connectionsChanged || connectionsExactChanged || followersChanged || followersExactChanged)
        ? { profile }
        : {}),
      ...(socialSellingIndexChanged
        ? {
            socialSellingIndex: {
              score: capture.socialSellingIndexScore,
              updatedAt: capture.capturedAt,
              sourceUrl: capture.sourceUrl,
            },
          }
        : {}),
    },
    { updatedAt: capture.capturedAt }
  );
  console.info('[profile-analytics] passive LinkedIn response captured', {
    connectionsCount: connectionsChanged ? capture.connectionsCount : undefined,
    connectionsExact: connectionsExactChanged ? true : undefined,
    followersCount: followersChanged ? capture.followersCount : undefined,
    socialSellingIndexScore: socialSellingIndexChanged ? capture.socialSellingIndexScore : undefined,
    sourceUrl: capture.sourceUrl,
  });
  return { written: true };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'PROFILE_ANALYTICS_PASSIVE_CAPTURE') return false;
  if (!sender.tab?.url?.startsWith('https://www.linkedin.com/')) {
    sendResponse({ success: false });
    return false;
  }
  const capture = normalizeCapture(message.capture);
  if (!capture) {
    sendResponse({ success: false });
    return false;
  }
  const operation = activeWrite.catch(() => undefined).then(() => persistPassiveCapture(capture));
  activeWrite = operation.then(() => undefined);
  operation
    .then((result) => sendResponse({ success: true, ...result }))
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.warn('[profile-analytics] passive LinkedIn response could not be persisted', { error: message });
      sendResponse({ success: false, error: message });
    });
  return true;
});

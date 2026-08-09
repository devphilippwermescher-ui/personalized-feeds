import { getProfileAnalyticsSnapshot, upsertProfileAnalyticsSnapshot } from 'shared/firestore-service';
import type { ProfileAnalyticsProfileSnapshot } from 'shared/types';
import { getAuthenticatedFeedsUser } from './feeds-auth';

interface PassiveAnalyticsCapture {
  sourceUrl: string;
  capturedAt: number;
  connectionsCount?: number;
  followersCount?: number;
}

let activeWrite: Promise<void> = Promise.resolve();

function normalizeCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function normalizeCapture(value: unknown): PassiveAnalyticsCapture | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  const sourceUrl = typeof input.sourceUrl === 'string' ? input.sourceUrl : '';
  if (!sourceUrl.startsWith('https://www.linkedin.com/')) return null;
  const connectionsCount = normalizeCount(input.connectionsCount);
  const followersCount = normalizeCount(input.followersCount);
  if (connectionsCount === undefined && followersCount === undefined) return null;
  const capturedAt =
    typeof input.capturedAt === 'number' && Number.isFinite(input.capturedAt) ? input.capturedAt : Date.now();
  return { sourceUrl, capturedAt, connectionsCount, followersCount };
}

async function persistPassiveCapture(capture: PassiveAnalyticsCapture): Promise<void> {
  const user = await getAuthenticatedFeedsUser();
  if (!user) return;
  const current = await getProfileAnalyticsSnapshot(user.uid);
  if (!current?.profile) return;

  const connectionsChanged =
    typeof capture.connectionsCount === 'number' && capture.connectionsCount !== current.profile.connectionsCount;
  const followersChanged =
    typeof capture.followersCount === 'number' && capture.followersCount !== current.profile.followersCount;
  if (!connectionsChanged && !followersChanged) return;

  const profile: ProfileAnalyticsProfileSnapshot = {
    ...current.profile,
    ...(connectionsChanged ? { connectionsCount: capture.connectionsCount } : {}),
    ...(followersChanged ? { followersCount: capture.followersCount } : {}),
    // A zero-traffic passive observation must not make the full six-hour
    // analytics cycle look fresh; only the observed totals are newer.
    updatedAt: current.profile.updatedAt,
  };
  await upsertProfileAnalyticsSnapshot(user.uid, { profile }, { updatedAt: capture.capturedAt });
  console.info('[profile-analytics] passive LinkedIn response captured', {
    connectionsCount: connectionsChanged ? capture.connectionsCount : undefined,
    followersCount: followersChanged ? capture.followersCount : undefined,
    sourceUrl: capture.sourceUrl,
  });
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
  activeWrite = activeWrite.catch(() => undefined).then(() => persistPassiveCapture(capture));
  activeWrite.then(() => sendResponse({ success: true })).catch(() => sendResponse({ success: false }));
  return true;
});

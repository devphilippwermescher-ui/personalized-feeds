import {
  getConnectionInvites,
  markConnectionInviteAccepted,
} from 'shared/firestore-service';
import { normalizeLinkedInUsername } from 'shared/linkedin-identity';
import { getAuthenticatedFeedsUser } from './feeds-auth';
import { resolveLinkedInRelationshipStatusInBackground } from './linkedin-relationship-status-resolver';

export const CONNECTION_INVITES_STATUS_ALARM_NAME = 'connection-invites-status-sync';

const CONNECTION_INVITES_SYNC_STATE_KEY = 'mfp_connection_invites_status_sync_v1';
const CONNECTION_INVITES_SYNC_INTERVAL_MS = 30 * 60 * 1000;
const CONNECTION_INVITES_SYNC_URGENT_DELAY_MS = 15 * 1000;
const CONNECTION_INVITES_SYNC_PENDING_RETRY_MS = 2 * 60 * 1000;
const CONNECTION_INVITES_SYNC_LEASE_MS = 2 * 60 * 1000;
const CONNECTION_INVITES_SYNC_BATCH_LIMIT = 20;
const CONNECTION_INVITES_SYNC_REQUEST_DELAY_MS = 5_000;
const CONNECTION_INVITES_ACCEPTANCE_GRACE_MS = 0;

type ConnectionInvitesStatusSyncTrigger =
  | 'install'
  | 'update'
  | 'chrome_startup'
  | 'service_worker'
  | 'alarm'
  | 'invite_sent'
  | 'profile_analytics'
  | 'manual';

interface ConnectionInvitesStatusSyncState {
  userId?: string;
  inProgressUntil?: number;
  lastStartedAt?: number;
  lastCompletedAt?: number;
  nextDueAt?: number;
  updatedAt: number;
}

export interface ConnectionInvitesStatusSyncResult {
  ran: boolean;
  success: boolean;
  checkedCount?: number;
  acceptedCount?: number;
  pendingCount?: number;
  skippedCount?: number;
  nextDueAt?: number;
  error?: string;
}

function getStoredConnectionInvitesSyncState(): Promise<ConnectionInvitesStatusSyncState | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(CONNECTION_INVITES_SYNC_STATE_KEY, (stored) => {
      const value = stored[CONNECTION_INVITES_SYNC_STATE_KEY];
      resolve(value && typeof value === 'object' ? value as ConnectionInvitesStatusSyncState : null);
    });
  });
}

function setStoredConnectionInvitesSyncState(state: ConnectionInvitesStatusSyncState): Promise<void> {
  return chrome.storage.local.set({
    [CONNECTION_INVITES_SYNC_STATE_KEY]: state,
  });
}

function scheduleConnectionInvitesStatusAlarmAt(scheduledAt: number): Promise<void> {
  if (!chrome.alarms?.create) {
    return Promise.resolve();
  }

  return chrome.alarms.create(CONNECTION_INVITES_STATUS_ALARM_NAME, {
    when: Math.max(Date.now() + 1_000, scheduledAt),
  });
}

function waitBetweenInviteStatusRequests(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, CONNECTION_INVITES_SYNC_REQUEST_DELAY_MS);
  });
}

export async function queueConnectionInvitesStatusSync(
  trigger: ConnectionInvitesStatusSyncTrigger,
  options: { urgent?: boolean } = {}
): Promise<void> {
  const user = await getAuthenticatedFeedsUser();
  if (!user) {
    return;
  }

  const now = Date.now();
  const state = await getStoredConnectionInvitesSyncState();
  const nextDueAt = options.urgent
    ? now + CONNECTION_INVITES_SYNC_URGENT_DELAY_MS
    : state?.userId === user.uid && state.nextDueAt
      ? Math.min(state.nextDueAt, now + CONNECTION_INVITES_SYNC_INTERVAL_MS)
      : now + CONNECTION_INVITES_SYNC_INTERVAL_MS;

  await setStoredConnectionInvitesSyncState({
    ...(state?.userId === user.uid ? state : {}),
    userId: user.uid,
    nextDueAt,
    updatedAt: now,
  });
  await scheduleConnectionInvitesStatusAlarmAt(nextDueAt);
  console.info('[connection-invites-sync] queued', {
    trigger,
    urgent: options.urgent === true,
    nextDueAt,
  });
}

export async function syncTrackedConnectionInviteAcceptance(
  userId: string
): Promise<ConnectionInvitesStatusSyncResult> {
  const now = Date.now();
  const invites = await getConnectionInvites(userId);
  const pendingInvites = invites
    .filter((invite) => invite.status !== 'accepted')
    .filter((invite) => normalizeLinkedInUsername(invite.linkedinUsername))
    .filter((invite) => now - invite.sentAt > CONNECTION_INVITES_ACCEPTANCE_GRACE_MS)
    .sort((left, right) => left.sentAt - right.sentAt)
    .slice(0, CONNECTION_INVITES_SYNC_BATCH_LIMIT);

  console.info('[connection-invites-sync] checking tracked invitations', {
    inviteCount: invites.length,
    pendingCount: pendingInvites.length,
    skippedWithoutUsername: invites.filter((invite) => invite.status !== 'accepted' && !normalizeLinkedInUsername(invite.linkedinUsername)).length,
  });

  let acceptedCount = 0;
  let checkedCount = 0;
  let stillPendingCount = 0;

  for (let index = 0; index < pendingInvites.length; index += 1) {
    const invite = pendingInvites[index];
    const username = normalizeLinkedInUsername(invite.linkedinUsername);
    if (!username) {
      continue;
    }

    try {
      const relationship = await resolveLinkedInRelationshipStatusInBackground(username, {
        allowHtmlFallback: false,
      });
      checkedCount += 1;
      console.info('[connection-invites-sync] invitation relationship checked', {
        username,
        status: relationship?.status || 'unresolved',
      });

      if (relationship?.status === 'connected') {
        await markConnectionInviteAccepted(userId, username);
        acceptedCount += 1;
      } else {
        stillPendingCount += 1;
      }
    } catch (error) {
      stillPendingCount += 1;
      console.warn('[connection-invites-sync] failed to resolve pending invite status', {
        username,
        error,
      });
    }

    if (index < pendingInvites.length - 1) {
      await waitBetweenInviteStatusRequests();
    }
  }

  return {
    ran: true,
    success: true,
    checkedCount,
    acceptedCount,
    pendingCount: stillPendingCount,
    skippedCount: Math.max(0, invites.length - pendingInvites.length),
  };
}

export async function runConnectionInvitesStatusSync(
  trigger: ConnectionInvitesStatusSyncTrigger = 'alarm'
): Promise<ConnectionInvitesStatusSyncResult> {
  const user = await getAuthenticatedFeedsUser();
  if (!user) {
    return { ran: false, success: false, error: 'myFeedPilot authentication is required.' };
  }

  const now = Date.now();
  let state = await getStoredConnectionInvitesSyncState();
  if (state?.userId && state.userId !== user.uid) {
    state = null;
  }

  if (state?.inProgressUntil && now < state.inProgressUntil) {
    await scheduleConnectionInvitesStatusAlarmAt(state.inProgressUntil);
    return { ran: false, success: true, nextDueAt: state.inProgressUntil };
  }

  if (trigger !== 'manual' && trigger !== 'profile_analytics' && state?.nextDueAt && now < state.nextDueAt) {
    await scheduleConnectionInvitesStatusAlarmAt(state.nextDueAt);
    return { ran: false, success: true, nextDueAt: state.nextDueAt };
  }

  const startedAt = Date.now();
  await setStoredConnectionInvitesSyncState({
    ...(state || {}),
    userId: user.uid,
    inProgressUntil: startedAt + CONNECTION_INVITES_SYNC_LEASE_MS,
    lastStartedAt: startedAt,
    updatedAt: startedAt,
  });

  try {
    const result = await syncTrackedConnectionInviteAcceptance(user.uid);
    const nextDueAt = Date.now() + (
      result.pendingCount && result.pendingCount > 0
        ? CONNECTION_INVITES_SYNC_PENDING_RETRY_MS
        : CONNECTION_INVITES_SYNC_INTERVAL_MS
    );
    await setStoredConnectionInvitesSyncState({
      ...(state || {}),
      userId: user.uid,
      inProgressUntil: undefined,
      lastStartedAt: startedAt,
      lastCompletedAt: Date.now(),
      nextDueAt,
      updatedAt: Date.now(),
    });
    await scheduleConnectionInvitesStatusAlarmAt(nextDueAt);
    return { ...result, nextDueAt };
  } catch (error) {
    const nextDueAt = Date.now() + CONNECTION_INVITES_SYNC_INTERVAL_MS;
    await setStoredConnectionInvitesSyncState({
      ...(state || {}),
      userId: user.uid,
      inProgressUntil: undefined,
      nextDueAt,
      updatedAt: Date.now(),
    });
    await scheduleConnectionInvitesStatusAlarmAt(nextDueAt);
    return {
      ran: true,
      success: false,
      nextDueAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

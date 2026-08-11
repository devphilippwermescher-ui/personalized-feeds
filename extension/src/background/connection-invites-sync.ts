import {
  CONNECTION_INVITE_FIRST_CHECK_DELAY_MS,
  getConnectionInvites,
  markConnectionInviteChecked,
} from 'shared/firestore-service';
import { normalizeLinkedInUsername } from 'shared/linkedin-identity';
import type { ProfileAnalyticsConnectionInvite } from 'shared/types';
import { markTrackedConnectionAccepted } from './connection-invite-lifecycle';
import { getAuthenticatedFeedsUser } from './feeds-auth';
import { resolveLinkedInRelationshipStatusInBackground } from './linkedin-relationship-status-resolver';

export const CONNECTION_INVITES_STATUS_ALARM_NAME = 'connection-invites-status-sync';

const CONNECTION_INVITES_SYNC_STATE_KEY = 'mfp_connection_invites_status_sync_v1';
const CONNECTION_INVITES_SYNC_INTERVAL_MS = 60 * 60 * 1000;
const CONNECTION_INVITES_SYNC_BATCH_COOLDOWN_MS = 60 * 60 * 1000;
const CONNECTION_INVITES_RESTRICTION_BACKOFF_MS = 12 * 60 * 60 * 1000;
const CONNECTION_INVITES_SYNC_LEASE_MS = 2 * 60 * 1000;
const CONNECTION_INVITES_SYNC_BATCH_LIMIT = 5;
const CONNECTION_INVITES_SYNC_REQUEST_DELAY_MS = 5_000;

type ConnectionInvitesStatusSyncTrigger =
  | 'install'
  | 'update'
  | 'chrome_startup'
  | 'service_worker'
  | 'alarm'
  | 'invite_sent'
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

function getInviteNextCheckAt(invite: ProfileAnalyticsConnectionInvite): number {
  return typeof invite.nextCheckAt === 'number'
    ? invite.nextCheckAt
    : invite.sentAt + CONNECTION_INVITE_FIRST_CHECK_DELAY_MS;
}

function isRestrictionSignal(error: unknown): boolean {
  const status = (error as { httpStatus?: unknown })?.httpStatus;
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return status === 429 || status === 999 || message.includes('temporarily restricted');
}

async function getStoredState(): Promise<ConnectionInvitesStatusSyncState | null> {
  const stored = await chrome.storage.local.get(CONNECTION_INVITES_SYNC_STATE_KEY);
  const value = stored[CONNECTION_INVITES_SYNC_STATE_KEY];
  return value && typeof value === 'object' ? (value as ConnectionInvitesStatusSyncState) : null;
}

function setStoredState(state: ConnectionInvitesStatusSyncState): Promise<void> {
  return chrome.storage.local.set({ [CONNECTION_INVITES_SYNC_STATE_KEY]: state });
}

function scheduleAlarm(scheduledAt: number): Promise<void> {
  if (!chrome.alarms?.create) return Promise.resolve();
  return chrome.alarms.create(CONNECTION_INVITES_STATUS_ALARM_NAME, {
    when: Math.max(Date.now() + 1_000, scheduledAt),
  });
}

function waitBetweenRequests(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, CONNECTION_INVITES_SYNC_REQUEST_DELAY_MS));
}

export async function queueConnectionInvitesStatusSync(
  trigger: ConnectionInvitesStatusSyncTrigger,
  _options: { urgent?: boolean } = {}
): Promise<void> {
  const user = await getAuthenticatedFeedsUser();
  if (!user) return;

  const now = Date.now();
  const state = await getStoredState();
  const requestedDueAt = now + CONNECTION_INVITES_SYNC_INTERVAL_MS;
  const nextDueAt =
    state?.userId === user.uid && state.nextDueAt ? Math.min(state.nextDueAt, requestedDueAt) : requestedDueAt;
  await setStoredState({
    ...(state?.userId === user.uid ? state : {}),
    userId: user.uid,
    nextDueAt,
    updatedAt: now,
  });
  await scheduleAlarm(nextDueAt);
  console.info('[connection-invites-sync] queued', { trigger, nextDueAt });
}

export async function syncTrackedConnectionInviteAcceptance(
  userId: string,
  now = Date.now()
): Promise<ConnectionInvitesStatusSyncResult> {
  const invites = await getConnectionInvites(userId);
  const candidates = invites
    .filter((invite) => invite.status !== 'accepted')
    .filter((invite) => normalizeLinkedInUsername(invite.linkedinUsername))
    .filter((invite) => getInviteNextCheckAt(invite) <= now)
    .sort((left, right) => getInviteNextCheckAt(left) - getInviteNextCheckAt(right))
    .slice(0, CONNECTION_INVITES_SYNC_BATCH_LIMIT);
  let acceptedCount = 0;
  let checkedCount = 0;

  for (let index = 0; index < candidates.length; index += 1) {
    const invite = candidates[index];
    const username = normalizeLinkedInUsername(invite.linkedinUsername);
    if (!username) continue;

    try {
      const relationship = await resolveLinkedInRelationshipStatusInBackground(username, {
        allowHtmlFallback: false,
      });
      checkedCount += 1;
      if (relationship?.status === 'connected') {
        await markTrackedConnectionAccepted(userId, username);
        acceptedCount += 1;
      } else {
        await markConnectionInviteChecked(userId, username);
      }
    } catch (error) {
      if (isRestrictionSignal(error)) throw error;
      checkedCount += 1;
      await markConnectionInviteChecked(userId, username).catch(() => undefined);
      console.warn('[connection-invites-sync] invitation status failed', { username, error });
    }

    if (index < candidates.length - 1) await waitBetweenRequests();
  }

  const remainingInvites = checkedCount > 0 || acceptedCount > 0 ? await getConnectionInvites(userId) : invites;

  return {
    ran: true,
    success: true,
    checkedCount,
    acceptedCount,
    pendingCount: Math.max(0, invites.filter((invite) => invite.status !== 'accepted').length - acceptedCount),
    skippedCount: Math.max(0, invites.length - candidates.length),
    nextDueAt: remainingInvites.some((invite) => invite.status !== 'accepted')
      ? getNextDueAt(remainingInvites, Date.now())
      : undefined,
  };
}

function getNextDueAt(invites: ProfileAnalyticsConnectionInvite[], now: number): number {
  const pending = invites.filter((invite) => invite.status !== 'accepted');
  if (pending.length === 0) return now + CONNECTION_INVITES_SYNC_INTERVAL_MS;
  const dueTimes = pending.map(getInviteNextCheckAt);
  const hasDueBacklog = dueTimes.some((dueAt) => dueAt <= now);
  if (hasDueBacklog) return now + CONNECTION_INVITES_SYNC_BATCH_COOLDOWN_MS;
  return Math.min(now + CONNECTION_INVITES_SYNC_INTERVAL_MS, ...dueTimes);
}

export async function runConnectionInvitesStatusSync(
  trigger: ConnectionInvitesStatusSyncTrigger = 'alarm'
): Promise<ConnectionInvitesStatusSyncResult> {
  const user = await getAuthenticatedFeedsUser();
  if (!user) return { ran: false, success: false, error: 'myFeedPilot authentication is required.' };

  const linkedInTabs = await chrome.tabs.query({ url: 'https://www.linkedin.com/*' });
  if (!linkedInTabs.some((tab) => typeof tab.id === 'number')) {
    const nextDueAt = Date.now() + CONNECTION_INVITES_SYNC_INTERVAL_MS;
    await scheduleAlarm(nextDueAt);
    return { ran: false, success: true, nextDueAt };
  }

  const now = Date.now();
  let state = await getStoredState();
  if (state?.userId && state.userId !== user.uid) state = null;
  if (state?.inProgressUntil && now < state.inProgressUntil) {
    await scheduleAlarm(state.inProgressUntil);
    return { ran: false, success: true, nextDueAt: state.inProgressUntil };
  }
  if (trigger !== 'manual' && state?.nextDueAt && now < state.nextDueAt) {
    await scheduleAlarm(state.nextDueAt);
    return { ran: false, success: true, nextDueAt: state.nextDueAt };
  }

  const startedAt = Date.now();
  await setStoredState({
    ...(state || {}),
    userId: user.uid,
    inProgressUntil: startedAt + CONNECTION_INVITES_SYNC_LEASE_MS,
    lastStartedAt: startedAt,
    updatedAt: startedAt,
  });

  try {
    const result = await syncTrackedConnectionInviteAcceptance(user.uid);
    const remainingInvites = await getConnectionInvites(user.uid);
    const nextDueAt = getNextDueAt(remainingInvites, Date.now());
    await setStoredState({
      ...(state || {}),
      userId: user.uid,
      inProgressUntil: undefined,
      lastStartedAt: startedAt,
      lastCompletedAt: Date.now(),
      nextDueAt,
      updatedAt: Date.now(),
    });
    await scheduleAlarm(nextDueAt);
    return { ...result, nextDueAt };
  } catch (error) {
    const nextDueAt =
      Date.now() +
      (isRestrictionSignal(error) ? CONNECTION_INVITES_RESTRICTION_BACKOFF_MS : CONNECTION_INVITES_SYNC_INTERVAL_MS);
    await setStoredState({
      ...(state || {}),
      userId: user.uid,
      inProgressUntil: undefined,
      nextDueAt,
      updatedAt: Date.now(),
    });
    await scheduleAlarm(nextDueAt);
    return {
      ran: true,
      success: false,
      nextDueAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

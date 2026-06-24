import type { User } from 'firebase/auth';
import {
  getProfileViewers,
  updateProfileViewer,
} from 'shared/firestore-service';
import { normalizeLinkedInUsername } from 'shared/linkedin-identity';
import type { ProfileViewer } from 'shared/types';
import type { RelationshipResolution } from '../content/linkedin-relationship-status/types';
import { getAuthenticatedFeedsUser } from './feeds-auth';
import { resolveLinkedInRelationshipStatusInBackground } from './linkedin-relationship-status-resolver';
import {
  PROFILE_VIEWERS_STATUS_BATCH_LIMIT,
  PROFILE_VIEWERS_STATUS_STALE_MS,
  selectProfileViewersForStatusSync,
} from './profile-viewers-status-sync-selection';

export {
  PROFILE_VIEWERS_STATUS_BATCH_LIMIT,
  PROFILE_VIEWERS_STATUS_STALE_MS,
  selectProfileViewersForStatusSync,
} from './profile-viewers-status-sync-selection';

export const PROFILE_VIEWERS_STATUS_ALARM_NAME = 'profile-viewers-status-sync';
export const PROFILE_VIEWERS_STATUS_BATCH_COOLDOWN_MS = 5 * 60 * 1000;

const PROFILE_VIEWERS_STATUS_STATE_KEY = 'lfs_profile_viewers_status_sync_state_v1';
const PROFILE_VIEWERS_STATUS_LEASE_MS = 2 * 60 * 1000;
const PROFILE_VIEWERS_STATUS_PRIORITY_LIMIT = 500;

type ProfileViewersStatusSyncTrigger =
  | 'install'
  | 'update'
  | 'chrome_startup'
  | 'service_worker'
  | 'alarm'
  | 'profile_viewers_sync'
  | 'manual';

interface ProfileViewersStatusSyncState {
  userId?: string;
  priorityUsernames: string[];
  inProgressUntil?: number;
  lastStartedAt?: number;
  lastCompletedAt?: number;
  nextDueAt?: number;
  updatedAt: number;
}

export interface ProfileViewersStatusSyncQueueOptions {
  trigger: ProfileViewersStatusSyncTrigger;
  priorityUsernames?: string[];
  urgent?: boolean;
}

export interface ProfileViewersStatusSyncResult {
  ran: boolean;
  success: boolean;
  checkedCount?: number;
  updatedCount?: number;
  failedCount?: number;
  remainingCount?: number;
  nextDueAt?: number;
  error?: string;
}

function getStoredStatusSyncState(): Promise<ProfileViewersStatusSyncState | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(PROFILE_VIEWERS_STATUS_STATE_KEY, (stored) => {
      const value = stored[PROFILE_VIEWERS_STATUS_STATE_KEY];
      resolve(value && typeof value === 'object' ? value as ProfileViewersStatusSyncState : null);
    });
  });
}

function setStoredStatusSyncState(state: ProfileViewersStatusSyncState): Promise<void> {
  return chrome.storage.local.set({
    [PROFILE_VIEWERS_STATUS_STATE_KEY]: state,
  });
}

function scheduleStatusSyncAlarmAt(scheduledAt: number): Promise<void> {
  if (!chrome.alarms?.create) {
    return Promise.resolve();
  }

  return chrome.alarms.create(PROFILE_VIEWERS_STATUS_ALARM_NAME, {
    when: Math.max(Date.now() + 1_000, scheduledAt),
  });
}

async function notifyLinkedInTabsAboutProfileViewerStatusSync(): Promise<void> {
  const tabs = await chrome.tabs.query({ url: 'https://www.linkedin.com/*' });
  await Promise.all(
    tabs
      .filter((tab): tab is chrome.tabs.Tab & { id: number } => typeof tab.id === 'number')
      .map((tab) =>
        chrome.tabs.sendMessage(tab.id, { type: 'PROFILE_VIEWERS_SYNC_COMPLETED' }).catch(() => {
          /* the sidebar content script may not be ready in every LinkedIn tab */
        })
      )
  );
}

function normalizePriorityUsernames(usernames: string[] = []): string[] {
  return Array.from(
    new Set(
      usernames
        .map((username) => normalizeLinkedInUsername(username))
        .filter(Boolean)
    )
  ).slice(0, PROFILE_VIEWERS_STATUS_PRIORITY_LIMIT);
}

function mergePriorityUsernames(
  current: string[] = [],
  incoming: string[] = []
): string[] {
  return normalizePriorityUsernames([...incoming, ...current]);
}

function buildStatusUpdate(
  viewer: ProfileViewer,
  resolution: RelationshipResolution,
  resolvedAt: number
): Parameters<typeof updateProfileViewer>[2] {
  const update: Parameters<typeof updateProfileViewer>[2] = {
    status: resolution.status,
    statusResolvedAt: resolvedAt,
    statusCheckFailedAt: 0,
    statusCheckError: '',
  };

  const profileUrn = resolution.profileUrn || viewer.profileUrn;
  const memberNumericId = resolution.memberNumericId || viewer.memberNumericId;
  const profileImageUrl = resolution.profileImageUrl || viewer.profileImageUrl;

  if (profileUrn) update.profileUrn = profileUrn;
  if (memberNumericId) update.memberNumericId = memberNumericId;
  if (profileImageUrl) update.profileImageUrl = profileImageUrl;
  if (typeof resolution.canMessage === 'boolean') update.canMessage = resolution.canMessage;
  if (typeof resolution.canFollow === 'boolean') update.canFollow = resolution.canFollow;
  if (typeof resolution.canConnect === 'boolean') update.canConnect = resolution.canConnect;
  if (typeof resolution.isFollowing === 'boolean') update.isFollowing = resolution.isFollowing;
  if (typeof resolution.isPremium === 'boolean') update.isPremium = resolution.isPremium;

  return update;
}

async function updateProfileViewerStatusFailure(
  userId: string,
  viewer: ProfileViewer,
  error: unknown,
  failedAt: number
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error || 'Unknown status sync error');
  await updateProfileViewer(userId, viewer.linkedinUsername || viewer.id, {
    statusCheckFailedAt: failedAt,
    statusCheckError: message.slice(0, 300),
  });
}

async function getStatusSyncUser(
  explicitUser?: User
): Promise<User | null> {
  return explicitUser || await getAuthenticatedFeedsUser();
}

export async function queueProfileViewersStatusSync(
  options: ProfileViewersStatusSyncQueueOptions
): Promise<void> {
  const user = await getStatusSyncUser();
  if (!user) {
    return;
  }

  const now = Date.now();
  const state = await getStoredStatusSyncState();
  const priorityUsernames = mergePriorityUsernames(
    state?.userId === user.uid ? state.priorityUsernames : [],
    options.priorityUsernames || []
  );
  const queuedAfterProfileViewersSync = options.trigger === 'profile_viewers_sync';
  const nextDueAt =
    options.urgent
      ? now + 1_000
      : queuedAfterProfileViewersSync
        ? now + PROFILE_VIEWERS_STATUS_BATCH_COOLDOWN_MS
      : state?.userId === user.uid && state.nextDueAt
        ? Math.min(state.nextDueAt, now + PROFILE_VIEWERS_STATUS_STALE_MS)
        : now + PROFILE_VIEWERS_STATUS_BATCH_COOLDOWN_MS;
  const nextState: ProfileViewersStatusSyncState = {
    ...(state?.userId === user.uid ? state : {}),
    userId: user.uid,
    priorityUsernames,
    nextDueAt,
    updatedAt: now,
  };

  await setStoredStatusSyncState(nextState);
  await scheduleStatusSyncAlarmAt(nextDueAt);
  console.info('[profile-viewers-status-sync] queued', {
    trigger: options.trigger,
    urgent: options.urgent === true,
    priorityCount: priorityUsernames.length,
    nextDueAt,
  });
}

export async function runProfileViewersStatusSync(
  trigger: ProfileViewersStatusSyncTrigger = 'alarm',
  explicitUser?: User
): Promise<ProfileViewersStatusSyncResult> {
  const user = await getStatusSyncUser(explicitUser);
  if (!user) {
    return { ran: false, success: false, error: 'myFeedPilot authentication is required.' };
  }

  const now = Date.now();
  let state = await getStoredStatusSyncState();
  if (state?.userId && state.userId !== user.uid) {
    state = null;
  }

  if (state?.inProgressUntil && now < state.inProgressUntil) {
    await scheduleStatusSyncAlarmAt(state.inProgressUntil);
    return { ran: false, success: true, nextDueAt: state.inProgressUntil };
  }

  if (trigger !== 'manual' && state?.nextDueAt && now < state.nextDueAt) {
    await scheduleStatusSyncAlarmAt(state.nextDueAt);
    return { ran: false, success: true, nextDueAt: state.nextDueAt };
  }

  const startedAt = Date.now();
  state = {
    ...(state || {}),
    userId: user.uid,
    priorityUsernames: state?.priorityUsernames || [],
    inProgressUntil: startedAt + PROFILE_VIEWERS_STATUS_LEASE_MS,
    lastStartedAt: startedAt,
    updatedAt: startedAt,
  };
  await setStoredStatusSyncState(state);

  try {
    const viewers = await getProfileViewers(user.uid);
    const candidates = selectProfileViewersForStatusSync(
      viewers,
      state.priorityUsernames,
      startedAt
    );

    if (candidates.length === 0) {
      const nextDueAt = startedAt + PROFILE_VIEWERS_STATUS_STALE_MS;
      await setStoredStatusSyncState({
        ...state,
        priorityUsernames: [],
        inProgressUntil: undefined,
        lastCompletedAt: Date.now(),
        nextDueAt,
        updatedAt: Date.now(),
      });
      await scheduleStatusSyncAlarmAt(nextDueAt);
      return { ran: true, success: true, checkedCount: 0, updatedCount: 0, failedCount: 0, remainingCount: 0, nextDueAt };
    }

    let updatedCount = 0;
    let failedCount = 0;
    const checkedUsernames: string[] = [];

    for (const viewer of candidates) {
      const username = normalizeLinkedInUsername(viewer.linkedinUsername || viewer.id);
      if (!username) {
        continue;
      }

      checkedUsernames.push(username);
      try {
        const resolution = await resolveLinkedInRelationshipStatusInBackground(username);
        if (!resolution) {
          throw new Error('LinkedIn relationship status was not found in GraphQL or profile HTML.');
        }

        await updateProfileViewer(
          user.uid,
          username,
          buildStatusUpdate(viewer, resolution, Date.now())
        );
        updatedCount += 1;
      } catch (error) {
        failedCount += 1;
        await updateProfileViewerStatusFailure(user.uid, viewer, error, Date.now()).catch((updateError) => {
          console.warn('[profile-viewers-status-sync] failed to persist status check failure', updateError);
        });
      }
    }

    const remainingCount = Math.max(0, selectProfileViewersForStatusSync(
      viewers,
      state.priorityUsernames,
      startedAt,
      Number.MAX_SAFE_INTEGER
    ).length - candidates.length);
    const nextDueAt = remainingCount > 0
      ? Date.now() + PROFILE_VIEWERS_STATUS_BATCH_COOLDOWN_MS
      : Date.now() + PROFILE_VIEWERS_STATUS_STALE_MS;
    const checkedSet = new Set(checkedUsernames);
    const priorityUsernames = normalizePriorityUsernames(
      state.priorityUsernames.filter((username) => !checkedSet.has(username))
    );

    await setStoredStatusSyncState({
      ...state,
      priorityUsernames,
      inProgressUntil: undefined,
      lastCompletedAt: Date.now(),
      nextDueAt,
      updatedAt: Date.now(),
    });
    await scheduleStatusSyncAlarmAt(nextDueAt);

    if (updatedCount > 0) {
      await notifyLinkedInTabsAboutProfileViewerStatusSync().catch((error) => {
        console.warn('[profile-viewers-status-sync] failed to notify LinkedIn tabs', error);
      });
    }

    console.info('[profile-viewers-status-sync] completed', {
      trigger,
      checkedCount: checkedUsernames.length,
      updatedCount,
      failedCount,
      remainingCount,
      nextDueAt,
    });

    return {
      ran: true,
      success: true,
      checkedCount: checkedUsernames.length,
      updatedCount,
      failedCount,
      remainingCount,
      nextDueAt,
    };
  } catch (error) {
    const nextDueAt = Date.now() + PROFILE_VIEWERS_STATUS_STALE_MS;
    await setStoredStatusSyncState({
      ...(state || {
        userId: user.uid,
        priorityUsernames: [],
      }),
      inProgressUntil: undefined,
      nextDueAt,
      updatedAt: Date.now(),
    });
    await scheduleStatusSyncAlarmAt(nextDueAt);
    console.warn('[profile-viewers-status-sync] failed', error);
    return {
      ran: true,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      nextDueAt,
    };
  }
}

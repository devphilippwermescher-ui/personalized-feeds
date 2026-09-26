import type { ProfileViewersCollectionProgress } from '../../../shared/profile-viewers-progress';
import { ProfileViewersSyncError } from './profile-viewers-error';
import type { ProfileViewersSyncResult } from './profile-viewers-sync-result';
import {
  canMakeProfileViewersRequest,
  PROFILE_VIEWERS_BACKGROUND_RESERVE,
  type ProfileViewersSyncErrorCode,
  type ProfileViewersSyncLog,
  type ProfileViewersSyncState,
  type ProfileViewersSyncTrigger,
} from './profile-viewers-sync-state';

const PROFILE_VIEWERS_SYNC_LOG_LIMIT = 50;

export function getProfileViewersSyncError(error: unknown): {
  code: ProfileViewersSyncErrorCode;
  message: string;
  httpStatus?: number;
} {
  if (error instanceof ProfileViewersSyncError) {
    return {
      code: error.code,
      message: error.message,
      httpStatus: error.httpStatus,
    };
  }

  const message = error instanceof Error ? error.message : String(error || 'Unknown profile visitors sync error');
  const normalized = message.toLowerCase();
  if (normalized.includes('network') || normalized.includes('failed to fetch')) {
    return { code: 'network_error', message };
  }

  return { code: 'unknown_error', message };
}

export function getProfileViewersSyncLogStatus(
  errorCode?: ProfileViewersSyncErrorCode,
  newCount = 0
): ProfileViewersSyncLog['status'] {
  if (!errorCode) return newCount > 0 ? 'success' : 'no_changes';
  if (errorCode === 'app_auth_required' || errorCode === 'linkedin_auth_required') {
    return 'auth_error';
  }
  if (errorCode === 'network_error') return 'network_error';
  if (errorCode === 'api_error') return 'api_error';
  if (errorCode === 'parse_error') return 'parse_error';
  return 'unknown_error';
}

export function appendProfileViewersSyncLog(
  state: ProfileViewersSyncState,
  log: ProfileViewersSyncLog
): ProfileViewersSyncState {
  return {
    ...state,
    logs: [log, ...state.logs].slice(0, PROFILE_VIEWERS_SYNC_LOG_LIMIT),
  };
}

export function mergeVisibleAndSummaryResults(
  visible: ProfileViewersSyncResult,
  summary: ProfileViewersSyncResult
): ProfileViewersSyncResult {
  return {
    ...visible,
    privateViewerCount: summary.privateViewerCount ?? visible.privateViewerCount,
    recruiterViewerCount: summary.recruiterViewerCount ?? visible.recruiterViewerCount,
    recruiterViewerUrl: summary.recruiterViewerUrl ?? visible.recruiterViewerUrl,
    httpStatus: summary.httpStatus ?? visible.httpStatus,
    responseLength: (visible.responseLength || 0) + (summary.responseLength || 0),
    requestCount: (visible.requestCount || 0) + (summary.requestCount || 0),
    pagesFetched: (visible.pagesFetched || 0) + (summary.pagesFetched || 0),
    paginationComplete: visible.paginationComplete && summary.paginationComplete,
    privateViewerCountStart: summary.privateViewerCountStart,
  };
}

export function getProfileViewersSyncSkipReason(
  state: ProfileViewersSyncState,
  now: number,
  trigger: ProfileViewersSyncTrigger
): string {
  const reserveTokens = trigger === 'manual' ? PROFILE_VIEWERS_BACKGROUND_RESERVE : 0;
  if (!canMakeProfileViewersRequest(state, now, reserveTokens)) {
    return trigger === 'manual' ? 'request_budget_reserved_for_background' : 'request_budget_empty';
  }
  if (state.cooldownUntil && now < state.cooldownUntil) return 'cooldown';
  if (state.retryAt && now < state.retryAt) return 'retry_not_due';
  if (state.nextDueAt && now < state.nextDueAt) return 'next_run_not_due';
  return 'decision_blocked';
}

type ProfileViewersSyncNotification =
  | {
      type: 'PROFILE_VIEWERS_SYNC_STARTED';
      syncProgress: ProfileViewersCollectionProgress;
    }
  | { type: 'PROFILE_VIEWERS_SYNC_COMPLETED'; collectionFinished: true };

export async function notifyLinkedInTabsAboutProfileViewersSync(
  message: ProfileViewersSyncNotification
): Promise<void> {
  const tabs = await chrome.tabs.query({ url: 'https://www.linkedin.com/*' });
  await Promise.all(
    tabs
      .filter((tab): tab is chrome.tabs.Tab & { id: number } => typeof tab.id === 'number')
      .map((tab) =>
        chrome.tabs.sendMessage(tab.id, message).catch(() => {
          /* the sidebar content script may not be ready in every LinkedIn tab */
        })
      )
  );
}

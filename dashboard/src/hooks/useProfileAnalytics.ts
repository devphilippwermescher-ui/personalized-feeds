import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getConnectionInviteAcceptanceSnapshot,
  getConnectionInvites,
  getProfileAnalyticsDailySnapshots,
  getProfileAnalyticsSnapshot,
  getProfileViewerItems,
} from 'shared/firestore-service';
import type {
  ProfileAnalyticsDailySnapshot,
  ProfileAnalyticsAcceptanceSnapshot,
  ProfileAnalyticsSnapshot,
  ProfileAnalyticsConnectionInvite,
  ProfileViewerListItem,
} from 'shared/types';
import { sendMessageToExtension } from '../utils/extensionMessaging';

type SyncResponse =
  | {
      success: true;
      result: unknown;
    }
  | {
      success: false;
      error: string;
    };

const DAY_MS = 24 * 60 * 60 * 1000;

function estimateViewedAt(viewedAgoText: string | undefined, fallbackTimestamp: number): number {
  const normalized = viewedAgoText?.replace(/\s+/g, ' ').trim().toLowerCase() || '';
  if (!normalized) {
    return fallbackTimestamp;
  }

  if (/\b(?:now|today|just)\b/.test(normalized)) {
    return Date.now();
  }

  if (/\byesterday\b/.test(normalized)) {
    return Date.now() - DAY_MS;
  }

  const match = normalized.match(/(\d+)\s*(?:\+)?\s*(minute|min|m|hour|hr|h|day|d|week|wk|w|month|mo|year|yr|y)s?\b/);
  if (!match) {
    return fallbackTimestamp;
  }

  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) {
    return fallbackTimestamp;
  }

  const unit = match[2];
  if (/^(?:minute|min|m)$/.test(unit)) return Date.now() - amount * 60 * 1000;
  if (/^(?:hour|hr|h)$/.test(unit)) return Date.now() - amount * 60 * 60 * 1000;
  if (/^(?:day|d)$/.test(unit)) return Date.now() - amount * DAY_MS;
  if (/^(?:week|wk|w)$/.test(unit)) return Date.now() - amount * 7 * DAY_MS;
  if (/^(?:month|mo)$/.test(unit)) return Date.now() - amount * 30 * DAY_MS;
  if (/^(?:year|yr|y)$/.test(unit)) return Date.now() - amount * 365 * DAY_MS;

  return fallbackTimestamp;
}

export function useProfileAnalytics(userId: string, rangeStart: number, rangeEnd = Date.now()) {
  const [snapshot, setSnapshot] = useState<ProfileAnalyticsSnapshot | null>(null);
  const [dailySnapshots, setDailySnapshots] = useState<ProfileAnalyticsDailySnapshot[]>([]);
  const [acceptanceSnapshot, setAcceptanceSnapshot] = useState<ProfileAnalyticsAcceptanceSnapshot | null>(null);
  const [profileViewers, setProfileViewers] = useState<ProfileViewerListItem[]>([]);
  const [connectionInvites, setConnectionInvites] = useState<ProfileAnalyticsConnectionInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        nextSnapshot,
        nextDailySnapshots,
        nextAcceptanceSnapshot,
        nextProfileViewers,
        nextConnectionInvites,
      ] = await Promise.all([
        getProfileAnalyticsSnapshot(userId),
        getProfileAnalyticsDailySnapshots(userId, 365),
        getConnectionInviteAcceptanceSnapshot(userId, rangeStart, rangeEnd),
        getProfileViewerItems(userId),
        getConnectionInvites(userId),
      ]);

      setSnapshot(nextSnapshot);
      setDailySnapshots(nextDailySnapshots);
      setAcceptanceSnapshot(nextAcceptanceSnapshot);
      setProfileViewers(nextProfileViewers);
      setConnectionInvites(nextConnectionInvites);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [rangeEnd, rangeStart, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const refreshFromExtension = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await sendMessageToExtension<SyncResponse>({
        type: 'DASHBOARD_PROFILE_ANALYTICS_SYNC_NOW',
      });

      if (!response?.success) {
        return;
      }

      await refresh();
    } catch {
      // Keep showing the latest Firebase snapshot when LinkedIn cannot be refreshed.
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  useEffect(() => {
    void refreshFromExtension();
  }, [refreshFromExtension]);

  const profileViewsInRange = useMemo(() => {
    return profileViewers.filter((viewer) => {
      const viewedAt = estimateViewedAt(viewer.viewedAgoText, viewer.lastSeenAt);
      return viewedAt >= rangeStart && viewedAt <= rangeEnd;
    }).length;
  }, [profileViewers, rangeEnd, rangeStart]);

  return {
    snapshot,
    dailySnapshots,
    acceptanceSnapshot,
    profileViewsInRange,
    profileViewers,
    connectionInvites,
    loading,
    refreshing,
    error,
    refresh,
    refreshFromExtension,
  };
}

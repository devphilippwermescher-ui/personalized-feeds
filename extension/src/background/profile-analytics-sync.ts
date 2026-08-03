import type {
  ProfileAnalyticsSnapshot,
  ProfileAnalyticsProfileSnapshot,
  ProfileAnalyticsSearchAppearancesSnapshot,
  ProfileAnalyticsSsiSnapshot,
} from 'shared/types';
import {
  upsertProfileAnalyticsSnapshot,
} from 'shared/firestore-service';
import { getAuthenticatedFeedsUser } from './feeds-auth';
import { syncTrackedConnectionInviteAcceptance } from './connection-invites-sync';
import { fetchLinkedInMeProfileSnapshot } from './profile-analytics-linkedin-api';

interface ProfileAnalyticsPageCollection {
  profile?: ProfileAnalyticsProfileSnapshot;
  searchAppearances?: ProfileAnalyticsSearchAppearancesSnapshot;
  socialSellingIndex?: ProfileAnalyticsSsiSnapshot;
  selfProfileUrl?: string;
  pageUrl: string;
  collectedAt: number;
}

type CollectPageResponse =
  | {
      success: true;
      data: ProfileAnalyticsPageCollection;
    }
  | {
      success: false;
      error: string;
    };

function sendCollectMessage(tabId: number): Promise<CollectPageResponse> {
  return chrome.tabs.sendMessage(tabId, { type: 'PROFILE_ANALYTICS_COLLECT_PAGE' }) as Promise<CollectPageResponse>;
}

function mergeCollectionIntoSnapshot(
  snapshot: Partial<ProfileAnalyticsSnapshot>,
  collection: ProfileAnalyticsPageCollection
): void {
  if (collection.searchAppearances) {
    snapshot.searchAppearances = collection.searchAppearances;
  }
  if (collection.socialSellingIndex) {
    snapshot.socialSellingIndex = collection.socialSellingIndex;
  }
}

function mergeProfileSnapshot(
  current: ProfileAnalyticsProfileSnapshot | undefined,
  next: ProfileAnalyticsProfileSnapshot
): ProfileAnalyticsProfileSnapshot {
  return {
    ...current,
    ...next,
    headline: next.headline || current?.headline,
    profileImageUrl: next.profileImageUrl || current?.profileImageUrl,
    backgroundImageUrl: next.backgroundImageUrl || current?.backgroundImageUrl,
    company: next.company || current?.company,
    location: next.location || current?.location,
    connectionsCount: next.connectionsCount ?? current?.connectionsCount,
    followersCount: next.followersCount ?? current?.followersCount,
  };
}

export async function syncProfileAnalyticsFromLinkedInTabs(): Promise<{
  snapshot: ProfileAnalyticsSnapshot;
  collectedPages: string[];
  collected: {
    profile: boolean;
    searchAppearances: boolean;
    socialSellingIndex: boolean;
  };
}> {
  const user = await getAuthenticatedFeedsUser();
  if (!user) {
    throw new Error('myFeedPilot authentication is required before profile analytics can be synchronized.');
  }
  await syncTrackedConnectionInviteAcceptance(user.uid).catch(() => undefined);
  const linkedInMeProfile = await fetchLinkedInMeProfileSnapshot(Date.now()).catch(() => null);
  const tabs = await chrome.tabs.query({ url: 'https://www.linkedin.com/*' });
  const linkedInTabs = tabs.filter((tab): tab is chrome.tabs.Tab & { id: number } => typeof tab.id === 'number');
  const pageResults = await Promise.allSettled(linkedInTabs.map((tab) => sendCollectMessage(tab.id)));
  const snapshot: Partial<ProfileAnalyticsSnapshot> = {};
  const collectedPages: string[] = [];

  if (linkedInMeProfile) {
    snapshot.profile = mergeProfileSnapshot(snapshot.profile, linkedInMeProfile);
    collectedPages.push(linkedInMeProfile.sourceUrl);
  }

  pageResults.forEach((result) => {
    if (result.status !== 'fulfilled' || !result.value.success) {
      return;
    }

    const collection = result.value.data;
    if (!collection.searchAppearances && !collection.socialSellingIndex) {
      return;
    }

    collectedPages.push(collection.pageUrl);
    mergeCollectionIntoSnapshot(snapshot, collection);
  });

  if (!snapshot.profile && !snapshot.searchAppearances && !snapshot.socialSellingIndex) {
    throw new Error(
      'No profile analytics data was found. Open your LinkedIn profile, Search appearances, or SSI page, then try syncing again.'
    );
  }

  const updatedAt = Date.now();
  const nextSnapshot = await upsertProfileAnalyticsSnapshot(user.uid, snapshot, { updatedAt });

  return {
    snapshot: nextSnapshot,
    collectedPages,
    collected: {
      profile: Boolean(snapshot.profile),
      searchAppearances: Boolean(snapshot.searchAppearances),
      socialSellingIndex: Boolean(snapshot.socialSellingIndex),
    },
  };
}

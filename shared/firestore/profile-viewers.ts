import {
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { getFirebaseDb } from '../firebase-config';
import {
  getUsernameFromLinkedInUrl,
  isValidLinkedInProfileUsername,
  normalizeLinkedInUsername,
} from '../linkedin-identity';
import {
  chooseProfileViewerDisplayName,
  chooseProfileViewerImageUrl,
  getAmbiguousProfileViewerImageUrls,
} from '../profile-viewer-quality';
import { sortProfileViewersByRecency } from '../profile-viewer-order';
import type {
  ProfileViewer,
  ProfileViewerInput,
  ProfileViewerListItem,
  ProfileViewerSearch,
  ProfileViewerSearchInput,
  ProfileViewerSummary,
} from '../types';
import {
  docToProfileViewer,
  docToProfileViewerSearch,
  profileViewerSearchesCollection,
  profileViewerSummaryDoc,
  profileViewersCollection,
} from './refs';

function keepExistingIfIncomingEmpty(incoming: string | undefined, existing: string | undefined): string {
  const normalizedIncoming = (incoming || '').trim();
  if (!normalizedIncoming) {
    return existing || '';
  }

  if (/^(offsetstart|offsetend|\d+(?:\.\d+)?x)$/i.test(normalizedIncoming)) {
    return existing || '';
  }

  return normalizedIncoming;
}

export async function upsertProfileViewers(
  userId: string,
  viewers: ProfileViewerInput[],
  existingViewers: ProfileViewer[],
  options: {
    seenAt?: number;
    positionOffset?: number;
  } = {}
): Promise<{
  savedCount: number;
  newCount: number;
  newProfileUsernames: string[];
}> {
  let savedCount = 0;
  let newCount = 0;
  const newProfileUsernames: string[] = [];
  const now = options.seenAt || Date.now();
  const positionOffset = options.positionOffset || 0;
  const existingByUsername = new Map(existingViewers.map((viewer) => [viewer.linkedinUsername.toLowerCase(), viewer]));
  const ambiguousExistingImages = getAmbiguousProfileViewerImageUrls(existingViewers);
  const validViewers = viewers
    .map((viewer, index) => ({
      viewer,
      lastSeenPosition: positionOffset + (viewer.listPosition ?? index),
      linkedinUsername: normalizeLinkedInUsername(
        viewer.linkedinUsername || getUsernameFromLinkedInUrl(viewer.linkedinUrl)
      ),
    }))
    .filter(
      (entry) =>
        isValidLinkedInProfileUsername(entry.linkedinUsername) &&
        Boolean(entry.viewer.linkedinUrl) &&
        Boolean(entry.viewer.displayName.trim())
    );

  if (validViewers.length > 500) {
    throw new Error('A single profile visitors sync cannot persist more than 500 profiles.');
  }

  const batch = writeBatch(getFirebaseDb());

  for (const { viewer, lastSeenPosition, linkedinUsername } of validViewers) {
    const viewerRef = doc(profileViewersCollection(userId), linkedinUsername);
    const existingViewer: Partial<ProfileViewer> = existingByUsername.get(linkedinUsername) || {};
    const existingProfileImageUrl = ambiguousExistingImages.has(existingViewer.profileImageUrl?.trim() || '')
      ? ''
      : existingViewer.profileImageUrl;
    const firstSeenAt = existingByUsername.has(linkedinUsername) ? existingViewer.firstSeenAt || now : now;

    batch.set(
      viewerRef,
      {
        linkedinUrl: viewer.linkedinUrl,
        linkedinUsername,
        displayName: chooseProfileViewerDisplayName(viewer.displayName, existingViewer.displayName, linkedinUsername),
        headline: keepExistingIfIncomingEmpty(viewer.headline, existingViewer.headline),
        profileImageUrl: chooseProfileViewerImageUrl(viewer.profileImageUrl, existingProfileImageUrl),
        connectionDegree: keepExistingIfIncomingEmpty(viewer.connectionDegree, existingViewer.connectionDegree),
        viewedAgoText: keepExistingIfIncomingEmpty(viewer.viewedAgoText, existingViewer.viewedAgoText),
        mutualConnectionsText: keepExistingIfIncomingEmpty(
          viewer.mutualConnectionsText,
          existingViewer.mutualConnectionsText
        ),
        firstSeenAt,
        lastSeenAt: now,
        lastSeenPosition,
        source: 'linkedin_profile_views',
      } satisfies Omit<ProfileViewer, 'id'>,
      { merge: true }
    );

    savedCount += 1;
    if (!existingByUsername.has(linkedinUsername)) {
      newCount += 1;
      newProfileUsernames.push(linkedinUsername);
    }
  }

  if (savedCount > 0) {
    await batch.commit();
  }

  return { savedCount, newCount, newProfileUsernames };
}

export async function getProfileViewers(userId: string): Promise<ProfileViewer[]> {
  const q = query(profileViewersCollection(userId), orderBy('lastSeenAt', 'desc'));
  const snapshot = await getDocs(q);
  const viewers = snapshot.docs.map(docToProfileViewer);
  const invalidDocs = snapshot.docs.filter((viewerDoc) => {
    const viewer = docToProfileViewer(viewerDoc);
    return !isValidLinkedInProfileUsername(viewer.linkedinUsername || viewer.id);
  });

  if (invalidDocs.length > 0) {
    const batch = writeBatch(getFirebaseDb());
    invalidDocs.forEach((viewerDoc) => batch.delete(viewerDoc.ref));
    await batch.commit();
  }

  return sortProfileViewersByRecency(
    viewers.filter((viewer) =>
      isValidLinkedInProfileUsername(viewer.linkedinUsername || viewer.id)
    )
  );
}

export async function upsertProfileViewerSearches(
  userId: string,
  searches: ProfileViewerSearchInput[],
  existingSearches: ProfileViewerSearch[],
  options: {
    seenAt?: number;
    positionOffset?: number;
  } = {}
): Promise<{ savedCount: number; newCount: number }> {
  const now = options.seenAt || Date.now();
  const positionOffset = options.positionOffset || 0;
  const existingByKey = new Map(
    existingSearches.map((search) => [search.searchKey, search])
  );
  const uniqueSearches = new Map<string, ProfileViewerSearchInput>();

  searches.forEach((search) => {
    const searchKey = search.searchKey.trim();
    if (searchKey && search.searchUrl.trim() && search.displayName.trim()) {
      uniqueSearches.set(searchKey, search);
    }
  });

  if (uniqueSearches.size > 500) {
    throw new Error(
      'A single profile visitors sync cannot persist more than 500 search segments.'
    );
  }

  const batch = writeBatch(getFirebaseDb());
  let savedCount = 0;
  let newCount = 0;

  for (const [searchKey, search] of uniqueSearches) {
    const existing = existingByKey.get(searchKey);
    const documentId = encodeURIComponent(searchKey);
    const lastSeenPosition =
      positionOffset + (search.listPosition ?? savedCount);

    batch.set(
      doc(profileViewerSearchesCollection(userId), documentId),
      {
        itemType: 'search',
        searchKey,
        searchUrl: search.searchUrl,
        displayName: search.displayName,
        keywords: search.keywords,
        currentCompany: search.currentCompany || '',
        viewedAgoText: keepExistingIfIncomingEmpty(
          search.viewedAgoText,
          existing?.viewedAgoText
        ),
        firstSeenAt: existing?.firstSeenAt || now,
        lastSeenAt: now,
        lastSeenPosition,
        source: 'linkedin_profile_views',
      } satisfies Omit<ProfileViewerSearch, 'id'>,
      { merge: true }
    );

    savedCount += 1;
    if (!existing) {
      newCount += 1;
    }
  }

  if (savedCount > 0) {
    await batch.commit();
  }

  return { savedCount, newCount };
}

export async function getProfileViewerSearches(
  userId: string
): Promise<ProfileViewerSearch[]> {
  const q = query(
    profileViewerSearchesCollection(userId),
    orderBy('lastSeenAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return sortProfileViewersByRecency(snapshot.docs.map(docToProfileViewerSearch));
}

export async function getProfileViewerItems(
  userId: string
): Promise<ProfileViewerListItem[]> {
  const [viewers, searches] = await Promise.all([
    getProfileViewers(userId),
    getProfileViewerSearches(userId),
  ]);
  return sortProfileViewersByRecency([...viewers, ...searches]);
}

export async function updateProfileViewerSummary(
  userId: string,
  privateViewerCount: number,
  updatedAt = Date.now()
): Promise<ProfileViewerSummary> {
  const summary: ProfileViewerSummary = {
    privateViewerCount: Math.max(0, Math.trunc(privateViewerCount)),
    updatedAt,
  };
  await setDoc(profileViewerSummaryDoc(userId), summary, { merge: true });
  return summary;
}

export async function getProfileViewerSummary(
  userId: string
): Promise<ProfileViewerSummary | null> {
  const snapshot = await getDoc(profileViewerSummaryDoc(userId));
  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data() as Partial<ProfileViewerSummary>;
  if (
    !Number.isSafeInteger(data.privateViewerCount) ||
    (data.privateViewerCount || 0) < 0
  ) {
    return null;
  }

  return {
    privateViewerCount: data.privateViewerCount || 0,
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
  };
}

export async function updateProfileViewer(
  userId: string,
  viewerId: string,
  updates: Partial<ProfileViewerInput & Pick<ProfileViewer, 'profileUrn' | 'memberNumericId' | 'canMessage' | 'canFollow' | 'canConnect' | 'isFollowing' | 'isPremium' | 'status'>>
): Promise<void> {
  const linkedinUsername = normalizeLinkedInUsername(viewerId || updates.linkedinUsername || getUsernameFromLinkedInUrl(updates.linkedinUrl || ''));
  if (!linkedinUsername) {
    throw new Error('Invalid profile viewer id');
  }

  await updateDoc(doc(profileViewersCollection(userId), linkedinUsername), {
    ...updates,
    linkedinUsername,
  });
}

export async function removeProfileViewer(userId: string, viewerId: string): Promise<void> {
  const linkedinUsername = normalizeLinkedInUsername(viewerId);
  if (!linkedinUsername) {
    throw new Error('Invalid profile viewer id');
  }

  await deleteDoc(doc(profileViewersCollection(userId), linkedinUsername));
}

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

function isSearchUrlLikeDisplayName(value: string | undefined): boolean {
  const normalized = (value || '').trim().toLocaleLowerCase();
  return (
    /^https?:\/\//i.test(normalized) ||
    normalized.includes('linkedin.com') ||
    normalized.includes('/search/results/people') ||
    normalized.includes('/results/people') ||
    normalized.includes('currentcompany=') ||
    normalized.includes('origin=who_viewed_me')
  );
}

function isWeakSearchDisplayName(value: string | undefined): boolean {
  const normalized = (value || '').trim();
  if (!normalized) {
    return true;
  }

  return (
    isSearchUrlLikeDisplayName(normalized) ||
    /^[\]}),.;:'"\s]+$/.test(normalized) ||
    /[{}[\]]/.test(normalized) ||
    /(?:\$undefined|props:|children:|componentkey|viewtrackingspecs|:false|:true)/i.test(normalized)
  );
}

function chooseSearchDisplayName(
  incoming: ProfileViewerSearchInput,
  existing?: ProfileViewerSearch
): string {
  const incomingName = incoming.displayName.trim();
  const existingName = existing?.displayName?.trim() || '';

  if (!isWeakSearchDisplayName(incomingName)) {
    return incomingName;
  }

  if (!isWeakSearchDisplayName(existingName)) {
    return existingName;
  }

  return incoming.keywords.trim() || 'LinkedIn search';
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
    const preservedRelationshipUpdates: Partial<ProfileViewer> = {};
    if (existingViewer.profileUrn) preservedRelationshipUpdates.profileUrn = existingViewer.profileUrn;
    if (existingViewer.memberNumericId) preservedRelationshipUpdates.memberNumericId = existingViewer.memberNumericId;
    if (typeof existingViewer.canMessage === 'boolean') preservedRelationshipUpdates.canMessage = existingViewer.canMessage;
    if (typeof existingViewer.canFollow === 'boolean') preservedRelationshipUpdates.canFollow = existingViewer.canFollow;
    if (typeof existingViewer.canConnect === 'boolean') preservedRelationshipUpdates.canConnect = existingViewer.canConnect;
    if (typeof existingViewer.isFollowing === 'boolean') preservedRelationshipUpdates.isFollowing = existingViewer.isFollowing;
    if (typeof existingViewer.isPremium === 'boolean') preservedRelationshipUpdates.isPremium = existingViewer.isPremium;
    if (existingViewer.status) preservedRelationshipUpdates.status = existingViewer.status;
    if (typeof existingViewer.statusResolvedAt === 'number') {
      preservedRelationshipUpdates.statusResolvedAt = existingViewer.statusResolvedAt;
    }
    if (typeof existingViewer.statusCheckFailedAt === 'number') {
      preservedRelationshipUpdates.statusCheckFailedAt = existingViewer.statusCheckFailedAt;
    }
    if (existingViewer.statusCheckError) {
      preservedRelationshipUpdates.statusCheckError = existingViewer.statusCheckError;
    }

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
        ...preservedRelationshipUpdates,
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
        displayName: chooseSearchDisplayName(search, existing),
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
  counts: {
    privateViewerCount?: number;
    recruiterViewerCount?: number;
    recruiterViewerUrl?: string;
  },
  updatedAt = Date.now()
): Promise<ProfileViewerSummary> {
  const summaryUpdate: Partial<ProfileViewerSummary> & { updatedAt: number } = {
    updatedAt,
  };
  if (typeof counts.privateViewerCount === 'number') {
    summaryUpdate.privateViewerCount = Math.max(0, Math.trunc(counts.privateViewerCount));
  }
  if (typeof counts.recruiterViewerCount === 'number') {
    summaryUpdate.recruiterViewerCount = Math.max(0, Math.trunc(counts.recruiterViewerCount));
  }
  if (typeof counts.recruiterViewerUrl === 'string' && counts.recruiterViewerUrl.trim()) {
    summaryUpdate.recruiterViewerUrl = counts.recruiterViewerUrl.trim();
  }

  await setDoc(profileViewerSummaryDoc(userId), summaryUpdate, { merge: true });
  return {
    privateViewerCount: summaryUpdate.privateViewerCount || 0,
    recruiterViewerCount: summaryUpdate.recruiterViewerCount,
    recruiterViewerUrl: summaryUpdate.recruiterViewerUrl,
    updatedAt,
  };
}

export async function getProfileViewerSummary(
  userId: string
): Promise<ProfileViewerSummary | null> {
  const snapshot = await getDoc(profileViewerSummaryDoc(userId));
  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data() as Partial<ProfileViewerSummary>;
  const hasPrivateViewerCount =
    Number.isSafeInteger(data.privateViewerCount) && (data.privateViewerCount || 0) >= 0;
  const hasRecruiterViewerCount =
    Number.isSafeInteger(data.recruiterViewerCount) && (data.recruiterViewerCount || 0) >= 0;

  if (!hasPrivateViewerCount && !hasRecruiterViewerCount) {
    return null;
  }

  return {
    privateViewerCount: hasPrivateViewerCount ? data.privateViewerCount || 0 : 0,
    recruiterViewerCount: hasRecruiterViewerCount ? data.recruiterViewerCount : undefined,
    recruiterViewerUrl:
      typeof data.recruiterViewerUrl === 'string' && data.recruiterViewerUrl.trim()
        ? data.recruiterViewerUrl.trim()
        : undefined,
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
  };
}

export async function updateProfileViewer(
  userId: string,
  viewerId: string,
  updates: Partial<ProfileViewerInput & Pick<ProfileViewer, 'profileUrn' | 'memberNumericId' | 'canMessage' | 'canFollow' | 'canConnect' | 'isFollowing' | 'isPremium' | 'status' | 'statusResolvedAt' | 'statusCheckFailedAt' | 'statusCheckError'>>
): Promise<void> {
  const linkedinUsername = normalizeLinkedInUsername(viewerId || updates.linkedinUsername || getUsernameFromLinkedInUrl(updates.linkedinUrl || ''));
  if (!linkedinUsername) {
    throw new Error('Invalid profile viewer id');
  }

  const viewerRef = doc(profileViewersCollection(userId), linkedinUsername);
  const existingSnapshot = await getDoc(viewerRef);
  const existing = existingSnapshot.exists() ? existingSnapshot.data() as Partial<ProfileViewer> : null;
  const shouldPreserveWithdrawn =
    existing?.status === 'withdrawn' &&
    (updates.status === 'connect' || updates.status === 'following');
  const safeUpdates = {
    ...updates,
    ...(shouldPreserveWithdrawn ? { status: 'withdrawn' as const, canConnect: false } : {}),
    ...(existing?.isFollowing === true && typeof updates.isFollowing !== 'boolean'
      ? { isFollowing: true }
      : {}),
    linkedinUsername,
  };

  await updateDoc(viewerRef, safeUpdates);
}

export async function removeProfileViewer(userId: string, viewerId: string): Promise<void> {
  const linkedinUsername = normalizeLinkedInUsername(viewerId);
  if (!linkedinUsername) {
    throw new Error('Invalid profile viewer id');
  }

  await deleteDoc(doc(profileViewersCollection(userId), linkedinUsername));
}

async function deleteCollectionDocuments(
  collectionRef: ReturnType<typeof profileViewersCollection>
): Promise<number> {
  const snapshot = await getDocs(collectionRef);
  if (snapshot.empty) {
    return 0;
  }

  let deletedCount = 0;
  for (let index = 0; index < snapshot.docs.length; index += 500) {
    const batch = writeBatch(getFirebaseDb());
    snapshot.docs.slice(index, index + 500).forEach((documentSnapshot) => {
      batch.delete(documentSnapshot.ref);
      deletedCount += 1;
    });
    await batch.commit();
  }

  return deletedCount;
}

async function deleteCollectionDocumentsNotSeenAt(
  collectionRef: ReturnType<typeof profileViewersCollection>,
  seenAt: number
): Promise<number> {
  const snapshot = await getDocs(collectionRef);
  const staleDocuments = snapshot.docs.filter(
    (documentSnapshot) => documentSnapshot.data().lastSeenAt !== seenAt
  );
  if (staleDocuments.length === 0) {
    return 0;
  }

  let deletedCount = 0;
  for (let index = 0; index < staleDocuments.length; index += 500) {
    const batch = writeBatch(getFirebaseDb());
    staleDocuments.slice(index, index + 500).forEach((documentSnapshot) => {
      batch.delete(documentSnapshot.ref);
      deletedCount += 1;
    });
    await batch.commit();
  }

  return deletedCount;
}

export async function deleteStaleProfileViewerCache(
  userId: string,
  seenAt: number
): Promise<{
  deletedProfileCount: number;
  deletedSearchCount: number;
}> {
  const [deletedProfileCount, deletedSearchCount] = await Promise.all([
    deleteCollectionDocumentsNotSeenAt(profileViewersCollection(userId), seenAt),
    deleteCollectionDocumentsNotSeenAt(profileViewerSearchesCollection(userId), seenAt),
  ]);

  return { deletedProfileCount, deletedSearchCount };
}

export async function clearProfileViewerCache(userId: string): Promise<{
  deletedProfileCount: number;
  deletedSearchCount: number;
}> {
  const [deletedProfileCount, deletedSearchCount] = await Promise.all([
    deleteCollectionDocuments(profileViewersCollection(userId)),
    deleteCollectionDocuments(profileViewerSearchesCollection(userId)),
  ]);
  await deleteDoc(profileViewerSummaryDoc(userId));

  return { deletedProfileCount, deletedSearchCount };
}

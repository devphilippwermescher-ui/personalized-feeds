import {
  addDoc,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  orderBy,
  query,
  type QueryDocumentSnapshot,
  updateDoc,
} from 'firebase/firestore';
import {
  buildMemberUpsertPatch,
  extractProfileToken,
  getCanonicalLinkedInUsername,
  getUsernameFromLinkedInUrl,
  memberMatchesProfileIdentity,
  normalizeLinkedInUsername,
  normalizeMemberNumericId,
} from '../linkedin-identity';
import type { Feed, FeedMember, LinkedInProfileData } from '../types';
import {
  docToFeed,
  docToMember,
  feedsCollection,
  membersCollection,
  shareLinksCollection,
  sharesCollection,
} from './refs';

export async function createFeed(userId: string, name: string, description?: string, color?: string): Promise<Feed> {
  const normalizedName = name.trim();
  if (!normalizedName) {
    throw new Error('Feed name is required');
  }

  const existingFeeds = await getFeeds(userId);
  const duplicate = existingFeeds.some((feed) => feed.name.trim().toLowerCase() === normalizedName.toLowerCase());
  if (duplicate) {
    throw new Error('A feed with this name already exists. Please choose a different name.');
  }

  const topSortOrder = existingFeeds.length > 0
    ? Math.min(
        ...existingFeeds.map((feed, index) => (typeof feed.sortOrder === 'number' ? feed.sortOrder : index))
      ) - 1
    : 0;

  const now = Date.now();
  const data = {
    name: normalizedName,
    description: description || '',
    color: color || '#615DEC',
    sortOrder: topSortOrder,
    createdAt: now,
    updatedAt: now,
    memberCount: 0,
    ownerId: userId,
  };

  const docRef = await addDoc(feedsCollection(userId), data);
  return { id: docRef.id, ...data };
}

export async function getFeeds(userId: string): Promise<Feed[]> {
  const q = query(feedsCollection(userId));
  const snapshot = await getDocs(q);
  return snapshot.docs
    .map(docToFeed)
    .sort((a, b) => {
      const aOrder = typeof a.sortOrder === 'number' ? a.sortOrder : Number.MAX_SAFE_INTEGER;
      const bOrder = typeof b.sortOrder === 'number' ? b.sortOrder : Number.MAX_SAFE_INTEGER;

      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }

      return b.createdAt - a.createdAt;
    });
}

export async function getFeed(userId: string, feedId: string): Promise<Feed | null> {
  const snap = await getDoc(doc(feedsCollection(userId), feedId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Feed) : null;
}

export async function updateFeed(
  userId: string,
  feedId: string,
  updates: Partial<Pick<Feed, 'name' | 'description' | 'color' | 'sortOrder'>>
): Promise<void> {
  const payload = { ...updates } as Partial<Pick<Feed, 'name' | 'description' | 'color' | 'sortOrder'>>;

  if (typeof payload.name === 'string') {
    const normalizedName = payload.name.trim();
    if (!normalizedName) {
      throw new Error('Feed name is required');
    }

    const existingFeeds = await getFeeds(userId);
    const duplicate = existingFeeds.some(
      (feed) => feed.id !== feedId && feed.name.trim().toLowerCase() === normalizedName.toLowerCase()
    );
    if (duplicate) {
      throw new Error('A feed with this name already exists. Please choose a different name.');
    }

    payload.name = normalizedName;
  }

  await updateDoc(doc(feedsCollection(userId), feedId), {
    ...payload,
    updatedAt: Date.now(),
  });
}

export async function reorderFeeds(userId: string, orderedFeedIds: string[]): Promise<void> {
  await Promise.all(
    orderedFeedIds.map((feedId, index) =>
      updateDoc(doc(feedsCollection(userId), feedId), {
        sortOrder: index,
        updatedAt: Date.now(),
      })
    )
  );
}

export async function deleteFeed(userId: string, feedId: string): Promise<void> {
  const membersSnap = await getDocs(membersCollection(userId, feedId));
  const sharesSnap = await getDocs(sharesCollection(userId, feedId));
  const feed = await getFeed(userId, feedId);
  const deletePromises = membersSnap.docs.map((d: QueryDocumentSnapshot) => deleteDoc(d.ref));
  const deleteSharePromises = sharesSnap.docs.map((d: QueryDocumentSnapshot) => deleteDoc(d.ref));

  if (feed?.shareToken) {
    deletePromises.push(deleteDoc(doc(shareLinksCollection(), feed.shareToken)));
  }

  await Promise.all([...deletePromises, ...deleteSharePromises]);
  await deleteDoc(doc(feedsCollection(userId), feedId));
}

// ── Members ──

export async function addMemberToFeed(
  userId: string,
  feedId: string,
  profileData: LinkedInProfileData
): Promise<{ member: FeedMember; alreadyExists: boolean }> {
  const existing = await findExistingMemberInFeed(userId, feedId, profileData);
  if (existing) {
    const patch = buildMemberUpsertPatch(existing, profileData);
    if (Object.keys(patch).length > 0) {
      await updateMemberInFeed(userId, feedId, existing.id, patch);
      return { member: { ...existing, ...patch }, alreadyExists: true };
    }
    return { member: existing, alreadyExists: true };
  }

  const now = Date.now();
  const data: Omit<FeedMember, 'id'> = {
    linkedinUrl: profileData.linkedinUrl,
    linkedinUsername: getCanonicalLinkedInUsername(profileData),
    profileUrn: profileData.profileUrn || '',
    memberNumericId: normalizeMemberNumericId(profileData.memberNumericId),
    canMessage: profileData.canMessage ?? false,
    canFollow: profileData.canFollow ?? false,
    canConnect: profileData.canConnect ?? false,
    isFollowing: profileData.isFollowing ?? false,
    displayName: profileData.displayName,
    headline: profileData.headline || '',
    profileImageUrl: profileData.profileImageUrl || '',
    company: profileData.company || '',
    location: profileData.location || '',
    connectionDegree: profileData.connectionDegree || '',
    addedAt: now,
  };

  const docRef = await addDoc(membersCollection(userId, feedId), data);

  await updateDoc(doc(feedsCollection(userId), feedId), {
    memberCount: increment(1),
    updatedAt: Date.now(),
  });

  return { member: { id: docRef.id, ...data }, alreadyExists: false };
}

export async function getFeedMembers(userId: string, feedId: string): Promise<FeedMember[]> {
  const q = query(membersCollection(userId, feedId), orderBy('addedAt', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(docToMember);
}

export async function getMemberByUsername(
  userId: string,
  feedId: string,
  username: string
): Promise<FeedMember | null> {
  const members = await getFeedMembers(userId, feedId);
  const normalizedUsername = normalizeLinkedInUsername(username);
  return members.find((member) => {
    const memberUsername = normalizeLinkedInUsername(member.linkedinUsername);
    const memberUrlUsername = getUsernameFromLinkedInUrl(member.linkedinUrl);
    return memberUsername === normalizedUsername || memberUrlUsername === normalizedUsername;
  }) || null;
}

async function findExistingMemberInFeed(
  userId: string,
  feedId: string,
  profileData: LinkedInProfileData
): Promise<FeedMember | null> {
  const members = await getFeedMembers(userId, feedId);
  return (
    members.find((member) =>
      memberMatchesProfileIdentity(member, {
        linkedinUsername: profileData.linkedinUsername,
        linkedinUrl: profileData.linkedinUrl,
        memberNumericId: profileData.memberNumericId,
        profileUrn: profileData.profileUrn,
      })
    ) || null
  );
}

export async function removeMemberFromFeed(userId: string, feedId: string, memberId: string): Promise<void> {
  await deleteDoc(doc(membersCollection(userId, feedId), memberId));
  await updateDoc(doc(feedsCollection(userId), feedId), {
    memberCount: increment(-1),
    updatedAt: Date.now(),
  });
}

export async function updateMemberInFeed(
  userId: string,
  feedId: string,
  memberId: string,
  updates: Partial<
    Pick<
      FeedMember,
      'displayName' | 'headline' | 'email' | 'company' | 'location' | 'linkedinUrl' | 'profileImageUrl' | 'connectionDegree' | 'status' | 'profileUrn' | 'canMessage' | 'memberNumericId' | 'canFollow' | 'canConnect' | 'isFollowing' | 'isPremium'
    >
  >
): Promise<void> {
  const memberRef = doc(membersCollection(userId, feedId), memberId);
  const existingSnapshot = await getDoc(memberRef);
  const existing = existingSnapshot.exists() ? { id: existingSnapshot.id, ...existingSnapshot.data() } as FeedMember : null;
  const shouldPreserveWithdrawn =
    existing?.status === 'withdrawn' &&
    (updates.status === 'connect' || updates.status === 'following');
  const safeUpdates = {
    ...updates,
    ...(shouldPreserveWithdrawn ? { status: 'withdrawn' as const, canConnect: false } : {}),
    ...(existing?.isFollowing === true && typeof updates.isFollowing !== 'boolean'
      ? { isFollowing: true }
      : {}),
  };

  await updateDoc(memberRef, safeUpdates);
  await updateDoc(doc(feedsCollection(userId), feedId), {
    updatedAt: Date.now(),
  });
}

export async function getProfileFeedMemberships(
  userId: string,
  linkedinUsername: string,
  linkedinUrl?: string,
  memberNumericId?: string,
  profileUrn?: string
): Promise<{ feedId: string; feedName: string; memberId: string }[]> {
  const feeds = await getFeeds(userId);
  const results: { feedId: string; feedName: string; memberId: string }[] = [];
  const normalizedUsername = normalizeLinkedInUsername(linkedinUsername);
  const urlUsername = getUsernameFromLinkedInUrl(linkedinUrl);
  const normalizedMemberId = normalizeMemberNumericId(memberNumericId);
  const normalizedProfileToken = extractProfileToken(profileUrn);

  for (const feed of feeds) {
    const members = await getFeedMembers(userId, feed.id);
    const member =
      members.find((item) => {
        return memberMatchesProfileIdentity(item, {
          linkedinUsername: normalizedUsername || urlUsername,
          linkedinUrl: linkedinUrl || '',
          memberNumericId: normalizedMemberId,
          profileUrn: normalizedProfileToken,
        });
      }) || null;

    if (member) {
      results.push({ feedId: feed.id, feedName: feed.name, memberId: member.id });
    }
  }

  return results;
}

// ── Sharing ──

import {
  collection,
  doc,
  setDoc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  increment,
  writeBatch,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { getFirebaseDb } from './firebase-config';
import {
  buildMemberUpsertPatch,
  extractProfileToken,
  getCanonicalLinkedInUsername,
  getUsernameFromLinkedInUrl,
  memberMatchesProfileIdentity,
  normalizeLinkedInUsername,
  normalizeMemberNumericId,
} from './linkedin-identity';
import {
  chooseProfileViewerDisplayName,
  chooseProfileViewerImageUrl,
  getAmbiguousProfileViewerImageUrls,
} from './profile-viewer-quality';
import { sortProfileViewersByRecency } from './profile-viewer-order';
import type {
  Feed,
  FeedMember,
  FeedShareAccess,
  FeedShareRole,
  FollowedFeed,
  LinkedInProfileData,
  ProfileViewer,
  ProfileViewerInput,
  SharedFeedSummary,
  UserFeatureSettings,
  UserProfile,
} from './types';

function feedsCollection(userId: string) {
  return collection(getFirebaseDb(), 'users', userId, 'feeds');
}

function membersCollection(userId: string, feedId: string) {
  return collection(getFirebaseDb(), 'users', userId, 'feeds', feedId, 'members');
}

function sharesCollection(userId: string, feedId: string) {
  return collection(getFirebaseDb(), 'users', userId, 'feeds', feedId, 'shares');
}

function followedFeedsCollection(userId: string) {
  return collection(getFirebaseDb(), 'users', userId, 'followedFeeds');
}

function profileViewersCollection(userId: string) {
  return collection(getFirebaseDb(), 'users', userId, 'profileViewers');
}

function emailIndexCollection() {
  return collection(getFirebaseDb(), 'emailIndex');
}

function shareLinksCollection() {
  return collection(getFirebaseDb(), 'feedShareLinks');
}

function settingsDoc(userId: string) {
  return doc(getFirebaseDb(), 'users', userId, 'settings', 'preferences');
}

function docToFeed(d: QueryDocumentSnapshot<DocumentData, DocumentData>): Feed {
  return { id: d.id, ...d.data() } as Feed;
}

function docToMember(d: QueryDocumentSnapshot<DocumentData, DocumentData>): FeedMember {
  return { id: d.id, ...d.data() } as FeedMember;
}

function docToShareAccess(d: QueryDocumentSnapshot<DocumentData, DocumentData>): FeedShareAccess {
  return d.data() as FeedShareAccess;
}

function docToProfileViewer(d: QueryDocumentSnapshot<DocumentData, DocumentData>): ProfileViewer {
  return { id: d.id, ...d.data() } as ProfileViewer;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function ensureFeedExists(ownerId: string, feedId: string): Promise<Feed> {
  const feed = await getFeed(ownerId, feedId);
  if (!feed) {
    throw new Error('Feed not found');
  }
  return feed;
}

async function ensureUserExists(userId: string): Promise<UserProfile> {
  const user = await getUserProfile(userId);
  if (!user) {
    throw new Error('User not found');
  }
  return user;
}

async function upsertFollowedFeed(userId: string, ownerId: string, feedId: string, role: FeedShareRole): Promise<void> {
  const followedId = `${ownerId}_${feedId}`;
  await setDoc(doc(followedFeedsCollection(userId), followedId), {
    ownerId,
    feedId,
    role,
    followedAt: Date.now(),
  } satisfies Omit<FollowedFeed, 'id'>);
}

const DEFAULT_USER_FEATURE_SETTINGS: UserFeatureSettings = {
  messagingButtons: true,
  postButtons: true,
  speechToComment: true,
};

// ── User ──

export async function createUserProfile(profile: UserProfile): Promise<void> {
  const userRef = doc(getFirebaseDb(), 'users', profile.uid);
  const existing = await getDoc(userRef);
  const createdAt = existing.exists()
    ? ((existing.data() as UserProfile).createdAt || profile.createdAt)
    : profile.createdAt;

  await setDoc(userRef, {
    ...profile,
    createdAt,
  });

  if (profile.email.trim()) {
    await setDoc(doc(emailIndexCollection(), normalizeEmail(profile.email)), {
      uid: profile.uid,
      email: profile.email.trim(),
      displayName: profile.displayName,
      photoURL: profile.photoURL || '',
      updatedAt: Date.now(),
    });
  }
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(getFirebaseDb(), 'users', userId));
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

export async function getUserFeatureSettings(userId: string): Promise<UserFeatureSettings> {
  const snap = await getDoc(settingsDoc(userId));
  if (!snap.exists()) {
    return DEFAULT_USER_FEATURE_SETTINGS;
  }

  const data = snap.data() as Partial<UserFeatureSettings>;
  return {
    messagingButtons: data.messagingButtons ?? DEFAULT_USER_FEATURE_SETTINGS.messagingButtons,
    postButtons: data.postButtons ?? DEFAULT_USER_FEATURE_SETTINGS.postButtons,
    speechToComment: data.speechToComment ?? DEFAULT_USER_FEATURE_SETTINGS.speechToComment,
  };
}

// Profile viewers

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
  existingViewers: ProfileViewer[]
): Promise<{
  savedCount: number;
  newCount: number;
  newProfileUsernames: string[];
}> {
  let savedCount = 0;
  let newCount = 0;
  const newProfileUsernames: string[] = [];
  const now = Date.now();
  const existingByUsername = new Map(existingViewers.map((viewer) => [viewer.linkedinUsername.toLowerCase(), viewer]));
  const ambiguousExistingImages = getAmbiguousProfileViewerImageUrls(existingViewers);
  const validViewers = viewers
    .map((viewer, lastSeenPosition) => ({
      viewer,
      lastSeenPosition,
      linkedinUsername: normalizeLinkedInUsername(
        viewer.linkedinUsername || getUsernameFromLinkedInUrl(viewer.linkedinUrl)
      ),
    }))
    .filter(
      (entry) =>
        Boolean(entry.linkedinUsername) && Boolean(entry.viewer.linkedinUrl) && Boolean(entry.viewer.displayName.trim())
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
  return sortProfileViewersByRecency(snapshot.docs.map(docToProfileViewer));
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

export async function updateUserFeatureSettings(
  userId: string,
  updates: Partial<UserFeatureSettings>
): Promise<UserFeatureSettings> {
  const current = await getUserFeatureSettings(userId);
  const next = {
    ...current,
    ...updates,
  };

  await setDoc(settingsDoc(userId), next, { merge: true });
  return next;
}

export async function findUserProfileByEmail(email: string): Promise<UserProfile | null> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return null;
  }

  const emailSnap = await getDoc(doc(emailIndexCollection(), normalizedEmail));
  if (!emailSnap.exists()) {
    return null;
  }

  const data = emailSnap.data() as { uid?: string };
  if (!data.uid) {
    return null;
  }

  return getUserProfile(data.uid);
}

// ── Feeds ──

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
  await updateDoc(doc(membersCollection(userId, feedId), memberId), updates);
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

export async function shareFeedWithUser(
  ownerId: string,
  feedId: string,
  targetEmail: string,
  role: FeedShareRole
): Promise<FeedShareAccess> {
  const normalizedEmail = normalizeEmail(targetEmail);
  if (!normalizedEmail) {
    throw new Error('Email is required');
  }

  const [feed, targetUser] = await Promise.all([
    ensureFeedExists(ownerId, feedId),
    findUserProfileByEmail(normalizedEmail),
  ]);

  if (!targetUser?.uid) {
    throw new Error('No MyFeedIn user found for this email');
  }

  if (targetUser.uid === ownerId) {
    throw new Error('You already own this feed');
  }

  const now = Date.now();
  const access: FeedShareAccess = {
    targetUid: targetUser.uid,
    targetEmail: normalizedEmail,
    role,
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(doc(sharesCollection(ownerId, feed.id), targetUser.uid), access, { merge: true });
  await upsertFollowedFeed(targetUser.uid, ownerId, feed.id, role);

  return access;
}

export async function getFeedShares(ownerId: string, feedId: string): Promise<Array<FeedShareAccess & UserProfile>> {
  const snapshot = await getDocs(query(sharesCollection(ownerId, feedId), orderBy('createdAt', 'asc')));
  const shares = snapshot.docs.map(docToShareAccess);
  const profiles = await Promise.all(shares.map((share) => ensureUserExists(share.targetUid)));

  return shares.map((share, index) => ({
    ...profiles[index],
    ...share,
  }));
}

export async function updateFeedShareRole(
  ownerId: string,
  feedId: string,
  targetUid: string,
  role: FeedShareRole
): Promise<void> {
  const shareRef = doc(sharesCollection(ownerId, feedId), targetUid);
  const shareSnap = await getDoc(shareRef);

  if (!shareSnap.exists()) {
    throw new Error('Shared user not found');
  }

  await updateDoc(shareRef, {
    role,
    updatedAt: Date.now(),
  } satisfies Partial<FeedShareAccess>);
}

export async function removeFeedShare(ownerId: string, feedId: string, targetUid: string): Promise<void> {
  await deleteDoc(doc(sharesCollection(ownerId, feedId), targetUid));

  try {
    await deleteDoc(doc(followedFeedsCollection(targetUid), `${ownerId}_${feedId}`));
  } catch (err: unknown) {
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code?: unknown }).code)
        : '';

    // The primary action is removing share access from the owner's feed.
    // Cleanup of the follower-side reference can legitimately race with:
    // - the recipient already unfollowing the feed
    // - an already-missing stale followedFeed entry
    // In those cases Firestore may reject the cleanup delete, but access has
    // already been removed successfully, so we do not want to surface a false error.
    if (code === 'permission-denied' || code === 'not-found') {
      return;
    }

    throw err;
  }
}

export async function ensureFeedShareLink(ownerId: string, feedId: string): Promise<string> {
  const feed = await ensureFeedExists(ownerId, feedId);
  if (feed.shareToken) {
    return feed.shareToken;
  }

  const token = crypto.randomUUID();
  await Promise.all([
    updateDoc(doc(feedsCollection(ownerId), feedId), {
      shareToken: token,
      updatedAt: Date.now(),
    }),
    setDoc(doc(shareLinksCollection(), token), {
      ownerId,
      feedId,
      role: 'reader',
      createdAt: Date.now(),
    }),
  ]);

  return token;
}

export async function followFeedByShareToken(userId: string, token: string): Promise<SharedFeedSummary> {
  const tokenSnap = await getDoc(doc(shareLinksCollection(), token));
  if (!tokenSnap.exists()) {
    throw new Error('This shared feed link is invalid or expired');
  }

  const tokenData = tokenSnap.data() as { ownerId?: string; feedId?: string; role?: FeedShareRole };
  if (!tokenData.ownerId || !tokenData.feedId) {
    throw new Error('This shared feed link is invalid');
  }

  if (tokenData.ownerId === userId) {
    throw new Error('This is your own feed');
  }

  const role = tokenData.role || 'reader';

  // Read own profile + owner profile first (allowed by signedIn rule on /users/{userId})
  const [ownerProfile, currentUser] = await Promise.all([
    ensureUserExists(tokenData.ownerId),
    ensureUserExists(userId),
  ]);

  // Create share entry BEFORE reading the feed — Firestore rules require the share
  // document to exist for hasFeedReadAccess to pass for non-owner users.
  const now = Date.now();
  await Promise.all([
    setDoc(doc(sharesCollection(tokenData.ownerId, tokenData.feedId), userId), {
      targetUid: userId,
      targetEmail: normalizeEmail(currentUser.email),
      role,
      createdAt: now,
      updatedAt: now,
    } satisfies FeedShareAccess, { merge: true }),
    upsertFollowedFeed(userId, tokenData.ownerId, tokenData.feedId, role),
  ]);

  // Now the share exists, so the user can read the feed
  const feed = await ensureFeedExists(tokenData.ownerId, tokenData.feedId);

  return {
    ...feed,
    role,
    ownerDisplayName: ownerProfile.displayName,
    ownerEmail: ownerProfile.email,
    ownerPhotoURL: ownerProfile.photoURL,
    followedAt: now,
  };
}

export async function getFollowedFeeds(userId: string): Promise<SharedFeedSummary[]> {
  const snapshot = await getDocs(query(followedFeedsCollection(userId), orderBy('followedAt', 'desc')));
  const followedDocs = snapshot.docs.map((item) => ({
    id: item.id,
    ...(item.data() as Omit<FollowedFeed, 'id'>),
  })) as FollowedFeed[];

  const summaries: Array<SharedFeedSummary | null> = await Promise.all(
    followedDocs.map(async (followed) => {
      try {
        const [feed, ownerProfile, shareSnap] = await Promise.all([
          getFeed(followed.ownerId, followed.feedId),
          getUserProfile(followed.ownerId),
          getDoc(doc(sharesCollection(followed.ownerId, followed.feedId), userId)),
        ]);

        if (!feed || !ownerProfile) {
          return null;
        }

        const activeRole = shareSnap.exists()
          ? ((shareSnap.data() as Partial<FeedShareAccess>).role || followed.role)
          : followed.role;

        if (activeRole !== followed.role) {
          await setDoc(doc(followedFeedsCollection(userId), followed.id), {
            ownerId: followed.ownerId,
            feedId: followed.feedId,
            role: activeRole,
            followedAt: followed.followedAt,
          } satisfies Omit<FollowedFeed, 'id'>);
        }

        return {
          ...feed,
          role: activeRole,
          ownerDisplayName: ownerProfile.displayName,
          ownerEmail: ownerProfile.email,
          ownerPhotoURL: ownerProfile.photoURL,
          followedAt: followed.followedAt,
        };
      } catch (err: unknown) {
        const code =
          typeof err === 'object' && err !== null && 'code' in err
            ? String((err as { code?: unknown }).code)
            : '';
        if (code === 'permission-denied') {
          // Share was revoked but followedFeed entry was not cleaned up. Treat as stale.
          return null;
        }
        throw err;
      }
    })
  );

  return summaries.filter((item): item is SharedFeedSummary => !!item);
}

export async function unfollowFeed(userId: string, ownerId: string, feedId: string): Promise<void> {
  await deleteDoc(doc(followedFeedsCollection(userId), `${ownerId}_${feedId}`));
}

export async function duplicateSharedFeed(
  userId: string,
  ownerId: string,
  feedId: string
): Promise<Feed> {
  const sourceFeed = await ensureFeedExists(ownerId, feedId);
  const sourceMembers = await getFeedMembers(ownerId, feedId);
  const existingFeeds = await getFeeds(userId);

  const baseName = sourceFeed.name.trim() || 'Shared feed';
  let nextName = `${baseName} (copy)`;
  let copyIndex = 2;

  const existingNames = new Set(existingFeeds.map((feed) => feed.name.trim().toLowerCase()));
  while (existingNames.has(nextName.trim().toLowerCase())) {
    nextName = `${baseName} (copy ${copyIndex})`;
    copyIndex += 1;
  }

  const duplicatedFeed = await createFeed(userId, nextName, sourceFeed.description, sourceFeed.color);

  if (sourceMembers.length === 0) {
    return duplicatedFeed;
  }

  const batch = writeBatch(getFirebaseDb());
  const now = Date.now();

  sourceMembers.forEach((member) => {
    const memberRef = doc(membersCollection(userId, duplicatedFeed.id));
    batch.set(memberRef, {
      linkedinUrl: member.linkedinUrl,
      linkedinUsername: member.linkedinUsername,
      profileUrn: member.profileUrn || '',
      canMessage: member.canMessage ?? false,
      displayName: member.displayName,
      headline: member.headline || '',
      profileImageUrl: member.profileImageUrl || '',
      company: member.company || '',
      location: member.location || '',
      connectionDegree: member.connectionDegree || '',
      addedAt: now,
    });
  });

  batch.update(doc(feedsCollection(userId), duplicatedFeed.id), {
    memberCount: sourceMembers.length,
    updatedAt: now,
  });

  await batch.commit();
  return {
    ...duplicatedFeed,
    memberCount: sourceMembers.length,
    updatedAt: now,
  };
}

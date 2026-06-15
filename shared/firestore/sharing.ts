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
import type {
  Feed,
  FeedShareAccess,
  FeedShareRole,
  FollowedFeed,
  SharedFeedSummary,
  UserProfile,
} from '../types';
import {
  followedFeedsCollection,
  feedsCollection,
  membersCollection,
  normalizeEmail,
  shareLinksCollection,
  sharesCollection,
  docToShareAccess,
} from './refs';
import {
  createFeed,
  getFeed,
  getFeedMembers,
  getFeeds,
} from './feeds';
import {
  findUserProfileByEmail,
  getUserProfile,
} from './users';

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

async function upsertFollowedFeed(
  userId: string,
  ownerId: string,
  feedId: string,
  role: FeedShareRole
): Promise<void> {
  const followedId = `${ownerId}_${feedId}`;
  await setDoc(doc(followedFeedsCollection(userId), followedId), {
    ownerId,
    feedId,
    role,
    followedAt: Date.now(),
  } satisfies Omit<FollowedFeed, 'id'>);
}

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

import {
  collection,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { getFirebaseDb } from '../firebase-config';
import type {
  ProfileAnalyticsAcceptanceSnapshot,
  ProfileAnalyticsConnectionInvite,
} from '../types';
import {
  extractProfileToken,
  normalizeLinkedInUsername,
  normalizeMemberNumericId,
} from '../linkedin-identity';
import {
  docToProfileAnalyticsConnectionInvite,
  profileConnectionInviteDoc,
} from './refs';

export type TrackConnectionInviteInput = Pick<
  ProfileAnalyticsConnectionInvite,
  'linkedinUsername' | 'linkedinUrl' | 'displayName' | 'profileUrn' | 'memberNumericId'
> & {
  source?: ProfileAnalyticsConnectionInvite['source'];
};

function getConnectionInviteStorageKey(input: TrackConnectionInviteInput): string {
  const linkedinUsername = normalizeLinkedInUsername(input.linkedinUsername);
  if (linkedinUsername) {
    return linkedinUsername;
  }

  const profileToken = extractProfileToken(input.profileUrn);
  if (profileToken) {
    return `profile_${profileToken.toLowerCase()}`;
  }

  const memberNumericId = normalizeMemberNumericId(input.memberNumericId);
  return memberNumericId ? `member_${memberNumericId}` : '';
}

export async function trackConnectionInviteSent(
  userId: string,
  input: TrackConnectionInviteInput,
  sentAt = Date.now()
): Promise<void> {
  const storageKey = getConnectionInviteStorageKey(input);
  if (!storageKey) {
    return;
  }

  const inviteRef = profileConnectionInviteDoc(userId, storageKey);
  const existingInvite = await getDoc(inviteRef);
  const existingData = existingInvite.exists()
    ? existingInvite.data() as Partial<ProfileAnalyticsConnectionInvite>
    : null;
  const existingAccepted = existingData?.status === 'accepted';
  const linkedinUsername = normalizeLinkedInUsername(input.linkedinUsername || existingData?.linkedinUsername);
  const profileUrn = input.profileUrn || existingData?.profileUrn || '';
  const memberNumericId =
    normalizeMemberNumericId(input.memberNumericId) ||
    normalizeMemberNumericId(existingData?.memberNumericId);

  await setDoc(
    inviteRef,
    {
      kind: 'connectionInvite',
      linkedinUsername,
      linkedinUrl: input.linkedinUrl || existingData?.linkedinUrl || '',
      displayName: input.displayName || existingData?.displayName || '',
      profileUrn,
      memberNumericId,
      sentAt: typeof existingData?.sentAt === 'number' ? Math.min(existingData.sentAt, sentAt) : sentAt,
      status: existingAccepted ? 'accepted' : 'sent',
      source: input.source || existingData?.source || 'sidebar_connect_action',
      updatedAt: sentAt,
      serverUpdatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function markConnectionInviteAccepted(
  userId: string,
  linkedinUsername: string,
  acceptedAt = Date.now()
): Promise<void> {
  const normalizedUsername = linkedinUsername.trim().toLowerCase();
  if (!normalizedUsername) {
    return;
  }

  const inviteRef = profileConnectionInviteDoc(userId, normalizedUsername);
  const existingInvite = await getDoc(inviteRef);
  if (!existingInvite.exists()) {
    return;
  }

  await setDoc(
    inviteRef,
    {
      kind: 'connectionInvite',
      linkedinUsername: normalizedUsername,
      acceptedAt,
      status: 'accepted',
      updatedAt: acceptedAt,
      serverUpdatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function getConnectionInvites(
  userId: string
): Promise<ProfileAnalyticsConnectionInvite[]> {
  const snapshot = await getDocs(collection(getFirebaseDb(), 'users', userId, 'profileViewerMetadata'));
  return snapshot.docs
    .map(docToProfileAnalyticsConnectionInvite)
    .filter((invite) => invite.kind === 'connectionInvite');
}

export async function getConnectionInviteAcceptanceSnapshot(
  userId: string,
  since: number,
  now = Date.now()
): Promise<ProfileAnalyticsAcceptanceSnapshot> {
  const invites = await getConnectionInvites(userId);
  const sentInRange = invites.filter((invite) => invite.sentAt >= since && invite.sentAt <= now);
  const acceptedInRange = sentInRange.filter((invite) => {
    return invite.status === 'accepted' && typeof invite.acceptedAt === 'number' && invite.acceptedAt <= now;
  });
  const sentCount = sentInRange.length;
  const acceptedCount = acceptedInRange.length;

  return {
    sentCount,
    acceptedCount,
    rate: sentCount > 0 ? (acceptedCount / sentCount) * 100 : 0,
    updatedAt: now,
    source: 'tracked_invites',
  };
}

import { collection, getDoc, getDocs, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { getFirebaseDb } from '../firebase-config';
import type { ProfileAnalyticsAcceptanceSnapshot, ProfileAnalyticsConnectionInvite } from '../types';
import { extractProfileToken, normalizeLinkedInUsername, normalizeMemberNumericId } from '../linkedin-identity';
import { docToProfileAnalyticsConnectionInvite, profileConnectionInviteDoc } from './refs';

export type TrackConnectionInviteInput = Pick<
  ProfileAnalyticsConnectionInvite,
  'linkedinUsername' | 'linkedinUrl' | 'displayName' | 'profileUrn' | 'memberNumericId'
> & {
  source?: ProfileAnalyticsConnectionInvite['source'];
};

export const CONNECTION_INVITE_FIRST_CHECK_DELAY_MS = 60 * 60 * 1000;
const CONNECTION_INVITE_CHECK_BACKOFF_MS = [
  3 * 60 * 60 * 1000,
  6 * 60 * 60 * 1000,
  12 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
] as const;

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
    ? (existingInvite.data() as Partial<ProfileAnalyticsConnectionInvite>)
    : null;
  const existingAccepted = existingData?.status === 'accepted';
  const linkedinUsername = normalizeLinkedInUsername(input.linkedinUsername || existingData?.linkedinUsername);
  const profileUrn = input.profileUrn || existingData?.profileUrn || '';
  const memberNumericId =
    normalizeMemberNumericId(input.memberNumericId) || normalizeMemberNumericId(existingData?.memberNumericId);

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
      nextCheckAt: existingAccepted
        ? null
        : typeof existingData?.nextCheckAt === 'number'
          ? existingData.nextCheckAt
          : sentAt + CONNECTION_INVITE_FIRST_CHECK_DELAY_MS,
      checkAttempts: typeof existingData?.checkAttempts === 'number' ? existingData.checkAttempts : 0,
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
      nextCheckAt: null,
      updatedAt: acceptedAt,
      serverUpdatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function markConnectionInviteChecked(
  userId: string,
  linkedinUsername: string,
  checkedAt = Date.now()
): Promise<number | undefined> {
  const normalizedUsername = normalizeLinkedInUsername(linkedinUsername);
  if (!normalizedUsername) return undefined;

  const inviteRef = profileConnectionInviteDoc(userId, normalizedUsername);
  const existingInvite = await getDoc(inviteRef);
  if (!existingInvite.exists()) return undefined;
  const data = existingInvite.data() as Partial<ProfileAnalyticsConnectionInvite>;
  if (data.status === 'accepted') return undefined;

  const previousAttempts = typeof data.checkAttempts === 'number' ? data.checkAttempts : 0;
  const checkAttempts = previousAttempts + 1;
  const delay =
    CONNECTION_INVITE_CHECK_BACKOFF_MS[Math.min(previousAttempts, CONNECTION_INVITE_CHECK_BACKOFF_MS.length - 1)];
  const nextCheckAt = checkedAt + delay;
  await setDoc(
    inviteRef,
    {
      lastCheckedAt: checkedAt,
      nextCheckAt,
      checkAttempts,
      updatedAt: checkedAt,
      serverUpdatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  return nextCheckAt;
}

export async function getConnectionInvites(userId: string): Promise<ProfileAnalyticsConnectionInvite[]> {
  const invitesQuery = query(
    collection(getFirebaseDb(), 'users', userId, 'profileViewerMetadata'),
    where('kind', '==', 'connectionInvite')
  );
  const snapshot = await getDocs(invitesQuery);
  return snapshot.docs.map(docToProfileAnalyticsConnectionInvite);
}

export function subscribeToConnectionInvites(
  userId: string,
  onValue: (invites: ProfileAnalyticsConnectionInvite[]) => void,
  onError?: (error: Error) => void
): () => void {
  const invitesQuery = query(
    collection(getFirebaseDb(), 'users', userId, 'profileViewerMetadata'),
    where('kind', '==', 'connectionInvite')
  );

  return onSnapshot(
    invitesQuery,
    (snapshot) => onValue(snapshot.docs.map(docToProfileAnalyticsConnectionInvite)),
    (error) => onError?.(error)
  );
}

export async function getConnectionInviteAcceptanceSnapshot(
  userId: string,
  since: number,
  now = Date.now()
): Promise<ProfileAnalyticsAcceptanceSnapshot> {
  const invites = await getConnectionInvites(userId);
  return buildConnectionInviteAcceptanceSnapshot(invites, since, now);
}

export function buildConnectionInviteAcceptanceSnapshot(
  invites: ProfileAnalyticsConnectionInvite[],
  since: number,
  now = Date.now()
): ProfileAnalyticsAcceptanceSnapshot {
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

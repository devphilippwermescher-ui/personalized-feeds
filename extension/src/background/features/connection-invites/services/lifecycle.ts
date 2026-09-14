import { markConnectionInviteAccepted, updateProfileViewer } from 'shared/firestore-service';
import { normalizeLinkedInUsername } from 'shared/linkedin-identity';

export async function markTrackedConnectionAccepted(
  userId: string,
  linkedinUsername: string,
  acceptedAt = Date.now()
): Promise<void> {
  const username = normalizeLinkedInUsername(linkedinUsername);
  if (!username) return;

  await markConnectionInviteAccepted(userId, username, acceptedAt);
  await updateProfileViewer(userId, username, {
    status: 'connected',
    statusResolvedAt: acceptedAt,
    canConnect: false,
    canMessage: true,
    statusCheckFailedAt: 0,
    statusCheckError: '',
  }).catch(() => {
    // The accepted invitation may belong to a profile that is not a Profile Visitor.
  });
}

export async function markTrackedConnectionsAccepted(
  userId: string,
  linkedinUsernames: string[],
  acceptedAt = Date.now()
): Promise<void> {
  const usernames = Array.from(new Set(linkedinUsernames.map(normalizeLinkedInUsername).filter(Boolean)));
  await Promise.all(usernames.map((username) => markTrackedConnectionAccepted(userId, username, acceptedAt)));
}

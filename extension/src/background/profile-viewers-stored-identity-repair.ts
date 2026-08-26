import { updateProfileViewer } from 'shared/firestore-service';
import { normalizeLinkedInUsername } from 'shared/linkedin-identity';
import { profileViewerDisplayNameConflictsWithUsername } from 'shared/profile-viewer-quality';
import type { ProfileViewer } from 'shared/types';
import { resolveLinkedInProfileIdentity } from './linkedin-profile-identity-resolver';
import { mapWithConcurrency } from './profile-viewers-enrichment-policy';

const STORED_IDENTITY_REPAIR_LIMIT = 5;
const STORED_IDENTITY_REPAIR_CONCURRENCY = 2;

interface StoredIdentityRepairResult {
  linkedinUsername: string;
  previousDisplayName: string;
  finalDisplayName?: string;
  repaired: boolean;
  error?: string;
}

export async function repairStoredProfileViewerIdentityMismatches(
  userId: string,
  existingViewers: ProfileViewer[]
): Promise<StoredIdentityRepairResult[]> {
  const candidates = existingViewers
    .filter((viewer) => {
      const username = normalizeLinkedInUsername(viewer.linkedinUsername);
      return profileViewerDisplayNameConflictsWithUsername(viewer.displayName, username);
    })
    .slice(0, STORED_IDENTITY_REPAIR_LIMIT);

  return mapWithConcurrency(
    candidates,
    STORED_IDENTITY_REPAIR_CONCURRENCY,
    async (viewer): Promise<StoredIdentityRepairResult> => {
      const linkedinUsername = normalizeLinkedInUsername(viewer.linkedinUsername);
      try {
        const identity = await resolveLinkedInProfileIdentity(linkedinUsername);
        const resolvedUsername = normalizeLinkedInUsername(identity?.linkedinUsername);
        const finalDisplayName = identity?.displayName?.trim() || '';
        if (
          !identity ||
          resolvedUsername !== linkedinUsername ||
          !finalDisplayName ||
          profileViewerDisplayNameConflictsWithUsername(finalDisplayName, linkedinUsername)
        ) {
          return {
            linkedinUsername,
            previousDisplayName: viewer.displayName,
            repaired: false,
            error: 'Exact LinkedIn identity was unavailable or its name did not match the stored profile URL.',
          };
        }

        if (finalDisplayName !== viewer.displayName) {
          await updateProfileViewer(userId, linkedinUsername, {
            displayName: finalDisplayName,
            profileUrn: identity.profileUrn,
          });
        }

        return {
          linkedinUsername,
          previousDisplayName: viewer.displayName,
          finalDisplayName,
          repaired: finalDisplayName !== viewer.displayName,
        };
      } catch (error) {
        return {
          linkedinUsername,
          previousDisplayName: viewer.displayName,
          repaired: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );
}

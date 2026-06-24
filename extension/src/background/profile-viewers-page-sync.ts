import { getProfileViewers, upsertProfileViewers } from 'shared/firestore-service';
import { getAuthenticatedFeedsUser } from './feeds-auth';
import { ProfileViewersSyncError } from './profile-viewers-error';
import { scrapeProfileViewersFromInactiveTab } from './profile-viewers-page-fallback';
import type { ProfileViewersSyncResult } from './profile-viewers-sync-result';

export async function syncProfileViewersViaPage(): Promise<ProfileViewersSyncResult> {
  const user = await getAuthenticatedFeedsUser();
  if (!user) {
    throw new ProfileViewersSyncError(
      'myFeedPilot authentication is required before profile visitors can be saved.',
      'app_auth_required'
    );
  }

  const [visibleViewers, existingViewers] = await Promise.all([
    scrapeProfileViewersFromInactiveTab(),
    getProfileViewers(user.uid),
  ]);
  const result = await upsertProfileViewers(user.uid, visibleViewers, existingViewers);
  return {
    ...result,
    visibleCount: visibleViewers.length,
    updatedCount: result.savedCount - result.newCount,
    visibleProfileUsernames: visibleViewers.map((viewer) => viewer.linkedinUsername),
  };
}

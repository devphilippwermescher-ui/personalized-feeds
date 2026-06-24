import type { ProfileViewer, ProfileViewerInput } from 'shared/types';
import {
  chooseProfileViewerDisplayName,
  chooseProfileViewerImageUrl,
  isUsableLinkedInProfileImageUrl,
  isWeakProfileViewerDisplayName,
} from 'shared/profile-viewer-quality';

export function hasCompleteProfileViewerIdentity(viewer: ProfileViewerInput): boolean {
  return (
    !isWeakProfileViewerDisplayName(viewer.displayName, viewer.linkedinUsername) &&
    isUsableLinkedInProfileImageUrl(viewer.profileImageUrl)
  );
}

export function profileViewerNeedsEnrichment(
  viewer: ProfileViewerInput,
  existingViewer: ProfileViewer | undefined,
  existingImageIsAmbiguous: boolean
): boolean {
  if (!existingViewer || existingImageIsAmbiguous) {
    return true;
  }

  const displayName = chooseProfileViewerDisplayName(
    viewer.displayName,
    existingViewer.displayName,
    viewer.linkedinUsername
  );
  const profileImageUrl = chooseProfileViewerImageUrl(viewer.profileImageUrl, existingViewer.profileImageUrl);

  return !hasCompleteProfileViewerIdentity({
    ...viewer,
    displayName,
    profileImageUrl,
  });
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(Math.floor(concurrency), items.length));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await worker(items[currentIndex], currentIndex);
      }
    })
  );

  return results;
}

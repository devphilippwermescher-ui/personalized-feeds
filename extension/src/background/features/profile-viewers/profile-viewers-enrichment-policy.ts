import type { ProfileViewer, ProfileViewerInput } from 'shared/types';
import {
  chooseProfileViewerDisplayName,
  chooseProfileViewerImageUrl,
  isUsableLinkedInProfileImageUrl,
  isWeakProfileViewerDisplayName,
} from 'shared/profile-viewer-quality';

export function hasCompleteProfileViewerIdentity(viewer: ProfileViewerInput): boolean {
  return (
    viewer.identityUncertain !== true &&
    !isWeakProfileViewerDisplayName(viewer.displayName, viewer.linkedinUsername) &&
    isUsableLinkedInProfileImageUrl(viewer.profileImageUrl)
  );
}

export function profileViewerNeedsEnrichment(
  viewer: ProfileViewerInput,
  existingViewer: ProfileViewer | undefined,
  existingImageIsAmbiguous: boolean
): boolean {
  if (viewer.identityUncertain === true) {
    return true;
  }

  // If the current LinkedIn response no longer confirms a stored avatar,
  // verify it by the exact username before preserving it. This repairs image
  // URLs that older RSC parsing attached to the wrong viewer.
  if (
    !isUsableLinkedInProfileImageUrl(viewer.profileImageUrl) &&
    isUsableLinkedInProfileImageUrl(existingViewer?.profileImageUrl)
  ) {
    return true;
  }

  if (hasCompleteProfileViewerIdentity(viewer)) {
    return false;
  }

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

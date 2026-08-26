import type { ProfileViewer, ProfileViewerInput } from 'shared/types';
import { findLinkedInPeopleSearchResultByUsername, type LinkedInPeopleSearchResult } from 'shared/linkedin-people-search';
import {
  getAmbiguousProfileViewerImageUrls,
  isUsableLinkedInProfileImageUrl,
  profileViewerDisplayNameConflictsWithUsername,
} from 'shared/profile-viewer-quality';
import { fetchWithTimeout } from './fetch-with-timeout';
import { mergeProfileViewerWithPageMetadata, parseProfileViewerPageMetadata } from './profile-viewers-enrichment';
import { hasCompleteProfileViewerIdentity, mapWithConcurrency, profileViewerNeedsEnrichment } from './profile-viewers-enrichment-policy';
import { getLinkedInCsrfToken } from './profile-viewers-api-client';

const PROFILE_VIEWERS_PEOPLE_SEARCH_TIMEOUT_MS = 10_000;
const PROFILE_VIEWERS_PROFILE_PAGE_TIMEOUT_MS = 15_000;
const PROFILE_VIEWERS_ENRICHMENT_CONCURRENCY = 2;

interface ProfileViewerEnrichmentDiagnostic {
  linkedinUsername: string;
  parsedDisplayName: string;
  finalDisplayName: string;
  hadRscImage: boolean;
  hadPeopleSearchImage: boolean;
  hadProfilePageImage: boolean;
  hadExistingImage: boolean;
  ignoredDuplicateExistingImage: boolean;
  removedAmbiguousFinalImage: boolean;
  hasFinalImage: boolean;
  skippedEnrichment: boolean;
  profilePageStatus?: number;
}

async function fetchProfileViewerPeopleSearchMatch(
  viewer: ProfileViewerInput,
  csrfToken: string
): Promise<LinkedInPeopleSearchResult | null> {
  const targetUsername = viewer.linkedinUsername.trim().toLowerCase();
  const queries = Array.from(new Set([viewer.displayName.trim(), viewer.linkedinUsername.trim()].filter(Boolean)));

  for (const query of queries) {
    const variables = `(keywords:${encodeURIComponent(query)})`;
    const url =
      `https://www.linkedin.com/voyager/api/graphql?variables=${variables}` +
      '&queryId=voyagerSearchDashSharing.4e26d0f2284baec4fa3fe92c090494cd';

    try {
      const response = await fetchWithTimeout(
        url,
        {
          method: 'GET',
          credentials: 'include',
          headers: {
            accept: 'application/vnd.linkedin.normalized+json+2.1',
            'csrf-token': csrfToken,
            'x-restli-protocol-version': '2.0.0',
          },
        },
        PROFILE_VIEWERS_PEOPLE_SEARCH_TIMEOUT_MS
      );
      if (!response.ok) {
        continue;
      }

      const exactMatch = findLinkedInPeopleSearchResultByUsername(await response.json(), targetUsername);
      if (exactMatch) {
        return exactMatch;
      }
    } catch (error) {
      console.warn(`[profile-viewers-sync] People search failed for ${viewer.linkedinUsername}:`, error);
    }
  }

  return null;
}

async function enrichProfileViewerFromProfilePage(
  viewer: ProfileViewerInput,
  existingViewer: Partial<ProfileViewer> | undefined,
  csrfToken: string,
  ignoredDuplicateExistingImage: boolean
): Promise<{
  viewer: ProfileViewerInput;
  diagnostic: ProfileViewerEnrichmentDiagnostic;
}> {
  const rawPeopleSearchMatch = await fetchProfileViewerPeopleSearchMatch(viewer, csrfToken);
  const peopleSearchMatch =
    rawPeopleSearchMatch &&
    !profileViewerDisplayNameConflictsWithUsername(
      rawPeopleSearchMatch.displayName,
      viewer.linkedinUsername
    )
      ? rawPeopleSearchMatch
      : null;
  const rejectedConflictingPeopleSearchIdentity = Boolean(rawPeopleSearchMatch && !peopleSearchMatch);
  const peopleSearchImageUrl = isUsableLinkedInProfileImageUrl(peopleSearchMatch?.profileImageUrl)
    ? peopleSearchMatch.profileImageUrl
    : '';
  const viewerWithTrustedData: ProfileViewerInput = {
    ...viewer,
    // People Search is matched by the exact public identifier, so its
    // identity fields are stronger than display-name associations in RSC.
    displayName: peopleSearchMatch?.displayName || viewer.displayName,
    headline: viewer.headline || peopleSearchMatch?.headline || '',
    connectionDegree: viewer.connectionDegree || peopleSearchMatch?.connectionDegree || '',
    profileImageUrl: peopleSearchImageUrl || viewer.profileImageUrl,
    identityUncertain: peopleSearchMatch ? false : viewer.identityUncertain,
    discardExistingProfileImage:
      viewer.discardExistingProfileImage === true ||
      rejectedConflictingPeopleSearchIdentity ||
      undefined,
  };
  const createResult = (
    enrichedViewer: ProfileViewerInput,
    profilePageStatus?: number,
    hadProfilePageImage = false
  ) => ({
    viewer: enrichedViewer,
    diagnostic: {
      linkedinUsername: viewer.linkedinUsername,
      parsedDisplayName: viewer.displayName,
      finalDisplayName: enrichedViewer.displayName,
      hadRscImage: Boolean(viewer.profileImageUrl),
      hadPeopleSearchImage: Boolean(peopleSearchImageUrl),
      hadProfilePageImage,
      hadExistingImage: Boolean(existingViewer?.profileImageUrl),
      ignoredDuplicateExistingImage,
      removedAmbiguousFinalImage: false,
      hasFinalImage: Boolean(enrichedViewer.profileImageUrl),
      skippedEnrichment: false,
      profilePageStatus,
    },
  });

  const viewerAfterPeopleSearch = mergeProfileViewerWithPageMetadata(
    viewerWithTrustedData,
    { displayName: '', profileImageUrl: '' },
    existingViewer
  );
  if (hasCompleteProfileViewerIdentity(viewerAfterPeopleSearch)) {
    return createResult(viewerAfterPeopleSearch);
  }

  try {
    const response = await fetchWithTimeout(
      viewer.linkedinUrl,
      {
        method: 'GET',
        credentials: 'include',
        headers: {
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      },
      PROFILE_VIEWERS_PROFILE_PAGE_TIMEOUT_MS
    );

    if (!response.ok) {
      return createResult(
        mergeProfileViewerWithPageMetadata(
          viewerWithTrustedData,
          { displayName: '', profileImageUrl: '' },
          existingViewer
        ),
        response.status
      );
    }

    const metadata = parseProfileViewerPageMetadata(await response.text());
    return createResult(
      mergeProfileViewerWithPageMetadata(viewerWithTrustedData, metadata, existingViewer),
      response.status,
      Boolean(metadata.profileImageUrl)
    );
  } catch (error) {
    console.warn(`[profile-viewers-sync] Profile enrichment failed for ${viewer.linkedinUsername}:`, error);
    return createResult(
      mergeProfileViewerWithPageMetadata(
        viewerWithTrustedData,
        { displayName: '', profileImageUrl: '' },
        existingViewer
      )
    );
  }
}

export async function enrichVisibleProfileViewers(
  viewers: ProfileViewerInput[],
  existingViewers: ProfileViewer[]
): Promise<{
  viewers: ProfileViewerInput[];
  diagnostics: ProfileViewerEnrichmentDiagnostic[];
}> {
  if (viewers.length === 0) {
    return { viewers: [], diagnostics: [] };
  }

  const existingByUsername = new Map(existingViewers.map((viewer) => [viewer.linkedinUsername.toLowerCase(), viewer]));
  const ambiguousExistingImages = getAmbiguousProfileViewerImageUrls(existingViewers);
  const csrfToken = await getLinkedInCsrfToken();
  const enrichments = await mapWithConcurrency(viewers, PROFILE_VIEWERS_ENRICHMENT_CONCURRENCY, async (viewer) => {
    const storedViewer = existingByUsername.get(viewer.linkedinUsername.toLowerCase());
    const existingImageUrl = storedViewer?.profileImageUrl?.trim() || '';
    const ignoredDuplicateExistingImage = ambiguousExistingImages.has(existingImageUrl);
    const storedIdentityConflicts = Boolean(
      storedViewer &&
        profileViewerDisplayNameConflictsWithUsername(
          storedViewer.displayName,
          viewer.linkedinUsername
        )
    );
    const viewerWithIdentitySafety =
      storedIdentityConflicts || ignoredDuplicateExistingImage
        ? { ...viewer, discardExistingProfileImage: true }
        : viewer;
    const existingViewer = storedViewer
      ? {
          ...storedViewer,
          profileImageUrl:
            ignoredDuplicateExistingImage || storedIdentityConflicts
              ? ''
              : storedViewer.profileImageUrl,
        }
      : undefined;

    if (!profileViewerNeedsEnrichment(viewerWithIdentitySafety, storedViewer, ignoredDuplicateExistingImage)) {
      const mergedViewer = mergeProfileViewerWithPageMetadata(
        viewerWithIdentitySafety,
        { displayName: '', profileImageUrl: '' },
        existingViewer
      );
      return {
        viewer: mergedViewer,
        diagnostic: {
          linkedinUsername: viewerWithIdentitySafety.linkedinUsername,
          parsedDisplayName: viewerWithIdentitySafety.displayName,
          finalDisplayName: mergedViewer.displayName,
          hadRscImage: Boolean(viewerWithIdentitySafety.profileImageUrl),
          hadPeopleSearchImage: false,
          hadProfilePageImage: false,
          hadExistingImage: Boolean(existingViewer?.profileImageUrl),
          ignoredDuplicateExistingImage,
          removedAmbiguousFinalImage: false,
          hasFinalImage: Boolean(mergedViewer.profileImageUrl),
          skippedEnrichment: true,
        },
      };
    }

    return enrichProfileViewerFromProfilePage(
      viewerWithIdentitySafety,
      existingViewer,
      csrfToken,
      ignoredDuplicateExistingImage
    );
  });
  const enrichedViewers = enrichments.map((enrichment) => enrichment.viewer);
  const diagnostics = enrichments.map((enrichment) => enrichment.diagnostic);

  const ambiguousFinalImages = getAmbiguousProfileViewerImageUrls(enrichedViewers);
  enrichedViewers.forEach((viewer, index) => {
    if (!ambiguousFinalImages.has(viewer.profileImageUrl?.trim() || '')) {
      return;
    }

    enrichedViewers[index] = {
      ...viewer,
      profileImageUrl: '',
    };
    diagnostics[index] = {
      ...diagnostics[index],
      removedAmbiguousFinalImage: true,
      hasFinalImage: false,
    };
  });

  return {
    viewers: enrichedViewers,
    diagnostics,
  };
}

export function updateExistingProfileViewerSnapshot(
  existingByUsername: Map<string, ProfileViewer>,
  viewers: ProfileViewerInput[],
  seenAt: number,
  positionOffset: number
): void {
  viewers.forEach((viewer, index) => {
    const username = viewer.linkedinUsername.toLowerCase();
    const existing = existingByUsername.get(username);
    const mergedViewer = mergeProfileViewerWithPageMetadata(
      viewer,
      { displayName: '', profileImageUrl: '' },
      existing
    );

    existingByUsername.set(username, {
      ...existing,
      ...mergedViewer,
      id: username,
      linkedinUsername: username,
      firstSeenAt: existing?.firstSeenAt || seenAt,
      lastSeenAt: seenAt,
      lastSeenPosition: positionOffset + index,
      source: 'linkedin_profile_views',
    });
  });
}

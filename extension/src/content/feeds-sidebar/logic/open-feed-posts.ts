import type { FeedInfo, FeedMemberInfo } from '../types';
import {
  buildLinkedInContentSearchUrl,
  extractLinkedInMemberToken,
} from './feed-posts';

const openInFlight = new Set<string>();

interface OpenFeedPostsDeps {
  getFeeds: () => FeedInfo[];
  getFeedMembersById: () => Record<string, FeedMemberInfo[]>;
  loadFeedMembers: (feedId: string) => Promise<void>;
  resolveProfileUrn: (linkedinUsername: string) => Promise<string | null>;
  renderSidebarContent: () => void;
  showToast: (message: string, type?: 'success' | 'error') => void;
}

export async function openFeedPosts(
  feedId: string,
  deps: OpenFeedPostsDeps
): Promise<void> {
  if (openInFlight.has(feedId)) {
    return;
  }

  openInFlight.add(feedId);

  try {
    const feed = deps.getFeeds().find((item) => item.id === feedId);
    if (!feed) {
      deps.showToast('Feed not found', 'error');
      return;
    }

    let members = deps.getFeedMembersById()[feedId];
    if (!members && (feed.memberCount || 0) > 0) {
      await deps.loadFeedMembers(feedId);
      members = deps.getFeedMembersById()[feedId];
    }

    const loadedMembers = members || [];
    if (loadedMembers.length === 0) {
      deps.showToast('This feed has no profiles yet', 'error');
      return;
    }

    let resolvedAnyProfileUrn = false;
    for (const member of loadedMembers) {
      if (extractLinkedInMemberToken(member.profileUrn) || !member.linkedinUsername) {
        continue;
      }

      try {
        const resolvedProfileUrn = await deps.resolveProfileUrn(member.linkedinUsername);
        if (resolvedProfileUrn) {
          member.profileUrn = resolvedProfileUrn;
          resolvedAnyProfileUrn = true;
        }
      } catch {
        // Ignore unresolved members and continue with the rest.
      }
    }

    if (resolvedAnyProfileUrn) {
      deps.renderSidebarContent();
    }

    const searchUrl = buildLinkedInContentSearchUrl(loadedMembers);
    if (!searchUrl) {
      deps.showToast('Could not resolve LinkedIn member IDs for this feed yet', 'error');
      return;
    }

    window.open(searchUrl, '_blank');
  } finally {
    window.setTimeout(() => {
      openInFlight.delete(feedId);
    }, 1200);
  }
}

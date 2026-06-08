import type { FeedMemberInfo } from './types';

export const FEED_MEMBER_ADDED_EVENT = 'myfeedpilot:feed-member-added';

export interface FeedMemberAddedDetail {
  feedId: string;
  feedName: string;
  member: FeedMemberInfo;
}

export function dispatchFeedMemberAdded(detail: FeedMemberAddedDetail): void {
  window.dispatchEvent(new CustomEvent<FeedMemberAddedDetail>(FEED_MEMBER_ADDED_EVENT, { detail }));
}

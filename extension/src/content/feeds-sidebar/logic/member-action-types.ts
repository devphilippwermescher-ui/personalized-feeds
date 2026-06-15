import type { FeedInfo, FeedMemberInfo, MemberEditorState } from '../types';
import type {
  fetchLinkedInRelationshipStatus,
  invalidateCacheForUser,
  resolveProfileUrn,
  sendLinkedInConnectRequest,
  sendLinkedInFollowState,
} from '../../linkedin-relationship-status';

export interface MemberActionDeps {
  sendMsg: (message: Record<string, unknown>) => Promise<Record<string, unknown>>;
  showToast: (message: string, type?: 'success' | 'error') => void;
  renderSidebarContent: () => void;
  openLinkedInMessage: (linkedinUrl: string, profileUrn?: string) => void;
  openLinkedInProfile: (linkedinUrl: string) => void;
  fetchLinkedInRelationshipStatus: typeof fetchLinkedInRelationshipStatus;
  resolveProfileUrn: typeof resolveProfileUrn;
  sendLinkedInConnectRequest: typeof sendLinkedInConnectRequest;
  sendLinkedInFollowState: typeof sendLinkedInFollowState;
  invalidateCacheForUser: typeof invalidateCacheForUser;
  getFeedMembersById: () => Record<string, FeedMemberInfo[]>;
  getMessagingButtonsEnabled?: () => boolean;
  setFeedMembersById: (value: Record<string, FeedMemberInfo[]>) => void;
  getFeeds: () => FeedInfo[];
  loadFeeds: () => Promise<void>;
  getActiveMemberEditor: () => MemberEditorState | null;
  setActiveMemberEditor: (value: MemberEditorState | null) => void;
  setExpandedFeedId?: (feedId: string | null) => void;
  loadFeedMembers?: (feedId: string) => Promise<void>;
}

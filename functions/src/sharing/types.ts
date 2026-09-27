export type ShareRole = 'reader' | 'editor';
export type ShareSource = 'email' | 'link' | 'notification';
export type LimitDirection = 'outgoing' | 'incoming';
export type LimitDimension = 'people' | 'feeds';

export interface SharingUsage {
  outgoingRecipientCount: number;
  outgoingFeedCount: number;
  incomingOwnerCount: number;
  incomingFeedCount: number;
  initializedAt: number;
  updatedAt: number;
}

export interface SharingLimitResult {
  code: 'SHARING_LIMIT_REACHED';
  direction: LimitDirection;
  dimension: LimitDimension;
  blockedParty: 'current_user' | 'counterparty';
  limit: 1 | 3;
  counterpartDisplayName?: string;
  notificationCreated: boolean;
}

export interface ShareSuccess {
  success: true;
  share: {
    targetUid: string;
    targetEmail: string;
    role: ShareRole;
    createdAt: number;
    updatedAt: number;
  };
  sharedFeed?: Record<string, unknown>;
}

export interface ShareBlocked {
  success: false;
  error: string;
  sharingLimit: SharingLimitResult;
}

export type ShareMutationResult = ShareSuccess | ShareBlocked;

export interface ShareNotificationData {
  kind:
    | 'incoming_share_added'
    | 'incoming_share_blocked'
    | 'link_follow_blocked_owner'
    | 'link_follow_blocked_recipient';
  status: 'pending' | 'unread';
  ownerId: string;
  recipientId: string;
  feedId: string;
  feedName: string;
  ownerDisplayName: string;
  recipientDisplayName: string;
  role: ShareRole;
  limitDirection?: LimitDirection;
  limitDimension?: LimitDimension;
  createdAt: number;
  updatedAt: number;
}

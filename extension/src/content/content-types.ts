export type CollectionMode = 'lite' | 'synced' | 'precision';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LinkedInEntity = Record<string, any>;

export type PostContentType = 'VIDEO' | 'IMAGE' | 'TEXT' | 'DOCUMENT' | 'CAROUSEL' | 'REPOST' | 'UNKNOWN';

export interface PostData {
  activityUrn: string;
  authorName: string;
  authorUrn?: string;
  text?: string;
  timestamp?: number;
  numLikes: number;
  numComments: number;
  numShares: number;
  isSponsored?: boolean;
  hashtags?: string[];
  contentType?: PostContentType;
  postDateText?: string;
}

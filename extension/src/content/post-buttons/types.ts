import type { LinkedInProfileData } from '../../../../shared/types';

export interface PostAuthorProfile extends LinkedInProfileData {
  postUrn?: string;
}

export interface FeedSummary {
  id: string;
  name: string;
  color?: string;
  memberCount: number;
}

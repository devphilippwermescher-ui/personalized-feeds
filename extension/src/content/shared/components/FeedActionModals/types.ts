export interface LinkedInTypeaheadPerson {
  id: string;
  displayName: string;
  headline: string;
  connectionDegree: string;
  linkedinUrl: string;
  linkedinUsername: string;
  profileUrn?: string;
  memberNumericId?: string;
  profileImageUrl?: string;
}

export interface FeedShareRecipient {
  targetUid: string;
  targetEmail: string;
  displayName: string;
  photoURL?: string;
  role: 'reader' | 'editor';
}

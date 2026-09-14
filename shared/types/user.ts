export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  createdAt: number;
}

export interface UserFeatureSettings {
  messagingButtons: boolean;
  postButtons: boolean;
  speechToComment: boolean;
  hideProfileViewers: boolean;
}

export type BillingCurrency = 'EUR' | 'USD';

export interface UserProfilePreferences {
  /** Empty means the Google account display name is used. */
  displayName: string;
  /** Compressed extension-owned avatar. Empty means the Google account photo is used. */
  avatarDataUrl: string;
  billingCurrency: BillingCurrency;
}

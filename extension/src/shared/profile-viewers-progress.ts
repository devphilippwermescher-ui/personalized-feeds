export type ProfileViewersCollectionPhase = 'visible' | 'private_summary';

export const PROFILE_VIEWERS_COLLECTION_PROGRESS_LEASE_MS = 5 * 60 * 1000;

export interface ProfileViewersCollectionProgress {
  phase: ProfileViewersCollectionPhase;
  startedAt: number;
  expiresAt?: number;
}

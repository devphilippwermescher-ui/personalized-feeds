export type ProfileViewersCollectionPhase = 'visible' | 'private_summary';

export interface ProfileViewersCollectionProgress {
  phase: ProfileViewersCollectionPhase;
  startedAt: number;
}

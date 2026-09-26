import type { ProfileViewersSyncErrorCode } from './profile-viewers-sync-state';

export class ProfileViewersSyncError extends Error {
  constructor(
    message: string,
    readonly code: ProfileViewersSyncErrorCode,
    readonly httpStatus?: number
  ) {
    super(message);
    this.name = 'ProfileViewersSyncError';
  }
}

export type LinkedInStatusFetchErrorCode =
  | 'auth_blocked'
  | 'rate_limited'
  | 'blocked'
  | 'api_error'
  | 'network_error';

export class LinkedInStatusFetchError extends Error {
  constructor(
    message: string,
    readonly code: LinkedInStatusFetchErrorCode,
    readonly httpStatus?: number
  ) {
    super(message);
    this.name = 'LinkedInStatusFetchError';
  }
}

export function isLinkedInStatusFetchError(
  error: unknown
): error is LinkedInStatusFetchError {
  return (
    error instanceof LinkedInStatusFetchError ||
    Boolean(
      error &&
        typeof error === 'object' &&
        (error as { name?: unknown }).name === 'LinkedInStatusFetchError' &&
        typeof (error as { code?: unknown }).code === 'string'
    )
  );
}

export function isLinkedInStatusFetchBlockLikeError(error: unknown): boolean {
  if (!isLinkedInStatusFetchError(error)) {
    return false;
  }

  return (
    error.code === 'auth_blocked' ||
    error.code === 'rate_limited' ||
    error.code === 'blocked' ||
    error.httpStatus === 401 ||
    error.httpStatus === 403 ||
    error.httpStatus === 429 ||
    error.httpStatus === 999
  );
}

export function getLinkedInStatusFetchErrorCode(
  status: number
): LinkedInStatusFetchErrorCode {
  if (status === 401 || status === 403) {
    return 'auth_blocked';
  }

  if (status === 429) {
    return 'rate_limited';
  }

  if (status === 999) {
    return 'blocked';
  }

  return 'api_error';
}

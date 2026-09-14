/**
 * Typed failures for every Dashboard Analytics source.
 *
 * A parser or transport failure must never be published as a zero. Callers
 * distinguish "valid zero", "no data", "source unavailable", "parser
 * unsupported" and "request failed" through these codes.
 */
export type DashboardAnalyticsErrorCode =
  | 'no_auth'
  | 'no_linkedin_tab'
  | 'linkedin_signed_out'
  | 'linkedin_auth_required'
  | 'linkedin_restricted'
  | 'query_id_expired'
  | 'unsupported_rsc_shape'
  | 'unsupported_graphql_shape'
  | 'empty_but_valid'
  | 'timeout'
  | 'network_error'
  | 'firestore_write_failed'
  | 'partial_post_enrichment'
  | 'source_unavailable'
  | 'sync_failed';

export type DashboardAnalyticsRetryKind = 'standard' | 'restriction';

export class DashboardAnalyticsError extends Error {
  readonly code: DashboardAnalyticsErrorCode;
  readonly httpStatus?: number;
  readonly retryKind: DashboardAnalyticsRetryKind;

  constructor(
    code: DashboardAnalyticsErrorCode,
    message: string,
    options: { httpStatus?: number; retryKind?: DashboardAnalyticsRetryKind } = {}
  ) {
    super(message);
    this.name = 'DashboardAnalyticsError';
    this.code = code;
    this.httpStatus = options.httpStatus;
    this.retryKind = options.retryKind || (code === 'linkedin_restricted' ? 'restriction' : 'standard');
  }
}

export function isDashboardAnalyticsError(error: unknown): error is DashboardAnalyticsError {
  return error instanceof DashboardAnalyticsError;
}

const USER_MESSAGES: Record<DashboardAnalyticsErrorCode, string> = {
  no_auth: 'Sign in to myFeedPilot to collect analytics.',
  no_linkedin_tab: 'Open LinkedIn in another tab to refresh analytics.',
  linkedin_signed_out: 'Open LinkedIn and sign in to refresh analytics.',
  linkedin_auth_required: 'The LinkedIn session could not be verified. Open LinkedIn and sign in.',
  linkedin_restricted: 'LinkedIn temporarily limited analytics requests. Showing the last saved data.',
  query_id_expired: 'LinkedIn changed its analytics query. Showing the last saved data until myFeedPilot updates.',
  unsupported_rsc_shape: 'LinkedIn returned an analytics page myFeedPilot could not read. Showing the last saved data.',
  unsupported_graphql_shape: 'LinkedIn returned an unexpected posts response. Showing the last saved data.',
  empty_but_valid: 'LinkedIn reported no content activity for this period.',
  timeout: 'LinkedIn did not respond in time. Showing the last saved data while we retry.',
  network_error: 'LinkedIn could not be reached. Showing the last saved data while we retry.',
  firestore_write_failed: 'Collected analytics could not be saved. Showing the last saved data while we retry.',
  partial_post_enrichment: 'Some post details are still being collected.',
  source_unavailable: 'This LinkedIn source is not available yet.',
  sync_failed: 'Analytics could not be refreshed. Showing the last saved data while we retry.',
};

export interface DashboardAnalyticsFailure {
  errorCode: DashboardAnalyticsErrorCode;
  /** Safe for storage and UI: never contains cookies, tokens or response bodies. */
  message: string;
  retryKind: DashboardAnalyticsRetryKind;
}

const SECRET_PATTERNS = [/li_at/i, /jsessionid/i, /csrf[-_ ]?token/i, /cookie/i, /authorization/i, /bearer\s+\S+/i];

/** Drops anything that looks like a credential before a message is persisted. */
export function redactDiagnosticText(value: string): string {
  return SECRET_PATTERNS.some((pattern) => pattern.test(value)) ? '[redacted]' : value.slice(0, 300);
}

export function classifyDashboardAnalyticsFailure(error: unknown): DashboardAnalyticsFailure {
  if (isDashboardAnalyticsError(error)) {
    return { errorCode: error.code, message: USER_MESSAGES[error.code], retryKind: error.retryKind };
  }

  const rawMessage = error instanceof Error ? error.message : String(error);
  const normalized = rawMessage.toLowerCase();
  const status = (error as { httpStatus?: unknown })?.httpStatus;

  if (normalized.includes('no linkedin tab')) {
    return { errorCode: 'no_linkedin_tab', message: USER_MESSAGES.no_linkedin_tab, retryKind: 'standard' };
  }
  if (status === 429 || status === 999 || normalized.includes(' 429') || normalized.includes(' 999')) {
    return { errorCode: 'linkedin_restricted', message: USER_MESSAGES.linkedin_restricted, retryKind: 'restriction' };
  }
  if (status === 401 || status === 403 || normalized.includes(' 401') || normalized.includes(' 403')) {
    return {
      errorCode: 'linkedin_auth_required',
      message: USER_MESSAGES.linkedin_auth_required,
      retryKind: 'standard',
    };
  }
  if (normalized.includes('timed out') || normalized.includes('timeout')) {
    return { errorCode: 'timeout', message: USER_MESSAGES.timeout, retryKind: 'standard' };
  }
  if (normalized.includes('failed to fetch') || normalized.includes('network')) {
    return { errorCode: 'network_error', message: USER_MESSAGES.network_error, retryKind: 'standard' };
  }
  return { errorCode: 'sync_failed', message: USER_MESSAGES.sync_failed, retryKind: 'standard' };
}

export function getDashboardAnalyticsErrorMessage(code: DashboardAnalyticsErrorCode): string {
  return USER_MESSAGES[code];
}

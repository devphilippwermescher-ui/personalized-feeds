import { describe, expect, it } from 'vitest';
import {
  DashboardAnalyticsError,
  classifyDashboardAnalyticsFailure,
  redactDiagnosticText,
} from '../dashboard-analytics-errors';

describe('classifyDashboardAnalyticsFailure', () => {
  it('keeps a typed error code as-is', () => {
    const failure = classifyDashboardAnalyticsFailure(
      new DashboardAnalyticsError('query_id_expired', 'LinkedIn rejected the query.')
    );

    expect(failure.errorCode).toBe('query_id_expired');
    expect(failure.retryKind).toBe('standard');
  });

  it('treats 429 and 999 as a LinkedIn restriction with a long cooldown', () => {
    const error = Object.assign(new Error('LinkedIn request was blocked with 999'), { httpStatus: 999 });

    expect(classifyDashboardAnalyticsFailure(error)).toMatchObject({
      errorCode: 'linkedin_restricted',
      retryKind: 'restriction',
    });
  });

  it('distinguishes auth, timeout and network failures', () => {
    expect(
      classifyDashboardAnalyticsFailure(Object.assign(new Error('blocked with 403'), { httpStatus: 403 })).errorCode
    ).toBe('linkedin_auth_required');
    expect(classifyDashboardAnalyticsFailure(new Error('request timed out after 15000ms')).errorCode).toBe('timeout');
    expect(classifyDashboardAnalyticsFailure(new Error('Failed to fetch')).errorCode).toBe('network_error');
  });

  it('never reports an unknown failure as valid empty data', () => {
    expect(classifyDashboardAnalyticsFailure(new Error('something odd')).errorCode).toBe('sync_failed');
  });
});

describe('redactDiagnosticText', () => {
  it.each([
    'li_at=AQEDAT...; JSESSIONID="ajax:123"',
    'Cookie: li_at=abc',
    'csrf-token: ajax:9999',
    'authorization: Bearer secret-token',
  ])('redacts credential-shaped diagnostics (%s)', (value) => {
    expect(redactDiagnosticText(value)).toBe('[redacted]');
  });

  it('keeps a safe message and bounds its length', () => {
    expect(redactDiagnosticText('LinkedIn returned an incomplete analytics response.')).toBe(
      'LinkedIn returned an incomplete analytics response.'
    );
    expect(redactDiagnosticText('x'.repeat(1000))).toHaveLength(300);
  });

  it('produces no secrets for any built-in failure message', () => {
    const messages = [
      new DashboardAnalyticsError('linkedin_restricted', 'x'),
      new DashboardAnalyticsError('unsupported_rsc_shape', 'x'),
      new DashboardAnalyticsError('source_unavailable', 'x'),
    ].map((error) => classifyDashboardAnalyticsFailure(error).message);

    messages.forEach((message) => {
      expect(message).not.toMatch(/li_at|JSESSIONID|csrf|cookie|bearer/i);
    });
  });
});

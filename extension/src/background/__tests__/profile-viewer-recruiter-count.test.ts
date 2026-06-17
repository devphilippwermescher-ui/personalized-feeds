import { describe, expect, it } from 'vitest';
import {
  extractRecruiterProfileViewerCount,
  extractRecruiterProfileViewerUrl,
} from '../profile-viewer-recruiter-count';

describe('extractRecruiterProfileViewerCount', () => {
  it('extracts the recruiter viewer aggregate count from an RSC payload', () => {
    expect(
      extractRecruiterProfileViewerCount(
        '"children":["32 recruiters viewed your profile"],"children":["From OnHires and other companies"]'
      )
    ).toBe(32);
  });

  it('supports singular recruiter text', () => {
    expect(extractRecruiterProfileViewerCount('"1 recruiter viewed your profile"')).toBe(1);
  });

  it('returns null when the recruiter aggregate is absent', () => {
    expect(extractRecruiterProfileViewerCount('"32 people viewed your profile"')).toBeNull();
  });

  it('extracts the recruiter views URL from an RSC payload', () => {
    expect(
      extractRecruiterProfileViewerUrl(
        '"url":"/analytics/recruiter-views/?timeRange=WvmpSearchFilterTimeRange_LAST_90_DAYS"'
      )
    ).toBe(
      'https://www.linkedin.com/analytics/recruiter-views/?timeRange=WvmpSearchFilterTimeRange_LAST_90_DAYS'
    );
  });
});

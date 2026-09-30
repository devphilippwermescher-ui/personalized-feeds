import { describe, expect, it } from 'vitest';
import { CONTENT_ANALYTICS_ENABLED, DASHBOARD_ANALYTICS_SYNC_ENABLED, DASHBOARD_ENABLED } from 'shared/feature-flags';

describe('dashboard release gate', () => {
  it('keeps the dashboard UI and every analytics collector disabled', () => {
    expect(DASHBOARD_ENABLED).toBe(false);
    expect(DASHBOARD_ANALYTICS_SYNC_ENABLED).toBe(false);
    expect(CONTENT_ANALYTICS_ENABLED).toBe(false);
  });
});

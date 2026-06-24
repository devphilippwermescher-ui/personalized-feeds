import { describe, expect, it } from 'vitest';
import type { FeedMemberInfo } from '../types';
import { canMemberReceiveMessage } from '../utils';

function makeMember(overrides: Partial<FeedMemberInfo> = {}): FeedMemberInfo {
  return {
    id: 'member-1',
    linkedinUrl: 'https://www.linkedin.com/in/member-1/',
    linkedinUsername: 'member-1',
    displayName: 'Member One',
    addedAt: Date.now(),
    ...overrides,
  };
}

describe('canMemberReceiveMessage', () => {
  it('allows messaging for connected members even when stale data says false', () => {
    expect(canMemberReceiveMessage(makeMember({
      status: 'connected',
      canMessage: false,
    }))).toBe(true);
  });

  it('allows messaging for first-degree connections without a resolved status', () => {
    expect(canMemberReceiveMessage(makeMember({
      connectionDegree: '1st',
      canMessage: false,
    }))).toBe(true);
  });

  it('keeps explicit InMail availability for non-connections', () => {
    expect(canMemberReceiveMessage(makeMember({
      status: 'connect',
      canMessage: true,
    }))).toBe(true);
  });

  it('does not allow ordinary non-connections when messaging is unresolved', () => {
    expect(canMemberReceiveMessage(makeMember({
      status: 'connect',
      canMessage: false,
    }))).toBe(false);
  });

  it('allows Profile Visitors message fallback for unresolved connect profiles', () => {
    expect(canMemberReceiveMessage(
      makeMember({
        status: 'connect',
        canMessage: false,
      }),
      'connect',
      { allowUnverifiedProfileMessage: true }
    )).toBe(true);
  });

  it.each(['loading', 'pending', 'withdrawn', 'unavailable'] as const)(
    'disables messaging for %s members',
    (status) => {
      expect(canMemberReceiveMessage(makeMember({
        status,
        connectionDegree: '1st',
        canMessage: true,
      }))).toBe(false);
    }
  );
});

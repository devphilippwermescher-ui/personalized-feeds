import { describe, expect, it } from 'vitest';
import { insertAddedMemberIntoCache } from '../logic/external-member-sync';
import type { FeedMemberInfo } from '../types';

function member(overrides: Partial<FeedMemberInfo>): FeedMemberInfo {
  const linkedinUsername = overrides.linkedinUsername || overrides.id || 'member-id';
  return {
    id: 'member-id',
    linkedinUrl: `https://www.linkedin.com/in/${linkedinUsername}/`,
    linkedinUsername,
    displayName: 'Member',
    addedAt: 100,
    ...overrides,
  };
}

describe('insertAddedMemberIntoCache', () => {
  it('places a newly added member by newest addedAt first', () => {
    const first = member({
      id: 'old-1',
      linkedinUsername: 'old-1',
      addedAt: 200,
      status: 'connected',
    });
    const second = member({
      id: 'old-2',
      linkedinUsername: 'old-2',
      addedAt: 100,
      status: 'following',
    });
    const incoming = member({
      id: 'new-1',
      linkedinUsername: 'new-1',
      addedAt: 300,
      status: 'loading',
    });

    const result = insertAddedMemberIntoCache([first, second], incoming);

    expect(result.map((item) => item.id)).toEqual(['new-1', 'old-1', 'old-2']);
    expect(result[1].status).toBe('connected');
    expect(result[2].status).toBe('following');
  });

  it('does not duplicate an existing member matched by username', () => {
    const existing = member({
      id: 'existing-id',
      linkedinUsername: 'same-user',
      addedAt: 100,
    });
    const incoming = member({
      id: 'new-doc-id',
      linkedinUsername: 'same-user',
      addedAt: 200,
    });

    const result = insertAddedMemberIntoCache([existing], incoming);

    expect(result).toEqual([existing]);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { getMemberStatus } from '../utils';
import type { FeedMemberInfo } from '../types';

function member(overrides: Partial<FeedMemberInfo> = {}): FeedMemberInfo {
  return {
    id: 'yuliia-biliavtseva',
    linkedinUrl: 'https://www.linkedin.com/in/yuliia-biliavtseva/',
    linkedinUsername: 'yuliia-biliavtseva',
    displayName: 'Yuliia Biliavtseva',
    status: 'pending',
    addedAt: Date.now(),
    ...overrides,
  };
}

describe('getMemberStatus', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/in/yuliia-biliavtseva/');
    document.body.innerHTML = '';
  });

  it('prefers the current LinkedIn profile DOM status over a stale stored status', () => {
    document.body.innerHTML = `
      <section class="pv-top-card">
        <button aria-label="Invite Yuliia to connect">Connect</button>
      </section>
    `;

    expect(getMemberStatus(member({ status: 'pending' }))).toBe('connect');
  });

  it('uses the current profile name as a fallback when the stored username differs', () => {
    window.history.pushState({}, '', '/in/yuliia-biliavtseva-canonical/');
    document.body.innerHTML = `
      <main>
        <section componentkey="Topcard">
          <h1>Yuliia Biliavtseva</h1>
          <button aria-label="Invite Yuliia to connect">Connect</button>
        </section>
      </main>
    `;

    expect(
      getMemberStatus(
        member({
          linkedinUsername: 'old-yuliia-slug',
          linkedinUrl: 'https://www.linkedin.com/in/old-yuliia-slug/',
          status: 'pending',
        })
      )
    ).toBe('connect');
  });
});

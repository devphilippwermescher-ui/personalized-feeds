import { beforeEach, describe, expect, it } from 'vitest';
import { getMemberStatus } from '../utils';
import type { FeedMemberInfo } from '../types';
import { renderMemberStatusAction } from '../logic/member-action-render';

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

describe('renderMemberStatusAction', () => {
  function renderStatus(memberOverrides: Partial<FeedMemberInfo> = {}): HTMLElement {
    const testMember = member({
      status: 'connect',
      ...memberOverrides,
    });
    const wrapper = document.createElement('div');
    wrapper.innerHTML = renderMemberStatusAction('feed-1', testMember, testMember.status || 'connect').trim();
    const element = wrapper.firstElementChild;
    if (!(element instanceof HTMLElement)) {
      throw new Error('Expected member status action markup');
    }
    return element;
  }

  it('shows Follow and Connect actions by default', () => {
    const element = renderStatus({ status: 'connect' });

    expect(element.textContent).toContain('Follow');
    expect(element.textContent).toContain('Connect');
    expect(element.querySelector('[data-member-action="follow-toggle"]')).toBeTruthy();
    expect(element.querySelector('[data-member-action="connect"]')).toBeTruthy();
  });

  it('keeps Follow visible when the connection state is already connected', () => {
    const element = renderStatus({ status: 'connected', canConnect: false });

    expect(element.textContent).toContain('Follow');
    expect(element.textContent).toContain('Connected');
    expect(element.querySelector('[data-member-action="follow-toggle"]')).toBeTruthy();
    expect(element.querySelector('[data-member-action="connect"]')).toBeFalsy();
  });

  it('keeps Follow visible next to pending and resend-later states', () => {
    const pending = renderStatus({ status: 'pending', canConnect: false });
    const withdrawn = renderStatus({ status: 'withdrawn', canConnect: false });

    expect(pending.textContent).toContain('Follow');
    expect(pending.textContent).toContain('Pending');
    expect(withdrawn.textContent).toContain('Follow');
    expect(withdrawn.textContent).toContain('Resend later');
  });

  it('does not show profile actions for unavailable profiles', () => {
    const element = renderStatus({ status: 'unavailable' });

    expect(element.textContent).not.toContain('Follow');
    expect(element.textContent).not.toContain('Connect');
    expect(element.textContent).toContain('Deleted');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMemberStatus } from '../utils';
import type { FeedInfo, FeedMemberInfo } from '../types';
import { bindMemberActionButtons, renderMemberStatusAction } from '../logic/member-action-render';
import type { MemberActionDeps } from '../logic/member-action-types';

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

  it('does not let a profile DOM Connect button override a stored resend-later cooldown', () => {
    document.body.innerHTML = `
      <section class="pv-top-card">
        <h1>Yuliia Biliavtseva</h1>
        <button aria-label="Invite Yuliia to connect">Connect</button>
      </section>
    `;

    expect(getMemberStatus(member({ status: 'withdrawn', canConnect: false }))).toBe('withdrawn');
  });

  it('keeps resend-later cooldown while taking Following from the profile DOM', () => {
    document.body.innerHTML = `
      <section class="pv-top-card">
        <h1>Yuliia Biliavtseva</h1>
        <button aria-label="Following Yuliia">Following</button>
      </section>
    `;
    const testMember = member({ status: 'withdrawn', canConnect: false, isFollowing: false });

    expect(getMemberStatus(testMember)).toBe('withdrawn');
    expect(testMember.isFollowing).toBe(true);
  });

  it('prefers an open profile menu Following signal over the top-card Connect button without dropping resend-later', () => {
    document.body.innerHTML = `
      <section class="pv-top-card">
        <h1>Yuliia Biliavtseva</h1>
        <button aria-label="Invite Yuliia to connect">Connect</button>
      </section>
      <div role="menu">
        <button aria-label="Following Yuliia">Following</button>
      </div>
    `;
    const testMember = member({ status: 'withdrawn', canConnect: false, isFollowing: false });

    expect(getMemberStatus(testMember)).toBe('withdrawn');
    expect(testMember.isFollowing).toBe(true);
  });

  it('clears stale following state when an open profile menu shows Follow', () => {
    document.body.innerHTML = `
      <section class="pv-top-card">
        <h1>Yuliia Biliavtseva</h1>
        <button aria-label="Invite Yuliia to connect">Connect</button>
      </section>
      <div role="menu">
        <button aria-label="Follow Yuliia">Follow</button>
      </div>
    `;
    const testMember = member({ status: 'withdrawn', canConnect: false, isFollowing: true });

    expect(getMemberStatus(testMember)).toBe('withdrawn');
    expect(testMember.isFollowing).toBe(false);
  });

  it('uses first-degree connection as Connected when stored status is stale connect', () => {
    document.body.innerHTML = '';

    expect(
      getMemberStatus(
        member({
          status: 'connect',
          connectionDegree: '1st',
        })
      )
    ).toBe('connected');
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

  it('shows only Connected when the profile is already connected', () => {
    const element = renderStatus({ status: 'connected', canConnect: false });

    expect(element.textContent).toContain('Connected');
    expect(element.textContent).not.toContain('Follow');
    expect(element.textContent).not.toContain('Unfollow');
    expect(element.querySelector('[data-member-action="follow-toggle"]')).toBeFalsy();
    expect(element.querySelector('[data-member-action="connect"]')).toBeFalsy();
  });

  it('shows Unfollow and Connect when the profile is followed but not connected', () => {
    const element = renderStatus({
      status: 'following',
      canFollow: true,
      canConnect: true,
      isFollowing: true,
    });

    expect(element.textContent).toContain('Unfollow');
    expect(element.textContent).toContain('Connect');
    expect(element.querySelector('[data-member-action="follow-toggle"]')).toBeTruthy();
    expect(element.querySelector('[data-member-action="connect"]')).toBeTruthy();
  });

  it('keeps Follow visible next to pending and resend-later states', () => {
    const pending = renderStatus({ status: 'pending', canConnect: false });
    const withdrawn = renderStatus({ status: 'withdrawn', canConnect: false });

    expect(pending.textContent).toContain('Follow');
    expect(pending.textContent).toContain('Pending');
    expect(withdrawn.textContent).toContain('Follow');
    expect(withdrawn.textContent).toContain('Resend');
    expect(withdrawn.textContent).not.toContain('Resend later');
  });

  it('shows Unfollow next to compact Resend when a withdrawn profile is already followed', () => {
    const element = renderStatus({
      status: 'withdrawn',
      canFollow: true,
      canConnect: false,
      isFollowing: true,
    });

    expect(element.textContent).toContain('Unfollow');
    expect(element.textContent).toContain('Resend');
    expect(element.textContent).not.toContain('Resend later');
    expect(element.querySelector('[data-member-action="follow-toggle"]')).toBeTruthy();
    expect(element.querySelector('[data-member-action="connect"]')).toBeFalsy();
  });

  it('puts the resend tooltip only on the compact resend segment', () => {
    const element = renderStatus({
      status: 'withdrawn',
      canFollow: true,
      canConnect: false,
    });

    const followButton = element.querySelector<HTMLElement>('[data-member-action="follow-toggle"]');
    const resendSegment = element.querySelector<HTMLElement>('.lfa-member-status-split-btn--withdrawn');
    const customTooltip = element.querySelector<HTMLElement>('.lfa-member-status-tooltip');

    expect(followButton?.getAttribute('title')).toBeNull();
    expect(resendSegment?.getAttribute('title')).toBeNull();
    expect(customTooltip?.getAttribute('role')).toBe('tooltip');
    expect(customTooltip?.textContent).toContain('Invitation was withdrawn earlier');
  });

  it('does not show profile actions for unavailable profiles', () => {
    const element = renderStatus({ status: 'unavailable' });

    expect(element.textContent).not.toContain('Follow');
    expect(element.textContent).not.toContain('Connect');
    expect(element.textContent).toContain('Deleted');
  });
});

describe('bindMemberActionButtons connect action', () => {
  it('attempts the connect request when the latest status only proves the profile is followed', async () => {
    const testMember = member({
      status: 'following',
      canConnect: true,
      canFollow: true,
      isFollowing: true,
    });
    const feed: FeedInfo = {
      id: 'feed-1',
      name: 'Feed',
      color: '#2563eb',
      memberCount: 1,
    };
    const wrapper = document.createElement('div');
    wrapper.innerHTML = renderMemberStatusAction(feed.id, testMember, 'following').trim();
    document.body.appendChild(wrapper);

    const sendLinkedInConnectRequest = vi.fn().mockRejectedValue(new Error('network failed'));
    const fetchLinkedInRelationshipStatus = vi.fn().mockResolvedValue({
      status: 'following',
      profileUrn: 'urn:li:fsd_profile:ACoAAConnectTest',
      canMessage: false,
      canFollow: true,
      canConnect: false,
      isFollowing: true,
    });

    const deps: MemberActionDeps = {
      sendMsg: vi.fn(),
      showToast: vi.fn(),
      renderSidebarContent: vi.fn(),
      openLinkedInMessage: vi.fn(),
      openLinkedInProfile: vi.fn(),
      fetchLinkedInRelationshipStatus,
      resolveProfileUrn: vi.fn(),
      sendLinkedInConnectRequest,
      sendLinkedInFollowState: vi.fn(),
      invalidateCacheForUser: vi.fn(),
      getFeedMembersById: () => ({ [feed.id]: [testMember] }),
      setFeedMembersById: vi.fn(),
      getFeeds: () => [feed],
      loadFeeds: vi.fn(),
      persistResolvedMemberState: vi.fn(),
      getActiveMemberEditor: vi.fn(() => null),
      setActiveMemberEditor: vi.fn(),
    };

    bindMemberActionButtons(wrapper, deps);
    wrapper.querySelector<HTMLButtonElement>('[data-member-action="connect"]')?.click();

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(sendLinkedInConnectRequest).toHaveBeenCalledWith(
      'urn:li:fsd_profile:ACoAAConnectTest',
      'https://www.linkedin.com/in/yuliia-biliavtseva/'
    );
  });

  it('attempts the connect request when the visible connect action resolves as connect with canConnect=false', async () => {
    const testMember = member({
      status: 'connect',
      canConnect: true,
    });
    const feed: FeedInfo = {
      id: 'feed-1',
      name: 'Feed',
      color: '#2563eb',
      memberCount: 1,
    };
    const wrapper = document.createElement('div');
    wrapper.innerHTML = renderMemberStatusAction(feed.id, testMember, 'connect').trim();
    document.body.appendChild(wrapper);

    const sendLinkedInConnectRequest = vi.fn().mockRejectedValue(new Error('network failed'));
    const fetchLinkedInRelationshipStatus = vi.fn().mockResolvedValue({
      status: 'connect',
      profileUrn: 'urn:li:fsd_profile:ACoAAConnectFalse',
      canMessage: false,
      canFollow: false,
      canConnect: false,
      isFollowing: false,
    });

    const deps: MemberActionDeps = {
      sendMsg: vi.fn(),
      showToast: vi.fn(),
      renderSidebarContent: vi.fn(),
      openLinkedInMessage: vi.fn(),
      openLinkedInProfile: vi.fn(),
      fetchLinkedInRelationshipStatus,
      resolveProfileUrn: vi.fn(),
      sendLinkedInConnectRequest,
      sendLinkedInFollowState: vi.fn(),
      invalidateCacheForUser: vi.fn(),
      getFeedMembersById: () => ({ [feed.id]: [testMember] }),
      setFeedMembersById: vi.fn(),
      getFeeds: () => [feed],
      loadFeeds: vi.fn(),
      persistResolvedMemberState: vi.fn(),
      getActiveMemberEditor: vi.fn(() => null),
      setActiveMemberEditor: vi.fn(),
    };

    bindMemberActionButtons(wrapper, deps);
    wrapper.querySelector<HTMLButtonElement>('[data-member-action="connect"]')?.click();

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(sendLinkedInConnectRequest).toHaveBeenCalledWith(
      'urn:li:fsd_profile:ACoAAConnectFalse',
      'https://www.linkedin.com/in/yuliia-biliavtseva/'
    );
  });
});

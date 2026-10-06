import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderMemberRow } from '../components/MemberRow/MemberRow';
import { renderMemberStatusAction, renderMessageButton } from '../logic/member-action-render';
import { updateRenderedMemberState } from '../logic/member-action-state';
import type { FeedInfo, FeedMemberInfo } from '../types';

function member(overrides: Partial<FeedMemberInfo> = {}): FeedMemberInfo {
  return {
    id: 'member-1',
    linkedinUrl: 'https://www.linkedin.com/in/member-1/',
    linkedinUsername: 'member-1',
    displayName: 'Member One',
    status: 'connected',
    canMessage: true,
    profileImageUrl: 'https://media.licdn.com/profile.jpg',
    addedAt: 100,
    ...overrides,
  };
}

function renderRow(sidebar: HTMLElement, currentMember: FeedMemberInfo): void {
  sidebar.innerHTML = renderMemberRow({
    feedId: 'feed-1',
    member: currentMember,
    messageButtonHtml: renderMessageButton('feed-1', currentMember, Boolean(currentMember.canMessage)),
    statusActionHtml: renderMemberStatusAction('feed-1', currentMember, currentMember.status || 'connect'),
  });
}

type UpdateDeps = Parameters<typeof updateRenderedMemberState>[3];

function makeDeps(currentMember: FeedMemberInfo): UpdateDeps {
  const feeds: FeedInfo[] = [{ id: 'feed-1', name: 'Feed', color: '#fff', memberCount: 1 }];
  return {
    openLinkedInMessage: vi.fn(),
    openLinkedInProfile: vi.fn(),
    fetchLinkedInRelationshipStatus: vi.fn(),
    resolveProfileUrn: vi.fn(),
    sendLinkedInConnectRequest: vi.fn(),
    sendLinkedInFollowState: vi.fn(),
    invalidateCacheForUser: vi.fn(),
    getFeedMembersById: () => ({ 'feed-1': [currentMember] }),
    getFeeds: () => feeds,
    showToast: vi.fn(),
    renderSidebarContent: vi.fn(),
    getMessagingButtonsEnabled: () => true,
  };
}

describe('updateRenderedMemberState', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('keeps unchanged member DOM nodes mounted', () => {
    const currentMember = member();
    const sidebar = document.createElement('div');
    renderRow(sidebar, currentMember);
    document.body.append(sidebar);

    const messageButton = sidebar.querySelector('[data-member-action="message"]');
    const statusNode = sidebar.querySelector('.lfa-member-status');
    const avatar = sidebar.querySelector('img.lfa-member-avatar');
    const nameText = sidebar.querySelector('.lfa-member-name-text');
    messageButton?.setAttribute('data-lfa-bound-message', 'true');

    expect(updateRenderedMemberState(sidebar, 'feed-1', currentMember, makeDeps(currentMember))).toBe(true);
    expect(sidebar.querySelector('[data-member-action="message"]')).toBe(messageButton);
    expect(sidebar.querySelector('.lfa-member-status')).toBe(statusNode);
    expect(sidebar.querySelector('img.lfa-member-avatar')).toBe(avatar);
    expect(sidebar.querySelector('.lfa-member-name-text')).toBe(nameText);
  });

  it('replaces only the status control when relationship status changes', () => {
    const currentMember = member({ status: 'connect', canMessage: false, canConnect: true });
    const sidebar = document.createElement('div');
    renderRow(sidebar, currentMember);
    document.body.append(sidebar);

    const messageButton = sidebar.querySelector('[data-member-action="message"]');
    const statusNode = sidebar.querySelector('.lfa-member-status');
    const avatar = sidebar.querySelector('img.lfa-member-avatar');
    const nextMember = member({ status: 'pending', canMessage: false, canConnect: false });

    expect(updateRenderedMemberState(sidebar, 'feed-1', nextMember, makeDeps(nextMember))).toBe(true);
    expect(sidebar.querySelector('[data-member-action="message"]')).toBe(messageButton);
    expect(sidebar.querySelector('.lfa-member-status')).not.toBe(statusNode);
    expect(sidebar.querySelector('.lfa-member-status')?.textContent).toContain('Pending');
    expect(sidebar.querySelector('img.lfa-member-avatar')).toBe(avatar);
  });
});

import type { FeedMemberInfo } from './types';
import { getLinkedInDomFollowState, getLinkedInDomStatus } from '../linkedin-dom-status';

export type MemberStatus = NonNullable<FeedMemberInfo['status']>;

function isFirstDegreeConnection(value?: string): boolean {
  const normalized = (value || '').trim().toLowerCase();
  return (
    normalized === '1st' ||
    normalized === '1st degree' ||
    normalized === '1st degree connection' ||
    normalized === '1-й' ||
    normalized === '1-го' ||
    normalized === '1'
  );
}

export function getMemberStatus(member: FeedMemberInfo): MemberStatus {
  const domStatus = getLinkedInDomStatus(member);
  const domFollowState = getLinkedInDomFollowState(member);
  if (typeof domFollowState === 'boolean') {
    member.isFollowing = domFollowState;
  }

  if (member.status === 'withdrawn' && (domStatus === 'connect' || domStatus === 'following')) {
    if (domStatus === 'following') {
      member.isFollowing = true;
    }
    return 'withdrawn';
  }

  if (
    member.status === 'unavailable' &&
    (domStatus === 'connect' || domStatus === 'following' || domStatus === 'pending')
  ) {
    member.isFollowing = false;
    return 'unavailable';
  }

  if (domStatus) {
    if (domStatus === 'following') {
      member.isFollowing = true;
    }
    return domStatus;
  }

  if (
    isFirstDegreeConnection(member.connectionDegree) &&
    member.status !== 'pending' &&
    member.status !== 'withdrawn' &&
    member.status !== 'unavailable' &&
    member.status !== 'loading'
  ) {
    return 'connected';
  }

  if (member.status) {
    return member.status;
  }

  return 'connect';
}

export function canMemberReceiveMessage(
  member: FeedMemberInfo,
  status: MemberStatus = getMemberStatus(member),
  options: { allowUnverifiedProfileMessage?: boolean } = {}
): boolean {
  if (status === 'loading' || status === 'pending' || status === 'withdrawn' || status === 'unavailable') {
    return false;
  }

  if (status === 'connected' || isFirstDegreeConnection(member.connectionDegree)) {
    return true;
  }

  if (member.canMessage === true) {
    return true;
  }

  return Boolean(options.allowUnverifiedProfileMessage && member.linkedinUrl);
}

export function getMemberStatusTooltip(status: MemberStatus): string | null {
  if (status === 'withdrawn') {
    return 'Invitation was withdrawn earlier. LinkedIn lets you resend it 3 weeks after withdrawal.';
  }

  if (status === 'unavailable') {
    return 'This LinkedIn profile is no longer available.';
  }

  return null;
}

export function getMemberInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

export function getMemberStatusMarkup(status: MemberStatus): string {
  if (status === 'loading') {
    return `
      <span class="lfa-status-spinner"></span>
      <span>Loading</span>
    `;
  }

  if (status === 'connect') {
    return `
      <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M10.25 13v-.75a2.5 2.5 0 0 0-2.5-2.5H4.75a2.5 2.5 0 0 0-2.5 2.5V13"></path>
        <circle cx="6.25" cy="5" r="2.25"></circle>
        <path d="M12.25 4v4"></path>
        <path d="M10.25 6h4"></path>
      </svg>
      <span>Connect</span>
    `;
  }

  if (status === 'pending') {
    return `
      <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="8" cy="8" r="5.25"></circle>
        <path d="M8 5.2v2.95l1.9 1.1"></path>
      </svg>
      <span>Pending</span>
    `;
  }

  if (status === 'following') {
    return `
      <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M10.25 13v-.75a2.5 2.5 0 0 0-2.5-2.5H4.75a2.5 2.5 0 0 0-2.5 2.5V13"></path>
        <circle cx="6.25" cy="5" r="2.25"></circle>
        <path d="m10.9 8.35 1.35 1.35 2.55-3"></path>
      </svg>
      <span>Following</span>
    `;
  }

  if (status === 'withdrawn') {
    return `
      <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="8" cy="8" r="5.25"></circle>
        <path d="M5.4 8h5.2"></path>
      </svg>
      <span>Resend later</span>
    `;
  }

  if (status === 'unavailable') {
    return `
      <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="8" cy="8" r="5.25"></circle>
        <path d="m5.75 5.75 4.5 4.5"></path>
        <path d="m10.25 5.75-4.5 4.5"></path>
      </svg>
      <span>Deleted</span>
    `;
  }

  return `
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M10.25 13v-.75a2.5 2.5 0 0 0-2.5-2.5H4.75a2.5 2.5 0 0 0-2.5 2.5V13"></path>
      <circle cx="6.25" cy="5" r="2.25"></circle>
      <path d="m10.9 8.15 1.25 1.25 2.35-2.6"></path>
    </svg>
    <span>Connected</span>
  `;
}

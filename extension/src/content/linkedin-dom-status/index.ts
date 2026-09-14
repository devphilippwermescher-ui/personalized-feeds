import type { FeedMemberInfo } from '../feeds-sidebar/types';
import {
  getRelationshipButtonSignal,
  hasFollowSignal,
  hasFollowingSignal,
} from '../shared/relationship-dom-signals';
import {
  findCurrentProfileRelationshipRoot,
  getCurrentProfileRelationshipActions,
} from '../shared/current-profile-relationship-dom';

function getCurrentProfileUsername(): string | null {
  const match = window.location.pathname.match(/^\/in\/([^/]+)/);
  return match ? normalizeLinkedInUsername(match[1]) : null;
}

function normalizeLinkedInUsername(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().replace(/^\/+|\/+$/g, '').toLowerCase();
  try {
    return decodeURIComponent(normalized);
  } catch {
    return normalized;
  }
}

function getUsernameFromLinkedInUrl(urlValue: string | undefined): string | null {
  if (!urlValue) {
    return null;
  }

  try {
    const url = new URL(urlValue, window.location.origin);
    const match = url.pathname.match(/^\/in\/([^/]+)/);
    return match ? normalizeLinkedInUsername(match[1]) : null;
  } catch {
    return null;
  }
}

function normalizeComparableName(value: string | undefined): string {
  return (value || '')
    .replace(/\s+/g, ' ')
    .replace(/\s*[·•]\s*(?:1st|2nd|3rd\+?|3rd|1-й|2-й|3-й)\s*$/i, '')
    .trim()
    .toLowerCase();
}

function getCurrentProfileDisplayName(): string {
  const candidate = findCurrentProfileRelationshipRoot();
  const name = candidate?.querySelector('h1, h2')?.textContent?.trim();
  if (name) return name;

  return document.querySelector('h1, h2')?.textContent?.trim() || '';
}

function isCurrentProfileMember(member: FeedMemberInfo): boolean {
  const currentUsername = getCurrentProfileUsername();
  const memberUsername = normalizeLinkedInUsername(member.linkedinUsername);
  const memberUrlUsername = getUsernameFromLinkedInUrl(member.linkedinUrl);

  if (currentUsername && (currentUsername === memberUsername || currentUsername === memberUrlUsername)) {
    return true;
  }

  const currentProfileName = normalizeComparableName(getCurrentProfileDisplayName());
  const memberName = normalizeComparableName(member.displayName);
  return Boolean(currentProfileName && memberName && currentProfileName === memberName);
}

function getProfileActionElements(): HTMLElement[] {
  const topCard = findCurrentProfileRelationshipRoot();
  return getCurrentProfileRelationshipActions(topCard || document.body);
}

export function getLinkedInDomFollowState(member: FeedMemberInfo): boolean | null {
  if (!isCurrentProfileMember(member)) {
    return null;
  }

  const buttons = getProfileActionElements();
  if (buttons.some((button) => hasFollowingSignal(getRelationshipButtonSignal(button)))) {
    return true;
  }
  if (buttons.some((button) => hasFollowSignal(getRelationshipButtonSignal(button)))) {
    return false;
  }
  return null;
}

export function getLinkedInDomStatus(member: FeedMemberInfo): 'connected' | 'pending' | 'connect' | 'following' | null {
  if (!isCurrentProfileMember(member)) {
    return null;
  }

  const buttons = getProfileActionElements();
  const topCard = findCurrentProfileRelationshipRoot();
  const topCardText = topCard?.textContent?.toLowerCase() || '';
  const hasFirstDegree =
    member.connectionDegree?.trim() === '1st' ||
    /\b1st\b/.test(topCardText) ||
    /1st degree connection/.test(topCardText) ||
    /\b1-й\b/.test(topCardText);
  const hasSecondOrThirdDegree =
    /\b2nd\b/.test(topCardText) ||
    /\b3rd\b/.test(topCardText) ||
    /2nd degree connection/.test(topCardText) ||
    /3rd degree connection/.test(topCardText) ||
    /\b2-й\b/.test(topCardText) ||
    /\b3-й\b/.test(topCardText);

  const pendingButton = buttons.find((button) => {
    const { text, label } = getRelationshipButtonSignal(button);
    return (
      text.includes('pending') ||
      text.includes('розгляда') ||
      label.startsWith('pending') ||
      label.includes('розгляда') ||
      label.includes('скасувати')
    );
  });

  if (pendingButton) {
    return 'pending';
  }

  const connectButton = buttons.find((button) => {
    const { text, label } = getRelationshipButtonSignal(button);
    return (
      text === 'connect' ||
      text.includes('встановити контакт') ||
      label.includes('invite') ||
      label.includes('connect') ||
      label.includes('встановити контакт') ||
      label.includes('запрос')
    );
  });

  if (
    buttons.some((button) => hasFollowingSignal(getRelationshipButtonSignal(button))) &&
    !hasFirstDegree
  ) {
    return 'following';
  }

  if (connectButton) {
    return 'connect';
  }

  const messageButton = buttons.find((button) => {
    const { text, label } = getRelationshipButtonSignal(button);
    return (
      text === 'message' ||
      text.includes('повідомлення') ||
      label.startsWith('message') ||
      label.includes('повідомлення')
    );
  });

  const followButton = buttons.find((button) => hasFollowSignal(getRelationshipButtonSignal(button)));

  if (followButton && hasSecondOrThirdDegree && !hasFirstDegree) {
    return 'connect';
  }

  if (messageButton && hasFirstDegree && !hasSecondOrThirdDegree) {
    return 'connected';
  }

  if (buttons.some((button) => hasFollowingSignal(getRelationshipButtonSignal(button)))) {
    return 'following';
  }

  return null;
}

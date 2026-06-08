import type { FeedMemberInfo } from '../feeds-sidebar/types';

function getCurrentProfileUsername(): string | null {
  const match = window.location.pathname.match(/^\/in\/([^/]+)/);
  return match ? match[1].toLowerCase() : null;
}

function normalizeLinkedInUsername(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  return value.trim().replace(/^\/+|\/+$/g, '').toLowerCase();
}

function getUsernameFromLinkedInUrl(urlValue: string | undefined): string | null {
  if (!urlValue) {
    return null;
  }

  try {
    const url = new URL(urlValue, window.location.origin);
    const match = url.pathname.match(/^\/in\/([^/]+)/);
    return match ? match[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

function isCurrentProfileMember(member: FeedMemberInfo): boolean {
  const currentUsername = getCurrentProfileUsername();
  const memberUsername = normalizeLinkedInUsername(member.linkedinUsername);
  const memberUrlUsername = getUsernameFromLinkedInUrl(member.linkedinUrl);

  return Boolean(
    currentUsername &&
      (currentUsername === memberUsername || currentUsername === memberUrlUsername)
  );
}

function getProfileActionButtons(): HTMLButtonElement[] {
  const topCard =
    document.querySelector('section[data-member-id]') ||
    document.querySelector('.pv-top-card') ||
    document.querySelector('.ph5.pb5');

  if (!topCard) {
    return [];
  }

  return Array.from(topCard.querySelectorAll('button')) as HTMLButtonElement[];
}

export function getLinkedInDomStatus(member: FeedMemberInfo): 'connected' | 'pending' | 'connect' | 'following' | null {
  if (!isCurrentProfileMember(member)) {
    return null;
  }

  const buttons = getProfileActionButtons();
  const topCard =
    document.querySelector('section[data-member-id]') ||
    document.querySelector('.pv-top-card') ||
    document.querySelector('.ph5.pb5') ||
    document.body;
  const topCardText = topCard?.textContent?.toLowerCase() || '';
  const hasFirstDegree =
    member.connectionDegree?.trim() === '1st' ||
    /\b1st\b/.test(topCardText) ||
    /1st degree connection/.test(topCardText);
  const hasSecondOrThirdDegree =
    /\b2nd\b/.test(topCardText) ||
    /\b3rd\b/.test(topCardText) ||
    /2nd degree connection/.test(topCardText) ||
    /3rd degree connection/.test(topCardText);

  const pendingButton = buttons.find((button) => {
    const text = button.textContent?.trim().toLowerCase() || '';
    const label = button.getAttribute('aria-label')?.trim().toLowerCase() || '';
    return text.includes('pending') || label.startsWith('pending');
  });

  if (pendingButton) {
    return 'pending';
  }

  const connectButton = buttons.find((button) => {
    const text = button.textContent?.trim().toLowerCase() || '';
    const label = button.getAttribute('aria-label')?.trim().toLowerCase() || '';
    return text === 'connect' || label.includes('invite') || label.includes('connect');
  });

  if (connectButton) {
    return 'connect';
  }

  const messageButton = buttons.find((button) => {
    const text = button.textContent?.trim().toLowerCase() || '';
    const label = button.getAttribute('aria-label')?.trim().toLowerCase() || '';
    return text === 'message' || label.startsWith('message');
  });

  const followButton = buttons.find((button) => {
    const text = button.textContent?.trim().toLowerCase() || '';
    const label = button.getAttribute('aria-label')?.trim().toLowerCase() || '';
    return text === 'follow' || text === '+ follow' || label.startsWith('follow');
  });

  if (followButton && hasSecondOrThirdDegree && !hasFirstDegree) {
    return 'connect';
  }

  if (messageButton && hasFirstDegree && !hasSecondOrThirdDegree) {
    return 'connected';
  }

  const followingButton = buttons.find((button) => {
    const text = button.textContent?.trim().toLowerCase() || '';
    const label = button.getAttribute('aria-label')?.trim().toLowerCase() || '';
    return text === 'following' || label.startsWith('following') || label.includes('unfollow');
  });

  if (followingButton) {
    return 'following';
  }

  return null;
}

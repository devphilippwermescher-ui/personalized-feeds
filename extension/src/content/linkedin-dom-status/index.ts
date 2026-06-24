import type { FeedMemberInfo } from '../feeds-sidebar/types';

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

function getTopCardCandidates(): HTMLElement[] {
  const directCandidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      'section[data-member-id], .pv-top-card, .ph5.pb5, section[componentkey*="Topcard"], section[componentkey*="topcard"]'
    )
  );
  const headingCandidates = Array.from(document.querySelectorAll<HTMLElement>('h1, h2'))
    .map((heading) => {
      let current: HTMLElement | null = heading;
      let depth = 0;
      while (current && depth < 8) {
        const hasActionButton = Array.from(current.querySelectorAll<HTMLButtonElement>('button')).some(
          (button) => {
            const text = button.textContent?.trim().toLowerCase() || '';
            const label = button.getAttribute('aria-label')?.trim().toLowerCase() || '';
            return /connect|invite|pending|message|follow|unfollow|встановити|повідомлення|розгляда|підпис|відстеж/i.test(
              `${text} ${label}`
            );
          }
        );
        if (hasActionButton) {
          return current;
        }
        current = current.parentElement;
        depth += 1;
      }
      return null;
    })
    .filter((candidate): candidate is HTMLElement => Boolean(candidate));

  return Array.from(new Set([...directCandidates, ...headingCandidates]));
}

function getCurrentProfileDisplayName(): string {
  for (const candidate of getTopCardCandidates()) {
    const name = candidate.querySelector('h1, h2')?.textContent?.trim();
    if (name) {
      return name;
    }
  }

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

function getProfileActionButtons(): HTMLButtonElement[] {
  const topCard = getTopCardCandidates()[0];

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
  const topCard = getTopCardCandidates()[0];
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
    const text = button.textContent?.trim().toLowerCase() || '';
    const label = button.getAttribute('aria-label')?.trim().toLowerCase() || '';
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
    const text = button.textContent?.trim().toLowerCase() || '';
    const label = button.getAttribute('aria-label')?.trim().toLowerCase() || '';
    return (
      text === 'connect' ||
      text.includes('встановити контакт') ||
      label.includes('invite') ||
      label.includes('connect') ||
      label.includes('встановити контакт') ||
      label.includes('запрос')
    );
  });

  if (connectButton) {
    return 'connect';
  }

  const messageButton = buttons.find((button) => {
    const text = button.textContent?.trim().toLowerCase() || '';
    const label = button.getAttribute('aria-label')?.trim().toLowerCase() || '';
    return (
      text === 'message' ||
      text.includes('повідомлення') ||
      label.startsWith('message') ||
      label.includes('повідомлення')
    );
  });

  const followButton = buttons.find((button) => {
    const text = button.textContent?.trim().toLowerCase() || '';
    const label = button.getAttribute('aria-label')?.trim().toLowerCase() || '';
    return (
      text === 'follow' ||
      text === '+ follow' ||
      text.includes('підпис') ||
      label.startsWith('follow') ||
      label.includes('підпис')
    );
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
    return (
      text === 'following' ||
      text.includes('відстеж') ||
      label.startsWith('following') ||
      label.includes('unfollow') ||
      label.includes('відстеж')
    );
  });

  if (followingButton) {
    return 'following';
  }

  return null;
}

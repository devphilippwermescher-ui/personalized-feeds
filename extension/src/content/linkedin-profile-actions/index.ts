const PROFILE_ACTION_QUERY_PARAM = 'myFeedPilotAction';
const MESSAGE_ACTION = 'message';

export function buildLinkedInProfileUrl(profileUrl: string, action?: 'message'): string {
  try {
    const url = new URL(profileUrl, window.location.origin);

    if (action) {
      url.searchParams.set(PROFILE_ACTION_QUERY_PARAM, action);
    } else {
      url.searchParams.delete(PROFILE_ACTION_QUERY_PARAM);
    }

    return url.toString();
  } catch {
    return profileUrl;
  }
}

export function openLinkedInProfile(profileUrl: string, action?: 'message'): void {
  window.open(buildLinkedInProfileUrl(profileUrl, action), '_blank');
}

export function buildLinkedInMessagingUrl(profileUrn: string): string | null {
  const normalizedUrn = profileUrn.trim();
  if (!normalizedUrn.startsWith('urn:li:fsd_profile:')) {
    return null;
  }

  const recipient = normalizedUrn.slice('urn:li:fsd_profile:'.length);
  const url = new URL('https://www.linkedin.com/messaging/compose/');
  url.searchParams.set('profileUrn', normalizedUrn);
  url.searchParams.set('recipient', recipient);
  url.searchParams.set('screenContext', 'NON_SELF_PROFILE_VIEW');

  return url.toString();
}

export function openLinkedInMessage(profileUrl: string, profileUrn?: string): void {
  const messagingUrl = profileUrn ? buildLinkedInMessagingUrl(profileUrn) : null;

  if (messagingUrl) {
    window.open(messagingUrl, '_blank');
    return;
  }

  openLinkedInProfile(profileUrl, 'message');
}

export function consumePendingProfileAction(): 'message' | null {
  try {
    const url = new URL(window.location.href);
    const action = url.searchParams.get(PROFILE_ACTION_QUERY_PARAM);

    if (action === MESSAGE_ACTION) {
      url.searchParams.delete(PROFILE_ACTION_QUERY_PARAM);
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      return action;
    }
  } catch {
    return null;
  }

  return null;
}

export function handlePendingProfileAction(): void {
  const action = consumePendingProfileAction();

  if (action !== MESSAGE_ACTION) {
    return;
  }

  let attempts = 0;

  const tryOpen = () => {
    const button = findMessageButton();
    if (button) {
      button.click();
      return;
    }

    attempts += 1;
    if (attempts < 20) {
      window.setTimeout(tryOpen, 500);
    }
  };

  window.setTimeout(tryOpen, 600);
}

function findMessageButton(): HTMLButtonElement | null {
  const selectors = [
    'button[aria-label^="Message"]',
    'button[aria-label*="message"]',
    '.pv-top-card-v2-ctas button',
    '.pvs-profile-actions button',
  ];

  for (const selector of selectors) {
    const candidates = Array.from(document.querySelectorAll(selector)) as HTMLButtonElement[];
    const match = candidates.find((button) => {
      const text = button.textContent?.trim().toLowerCase() || '';
      const label = button.getAttribute('aria-label')?.trim().toLowerCase() || '';
      return text === 'message' || label.startsWith('message');
    });

    if (match) {
      return match;
    }
  }

  return null;
}

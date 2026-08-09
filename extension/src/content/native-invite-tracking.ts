const INVITE_HOOK_SCRIPT_ID = 'mfp-linkedin-invite-network-hook';
const INVITE_HOOK_MESSAGE_TYPE = 'MFP_LINKEDIN_NATIVE_INVITE_SENT';
const INVITE_HOOK_PING_MESSAGE_TYPE = 'MFP_LINKEDIN_INVITE_NETWORK_HOOK_PING';
const INVITE_HOOK_READY_MESSAGE_TYPE = 'MFP_LINKEDIN_INVITE_NETWORK_HOOK_READY';
const RECENT_CONNECT_CLICK_MAX_AGE_MS = 2 * 60 * 1000;
const INVITE_UI_CONFIRMATION_DELAYS_MS = [900, 2600];
const FALLBACK_INVITE_DEDUPLICATION_MS = 15 * 1000;

interface NativeInvitePayload {
  requestUrl?: string;
  linkedinUsername?: string;
  linkedinUrl?: string;
  displayName?: string;
  profileUrn?: string;
  memberNumericId?: string;
}

interface ConnectClickContext {
  linkedinUsername: string;
  linkedinUrl: string;
  displayName: string;
  capturedAt: number;
}

let lastConnectClickContext: ConnectClickContext | null = null;
let lastFallbackInviteKey = '';
let lastFallbackInviteAt = 0;

function normalizeLinkedInUsername(value: string | undefined): string {
  const raw = (value || '').trim().replace(/^\/+|\/+$/g, '').toLowerCase();
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function getUsernameFromLinkedInUrl(value: string | undefined): string {
  if (!value) {
    return '';
  }

  try {
    const url = new URL(value, window.location.origin);
    return normalizeLinkedInUsername(url.pathname.match(/^\/in\/([^/?#]+)/)?.[1] || '');
  } catch {
    return '';
  }
}

function getCurrentProfileUsername(): string {
  return getUsernameFromLinkedInUrl(window.location.href);
}

function getCurrentProfileDisplayName(): string {
  const profileHeading = document.querySelector<HTMLElement>('main h1, h1');
  return profileHeading?.textContent?.replace(/\s+/g, ' ').trim() || '';
}

function getElementText(element: Element): string {
  return [
    element.textContent || '',
    element.getAttribute('aria-label') || '',
    element.getAttribute('title') || '',
  ].join(' ').replace(/\s+/g, ' ').trim();
}

function isConnectIntentElement(element: Element): boolean {
  const text = getElementText(element);
  return /\b(connect|invite)\b/i.test(text);
}

function isInviteSubmitElement(element: Element): boolean {
  const actionElement = element.closest('button, [role="button"]');
  if (!actionElement) {
    return false;
  }

  const dialog = actionElement.closest('[role="dialog"]');
  const dialogText = dialog?.textContent?.replace(/\s+/g, ' ').trim() || '';
  const actionText = getElementText(actionElement);
  return /invitation/i.test(dialogText) && /^(?:send(?:\s+without\s+(?:a\s+)?note)?|send invitation)$/i.test(actionText);
}

function getNearestProfileContextRoot(element: Element): Element {
  return (
    element.closest(
      'li, article, [role="listitem"], [data-view-name], .entity-result, .reusable-search__result-container, .mn-connection-card, .artdeco-card, section'
    ) || document.body
  );
}

function findProfileLink(root: Element, actionElement: Element): HTMLAnchorElement | null {
  const actionRect = actionElement.getBoundingClientRect();
  const links = Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href*="/in/"]'))
    .filter((link) => getUsernameFromLinkedInUrl(link.href));

  return links
    .map((link) => {
      const rect = link.getBoundingClientRect();
      const verticalOverlap = rect.bottom >= actionRect.top && rect.top <= actionRect.bottom;
      const verticalDistance = verticalOverlap
        ? 0
        : Math.abs((rect.top + rect.bottom) / 2 - (actionRect.top + actionRect.bottom) / 2);
      return { link, distance: verticalDistance };
    })
    .sort((left, right) => left.distance - right.distance)[0]?.link || null;
}

function getDisplayNameFromProfileLink(link: HTMLAnchorElement | null): string {
  if (!link) {
    return '';
  }

  return link.textContent
    ?.replace(/\s+/g, ' ')
    .replace(/\bView\s+.*profile\b/gi, '')
    .trim() || '';
}

function captureConnectClickContext(target: EventTarget | null): void {
  if (!(target instanceof Element)) {
    return;
  }

  const actionElement = target.closest('button, a, [role="button"], [role="menuitem"]');
  if (!actionElement || !isConnectIntentElement(actionElement)) {
    return;
  }

  const currentProfileUsername = getCurrentProfileUsername();
  if (currentProfileUsername) {
    lastConnectClickContext = {
      linkedinUsername: currentProfileUsername,
      linkedinUrl: `https://www.linkedin.com/in/${currentProfileUsername}/`,
      displayName: getCurrentProfileDisplayName(),
      capturedAt: Date.now(),
    };
    reportNativeInviteDiagnostic('connect_context_captured', lastConnectClickContext);
    return;
  }

  const contextRoot = getNearestProfileContextRoot(actionElement);
  const profileLink = findProfileLink(contextRoot, actionElement);
  const linkedinUsername = getUsernameFromLinkedInUrl(profileLink?.href);
  if (!linkedinUsername) {
    return;
  }

  lastConnectClickContext = {
    linkedinUsername,
    linkedinUrl: `https://www.linkedin.com/in/${linkedinUsername}/`,
    displayName: getDisplayNameFromProfileLink(profileLink),
    capturedAt: Date.now(),
  };
  reportNativeInviteDiagnostic('connect_context_captured', lastConnectClickContext);
}

function getRecentConnectClickContext(): ConnectClickContext | null {
  if (!lastConnectClickContext) {
    return null;
  }

  return Date.now() - lastConnectClickContext.capturedAt <= RECENT_CONNECT_CLICK_MAX_AGE_MS
    ? lastConnectClickContext
    : null;
}

function findProfileRoot(username: string): Element | null {
  const normalizedUsername = normalizeLinkedInUsername(username);
  if (!normalizedUsername) {
    return null;
  }

  const profileLink = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/in/"]'))
    .find((link) => getUsernameFromLinkedInUrl(link.href) === normalizedUsername);
  return profileLink ? getNearestProfileContextRoot(profileLink) : null;
}

function isPendingInviteVisible(context: ConnectClickContext): boolean {
  const currentUsername = getCurrentProfileUsername();
  const root = currentUsername === context.linkedinUsername
    ? document.querySelector('main') || document.body
    : findProfileRoot(context.linkedinUsername);
  if (!root) {
    return false;
  }

  return Array.from(root.querySelectorAll('button, [role="button"]')).some((element) => {
    const text = getElementText(element);
    return /^(?:pending|withdraw invitation)$/i.test(text);
  });
}

function shouldSendFallbackInvite(context: NativeInvitePayload): boolean {
  const now = Date.now();
  const key = context.linkedinUsername || context.linkedinUrl || context.profileUrn || context.memberNumericId || '';
  if (!key || (key === lastFallbackInviteKey && now - lastFallbackInviteAt < FALLBACK_INVITE_DEDUPLICATION_MS)) {
    return false;
  }

  lastFallbackInviteKey = key;
  lastFallbackInviteAt = now;
  return true;
}

function reportNativeInviteDiagnostic(event: string, context?: ConnectClickContext): void {
  chrome.runtime.sendMessage({
    type: 'LINKEDIN_NATIVE_INVITE_TRACKER_DIAGNOSTIC',
    event,
    linkedinUsername: context?.linkedinUsername || '',
    linkedinUrl: context?.linkedinUrl || '',
    displayName: context?.displayName || '',
    pageUrl: window.location.href,
  }).catch(() => {
    /* background may be unavailable while the extension is reloading */
  });
}

function confirmInviteFromUi(): void {
  const context = getRecentConnectClickContext();
  if (!context) {
    console.info('[connection-invites] native invite fallback skipped because no profile context was captured');
    reportNativeInviteDiagnostic('invite_submit_without_profile_context');
    return;
  }

  INVITE_UI_CONFIRMATION_DELAYS_MS.forEach((delay) => {
    window.setTimeout(() => {
      const pendingVisible = isPendingInviteVisible(context);
      console.info('[connection-invites] native invite submit captured', {
        linkedinUsername: context.linkedinUsername,
        pendingVisible,
      });
      reportNativeInviteDiagnostic('invite_submit_captured', context);

      // A visible Pending state is LinkedIn UI confirmation that the request
      // succeeded. It is a safe fallback when LinkedIn changes the request URL
      // and neither network observer recognizes it.
      if (pendingVisible) {
        sendNativeInviteToBackground(context);
      }
    }, delay);
  });
}

function sendNativeInviteToBackground(invite: NativeInvitePayload): void {
  const recentContext = getRecentConnectClickContext();
  const linkedinUsername = normalizeLinkedInUsername(
    invite.linkedinUsername || recentContext?.linkedinUsername || getCurrentProfileUsername()
  );
  const linkedinUrl =
    invite.linkedinUrl ||
    recentContext?.linkedinUrl ||
    (linkedinUsername ? `https://www.linkedin.com/in/${linkedinUsername}/` : '');
  const displayName = invite.displayName || recentContext?.displayName || getCurrentProfileDisplayName();

  if (!linkedinUsername && !invite.profileUrn && !invite.memberNumericId) {
    console.info('[connection-invites] native invite ignored because profile identity was not found');
    return;
  }

  const deduplicationContext: NativeInvitePayload = {
    linkedinUsername,
    linkedinUrl,
    displayName,
    profileUrn: invite.profileUrn,
    memberNumericId: invite.memberNumericId,
  };
  if (!shouldSendFallbackInvite(deduplicationContext)) {
    return;
  }

  console.info('[connection-invites] native invite captured', {
    linkedinUsername,
    hasProfileUrn: Boolean(invite.profileUrn),
    hasMemberNumericId: Boolean(invite.memberNumericId),
  });

  chrome.runtime.sendMessage({
    type: 'LINKEDIN_CONNECTION_INVITE_TRACK_SENT',
    invite: {
      linkedinUsername,
      linkedinUrl,
      displayName,
      profileUrn: invite.profileUrn || '',
      memberNumericId: invite.memberNumericId || '',
      source: 'linkedin_native_connect_action',
    },
  }).catch(() => {
    /* background may be unavailable while the extension is reloading */
  });
}

export function initNativeInviteTracking(): void {
  chrome.runtime.sendMessage({
    type: 'LINKEDIN_NATIVE_INVITE_TRACKER_READY',
    pageUrl: window.location.href,
  }).catch(() => {
    /* background may be unavailable while the extension is reloading */
  });

  document.addEventListener('click', (event) => {
    captureConnectClickContext(event.target);
    if (event.target instanceof Element) {
      const actionElement = event.target.closest('button, a, [role="button"], [role="menuitem"]');
      if (actionElement && isConnectIntentElement(actionElement)) {
        // Some LinkedIn surfaces (for example People you may know) send the
        // invitation immediately without opening a confirmation dialog.
        confirmInviteFromUi();
      }
      if (isInviteSubmitElement(event.target)) {
        confirmInviteFromUi();
      }
    }
  }, true);
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== window.location.origin) {
      return;
    }

    const data = event.data as { type?: string; invite?: NativeInvitePayload } | null;
    if (!data) {
      return;
    }

    if (data.type === INVITE_HOOK_READY_MESSAGE_TYPE) {
      chrome.runtime.sendMessage({
        type: 'LINKEDIN_NATIVE_INVITE_NETWORK_HOOK_READY',
        pageUrl: window.location.href,
      }).catch(() => undefined);
      return;
    }

    if (data.type === INVITE_HOOK_MESSAGE_TYPE && data.invite) {
      sendNativeInviteToBackground(data.invite);
    }
  });

  window.postMessage({ type: INVITE_HOOK_PING_MESSAGE_TYPE }, window.location.origin);
}

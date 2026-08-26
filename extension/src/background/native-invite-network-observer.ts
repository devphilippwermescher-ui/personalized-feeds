import { trackConnectionInviteSent } from 'shared/firestore-service';
import { getAuthenticatedFeedsUser } from './feeds-auth';
import { resolveLinkedInProfileIdentity } from './linkedin-profile-identity-resolver';
import { queueProfileAnalyticsSync } from './profile-analytics-sync-coordinator';

const INVITE_CONTEXT_MAX_AGE_MS = 2 * 60 * 1000;

interface NativeInviteContext {
  linkedinUsername: string;
  linkedinUrl: string;
  displayName: string;
  capturedAt: number;
}

const contextsByTabId = new Map<number, NativeInviteContext>();

function isLinkedInInviteCreationRequest(urlValue: string): boolean {
  try {
    const url = new URL(urlValue);
    return (
      /\/voyager\/api\/voyagerRelationshipsDashMemberRelationships$/i.test(url.pathname) &&
      url.searchParams.get('action') === 'verifyQuotaAndCreateV2'
    );
  } catch {
    return false;
  }
}

export function rememberNativeInviteContext(tabId: number | undefined, context: NativeInviteContext): void {
  if (typeof tabId !== 'number' || tabId < 0 || !context.linkedinUsername) {
    return;
  }

  contextsByTabId.set(tabId, context);
}

async function trackCompletedNativeInvite(tabId: number): Promise<void> {
  const context = contextsByTabId.get(tabId);
  if (!context || Date.now() - context.capturedAt > INVITE_CONTEXT_MAX_AGE_MS) {
    console.info('[connection-invites] invite request completed without a recent profile context', { tabId });
    return;
  }

  const user = await getAuthenticatedFeedsUser();
  if (!user) {
    console.info('[connection-invites] invite request was not tracked because myFeedPilot is not authenticated');
    return;
  }

  const identity = await resolveLinkedInProfileIdentity(context.linkedinUsername);
  if (!identity) {
    console.info('[connection-invites] invite request was not tracked because profile identity was unavailable', {
      linkedinUsername: context.linkedinUsername,
    });
    return;
  }

  await trackConnectionInviteSent(user.uid, {
    linkedinUsername: identity.linkedinUsername,
    linkedinUrl: context.linkedinUrl || `https://www.linkedin.com/in/${identity.linkedinUsername}/`,
    displayName: context.displayName || identity.displayName || '',
    profileUrn: identity.profileUrn,
    source: 'linkedin_native_connect_action',
  });
  contextsByTabId.delete(tabId);
  console.info('[connection-invites] invite saved from completed LinkedIn request', {
    tabId,
    linkedinUsername: identity.linkedinUsername,
    profileUrn: identity.profileUrn,
  });
  await queueProfileAnalyticsSync('invite_sent', tabId);
}

export function initNativeInviteNetworkObserver(): void {
  chrome.webRequest?.onCompleted.addListener(
    (details) => {
      if (
        details.tabId < 0 ||
        details.method !== 'POST' ||
        details.statusCode < 200 ||
        details.statusCode >= 300 ||
        !isLinkedInInviteCreationRequest(details.url)
      ) {
        return;
      }

      console.info('[connection-invites] LinkedIn invite request completed', {
        tabId: details.tabId,
        statusCode: details.statusCode,
      });
      void trackCompletedNativeInvite(details.tabId).catch((error) => {
        console.warn('[connection-invites] failed to track completed LinkedIn invite request', error);
      });
    },
    {
      urls: ['https://www.linkedin.com/voyager/api/voyagerRelationshipsDashMemberRelationships*'],
    }
  );
}

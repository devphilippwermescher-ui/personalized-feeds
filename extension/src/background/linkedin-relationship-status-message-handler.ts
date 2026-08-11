import { normalizeFeedsError } from './feeds-errors';
import { trackConnectionInviteSent } from 'shared/firestore-service';
import { getAuthenticatedFeedsUser } from './feeds-auth';
import { resolveLinkedInProfileIdentity } from './linkedin-profile-identity-resolver';
import { rememberNativeInviteContext } from './native-invite-network-observer';
import { queueProfileAnalyticsSync } from './profile-analytics-sync-coordinator';
import {
  resolveLinkedInRelationshipStatusInBackground,
  sendLinkedInConnectRequestInBackground,
} from './linkedin-relationship-status-resolver';
import type { ProfileAnalyticsConnectionInvite } from 'shared/types';

async function getVerifiedConnectionInvite(input: Record<string, unknown>) {
  const submittedUsername = typeof input.linkedinUsername === 'string' ? input.linkedinUsername : '';
  const submittedProfileUrn = typeof input.profileUrn === 'string' ? input.profileUrn.trim() : '';
  const submittedMemberNumericId = typeof input.memberNumericId === 'string' ? input.memberNumericId.trim() : '';
  const identityLookup = submittedUsername || submittedMemberNumericId;
  const identity = identityLookup ? await resolveLinkedInProfileIdentity(identityLookup).catch(() => null) : null;

  if (identity && submittedProfileUrn && submittedProfileUrn !== identity.profileUrn) {
    throw new Error('LinkedIn invitation target did not match the selected profile identity.');
  }

  if (!identity && !submittedProfileUrn && !submittedMemberNumericId) {
    throw new Error('LinkedIn profile identity was not found for the invitation target.');
  }

  console.info('[connection-invites] invitation identity verified', {
    linkedinUsername: identity?.linkedinUsername || submittedUsername,
    profileUrn: identity?.profileUrn || submittedProfileUrn,
    matchedNetworkTarget: Boolean(submittedProfileUrn),
  });

  return {
    linkedinUsername: identity?.linkedinUsername || submittedUsername,
    linkedinUrl:
      typeof input.linkedinUrl === 'string' && input.linkedinUrl.trim()
        ? input.linkedinUrl
        : identity?.linkedinUsername
          ? `https://www.linkedin.com/in/${identity.linkedinUsername}/`
          : '',
    displayName:
      typeof input.displayName === 'string' && input.displayName.trim()
        ? input.displayName
        : identity?.displayName || '',
    profileUrn: identity?.profileUrn || submittedProfileUrn,
    memberNumericId: submittedMemberNumericId,
  };
}

function getConnectionInviteSource(value: unknown): ProfileAnalyticsConnectionInvite['source'] {
  if (
    value === 'sidebar_connect_action' ||
    value === 'linkedin_native_connect_action' ||
    value === 'linkedin_sent_invitations_sync'
  ) {
    return value;
  }

  return 'sidebar_connect_action';
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'LINKEDIN_NATIVE_INVITE_TRACKER_READY') {
    console.info('[connection-invites] native tracker ready', {
      pageUrl: typeof message.pageUrl === 'string' ? message.pageUrl : '',
    });
    return false;
  }

  if (message.type === 'LINKEDIN_NATIVE_INVITE_NETWORK_HOOK_READY') {
    console.info('[connection-invites] network hook ready in MAIN world', {
      pageUrl: typeof message.pageUrl === 'string' ? message.pageUrl : '',
    });
    return false;
  }

  if (message.type === 'LINKEDIN_NATIVE_INVITE_TRACKER_DIAGNOSTIC') {
    const event = typeof message.event === 'string' ? message.event : '';
    const linkedinUsername = typeof message.linkedinUsername === 'string' ? message.linkedinUsername : '';
    if (event === 'connect_context_captured') {
      rememberNativeInviteContext(sender.tab?.id, {
        linkedinUsername,
        linkedinUrl: typeof message.linkedinUrl === 'string' ? message.linkedinUrl : '',
        displayName: typeof message.displayName === 'string' ? message.displayName : '',
        capturedAt: Date.now(),
      });
    }
    console.info('[connection-invites] native tracker diagnostic', {
      event,
      linkedinUsername,
      pageUrl: typeof message.pageUrl === 'string' ? message.pageUrl : '',
    });
    return false;
  }

  if (message.type === 'LINKEDIN_CONNECTION_INVITE_TRACK_SENT') {
    getAuthenticatedFeedsUser()
      .then(async (user) => {
        if (!user) {
          sendResponse({ success: false, error: 'myFeedPilot authentication is required.' });
          return;
        }

        const invite = (message.invite || {}) as Record<string, unknown>;
        console.info('[connection-invites] received tracking event', {
          source: getConnectionInviteSource(invite.source),
          linkedinUsername: String(invite.linkedinUsername || ''),
          hasProfileUrn: typeof invite.profileUrn === 'string' && invite.profileUrn.length > 0,
          hasMemberNumericId: typeof invite.memberNumericId === 'string' && invite.memberNumericId.length > 0,
        });
        const verifiedInvite = await getVerifiedConnectionInvite(invite);
        await trackConnectionInviteSent(user.uid, {
          ...verifiedInvite,
          source: getConnectionInviteSource(invite.source),
        });
        console.info('[connection-invites] invite saved', {
          source: getConnectionInviteSource(invite.source),
          linkedinUsername: String(invite.linkedinUsername || ''),
          hasProfileUrn: typeof invite.profileUrn === 'string' && invite.profileUrn.length > 0,
          hasMemberNumericId: typeof invite.memberNumericId === 'string' && invite.memberNumericId.length > 0,
        });
        await queueProfileAnalyticsSync('invite_sent', sender.tab?.id).catch(() => undefined);
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.warn('[connection-invites] failed to save invite tracking event', error);
        sendResponse({
          success: false,
          error: normalizeFeedsError(error, 'Failed to track LinkedIn connection invite'),
        });
      });

    return true;
  }

  if (message.type === 'LINKEDIN_CONNECT_REQUEST_BACKGROUND') {
    sendLinkedInConnectRequestInBackground(
      String(message.profileUrn || ''),
      typeof message.referrerUrl === 'string' ? message.referrerUrl : undefined
    )
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        sendResponse({
          success: false,
          error: normalizeFeedsError(error, 'Failed to send LinkedIn connect request in background'),
        });
      });

    return true;
  }

  if (message.type === 'LINKEDIN_RELATIONSHIP_STATUS_RESOLVE_BACKGROUND') {
    resolveLinkedInRelationshipStatusInBackground(String(message.linkedinUsername || ''), {
      allowHtmlFallback: false,
    })
      .then((resolution) => {
        if (!resolution) {
          sendResponse({
            success: false,
            error: 'LinkedIn relationship status was not found in background GraphQL.',
          });
          return;
        }

        sendResponse({ success: true, resolution });
      })
      .catch((error) => {
        sendResponse({
          success: false,
          error: normalizeFeedsError(error, 'Failed to resolve relationship status in background'),
        });
      });

    return true;
  }

  return false;
});

export interface ParsedNativeInviteNetworkResult {
  linkedinUsername: string;
  profileUrn: string;
  memberNumericId: string;
  invitationUrn: string;
}

const VOYAGER_INVITE_CREATION_PATH = '/voyager/api/voyagerRelationshipsDashMemberRelationships';
const MY_NETWORK_ADD_CONNECTION_SDUI_ID = 'com.linkedin.sdui.requests.mynetwork.addaAddConnection';

function getLinkedInRequestUrl(rawUrl: string): URL | null {
  try {
    return new URL(rawUrl, 'https://www.linkedin.com');
  } catch {
    return null;
  }
}

function decodeRequestText(value: string): string {
  const unescaped = value.replace(/\\\//g, '/');
  try {
    return `${unescaped}\n${decodeURIComponent(unescaped)}`;
  } catch {
    return unescaped;
  }
}

function extractField(text: string, fieldNames: string[]): string {
  for (const fieldName of fieldNames) {
    const match = text.match(new RegExp(`"${fieldName}"\\s*:\\s*"([^"]+)"`, 'i'));
    if (match?.[1]) return match[1];
  }
  return '';
}

export function isPotentialInviteRequest(rawUrl: string): boolean {
  const url = getLinkedInRequestUrl(rawUrl);
  if (!url) return false;

  if (url.pathname === VOYAGER_INVITE_CREATION_PATH) return true;
  if (url.pathname === '/flagship-web/rsc-action/actions/server-request') {
    return url.searchParams.get('sduiid') === MY_NETWORK_ADD_CONNECTION_SDUI_ID;
  }

  return /\/voyager\/api\//i.test(url.pathname) && /(?:relationship|invitation|invite)/i.test(url.pathname);
}

export function isInviteCreationRequest(rawUrl: string, requestBody = ''): boolean {
  const url = getLinkedInRequestUrl(rawUrl);
  if (!url) return false;

  const isKnownVoyagerCreateEndpoint =
    url.pathname === VOYAGER_INVITE_CREATION_PATH && url.searchParams.get('action') === 'verifyQuotaAndCreateV2';
  const isKnownMyNetworkRscEndpoint =
    url.pathname === '/flagship-web/rsc-action/actions/server-request' &&
    url.searchParams.get('sduiid') === MY_NETWORK_ADD_CONNECTION_SDUI_ID;
  const hasInvitePayload = /(?:inviteeUnion|memberProfile|invitee|memberId)/i.test(decodeRequestText(requestBody));

  return (
    isKnownVoyagerCreateEndpoint ||
    isKnownMyNetworkRscEndpoint ||
    (isPotentialInviteRequest(rawUrl) && hasInvitePayload)
  );
}

export function isSuccessfulInviteCreationResponse(rawUrl: string, responseText: string): boolean {
  const url = getLinkedInRequestUrl(rawUrl);
  if (!url) return false;
  const decodedResponse = decodeRequestText(responseText);

  if (
    url.pathname === '/flagship-web/rsc-action/actions/server-request' &&
    url.searchParams.get('sduiid') === MY_NETWORK_ADD_CONNECTION_SDUI_ID
  ) {
    return (
      /"stringValue"\s*:\s*"Pending"/i.test(decodedResponse) && !/"errors"\s*:\s*\[(?!\s*\])/i.test(decodedResponse)
    );
  }

  if (url.pathname === VOYAGER_INVITE_CREATION_PATH) {
    return /urn:li:fsd_invitation:\d+/.test(decodedResponse);
  }

  return true;
}

export function parseNativeInviteNetworkResult(
  requestBody: string,
  responseText: string
): ParsedNativeInviteNetworkResult {
  const text = decodeRequestText(`${requestBody}\n${responseText}`);
  const rawProfileUrn = text.match(/urn:li:fsd_profile:(?:urn:li:fsd_profile:)?[A-Za-z0-9_-]+/)?.[0] || '';
  const profileUrn = rawProfileUrn.replace('urn:li:fsd_profile:urn:li:fsd_profile:', 'urn:li:fsd_profile:');
  const memberNumericId = text.match(/urn:li:member:(\d+)/)?.[1] || extractField(text, ['memberId', 'memberNumericId']);
  const invitationUrn = text.match(/urn:li:fsd_invitation:\d+/)?.[0] || '';
  const fieldUsername = extractField(text, ['publicIdentifier', 'inviteeVanityName', 'vanityName']);
  const profileUrlUsername = text.match(/(?:https?:\/\/www\.linkedin\.com)?\/in\/([^/?#"\\]+)/i)?.[1] || '';

  return {
    linkedinUsername: fieldUsername || profileUrlUsername,
    profileUrn,
    memberNumericId,
    invitationUrn,
  };
}

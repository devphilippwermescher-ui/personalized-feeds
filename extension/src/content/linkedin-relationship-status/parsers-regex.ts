import { decodeHtmlEntities } from './utils';
import type { RelationshipResolution } from './types';

export function parseStatusFromRegex(
  html: string
): (RelationshipResolution & { reason: string }) | null {
  const text = decodeHtmlEntities(html);

  const findStateStringValue = (
    prefixPattern: RegExp,
    valuePattern: RegExp
  ): { memberNumericId?: string; value?: string } | null => {
    const prefixMatch = text.match(prefixPattern);
    if (!prefixMatch) {
      return null;
    }

    const startIndex = prefixMatch.index ?? 0;
    const chunk = text.slice(startIndex, startIndex + 8000);
    const valueMatch = chunk.match(valuePattern);
    if (!valueMatch) {
      return {
        memberNumericId: prefixMatch[1],
      };
    }

    return {
      memberNumericId: prefixMatch[1],
      value: valueMatch[1]?.toLowerCase(),
    };
  };

  const profileUrnMatch = text.match(/urn:li:fsd_profile:[A-Za-z0-9_-]+/);
  const profileUrn = profileUrnMatch?.[0];
  const memberNumericIdMatch = text.match(/urn:li:member:(\d+)/);
  const memberNumericId = memberNumericIdMatch?.[1];
  const invitationState = findStateStringValue(
    /state:invitation:urn:li:member:(\d+)/i,
    /\\?"stringValue\\?"\s*:\s*\\?"(Connect|Pending|Withdrawn)\\?"/i
  );
  const followingState = findStateStringValue(
    /urn:li:fsd_followingState:urn:li:member:(\d+)/i,
    /\\?"stringValue\\?"\s*:\s*\\?"(Follow|Following)\\?"/i
  );
  const hasPendingCta =
    /aria-label="Pending[^"]*withdraw invitation/i.test(text) ||
    />\s*Pending\s*</i.test(text);
  const hasConnectCta =
    /aria-label="Invite [^"]+ to connect"/i.test(text) ||
    /aria-label="Connect[^"]*"/i.test(text) ||
    />\s*Connect\s*</i.test(text);
  const hasFollowCta =
    /aria-label="Follow[^"]*"/i.test(text) ||
    />\s*\+?\s*Follow\s*</i.test(text);
  const hasMessageCta =
    /aria-label="Message [^"]+"/i.test(text) ||
    />\s*Message\s*</i.test(text);
  const hasFirstDegree =
    />\s*1st\s*</i.test(text) ||
    /1st degree connection/i.test(text) ||
    /"memberDistance"\s*:\s*"DISTANCE_1"/.test(text) ||
    /"networkDistance"\s*:\s*1\b/.test(text);
  const hasSecondOrThirdDegree =
    />\s*(?:·|&middot;)?\s*2nd\s*</i.test(text) ||
    />\s*(?:·|&middot;)?\s*3rd(?:\+)?\s*</i.test(text) ||
    /2nd degree connection/i.test(text) ||
    /3rd degree connection/i.test(text) ||
    /"memberDistance"\s*:\s*"DISTANCE_2"/.test(text) ||
    /"memberDistance"\s*:\s*"DISTANCE_3"/.test(text) ||
    /"memberDistance"\s*:\s*"OUT_OF_NETWORK"/.test(text) ||
    /"networkDistance"\s*:\s*(?:2|3)\b/.test(text);

  const invitationMemberNumericId = invitationState?.memberNumericId;
  const invitationStateValue = invitationState?.value || '';
  const followingMemberNumericId = followingState?.memberNumericId;
  const followingStateValue = followingState?.value || '';
  const resolvedMemberNumericId = invitationMemberNumericId || followingMemberNumericId || memberNumericId;
  const isFollowing = followingStateValue === 'following';
  const canFollow = Boolean(followingStateValue);

  if (invitationStateValue === 'pending') {
    return {
      status: 'pending',
      profileUrn,
      memberNumericId: resolvedMemberNumericId,
      canMessage: false,
      canFollow,
      canConnect: false,
      isFollowing,
      reason: 'rehydration invitation state = Pending',
    };
  }

  if (invitationStateValue === 'withdrawn') {
    return {
      status: 'withdrawn',
      profileUrn,
      memberNumericId: resolvedMemberNumericId,
      canMessage: false,
      canFollow,
      canConnect: false,
      isFollowing,
      reason: 'rehydration invitation state = Withdrawn',
    };
  }

  if (invitationStateValue === 'connect') {
    return {
      status: 'connect',
      profileUrn,
      memberNumericId: resolvedMemberNumericId,
      canMessage: false,
      canFollow,
      canConnect: true,
      isFollowing,
      reason: 'rehydration invitation state = Connect',
    };
  }

  if (followingStateValue === 'following') {
    return {
      status: 'following',
      profileUrn,
      memberNumericId: resolvedMemberNumericId,
      canMessage: false,
      canFollow: true,
      canConnect: false,
      isFollowing: true,
      reason: 'rehydration follow state = Following',
    };
  }

  if (
    /"invitationState"\s*:\s*"PENDING"/.test(text) &&
    /"invitationType"\s*:\s*"SENT"/.test(text)
  ) {
    return {
      status: 'pending',
      profileUrn,
      memberNumericId: resolvedMemberNumericId,
      canMessage: false,
      canFollow,
      canConnect: false,
      isFollowing,
      reason: 'invitationState=PENDING + invitationType=SENT',
    };
  }
  if (
    /"invitationState"\s*:\s*"WITHDRAWN"/.test(text) &&
    /"invitationType"\s*:\s*"SENT"/.test(text)
  ) {
    return {
      status: 'withdrawn',
      profileUrn,
      memberNumericId: resolvedMemberNumericId,
      canMessage: false,
      canFollow,
      canConnect: false,
      isFollowing,
      reason: 'invitationState=WITHDRAWN + invitationType=SENT',
    };
  }
  if (hasPendingCta) {
    return {
      status: 'pending',
      profileUrn,
      memberNumericId: resolvedMemberNumericId,
      canMessage: false,
      canFollow,
      canConnect: false,
      isFollowing,
      reason: 'pending CTA in HTML',
    };
  }

  const mrIdx = text.indexOf('fsd_memberRelationship:');
  if (mrIdx !== -1) {
    const chunk = text.slice(mrIdx, mrIdx + 800);

    if (/"connection"\s*:\s*\{/.test(chunk) || /"\*connection"\s*:\s*"urn:/.test(chunk)) {
      return {
        status: 'connected',
        profileUrn,
        memberNumericId: resolvedMemberNumericId,
        canMessage: true,
        canFollow,
        canConnect: false,
        isFollowing,
        reason: 'fsd_memberRelationship.connection object',
      };
    }
    if (/"connection"\s*:\s*null/.test(chunk)) {
      return {
        status: 'connect',
        profileUrn,
        memberNumericId: resolvedMemberNumericId,
        canMessage: false,
        canFollow,
        canConnect: true,
        isFollowing,
        reason: 'fsd_memberRelationship.connection=null',
      };
    }
  }

  const hasPremiumInMailJson = /"composeOptionType"\s*:\s*"PREMIUM_INMAIL"/.test(text);
  const hasUpsellJson = /"composeOptionType"\s*:\s*"UPSELL"/.test(text);

  if (hasFirstDegree || (hasMessageCta && !hasConnectCta && !hasSecondOrThirdDegree && !hasPremiumInMailJson && !hasUpsellJson)) {
    return {
      status: 'connected',
      profileUrn,
      memberNumericId: resolvedMemberNumericId,
      canMessage: true,
      canFollow,
      canConnect: false,
      isFollowing,
      reason: 'message CTA or 1st-degree markers in HTML',
    };
  }
  if (hasFollowCta && hasSecondOrThirdDegree) {
    return {
      status: 'connect',
      profileUrn,
      memberNumericId: resolvedMemberNumericId,
      canMessage: false,
      canFollow: true,
      canConnect: true,
      isFollowing: false,
      reason: 'follow CTA + non-1st-degree markers in HTML',
    };
  }
  if (hasConnectCta) {
    return {
      status: 'connect',
      profileUrn,
      memberNumericId: resolvedMemberNumericId,
      canMessage: hasPremiumInMailJson,  // UPSELL does not enable messaging
      canFollow,
      canConnect: true,
      isFollowing,
      // PREMIUM_INMAIL indicates InMail availability for the viewer, not a Premium badge on the profile.
      reason: hasPremiumInMailJson ? 'connect CTA + PREMIUM_INMAIL in HTML' : 'connect CTA in HTML',
    };
  }

  // PREMIUM_INMAIL detected in embedded JSON: profile supports InMail messaging.
  // isPremium is NOT set here — PREMIUM_INMAIL signals InMail availability for the viewer,
  // not a Premium badge on the viewed profile. The structured path is authoritative for isPremium.
  if (hasMessageCta && hasPremiumInMailJson) {
    return {
      status: 'connect',
      profileUrn,
      memberNumericId: resolvedMemberNumericId,
      canMessage: true,
      canFollow,
      canConnect: false,
      isFollowing,
      reason: 'PREMIUM_INMAIL composeOptionType in HTML',
    };
  }

  // UPSELL detected: messaging is locked behind a paid upsell.
  // canMessage = false. isPremium is NOT set here — UPSELL does not identify the
  // profile as a Premium subscriber; the structured parser path is authoritative for that.
  if (hasUpsellJson) {
    return {
      status: 'connect',
      profileUrn,
      memberNumericId: resolvedMemberNumericId,
      canMessage: false,
      canFollow,
      canConnect: false,
      isFollowing,
      reason: 'UPSELL composeOptionType in HTML',
    };
  }

  return null;
}

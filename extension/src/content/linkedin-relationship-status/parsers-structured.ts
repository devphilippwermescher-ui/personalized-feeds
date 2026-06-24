import { asArray, asRecord, asString, getComposeOptionType, isFollowingStateActive, normalizeRelationshipResolution, pickProfileUrn } from './utils';
import type { RelationshipResolution, RelationshipStatus } from './types';

import {
  extractRehydrationStateFromHtml,
  findProfileImageUrl,
} from './parsers-image';

function resolveStatusFromRehydrationState(
  state: Record<string, unknown>
): RelationshipResolution | null {
  let memberNumericId: string | undefined;
  let profileUrn: string | undefined;
  let invitationValue: string | null = null;
  let followingValue: string | null = null;

  for (const [key, value] of Object.entries(state)) {
    // invitation state: "state:invitation:urn:li:member:<id>"
    const invMatch = key.match(/^state:invitation:urn:li:member:(\d+)$/);
    if (invMatch) {
      const sv = asString(asRecord(value)?.stringValue);
      if (sv) {
        invitationValue = sv.toLowerCase();
        memberNumericId = memberNumericId || invMatch[1];
      }
      continue;
    }

    // following state: "urn:li:fsd_followingState:urn:li:member:<id>"
    const followMatch = key.match(/^urn:li:fsd_followingState:urn:li:member:(\d+)$/);
    if (followMatch) {
      const sv = asString(asRecord(value)?.stringValue);
      if (sv) {
        followingValue = sv.toLowerCase();
        memberNumericId = memberNumericId || followMatch[1];
      }
      continue;
    }

    // capture first fsd_profile URN seen
    if (!profileUrn && key.startsWith('urn:li:fsd_profile:')) {
      profileUrn = key;
    }
  }

  const isFollowing = followingValue === 'following';
  const canFollow = Boolean(followingValue);

  if (invitationValue === 'pending') {
    return { status: 'pending', profileUrn, memberNumericId, canMessage: false, canFollow, canConnect: false, isFollowing };
  }
  if (invitationValue === 'withdrawn') {
    return { status: 'withdrawn', profileUrn, memberNumericId, canMessage: false, canFollow, canConnect: false, isFollowing };
  }
  if (invitationValue === 'connect') {
    return { status: 'connect', profileUrn, memberNumericId, canMessage: false, canFollow, canConnect: true, isFollowing };
  }
  if (isFollowing) {
    return { status: 'following', profileUrn, memberNumericId, canMessage: false, canFollow: true, canConnect: false, isFollowing: true };
  }

  // "follow" (not yet following) alone is insufficient — need more signals
  return null;
}

export function parseStatusFromRehydration(html: string): RelationshipResolution | null {
  const state = extractRehydrationStateFromHtml(html);
  if (!state) return null;
  return resolveStatusFromRehydrationState(state);
}

function extractMemberNumericId(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const match = value.match(/urn:li:member:(\d+)/);
    if (match?.[1]) {
      return match[1];
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = extractMemberNumericId(item);
      if (nested) {
        return nested;
      }
    }
    return undefined;
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;

    const directCandidates = [
      record.objectUrn,
      record.targetUrn,
      record.entityUrn,
      record.memberUrn,
      record.viewerUrn,
      record.vieweeUrn,
    ];

    for (const candidate of directCandidates) {
      const direct = extractMemberNumericId(candidate);
      if (direct) {
        return direct;
      }
    }

    for (const nested of Object.values(record)) {
      const resolved = extractMemberNumericId(nested);
      if (resolved) {
        return resolved;
      }
    }
  }

  return undefined;
}

function extractFollowingSignal(profile: Record<string, unknown>): boolean {
  if (isFollowingStateActive(profile.followingState)) {
    return true;
  }

  const profileActions = asRecord(profile.profileStatefulProfileActions);
  const primaryAction = asRecord(profileActions?.primaryActionResolutionResult);
  const secondaryAction = asRecord(profileActions?.secondaryActionResolutionResult);

  if (isFollowingStateActive(primaryAction?.followingState) || isFollowingStateActive(secondaryAction?.followingState)) {
    return true;
  }

  const secondaryStatefulAction = asRecord(secondaryAction?.statefulAction);
  const actionDataModel = asRecord(secondaryStatefulAction?.actionDataModel);
  const relationshipActionData = asRecord(actionDataModel?.relationshipActionData);
  const relationshipData = asRecord(relationshipActionData?.relationshipData);
  const memberToEntityRelationship = asRecord(relationshipData?.memberToEntityRelationship);
  const followRelationship = asRecord(asRecord(memberToEntityRelationship?.relationshipData)?.follow);

  if (isFollowingStateActive(followRelationship?.followingState)) {
    return true;
  }

  const overflowActions = asArray(profileActions?.overflowActionsResolutionResults);
  return overflowActions.some((action) => isFollowingStateActive(asRecord(action)?.followingState));
}

export function collectEntities(obj: unknown, out: Map<string, unknown>, depth = 0): void {
  if (!obj || typeof obj !== 'object' || depth > 15) return;

  const entityUrn = typeof (obj as { entityUrn?: unknown }).entityUrn === 'string'
    ? (obj as { entityUrn: string }).entityUrn.trim()
    : '';
  if (entityUrn) {
    out.set(entityUrn, obj);
  }

  const items = Array.isArray(obj) ? obj : Object.values(obj);
  for (const item of items) {
    if (item && typeof item === 'object') {
      collectEntities(item, out, depth + 1);
    }
  }
}

export function resolveStatusFromEntities(
  entities: Map<string, unknown>
): { status: RelationshipStatus; profileUrn?: string } | null {
  let profileUrn: string | undefined;
  for (const urn of entities.keys()) {
    if (urn.startsWith('urn:li:fsd_profile:')) {
      profileUrn = urn;
      break;
    }
  }

  let mrEntity: Record<string, unknown> | null = null;
  for (const [urn, entity] of entities) {
    if (urn.includes('fsd_memberRelationship:')) {
      mrEntity = asRecord(entity);
      break;
    }
  }

  const memberRelationship = asRecord(mrEntity?.memberRelationship);
  if (!memberRelationship) return null;

  if (asRecord(memberRelationship.self) || asRecord(memberRelationship.connection)) {
    return { status: 'connected', profileUrn };
  }

  const noConnection = asRecord(memberRelationship.noConnection);
  if (!noConnection) return null;

  const invitationContainer = asRecord(noConnection.invitation);
  if (invitationContainer) {
    const invRef = asString(invitationContainer['*invitation']);
    if (invRef) {
      const invEntity = asRecord(entities.get(invRef));
      const invitationState = asString(invEntity?.invitationState);
      const invitationType = asString(invEntity?.invitationType);
      if (invitationState === 'PENDING') {
        return { status: 'pending', profileUrn };
      }
      if (invitationState === 'WITHDRAWN' && invitationType === 'SENT') {
        return { status: 'withdrawn', profileUrn };
      }
    }

    const inlineInvitation = asRecord(invitationContainer.invitation);
    if (inlineInvitation) {
      const invitationState = asString(inlineInvitation.invitationState);
      const invitationType = asString(inlineInvitation.invitationType);
      if (invitationState === 'PENDING') {
        return { status: 'pending', profileUrn };
      }
      if (invitationState === 'WITHDRAWN' && invitationType === 'SENT') {
        return { status: 'withdrawn', profileUrn };
      }
    }
  }

  return { status: 'connect', profileUrn };
}

function resolveStatusFromRelationshipUnion(
  relationship: unknown,
  profileUrn?: string
): { status: RelationshipStatus; profileUrn?: string } | null {
  const memberRelationship = asRecord(relationship);
  if (!memberRelationship) return null;

  if (asRecord(memberRelationship.self) || asRecord(memberRelationship.connection)) {
    return { status: 'connected', profileUrn };
  }

  const noConnection = asRecord(memberRelationship.noConnection);
  if (!noConnection) return null;

  const invitationContainer = asRecord(noConnection.invitation);
  const inlineInvitation = asRecord(invitationContainer?.invitation);
  const invitationState = asString(inlineInvitation?.invitationState);
  const invitationType = asString(inlineInvitation?.invitationType);

  if (invitationState === 'PENDING') {
    return { status: 'pending', profileUrn };
  }

  if (invitationState === 'WITHDRAWN' && invitationType === 'SENT') {
    return { status: 'withdrawn', profileUrn };
  }

  if (invitationContainer?.['*invitation']) {
    return { status: 'pending', profileUrn };
  }

  if (asRecord(invitationContainer?.noInvitation) || invitationContainer?.['*noInvitation']) {
    return { status: 'connect', profileUrn };
  }

  return { status: 'connect', profileUrn };
}

export function extractStatusFromProfileEntry(
  profileEntry: unknown
): RelationshipResolution | null {
  const profile = asRecord(profileEntry);
  if (!profile) return null;

  const profileUrn = pickProfileUrn(profile.entityUrn);
  const profileImageUrl = findProfileImageUrl(profile, profileUrn);
  const memberNumericId = extractMemberNumericId(profile);
  let connectCandidate = false;
  const followingActive = extractFollowingSignal(profile);
  const profileActions = asRecord(profile.profileStatefulProfileActions);
  const primaryAction = asRecord(profileActions?.primaryActionResolutionResult);
  const secondaryAction = asRecord(profileActions?.secondaryActionResolutionResult);
  const supplementaryAction = asRecord(profileActions?.supplementaryAction);
  const primaryComposeOptionType = getComposeOptionType(primaryAction);
  const secondaryComposeOptionType = getComposeOptionType(secondaryAction);

  // PREMIUM_INMAIL signals that the viewer can send InMail to this profile.
  // It does NOT indicate the profile is a Premium subscriber — use premiumFeatures for that.
  const isPremiumInMail =
    primaryComposeOptionType === 'PREMIUM_INMAIL' ||
    secondaryComposeOptionType === 'PREMIUM_INMAIL';

  // isPremium: true only when the profile itself carries explicit Premium features.
  // PREMIUM_INMAIL, paidInMail, and UPSELL all describe messaging cost/availability for
  // the viewer — they say nothing about whether the viewed profile is a Premium subscriber.
  const premiumFeaturesRaw = profile.premiumFeatures;
  const hasPremiumFeatures = Array.isArray(premiumFeaturesRaw)
    ? premiumFeaturesRaw.some((f) => {
        const feature = asRecord(f);
        return feature?.hasAccess === true || feature?.hasEnabled === true;
      })
    : Boolean(premiumFeaturesRaw && typeof premiumFeaturesRaw === 'object'
        ? Object.keys(premiumFeaturesRaw as Record<string, unknown>).length > 0
        : premiumFeaturesRaw);
  const isPremium = hasPremiumFeatures || undefined;

  // canMessage: true for regular connections OR when Premium InMail is explicitly available.
  // UPSELL does NOT grant messaging — it is a paid upsell prompt, not an available action.
  const canMessage =
    primaryComposeOptionType === 'CONNECTION_MESSAGE' ||
    secondaryComposeOptionType === 'CONNECTION_MESSAGE' ||
    isPremiumInMail;

  const resolveStatusFromAction = (action: Record<string, unknown> | null): { status: RelationshipStatus; profileUrn?: string } | null => {
    if (!action) return null;

    const directStatefulAction = asRecord(action?.statefulAction);
    const actionDataModel = asRecord(directStatefulAction?.actionDataModel);
    const relationshipActionData = asRecord(actionDataModel?.relationshipActionData);
    const relationshipData = asRecord(relationshipActionData?.relationshipData);
    const connectionOrInvitation = asRecord(relationshipData?.connectionOrInvitation);
    const resolved = resolveStatusFromRelationshipUnion(
      connectionOrInvitation?.memberRelationship ?? connectionOrInvitation,
      profileUrn
    );
    if (resolved) {
      return resolved;
    }

    const wrappedConnection = asRecord(action?.connection);
    const directConnectionStatus = resolveStatusFromRelationshipUnion(
      asRecord(wrappedConnection?.memberRelationship)?.memberRelationship ??
        wrappedConnection?.memberRelationship ??
        wrappedConnection,
      profileUrn
    );
    if (directConnectionStatus) {
      return directConnectionStatus;
    }

    const personalizedConnect = asRecord(action?.personalizedConnect);
    return resolveStatusFromRelationshipUnion(
      personalizedConnect?.memberRelationship ?? personalizedConnect,
      profileUrn
    );
  };

  const prioritizedActions = [primaryAction, secondaryAction, supplementaryAction];
  for (const action of prioritizedActions) {
    const resolvedStatus = resolveStatusFromAction(action);
    if (!resolvedStatus) continue;

    if (resolvedStatus.status === 'connect') {
      connectCandidate = true;
    } else {
      return normalizeRelationshipResolution({
        ...resolvedStatus,
        canMessage,
        isPremium: isPremium || undefined,
        profileImageUrl,
      });
    }
  }

  if (canMessage) {
    return {
      status: isPremiumInMail ? 'connect' : 'connected',
      profileUrn,
      canMessage: true,
      canConnect: false,
      canFollow: false,
      isFollowing: followingActive,
      memberNumericId,
      isPremium: isPremium || undefined,
      profileImageUrl,
    };
  }

  const overflowActions = asArray(profileActions?.overflowActionsResolutionResults);
  for (const action of overflowActions) {
    const overflowStatus = resolveStatusFromAction(asRecord(action));
    if (overflowStatus) {
      if (overflowStatus.status === 'connect') {
        connectCandidate = true;
      } else {
        return normalizeRelationshipResolution({
          ...overflowStatus,
          canMessage,
          isPremium: isPremium || undefined,
          profileImageUrl,
        });
      }
    }
  }

  const canFollow = followingActive || Boolean(
    asRecord(asRecord(primaryAction?.statefulAction)?.actionDataModel)?.relationshipActionData ||
    asRecord(asRecord(secondaryAction?.statefulAction)?.actionDataModel)?.relationshipActionData ||
    asRecord(asRecord(supplementaryAction?.statefulAction)?.actionDataModel)?.relationshipActionData ||
    asRecord(profile.followingState)
  );
  const canConnect = connectCandidate;

  if (followingActive && !canConnect) {
    return {
      status: 'following',
      profileUrn,
      canMessage: false,
      canFollow,
      canConnect,
      isFollowing: true,
      memberNumericId,
      isPremium: isPremium || undefined,
      profileImageUrl,
    };
  }

  if (connectCandidate) {
    return {
      status: 'connect',
      profileUrn,
      canMessage: isPremiumInMail,
      canFollow,
      canConnect: true,
      isFollowing: followingActive,
      memberNumericId,
      isPremium: isPremium || undefined,
      profileImageUrl,
    };
  }

  return null;
}

export function enrichFromEntities(
  base: { status: RelationshipStatus; profileUrn?: string },
  entities: Map<string, unknown>
): RelationshipResolution {
  // Extract memberNumericId from entity URNs
  let memberNumericId: string | undefined;
  for (const urn of entities.keys()) {
    const m = urn.match(/urn:li:member:(\d+)/);
    if (m?.[1]) { memberNumericId = m[1]; break; }
  }
  // Fallback: deep-search entity values
  if (!memberNumericId) {
    for (const entity of entities.values()) {
      const id = extractMemberNumericId(entity);
      if (id) { memberNumericId = id; break; }
    }
  }

  const { status, profileUrn } = base;
  return {
    status,
    profileUrn,
    memberNumericId,
    canMessage: status === 'connected',
    canConnect: status === 'connect',
    canFollow: undefined,   // not determinable from code blocks alone
    isFollowing: status === 'following' ? true : undefined,
  };
}
